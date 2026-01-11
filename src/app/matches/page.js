'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './matches.module.css';

export default function MatchesPage() {
    const [matches, setMatches] = useState([]);
    const [myPosts, setMyPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [courses, setCourses] = useState({});
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/auth');
            return;
        }
        setUser(user);
        fetchMatches(user.id);
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
            .select(`
        *,
        post_a:posts!matches_post_a_id_fkey(*, profile:profiles!posts_user_id_fkey(name, student_id, phone)),
        post_b:posts!matches_post_b_id_fkey(*, profile:profiles!posts_user_id_fkey(name, student_id, phone))
      `)
            .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false });

        // Filter out matches where the current user's post is completed
        // (other user can still see their side of the match)
        const activeMatches = (data || []).filter(match => {
            const isUserA = match.user_a_id === userId;
            const myPost = isUserA ? match.post_a : match.post_b;
            // Only hide if MY post is completed
            return myPost?.status !== 'completed';
        });

        setMatches(activeMatches);
        setLoading(false);
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

    const handleAccept = async (matchId, isUserA) => {
        try {
            const update = isUserA
                ? { user_a_accepted: true }
                : { user_b_accepted: true };

            // Check if other party has accepted
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

        // Update match status to declined
        await supabase
            .from('matches')
            .update({ status: 'declined' })
            .eq('id', matchId);

        // Unlock both posts
        await supabase
            .from('posts')
            .update({ status: 'active' })
            .in('id', [match.post_a_id, match.post_b_id]);

        // Helper function to find and create a new match for a post
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

                // Create new match
                await supabase.from('matches').insert({
                    post_a_id: post.id,
                    post_b_id: newMatch.id,
                    user_a_id: post.user_id,
                    user_b_id: newMatch.user_id,
                    status: 'pending',
                });

                // Lock both posts
                await supabase
                    .from('posts')
                    .update({ status: 'pending' })
                    .in('id', [post.id, newMatch.id]);

                // Send email notifications
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

                return true; // Match found
            }
            return false;
        };

        // Try to find new matches for BOTH posts
        // First, try to rematch "my" post (decliner's post)
        const myPostMatched = await findNewMatch(myPost, theirPost?.id);

        // Then, try to rematch "their" post (the other user's post)
        // But only if my post didn't match with theirs already
        if (!myPostMatched) {
            await findNewMatch(theirPost, myPost?.id);
        }

        fetchMatches(user.id);
        fetchMyPosts(user.id);
    };

    const handleComplete = async (postId) => {
        // Update the post status
        await supabase
            .from('posts')
            .update({ status: 'completed' })
            .eq('id', postId);

        // Find and complete any associated match
        const associatedMatch = matches.find(
            m => m.post_a_id === postId || m.post_b_id === postId
        );

        if (associatedMatch) {
            // Just remove from local state - the post being completed is the source of truth
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

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h1>🔄 Matches & My Posts</h1>
                <ThemeToggle />
            </header>

            <main className={styles.main}>
                {loading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner}></div>
                    </div>
                ) : (
                    <>
                        {/* Active Matches */}
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
                                                        {bothAccepted ? '✅ Matched!' : '⏳ Pending'}
                                                    </span>
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

                                                {/* User Info */}
                                                <div className={styles.matchUser}>
                                                    <span className={styles.userName}>{theirPost?.profile?.name}</span>
                                                    <span className={styles.userMeta}>
                                                        {theirPost?.profile?.student_id}
                                                    </span>
                                                </div>

                                                {/* Contact Info (only if both accepted) */}
                                                {bothAccepted && (
                                                    <div className={styles.contactInfo}>
                                                        <span>📞 Contact: </span>
                                                        <a href={`tel:${theirPost?.profile?.phone}`}>
                                                            {theirPost?.profile?.phone}
                                                        </a>
                                                    </div>
                                                )}

                                                {/* Status */}
                                                {!bothAccepted && (
                                                    <div className={styles.matchStatus}>
                                                        {theirAccepted && !myAccepted && (
                                                            <span className={styles.waitingYou}>
                                                                {theirPost?.profile?.name} accepted! Waiting for you
                                                            </span>
                                                        )}
                                                        {myAccepted && !theirAccepted && (
                                                            <span className={styles.waitingThem}>
                                                                You accepted! Waiting for {theirPost?.profile?.name} to accept
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Actions */}
                                                {!myAccepted && match.status === 'pending' && (
                                                    <div className={styles.matchActions}>
                                                        <button
                                                            onClick={() => handleAccept(match.id, isUserA)}
                                                            className={styles.acceptBtn}
                                                        >
                                                            ✓ Accept
                                                        </button>
                                                        <button
                                                            onClick={() => handleDecline(match.id)}
                                                            className={styles.declineBtn}
                                                        >
                                                            ✕ Decline
                                                        </button>
                                                    </div>
                                                )}

                                                {bothAccepted && (
                                                    <button
                                                        onClick={() => handleComplete(myPost.id)}
                                                        className={styles.completeBtn}
                                                    >
                                                        ✓ Mark as Completed
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* My Posts */}
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
                                                    {post.type === 'swap' ? '🔄' : post.type === 'giveaway' ? '🎁' : '🙋'}
                                                    {post.type?.charAt(0).toUpperCase() + post.type?.slice(1)}
                                                </span>
                                                <span className={`${styles.postStatus} ${styles[`postStatus${post.status}`]}`}>
                                                    {post.status}
                                                </span>
                                            </div>

                                            <div className={styles.postDetails}>
                                                <span className={styles.courseId}>{post.course_code}</span>
                                                <span className={styles.courseName}>
                                                    {post.course_name || courses[post.course_code] || `Course: ${Object.keys(courses).length} loaded`}
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
                                                    <button
                                                        onClick={() => handleComplete(post.id)}
                                                        className={styles.completePostBtn}
                                                        title="Mark this post as completed/swapped"
                                                    >
                                                        ✓ Swapped
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(post.id)}
                                                        className={styles.deletePostBtn}
                                                        title="Cancel and remove this post"
                                                    >
                                                        ✕ Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </main>

            <BottomNav />
        </div>
    );
}
