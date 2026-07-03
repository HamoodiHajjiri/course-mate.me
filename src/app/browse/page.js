'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useSemester } from '@/lib/SemesterContext';
import { SearchIcon } from '@/components/Icons';
import BottomNav from '@/components/BottomNav';
import PostCard from '@/components/PostCard';
import SectionAlerts from '@/components/SectionAlerts';
import styles from './page.module.css';

export default function BrowsePage() {
    const [posts, setPosts] = useState([]);
    const [courses, setCourses] = useState({});
    const [sections, setSections] = useState([]);
    const [majorCourses, setMajorCourses] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [user, setUser] = useState(null);
    const [interestedPostIds, setInterestedPostIds] = useState(new Set());
    const [userMajor, setUserMajor] = useState(null);
    const [userGender, setUserGender] = useState(null);
    const [transitioning, setTransitioning] = useState(false);
    const router = useRouter();
    const supabase = createClient();
    // Semester is chosen on the home page; Browse just follows the shared selection.
    const { selectedTerm } = useSemester();

    useEffect(() => {
        initializePage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!selectedTerm || !user) return;
        fetchSections(userGender);
        fetchPosts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTerm]);

    const navigateWithTransition = (path) => {
        setTransitioning(true);
        setTimeout(() => {
            router.push(path);
        }, 420);
    };

    const initializePage = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            router.replace(`/auth/reset-password?code=${code}`);
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            navigateWithTransition('/auth');
            return;
        }
        setUser(user);
        fetchMyInterests(user.id);

        const { data: profile } = await supabase
            .from('profiles')
            .select('major, gender')
            .eq('id', user.id)
            .single();

        if (profile?.major) {
            setUserMajor(profile.major);
            setUserGender(profile.gender);
            const { data: majorCoursesData } = await supabase
                .from('major_courses')
                .select('course_id')
                .eq('major_code', profile.major);

            const courseIds = majorCoursesData?.map(mc => mc.course_id) || [];
            setMajorCourses(courseIds);
        } else {
            navigateWithTransition('/profile?selectMajor=true');
            return;
        }

        fetchCourses();
        fetchSections(profile?.gender);
        fetchPosts();
    };

    const fetchMyInterests = async (userId) => {
        const { data } = await supabase
            .from('post_interests')
            .select('post_id')
            .eq('interested_user_id', userId);
        if (data) setInterestedPostIds(new Set(data.map(r => r.post_id)));
    };

    const fetchCourses = async () => {
        const { data, error } = await supabase
            .from('courses')
            .select('*');

        if (error) return;

        if (data) {
            const courseMap = {};
            data.forEach(c => courseMap[c.course_id] = c.name || c.course_name);
            setCourses(courseMap);
        }
    };

    const fetchSections = async (gender) => {
        const allowedCampuses = gender === 'male'
            ? ['main', 'men']
            : ['main', 'women'];

        let query = supabase
            .from('sections')
            .select('*')
            .in('campus', allowedCampuses);

        if (selectedTerm) query = query.eq('term_code', selectedTerm);

        const { data, error } = await query;

        if (!error && data) {
            setSections(data);
        }
    };

    const fetchPosts = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('posts')
                .select(`
          *,
          profile:profiles!posts_user_id_fkey(id, name, student_id)
        `)
                .in('status', ['active', 'pending'])
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false });

            if (selectedTerm) query = query.eq('term_code', selectedTerm);

            const { data, error } = await query;

            if (error) throw error;
            setPosts(data || []);
        } catch (error) {
            console.error('Error fetching posts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePost = async (postId) => {
        if (!confirm('Cancel this post? It will be removed for everyone.')) return;
        // cancel_post cleans up stale match_participant rows (the FK used to
        // silently block the delete) and refuses posts tied to a live match.
        const { error } = await supabase.rpc('cancel_post', { p_post_id: postId });
        if (error) {
            alert(error.message || 'Failed to cancel post.');
            return;
        }
        setPosts(prev => prev.filter(p => p.id !== postId));
    };

    const filteredPosts = posts.filter(post => {
        if (majorCourses && majorCourses.length > 0) {
            if (!majorCourses.includes(post.course_code)) return false;
        }

        if (filter !== 'all' && post.type !== filter) return false;

        if (search) {
            const searchLower = search.toLowerCase();
            const courseName = (post.course_name || courses[post.course_code] || '').toLowerCase();
            const matchesCourseCode = post.course_code?.includes(search);
            const matchesCourseName = courseName.includes(searchLower);

            const matchesCRN = sections.some(section =>
                section.crn?.toLowerCase().includes(searchLower) &&
                section.course_id === post.course_code &&
                (section.section_num === post.have_section || section.section_num === post.want_section)
            );

            if (!matchesCourseCode && !matchesCourseName && !matchesCRN) return false;
        }

        return true;
    });

    const filterLabels = {
        all: 'All Posts',
        swap: 'Swaps',
        giveaway: 'Giveaways',
        request: 'Requests',
    };

    return (
        <div className={styles.page}>
            <div className={`${styles.transitionOverlay} ${transitioning ? styles.active : ''}`} />

            <div className={styles.pageInner}>
                <aside className={styles.sidebar}>
                    <div className={styles.sidebarCard}>
                        <div className={styles.logoContainer}>
                            <div className={styles.logoWrapper}>
                                <div className={styles.logoFrame}>
                                    <Image src="/logo.png" alt="CourseMate" width={256} height={256} className={styles.logoImage} />
                                </div>
                                <div>
                                    <span className={styles.logoText}>Browse</span>
                                    <p className={styles.logoSubtitle}>Find a section to swap</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.filtersCard}>
                        <p className={styles.filtersTitle}>Filter by type</p>
                        <div className={styles.filters}>
                            {['all', 'swap', 'giveaway', 'request'].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setFilter(type)}
                                    className={`${styles.filterBtn} ${filter === type ? styles.filterBtnActive : ''}`}
                                >
                                    {filterLabels[type]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <SectionAlerts term={selectedTerm} courses={courses} sections={sections} majorCourses={majorCourses} />
                </aside>

                <main className={styles.mainContent}>
                    <div className={styles.searchCard}>
                        <div className={styles.searchWrapper}>
                            <span className={styles.searchIcon}>
                                <SearchIcon width={20} height={20} />
                            </span>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className={styles.searchInput}
                                placeholder="Search by course ID, name, or CRN..."
                            />
                        </div>
                    </div>

                    <div className={styles.feedCard}>
                        {loading ? (
                            <div className={styles.loading}>
                                <div className={styles.spinner}></div>
                                <p>Loading posts...</p>
                            </div>
                        ) : filteredPosts.length === 0 ? (
                            <div className={styles.empty}>
                                <span className={styles.emptyIcon}>📭</span>
                                <h3>No posts found</h3>
                                <p>{search ? 'Try a different search term' : 'Be the first to create a post!'}</p>
                            </div>
                        ) : (
                            <div className={styles.postList}>
                                {filteredPosts.map((post) => {
                                    const haveSectionData = sections.find(s => s.course_id === post.course_code && s.section_num === post.have_section);
                                    const wantSectionData = post.want_section ? sections.find(s => s.course_id === post.course_code && s.section_num === post.want_section) : null;

                                    const isOwn = user?.id && post.user_id === user.id;
                                    return (<PostCard key={post.id} post={post} courseName={courses[post.course_code]} haveInstructor={haveSectionData?.instructor} wantInstructor={wantSectionData?.instructor} showContact={post.type !== 'swap'} showActions={isOwn} isOwn={isOwn} onDelete={handleDeletePost} interestAlreadySent={interestedPostIds.has(post.id)} />);
                                })}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <BottomNav />
        </div>
    );
}
