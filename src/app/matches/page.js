'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './matches.module.css';

export default function MatchesPage() {
    const [matches, setMatches] = useState([]);
    const [declinedMatches, setDeclinedMatches] = useState([]);
    const [myPosts, setMyPosts] = useState([]);
    const [activeTab, setActiveTab] = useState('matches');
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [courses, setCourses] = useState({});
    const [contactInfoMap, setContactInfoMap] = useState({});
    const router = useRouter();
    const supabase = createClient();

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

    const fetchMatches = async (userId) => {
        const { data } = await supabase
            .from('matches')
            .select(`*,
                post_a:posts!matches_post_a_id_fkey(*, profile:profiles!posts_user_id_fkey(id, name, student_id)),
                post_b:posts!matches_post_b_id_fkey(*, profile:profiles!posts_user_id_fkey(id, name, student_id))
            `)
            .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false });

        const activeMatches = (data || []).filter(match => {
            const isUserA = match.user_a_id === userId;
            const myPost = isUserA ? match.post_a : match.post_b;
            return myPost?.status !== 'completed';
        });

        setMatches(activeMatches);
        setLoading(false);

        const acceptedMatches = activeMatches.filter(m => m.status === 'accepted');
        for (const match of acceptedMatches) {
            const isUserA = match.user_a_id === userId;
            const theirProfile = isUserA ? match.post_b?.profile : match.post_a?.profile;
            if (theirProfile?.id) {
                const { data } = await supabase.rpc('get_contact_info', {
                    target_profile_id: theirProfile.id
                });
                if (data && data.length > 0) {
                    setContactInfoMap(prev => ({
                        ...prev,
                        [theirProfile.id]: data[0]
                    }));
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

    const fetchDeclinedMatches = async (userId) => {
        const { data } = await supabase
            .from('matches')
            .select(`
                *,
                post_a:posts!matches_post_a_id_fkey(*, profile:profiles!posts_user_id_fkey(name)),
                post_b:posts!matches_post_b_id_fkey(*, profile:profiles!posts_user_id_fkey(name))
            `)
            .eq('status', 'declined')
            .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
            .not('declined_seen_by', 'cs', `{${userId}}`);

        setDeclinedMatches(data || []);
    };

    const dismissDecline = async (matchId) => {
        const match = declinedMatches.find(m => m.id === matchId);
        if (!match) return;

        const updatedSeenBy = [...(match.declined_seen_by || []), user.id];

        await supabase
            .from('matches')
            .update({ declined_seen_by: updatedSeenBy })
            .eq('id', matchId);

        setDeclinedMatches(prev => prev.filter(m => m.id !== matchId));
    };

    const handleAccept = async (matchId, isUserA) => {
        try {
            const update = isUserA
                ? { user_a_accepted: true }
                : { user_b_accepted: true };

            const match = matches.find(m => m.id === matchId);
            const otherAccepted = isUserA ? match.user_b_accepted : match.user_a_accepted;

            if (otherAccepted) {
                update.status = 'accepted';
            }

            const { error } = await supabase
                .from('matches')
                .update(update)
                .eq('id', matchId);

            if (error) {
                console.error('Accept error:', error);
                alert('Failed to accept: ' + error.message);
                return;
            }

            fetchMatches(user.id);
        } catch (err) {
            console.error('Accept error:', err);
            alert('Failed to accept: ' + err.message);
        }
    };

    const handleDecline = async (matchId) => {
        const match = matches.find(m => m.id === matchId);
        const isUserA = match.user_a_id === user.id;
        const myPost = isUserA ? match.post_a : match.post_b;
        const theirPost = isUserA ? match.post_b : match.post_a;

        await supabase
            .from('matches')
            .update({ status: 'declined' })
            .eq('id', matchId);

        await supabase
            .from('posts')
            .update({ status: 'active' })
            .in('id', [match.post_a_id, match.post_b_id]);

        const findNewMatch = async (post, excludePostId) => {
            if (post?.type !== 'swap') return;

            const { data: potentialMatches } = await supabase
                .from('posts')
                .select('*, profile:profiles!posts_user_id_fkey(name)')
                .eq('type', 'swap')
                .eq('course_code', post.course_code)
                .eq('have_section', post.want_section)
                .eq('want_section', post.have_section)
                .eq('status', 'active')
                .neq('user_id', post.user_id)
                .neq('id', excludePostId);

            if (potentialMatches?.length > 0) {
                const newMatch = potentialMatches[0];
                const matchExpiresAt = new Date();
                matchExpiresAt.setHours(matchExpiresAt.getHours() + 24);

                await supabase.from('matches').insert({
                    post_a_id: post.id,
                    post_b_id: newMatch.id,
                    user_a_id: post.user_id,
                    user_b_id: newMatch.user_id,
                    status: 'pending',
                    expires_at: matchExpiresAt.toISOString(),
                });

                await supabase
                    .from('posts')
                    .update({ status: 'pending' })
                    .in('id', [post.id, newMatch.id]);

                try {
                    await fetch('/api/notify-match', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userAId: post.user_id,
                            userBId: newMatch.user_id,
                            courseCode: post.course_code,
                            courseName: post.course_name,
                            userASection: post.have_section,
                            userBSection: newMatch.have_section,
                            userAName: post.profile?.name,
                            userBName: newMatch.profile?.name,
                        }),
                    });
                } catch (emailErr) {
                    console.error('Failed to send email notification:', emailErr);
                }

                return true;
            }
            return false;
        };

        const myPostMatched = await findNewMatch(myPost, theirPost?.id);
        if (!myPostMatched) {
            await findNewMatch(theirPost, myPost?.id);
        }

        fetchMatches(user.id);
        fetchMyPosts(user.id);
    };

    const handleComplete = async (postId) => {
        await supabase
            .from('posts')
            .update({ status: 'completed' })
            .eq('id', postId);

        const associatedMatch = matches.find(
            m => m.post_a_id === postId || m.post_b_id === postId
        );

        if (associatedMatch) {
            setMatches(prev => prev.filter(m => m.id !== associatedMatch.id));
        }

        fetchMyPosts(user.id);
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

    const pendingCount = matches.filter(m =>
        m.status === 'pending' &&
        ((m.user_a_id === user?.id && !m.user_a_accepted) ||
            (m.user_b_id === user?.id && !m.user_b_accepted))
    ).length;

    return (
        <div className={styles.page}>
            <div className={styles.pageInner}>
                <header className={styles.header}>
                    <h1>Activity</h1>
                    <ThemeToggle />
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
                                        const isUserA = match.user_a_id === user?.id;
                                        const theirPost = isUserA ? match.post_b : match.post_a;
                                        const myPost = isUserA ? match.post_a : match.post_b;

                                        return (
                                            <div key={match.id} className={styles.declineCard}>
                                                <div className={styles.declineContent}>
                                                    <span className={styles.declineIcon}>⚠️</span>
                                                    <div className={styles.declineText}>
                                                        <strong>{theirPost?.profile?.name || 'Someone'}</strong> declined your swap request
                                                        <span className={styles.declineCourse}>
                                                            {myPost?.course_code} • Section {myPost?.have_section} ↔ {myPost?.want_section}
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
                                            <p className={styles.hint}>When someone wants to swap sections with you, it'll appear here</p>
                                        </div>
                                    ) : (
                                        <div className={styles.matchList}>
                                            {matches.map((match) => {
                                                const isUserA = match.user_a_id === user?.id;
                                                const myPost = isUserA ? match.post_a : match.post_b;
                                                const theirPost = isUserA ? match.post_b : match.post_a;
                                                const myAccepted = isUserA ? match.user_a_accepted : match.user_b_accepted;
                                                const theirAccepted = isUserA ? match.user_b_accepted : match.user_a_accepted;
                                                const bothAccepted = match.status === 'accepted';

                                                return (
                                                    <div key={match.id} className={styles.matchCard}>
                                                        <div className={styles.matchHeader}>
                                                            <span className={`${styles.matchBadge} ${bothAccepted ? styles.matchBadgeAccepted : ''}`}>
                                                                {bothAccepted ? 'Matched!' : 'Pending'}
                                                            </span>
                                                            {!bothAccepted && match.expires_at && (
                                                                <span className={styles.matchTimer}>
                                                                    {getTimeRemaining(match.expires_at)}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className={styles.matchContent}>
                                                            <div className={styles.matchSide}>
                                                                <span className={styles.matchLabel}>You have</span>
                                                                <span className={styles.matchSection}>Section {myPost?.have_section}</span>
                                                            </div>
                                                            <span className={styles.matchArrow}>⇄</span>
                                                            <div className={styles.matchSide}>
                                                                <span className={styles.matchLabel}>They have</span>
                                                                <span className={styles.matchSection}>Section {theirPost?.have_section}</span>
                                                            </div>
                                                        </div>

                                                        <div className={styles.matchCourse}>
                                                            <span className={styles.courseId}>{myPost?.course_code}</span>
                                                            <span className={styles.courseName}>{myPost?.course_name || courses[myPost?.course_code]}</span>
                                                        </div>

                                                        <div className={styles.matchUser}>
                                                            <span className={styles.userName}>{theirPost?.profile?.name}</span>
                                                            <span className={styles.userMeta}>{theirPost?.profile?.student_id}</span>
                                                        </div>

                                                        {bothAccepted && contactInfoMap[theirPost?.profile?.id]?.phone && (
                                                            <div className={styles.contactInfo}>
                                                                <span>Contact: </span>
                                                                <a href={`tel:${contactInfoMap[theirPost?.profile?.id]?.phone}`}>
                                                                    {contactInfoMap[theirPost?.profile?.id]?.phone}
                                                                </a>
                                                            </div>
                                                        )}

                                                        {!bothAccepted && theirAccepted && !myAccepted && (
                                                            <div className={styles.matchStatus}>
                                                                <span className={styles.waitingYou}>
                                                                    {theirPost?.profile?.name} accepted! Waiting for you
                                                                </span>
                                                            </div>
                                                        )}
                                                        {!bothAccepted && myAccepted && !theirAccepted && (
                                                            <div className={styles.matchStatus}>
                                                                <span className={styles.waitingThem}>
                                                                    You accepted! Waiting for {theirPost?.profile?.name} to accept
                                                                </span>
                                                            </div>
                                                        )}

                                                        {!myAccepted && match.status === 'pending' && (
                                                            <div className={styles.matchActions}>
                                                                <button onClick={() => handleAccept(match.id, isUserA)} className={styles.acceptBtn}>Accept</button>
                                                                <button onClick={() => handleDecline(match.id)} className={styles.declineBtn}>Decline</button>
                                                            </div>
                                                        )}

                                                        {bothAccepted && (
                                                            <button onClick={() => handleComplete(myPost.id)} className={styles.completeBtn}>Mark as Completed</button>
                                                        )}
                                                    </div>
                                                );
                                            })}
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
