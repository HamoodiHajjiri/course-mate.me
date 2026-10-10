'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/fetchAll';
import { ACTIVITY_TYPES } from '@/lib/useUnreadCount';
import PageShell from '@/components/PageShell';
import MatchCard from './MatchCard';
import {
    Button, Callout, CourseCode, CourseMark, CourseName, EmptyState, Meter, Rubric, Section, Skeleton, Status,
    Transfer, useConfirm, useToast,
} from '@/components/ui';
import styles from './matches.module.css';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Activity: the relationships. Open matches are drawn as routes in the main
 * column, because a swap is people handing sections to each other; your
 * own posts and what's finished sit in a ledger beside them.
 */
export default function MatchesPage() {
    const [matches, setMatches] = useState([]);
    const [declinedMatches, setDeclinedMatches] = useState([]);
    const [myPosts, setMyPosts] = useState([]);
    const [historyPosts, setHistoryPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [courses, setCourses] = useState({});
    const [contactInfoMap, setContactInfoMap] = useState({});
    const [busy, setBusy] = useState(null);
    const router = useRouter();
    const supabase = createClient();
    const liveChannelRef = useRef(null);
    const confirm = useConfirm();
    const toast = useToast();

    useEffect(() => {
        checkAuth();

        // Check for expired matches on page load
        fetch('/api/expire-matches').catch(() => { });

        // Refresh timer display every minute
        const timerInterval = setInterval(() => {
            setMatches(prev => [...prev]); // Force re-render to update timer
        }, 60000);

        return () => {
            clearInterval(timerInterval);
            if (liveChannelRef.current) supabase.removeChannel(liveChannelRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/auth');
            return;
        }
        setUser(user);

        const { data: profile } = await supabase
            .from('profiles')
            .select('major')
            .eq('id', user.id)
            .single();

        if (!profile?.major) {
            router.push('/profile?selectMajor=true');
            return;
        }

        fetchMatches(user.id);
        fetchDeclinedMatches(user.id);
        fetchMyPosts(user.id);
        fetchHistory(user.id);
        fetchCourses();
        markActivityRead(user.id);
        liveChannelRef.current = subscribeToLiveUpdates(user.id);
    };

    // Opening Activity is reading its notifications: this page shows every match
    // they point to, so the Activity badge clears here rather than only on
    // /notifications. Other types stay unread for the bell.
    const markActivityRead = async (userId) => {
        await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', userId)
            .is('read', false)
            .in('type', ACTIVITY_TYPES);
    };

    // Live updates: a new match, an accept/decline from the other side, or a
    // notification landing for me all refresh this page's data on their own,
    // instead of the user having to reload to see a match appear or fall through.
    const subscribeToLiveUpdates = (userId) => {
        if (typeof supabase.channel !== 'function') return;
        const refresh = () => {
            fetchMatches(userId);
            fetchDeclinedMatches(userId);
            fetchMyPosts(userId);
        };
        const channel = supabase
            .channel(`matches-live-${userId}`)
            // RLS already scopes these to matches/participants I'm actually in,
            // so no extra filter is needed on top of the subscription itself.
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'match_participants' }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
            .subscribe();
        return channel;
    };

    // The column is course_name; asking for `name` failed the whole read, so
    // this map was always empty and the cards fell back to the post's own copy.
    const fetchCourses = async () => {
        const { data } = await fetchAllRows(() => supabase
            .from('courses')
            .select('course_id, course_name'));

        if (data) {
            const courseMap = {};
            data.forEach(c => courseMap[c.course_id] = c.course_name);
            setCourses(courseMap);
        }
    };

    // All match ids the current user participates in, filtered by match status.
    const myMatchIds = async (userId, statuses) => {
        const { data } = await supabase
            .from('match_participants')
            .select('match_id, matches!inner(status)')
            .eq('user_id', userId)
            .in('matches.status', statuses);
        return [...new Set((data || []).map(d => d.match_id))];
    };

    const MATCH_SELECT = `id, size, status, expires_at, created_at, declined_seen_by, declined_by,
        participants:match_participants(
            position, user_id, accepted, gives_section, gets_section,
            post:posts!match_participants_post_id_fkey(id, course_code, course_name, have_section, want_section, status),
            profile:profiles_public!match_participants_user_id_fkey(id, name, student_id)
        )`;

    const fetchMatches = async (userId) => {
        const ids = await myMatchIds(userId, ['pending', 'accepted']);
        if (ids.length === 0) {
            setMatches([]);
            setLoading(false);
            return;
        }

        const { data } = await supabase
            .from('matches')
            .select(MATCH_SELECT)
            .in('id', ids)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false });

        // Drop matches where my own leg is already marked completed.
        const activeMatches = (data || []).filter(m => {
            const mine = (m.participants || []).find(p => p.user_id === userId);
            return mine && mine.post?.status !== 'completed';
        });

        setMatches(activeMatches);
        setLoading(false);

        // Unlock contacts for every co-member of an accepted match.
        for (const match of activeMatches.filter(m => m.status === 'accepted')) {
            for (const p of (match.participants || [])) {
                if (p.user_id === userId || !p.profile?.id) continue;
                const { data: ci } = await supabase.rpc('get_contact_info', {
                    target_profile_id: p.profile.id,
                });
                if (ci && ci.length > 0) {
                    setContactInfoMap(prev => ({ ...prev, [p.profile.id]: ci[0] }));
                }
            }
        }
    };

    const fetchMyPosts = async (userId) => {
        const { data } = await supabase
            .from('posts')
            .select('*')
            .eq('user_id', userId)
            .in('status', ['active', 'pending'])
            .order('created_at', { ascending: false });

        setMyPosts(data || []);
    };

    // Past posts (completed swaps/giveaways and expired ones) for the History tab.
    const fetchHistory = async (userId) => {
        const { data } = await supabase
            .from('posts')
            .select('*')
            .eq('user_id', userId)
            .in('status', ['completed', 'expired'])
            .order('updated_at', { ascending: false })
            .limit(50);

        setHistoryPosts(data || []);
    };

    const fetchDeclinedMatches = async (userId) => {
        const ids = await myMatchIds(userId, ['declined']);
        if (ids.length === 0) {
            setDeclinedMatches([]);
            return;
        }

        const { data } = await supabase
            .from('matches')
            .select(MATCH_SELECT)
            .in('id', ids)
            .eq('status', 'declined');

        // Don't alert the person who declined — they made the decision. Only
        // the other participants need to know their pending match fell through.
        const unseen = (data || []).filter(m =>
            m.declined_by !== userId && !(m.declined_seen_by || []).includes(userId)
        );
        setDeclinedMatches(unseen);
    };

    const dismissDecline = async (matchId) => {
        await supabase.rpc('mark_decline_seen', { p_match_id: matchId });
        setDeclinedMatches(prev => prev.filter(m => m.id !== matchId));
    };

    const handleAccept = async (match) => {
        setBusy(`accept-${match.id}`);
        const { error } = await supabase.rpc('accept_match', { p_match_id: match.id });
        setBusy(null);
        if (error) {
            console.error('Accept error:', error);
            toast.error(`Couldn't accept: ${error.message}`);
            return;
        }
        toast.success('Accepted. We’ll tell you when everyone has.');
        fetchMatches(user.id);
    };

    const handleDecline = async (match) => {
        const ok = await confirm({
            title: 'Decline this swap?',
            body: 'Everyone in the match is told, and your post goes straight back on the marketplace for another match.',
            confirmLabel: 'Decline swap',
            cancelLabel: 'Keep it',
            tone: 'danger',
        });
        if (!ok) return;
        setBusy(`decline-${match.id}`);
        const { error } = await supabase.rpc('decline_match', { p_match_id: match.id });
        setBusy(null);
        if (error) {
            console.error('Decline error:', error);
            toast.error(`Couldn't decline: ${error.message}`);
            return;
        }

        // Best-effort decline email/push (in-app notification already sent by the RPC).
        fetch('/api/notify-decline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId: match.id }),
        }).catch(() => { });

        toast.info('Declined. Your post is back on the marketplace.');
        fetchMatches(user.id);
        fetchMyPosts(user.id);
        fetchDeclinedMatches(user.id);
    };

    const handleComplete = async (postId) => {
        const ok = await confirm({
            title: 'Mark this post as done?',
            body: 'It comes off the marketplace and moves to your history.',
            confirmLabel: 'Mark as swapped',
        });
        if (!ok) return;
        await supabase
            .from('posts')
            .update({ status: 'completed' })
            .eq('id', postId);

        setMatches(prev => prev.filter(m =>
            !(m.participants || []).some(p => p.user_id === user.id && p.post?.id === postId)
        ));

        toast.success('Moved to history');
        fetchMyPosts(user.id);
        fetchHistory(user.id);
    };

    // Completing from an accepted match goes through the RPC so the whole match
    // closes (status + completed_at) once every member has marked their leg done.
    const handleCompleteMatch = async (match) => {
        const ok = await confirm({
            title: 'Did the swap go through?',
            body: 'Only mark it once you’ve both dropped and added the sections in the university portal.',
            confirmLabel: 'Yes, it’s done',
        });
        if (!ok) return;
        setBusy(`complete-${match.id}`);
        const { error } = await supabase.rpc('complete_match_leg', { p_match_id: match.id });
        setBusy(null);
        if (error) {
            console.error('Complete error:', error);
            toast.error(`Couldn't complete: ${error.message}`);
            return;
        }
        toast.success('Swap completed. Nice one.');
        setMatches(prev => prev.filter(m => m.id !== match.id));
        fetchMyPosts(user.id);
        fetchHistory(user.id);
    };

    const handleDelete = async (postId) => {
        const ok = await confirm({
            title: 'Cancel this post?',
            body: 'It will be removed from Browse for everyone.',
            confirmLabel: 'Cancel post',
            cancelLabel: 'Keep it',
            tone: 'danger',
        });
        if (!ok) return;
        // Goes through cancel_post so stale match_participant rows are cleaned up
        // (the FK used to silently block the delete) and live matches are guarded.
        const { error } = await supabase.rpc('cancel_post', { p_post_id: postId });
        if (error) {
            toast.error(error.message || 'Failed to cancel this post.');
            return;
        }
        toast.success('Post cancelled');
        fetchMyPosts(user.id);
    };

    // Compact "time left" label for a user's own active post (turns urgent < 24h).
    const getPostExpiry = (expiresAt) => {
        if (!expiresAt) return null;
        const diff = new Date(expiresAt) - new Date();
        if (diff <= 0) return { text: 'Expiring…', urgent: true, pct: 0 };
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const pct = Math.min(100, (diff / (7 * DAY)) * 100);
        if (days >= 1) return { text: `${days}d left`, urgent: false, pct };
        if (hours >= 1) return { text: `${hours}h left`, urgent: true, pct };
        return { text: '<1h left', urgent: true, pct };
    };

    const formatDay = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    };

    const copy = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Number copied');
        } catch {
            toast.error('Your browser blocked the clipboard.');
        }
    };

    const sortedParts = (match) => [...(match.participants || [])].sort((a, b) => a.position - b.position);

    const needsMe = matches.filter(m => m.status === 'pending' && (m.participants || []).some(p => p.user_id === user?.id && !p.accepted));
    const waiting = matches.filter(m => m.status === 'pending' && !needsMe.includes(m));
    const accepted = matches.filter(m => m.status === 'accepted');
    const ordered = [...needsMe, ...accepted, ...waiting];

    const renderMatch = (match) => (
        <MatchCard
            key={match.id}
            match={match}
            user={user}
            courses={courses}
            contactInfoMap={contactInfoMap}
            busy={busy}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onComplete={handleCompleteMatch}
            onCopy={copy}
        />
    );

    const KIND = { swap: 'Swap', giveaway: 'Giveaway', request: 'Request' };

    const postRow = (post) => {
        const exp = post.status === 'active' ? getPostExpiry(post.expires_at) : null;
        return (
            <li key={post.id} className={styles.post}>
                <div className={styles.postTop}>
                    <span className={styles.postCode}>
                        <CourseMark courseId={post.course_code} size="sm" />
                        <CourseCode id={post.course_code} size="sm" />
                    </span>
                    <span className={`${styles.postKind} ${styles[`kind_${post.type}`]}`}>{KIND[post.type] || 'Post'}</span>
                </div>
                <CourseName size="sm" className={styles.postName}>{post.course_name || courses[post.course_code] || post.course_code}</CourseName>
                <Transfer
                    kind={post.type}
                    from={post.type === 'request' ? undefined : post.have_section}
                    to={post.type === 'swap' ? post.want_section : post.type === 'request' ? post.have_section : ''}
                    fromTone="plain"
                    toTone={post.type === 'swap' ? 'mine' : 'plain'}
                    size="sm"
                    className={styles.postTransfer}
                />
                <div className={styles.postFoot}>
                    {post.status === 'active' ? (
                        <>
                            {exp && <span className={`${styles.expiry} ${exp.urgent ? styles.expiryUrgent : ''}`} title="Posts last a week">{exp.text}</span>}
                            <span className={styles.postLinks}>
                                <button type="button" className={styles.textBtn} onClick={() => handleComplete(post.id)}>Mark done</button>
                                <button type="button" className={`${styles.textBtn} ${styles.textBtnDanger}`} onClick={() => handleDelete(post.id)}>Cancel</button>
                            </span>
                        </>
                    ) : (
                        <Status tone="warn" title="Answer it under Matches">In a match</Status>
                    )}
                </div>
            </li>
        );
    };

    const summary = loading ? null : [
        needsMe.length > 0 && <span key="n" className={styles.sumAlert}>{needsMe.length} {needsMe.length === 1 ? 'swap needs' : 'swaps need'} your answer</span>,
        accepted.length > 0 && <span key="a">{accepted.length} confirmed</span>,
        waiting.length > 0 && <span key="w">{waiting.length} waiting on others</span>,
        <span key="p">{myPosts.length} of 5 posts live</span>,
    ].filter(Boolean);

    return (
        <PageShell width="wide">
            <header className={styles.head}>
                <h1 className={styles.title}>Activity</h1>
                {summary && <p className={styles.summary}>{summary.reduce((acc, el, i) => (i ? [...acc, <span key={`s${i}`} className={styles.sumSep} aria-hidden="true">·</span>, el] : [el]), [])}</p>}
            </header>

            {declinedMatches.length > 0 && (
                <div className={styles.declines}>
                    {declinedMatches.map((match) => {
                        const parts = sortedParts(match);
                        const mine = parts.find(p => p.user_id === user?.id);
                        const others = parts.filter(p => p.user_id !== user?.id);
                        // Prefer the actual decliner's name; fall back to listing
                        // the others (e.g. legacy matches with no declined_by).
                        const decliner = parts.find(p => p.user_id === match.declined_by);
                        const declinerName = decliner?.profile?.name
                            || others.map(o => o.profile?.name || 'Someone').join(', ');

                        return (
                            <Callout
                                key={match.id}
                                tone="warning"
                                title={`${declinerName} declined the ${match.size > 2 ? `${match.size}-way loop` : 'swap'} for ${mine?.post?.course_code || 'your course'}`}
                                action={<Button size="sm" variant="ghost" onClick={() => dismissDecline(match.id)}>Dismiss</Button>}
                            >
                                You were giving §{mine?.gives_section} for §{mine?.gets_section}. Your post is back on Browse and can match again.
                            </Callout>
                        );
                    })}
                </div>
            )}

            <div className={styles.layout}>
                <section className={styles.matches} aria-labelledby="h-matches">
                    <Rubric id="h-matches" title="Matches" meta={loading ? null : matches.length} />
                    {loading ? (
                        <div className={styles.skeletons} aria-busy="true">
                            {[0, 1].map(i => (
                                <div key={i} className={styles.skeleton}>
                                    <Skeleton width={120} height={12} />
                                    <Skeleton width="55%" height={22} />
                                    <Skeleton height={96} />
                                </div>
                            ))}
                        </div>
                    ) : ordered.length === 0 ? (
                        <div className={styles.emptyMatches}>
                            <EmptyState
                                title="No matches yet."
                                actions={<Button variant="link" href="/post?type=swap">Post a section you want to swap →</Button>}
                            >
                                When a swap post of yours lines up with someone else&rsquo;s, the match appears here and we tell you.
                            </EmptyState>
                            <ol className={styles.how}>
                                <li><span className={styles.howNum}>1</span><span><strong>Post a swap.</strong> Say which section you hold and which you want.</span></li>
                                <li><span className={styles.howNum}>2</span><span><strong>We find the route.</strong> A direct swap, or a loop of three where everyone gets what they asked for.</span></li>
                                <li><span className={styles.howNum}>3</span><span><strong>Everyone accepts within 24 hours.</strong> Contacts unlock, and you swap in the portal together.</span></li>
                            </ol>
                        </div>
                    ) : (
                        <div className={styles.matchList}>{ordered.map(renderMatch)}</div>
                    )}
                </section>

                <aside className={styles.rail}>
                    <section aria-labelledby="h-posts">
                        <Rubric
                            id="h-posts"
                            title="Your posts"
                            meta={loading ? null : <Meter value={myPosts.length} max={5} warnAt={5} label={`${myPosts.length} of 5 posts live`} />}
                            actions={myPosts.length < 5 && <Button variant="link" href="/post" className={styles.railLink}>New post</Button>}
                        />
                        {loading ? (
                            <div className={styles.railSkeleton}><Skeleton height={64} /><Skeleton height={64} /></div>
                        ) : myPosts.length === 0 ? (
                            <EmptyState compact title="Nothing posted.">
                                You can have five posts live at once; each lasts a week.
                            </EmptyState>
                        ) : (
                            <ul className={styles.posts}>{myPosts.map(postRow)}</ul>
                        )}
                    </section>

                    <section aria-labelledby="h-history">
                        <Rubric id="h-history" title="Finished" meta={loading ? null : historyPosts.length} quiet />
                        {!loading && historyPosts.length === 0 ? (
                            <p className={styles.railNote}>Completed swaps and expired posts are kept here.</p>
                        ) : (
                            <ol className={styles.log}>
                                {historyPosts.map(post => (
                                    <li key={post.id} className={styles.logRow}>
                                        <time className={styles.logDate} dateTime={post.updated_at}>{formatDay(post.updated_at)}</time>
                                        <span className={styles.logMain}>
                                            <CourseCode id={post.course_code} size="sm" />
                                            <Section value={post.have_section} size="sm" tone={post.status === 'completed' ? 'struck' : 'muted'} />
                                            {post.want_section && <><span className={styles.logArrow} aria-hidden="true">→</span><Section value={post.want_section} size="sm" /></>}
                                        </span>
                                        <Status tone={post.status === 'completed' ? 'go' : 'muted'}>{post.status === 'completed' ? 'Swapped' : 'Expired'}</Status>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </aside>
            </div>
        </PageShell>
    );
}
