'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSemester } from '@/lib/SemesterContext';
import BottomNav from '@/components/BottomNav';
import styles from './matches.module.css';

export default function MatchesPage() {
    const [matches, setMatches] = useState([]);
    const [declinedMatches, setDeclinedMatches] = useState([]);
    const [myPosts, setMyPosts] = useState([]);
    const [historyPosts, setHistoryPosts] = useState([]);
    const [activeTab, setActiveTab] = useState('matches');
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [courses, setCourses] = useState({});
    const [contactInfoMap, setContactInfoMap] = useState({});
    const router = useRouter();
    const supabase = createClient();
    const { selectedTerm } = useSemester();

    useEffect(() => {
        checkAuth();

        // Check for expired matches on page load
        fetch('/api/expire-matches').catch(() => { });

        // Refresh timer display every minute
        const timerInterval = setInterval(() => {
            setMatches(prev => [...prev]); // Force re-render to update timer
        }, 60000);

        return () => clearInterval(timerInterval);
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
    };

    const fetchCourses = async () => {
        const { data } = await supabase
            .from('courses')
            .select('course_id, name');

        if (data) {
            const courseMap = {};
            data.forEach(c => courseMap[c.course_id] = c.name);
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
            profile:profiles!match_participants_user_id_fkey(id, name, student_id)
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
        const { error } = await supabase.rpc('accept_match', { p_match_id: match.id });
        if (error) {
            console.error('Accept error:', error);
            alert('Failed to accept: ' + error.message);
            return;
        }
        fetchMatches(user.id);
    };

    const handleDecline = async (match) => {
        const { error } = await supabase.rpc('decline_match', { p_match_id: match.id });
        if (error) {
            console.error('Decline error:', error);
            alert('Failed to decline: ' + error.message);
            return;
        }
        fetchMatches(user.id);
        fetchMyPosts(user.id);
        fetchDeclinedMatches(user.id);
    };

    const handleComplete = async (postId) => {
        await supabase
            .from('posts')
            .update({ status: 'completed' })
            .eq('id', postId);

        setMatches(prev => prev.filter(m =>
            !(m.participants || []).some(p => p.user_id === user.id && p.post?.id === postId)
        ));

        fetchMyPosts(user.id);
        fetchHistory(user.id);
    };

    // Completing from an accepted match goes through the RPC so the whole match
    // closes (status + completed_at) once every member has marked their leg done.
    const handleCompleteMatch = async (match) => {
        const { error } = await supabase.rpc('complete_match_leg', { p_match_id: match.id });
        if (error) {
            console.error('Complete error:', error);
            alert('Failed to complete: ' + error.message);
            return;
        }
        setMatches(prev => prev.filter(m => m.id !== match.id));
        fetchMyPosts(user.id);
        fetchHistory(user.id);
    };

    const handleDelete = async (postId) => {
        await supabase
            .from('posts')
            .delete()
            .eq('id', postId);

        fetchMyPosts(user.id);
    };

    const getTimeRemaining = (expiresAt) => {
        const now = new Date();
        const expiry = new Date(expiresAt);
        const diff = expiry - now;

        if (diff <= 0) return 'Expired';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        return `${hours}h ${minutes}m left`;
    };

    // Compact "time left" label for a user's own active post (turns urgent < 24h).
    const getPostExpiry = (expiresAt) => {
        if (!expiresAt) return null;
        const diff = new Date(expiresAt) - new Date();
        if (diff <= 0) return { text: 'Expiring…', urgent: true };
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        if (days >= 1) return { text: `${days}d left`, urgent: false };
        if (hours >= 1) return { text: `${hours}h left`, urgent: true };
        return { text: '<1h left', urgent: true };
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const sortedParts = (match) => [...(match.participants || [])].sort((a, b) => a.position - b.position);

    const pendingCount = matches.filter(m =>
        m.status === 'pending' &&
        (m.participants || []).some(p => p.user_id === user?.id && !p.accepted)
    ).length;

    return (
        <div className={styles.page}>
            <div className={styles.pageInner}>
                <header className={styles.header}>
                    <div className={styles.headerTitleContainer}>
                        <button type="button" onClick={() => router.back()} className={styles.backBtn} title="Back" aria-label="Back">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </button>
                        <h1>Activity</h1>
                    </div>
                </header>

                {/* Tabs */}
                <div className={styles.tabsCard}>
                    <div className={styles.tabs}>
                        <button
                            className={`${styles.tab} ${activeTab === 'matches' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('matches')}
                        >
                            Matches
                            {pendingCount > 0 && (
                                <span className={styles.countBadge}>{pendingCount}</span>
                            )}
                        </button>
                        <button
                            className={`${styles.tab} ${activeTab === 'posts' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('posts')}
                        >
                            Posts
                            {myPosts.length > 0 && (
                                <span className={styles.countBadge}>{myPosts.length}</span>
                            )}
                        </button>
                        <button
                            className={`${styles.tab} ${activeTab === 'history' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('history')}
                        >
                            History
                        </button>
                    </div>
                </div>

                <main className={styles.main}>
                    {loading ? (
                        <div className={styles.loading}>
                            <div className={styles.spinner}></div>
                        </div>
                    ) : (
                        <>
                            {/* Decline Notifications */}
                            {declinedMatches.length > 0 && (
                                <section className={styles.declineNotifications}>
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
                                            <div key={match.id} className={styles.declineCard}>
                                                <div className={styles.declineContent}>
                                                    <span className={styles.declineIcon}>⚠️</span>
                                                    <div className={styles.declineText}>
                                                        <span><strong>{declinerName}</strong> declined your {match.size > 2 ? `${match.size}-way ` : ''}swap request</span>
                                                        <span className={styles.declineCourse}>
                                                            {mine?.post?.course_code} • give {mine?.gives_section} ↔ get {mine?.gets_section}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button onClick={() => dismissDecline(match.id)} className={styles.dismissBtn}>Dismiss</button>
                                            </div>
                                        );
                                    })}
                                </section>
                            )}

                            {/* Active Matches */}
                            {activeTab === 'matches' && (
                                <section className={styles.section}>
                                    <h2 className={styles.sectionTitle}>Active Matches</h2>

                                    {matches.length === 0 ? (
                                        <div className={styles.empty}>
                                            <p>No active matches yet</p>
                                            <p className={styles.hint}>When a swap (direct or a 3-way loop) opens up for one of your posts, it'll appear here</p>
                                        </div>
                                    ) : (
                                        <div className={styles.matchList}>
                                            {matches.map((match) => {
                                                const parts = sortedParts(match);
                                                const me = parts.find(p => p.user_id === user?.id);
                                                if (!me) return null;

                                                const size = match.size || parts.length;
                                                const isCycle = size > 2;
                                                const others = parts.filter(p => p.user_id !== user?.id);
                                                const allAccepted = match.status === 'accepted';
                                                const acceptedCount = parts.filter(p => p.accepted).length;
                                                const myAccepted = me.accepted;
                                                const waitingOn = size - acceptedCount;
                                                const course = me.post;

                                                return (
                                                    <div key={match.id} className={styles.matchCard}>
                                                        <div className={styles.matchHeader}>
                                                            <span className={`${styles.matchBadge} ${allAccepted ? styles.matchBadgeAccepted : ''}`}>
                                                                {allAccepted ? 'Matched!' : 'Pending'}
                                                                {isCycle && ` · ${size}-way`}
                                                            </span>
                                                            {!allAccepted && match.expires_at && (
                                                                <span className={styles.matchTimer}>
                                                                    {getTimeRemaining(match.expires_at)}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {isCycle ? (
                                                            <div className={styles.cycleChain}>
                                                                {parts.map((p) => {
                                                                    const isMe = p.user_id === user?.id;
                                                                    return (
                                                                        <div key={p.position} className={`${styles.cycleStep} ${isMe ? styles.cycleStepMe : ''}`}>
                                                                            <span className={styles.cycleName}>{isMe ? 'You' : p.profile?.name}</span>
                                                                            <span className={styles.cycleFlow}>give <b className={styles.cycleNum}>{p.gives_section}</b> <span className={styles.cycleArrow}>→</span> get <b className={styles.cycleNum}>{p.gets_section}</b></span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div className={styles.matchContent}>
                                                                <div className={styles.matchSide}>
                                                                    <span className={styles.matchLabel}>You give</span>
                                                                    <span className={styles.matchSection}>{me.gives_section}</span>
                                                                </div>
                                                                <span className={styles.matchArrow}>⇄</span>
                                                                <div className={styles.matchSide}>
                                                                    <span className={styles.matchLabel}>You get</span>
                                                                    <span className={styles.matchSection}>{me.gets_section}</span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className={styles.matchCourse}>
                                                            <span className={styles.courseId}>{course?.course_code}</span>
                                                            <span className={styles.courseName}>{course?.course_name || courses[course?.course_code]}</span>
                                                        </div>

                                                        {!isCycle && (
                                                            <div className={styles.matchUser}>
                                                                <span className={styles.userName}>{others[0]?.profile?.name}</span>
                                                                <span className={styles.userMeta}>{others[0]?.profile?.student_id}</span>
                                                            </div>
                                                        )}

                                                        {allAccepted && (
                                                            <div className={styles.contactList}>
                                                                {others.map((p) => {
                                                                    const ci = contactInfoMap[p.profile?.id];
                                                                    return (
                                                                        <div key={p.position} className={styles.contactInfo}>
                                                                            <span>{p.profile?.name}: </span>
                                                                            {ci?.phone ? (
                                                                                <a href={`tel:${ci.phone}`}>{ci.phone}</a>
                                                                            ) : (
                                                                                <span>contact unlocked</span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {!allAccepted && myAccepted && (
                                                            <div className={styles.matchStatus}>
                                                                <span className={styles.waitingThem}>
                                                                    You accepted — waiting for {waitingOn} {waitingOn === 1 ? 'other' : 'others'} to accept
                                                                </span>
                                                            </div>
                                                        )}

                                                        {!myAccepted && match.status === 'pending' && (
                                                            <div className={styles.matchActions}>
                                                                <button onClick={() => handleAccept(match)} className={styles.acceptBtn}>Accept</button>
                                                                <button onClick={() => handleDecline(match)} className={styles.declineBtn}>Decline</button>
                                                            </div>
                                                        )}

                                                        {allAccepted && (
                                                            <button onClick={() => handleCompleteMatch(match)} className={styles.completeBtn}>Mark as Completed</button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* History */}
                            {activeTab === 'history' && (
                                <section className={styles.section}>
                                    <h2 className={styles.sectionTitle}>Past Posts</h2>

                                    {historyPosts.length === 0 ? (
                                        <div className={styles.empty}>
                                            <p>No past posts yet</p>
                                            <p className={styles.hint}>Completed swaps and expired posts will show up here</p>
                                        </div>
                                    ) : (
                                        <div className={styles.postList}>
                                            {historyPosts.map((post) => (
                                                <div key={post.id} className={`${styles.postCard} ${styles[`postCard${post.type}`]}`}>
                                                    <div className={styles.postHeader}>
                                                        <span className={`${styles.postBadge} ${styles[`postBadge${post.type}`]}`}>
                                                            {post.type?.charAt(0).toUpperCase() + post.type?.slice(1)}
                                                        </span>
                                                        <span className={`${styles.postStatus} ${styles[`postStatus${post.status}`]}`}>
                                                            {post.status === 'completed' ? 'Swapped' : 'Expired'}
                                                        </span>
                                                    </div>

                                                    <div className={styles.postDetails}>
                                                        <span className={styles.courseId}>{post.course_code}</span>
                                                        <span className={styles.courseName}>
                                                            {post.course_name || courses[post.course_code]}
                                                        </span>
                                                        <div className={styles.sections}>
                                                            <span>Section {post.have_section}</span>
                                                            {post.want_section && (
                                                                <>
                                                                    <span className={styles.arrow}>→</span>
                                                                    <span>Section {post.want_section}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        <span className={styles.postExpiry}>{formatDate(post.updated_at)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* My Posts */}
                            {activeTab === 'posts' && (
                                <section className={styles.section}>
                                    <h2 className={styles.sectionTitle}>My Active Posts ({myPosts.length}/5)</h2>

                                    {myPosts.length === 0 ? (
                                        <div className={styles.empty}>
                                            <p>No active posts</p>
                                        </div>
                                    ) : (
                                        <div className={styles.postList}>
                                            {myPosts.map((post) => (
                                                <div key={post.id} className={`${styles.postCard} ${styles[`postCard${post.type}`]}`}>
                                                    <div className={styles.postHeader}>
                                                        <span className={`${styles.postBadge} ${styles[`postBadge${post.type}`]}`}>
                                                            {post.type?.charAt(0).toUpperCase() + post.type?.slice(1)}
                                                        </span>
                                                        <span className={`${styles.postStatus} ${styles[`postStatus${post.status}`]}`}>
                                                            {post.status}
                                                        </span>
                                                    </div>

                                                    <div className={styles.postDetails}>
                                                        <span className={styles.courseId}>{post.course_code}</span>
                                                        <span className={styles.courseName}>
                                                            {post.course_name || courses[post.course_code]}
                                                        </span>
                                                        <div className={styles.sections}>
                                                            <span>Section {post.have_section}</span>
                                                            {post.want_section && (
                                                                <>
                                                                    <span className={styles.arrow}>→</span>
                                                                    <span>Section {post.want_section}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        {post.status === 'active' && post.expires_at && (() => {
                                                            const exp = getPostExpiry(post.expires_at);
                                                            return exp ? (
                                                                <span className={`${styles.postExpiry} ${exp.urgent ? styles.postExpiryUrgent : ''}`}>
                                                                    Expires · {exp.text}
                                                                </span>
                                                            ) : null;
                                                        })()}
                                                    </div>

                                                    <div className={styles.postFooter}>
                                                        <div className={styles.postActions}>
                                                            <button onClick={() => handleComplete(post.id)} className={styles.completePostBtn} title="Mark this post as completed/swapped">Swapped</button>
                                                            <button onClick={() => handleDelete(post.id)} className={styles.deletePostBtn} title="Cancel and remove this post">Cancel</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            )}
                        </>
                    )}
                </main>
            </div>

            <BottomNav />
        </div>
    );
}
