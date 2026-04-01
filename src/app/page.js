'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { SearchIcon } from '@/components/Icons';
import BottomNav from '@/components/BottomNav';
import PostCard from '@/components/PostCard';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './page.module.css';

export default function HomePage() {
    const [posts, setPosts] = useState([]);
    const [courses, setCourses] = useState({});
    const [sections, setSections] = useState([]);
    const [majorCourses, setMajorCourses] = useState(null); // null = loading, [] = no major set
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [user, setUser] = useState(null);
    const [userMajor, setUserMajor] = useState(null);
    const [userGender, setUserGender] = useState(null);
    const [transitioning, setTransitioning] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        initializePage();
    }, []);

    const navigateWithTransition = (path) => {
        setTransitioning(true);
        setTimeout(() => {
            router.push(path);
        }, 420);
    };

    const initializePage = async () => {
        // Handle auth callback code (e.g., from password reset email)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            // Redirect to reset-password page with the code — let it handle the exchange
            router.replace(`/auth/reset-password?code=${code}`);
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            navigateWithTransition('/auth');
            return;
        }
        setUser(user);

        // Fetch user's profile to get their major and gender
        const { data: profile } = await supabase
            .from('profiles')
            .select('major, gender')
            .eq('id', user.id)
            .single();

        if (profile?.major) {
            setUserMajor(profile.major);
            setUserGender(profile.gender);
            // Fetch courses for user's major
            const { data: majorCoursesData } = await supabase
                .from('major_courses')
                .select('course_id')
                .eq('major_code', profile.major);

            const courseIds = majorCoursesData?.map(mc => mc.course_id) || [];
            setMajorCourses(courseIds);
        } else {
            // User has no major set - redirect to profile to select one
            navigateWithTransition('/profile?selectMajor=true');
            return;
        }

        fetchCourses();
        fetchSections(profile?.gender);
        fetchPosts();
    };

    const fetchCourses = async () => {
        const { data, error } = await supabase
            .from('courses')
            .select('*');

        if (error) {
            return;
        }

        if (data) {
            const courseMap = {};
            data.forEach(c => courseMap[c.course_id] = c.name || c.course_name);
            setCourses(courseMap);
        }
    };

    const fetchSections = async (gender) => {
        // Filter sections by campus based on user gender
        const allowedCampuses = gender === 'male'
            ? ['main', 'men']
            : ['main', 'women'];

        const { data, error } = await supabase
            .from('sections')
            .select('*')
            .in('campus', allowedCampuses);

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

            const { data, error } = await query;

            if (error) throw error;
            setPosts(data || []);
        } catch (error) {
            console.error('Error fetching posts:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredPosts = posts.filter(post => {
        // Major filter - only show posts for courses in user's major
        // If majorCourses is null (loading) or empty array with no major, show all
        if (majorCourses && majorCourses.length > 0) {
            if (!majorCourses.includes(post.course_code)) return false;
        }

        // Type filter
        if (filter !== 'all' && post.type !== filter) return false;

        // Search filter
        if (search) {
            const searchLower = search.toLowerCase();
            const courseName = (post.course_name || courses[post.course_code] || '').toLowerCase();
            const matchesCourseCode = post.course_code?.includes(search);
            const matchesCourseName = courseName.includes(searchLower);

            // Check CRN match - find if any section's CRN matches the search
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
            {/* Transition overlay */}
            <div className={`${styles.transitionOverlay} ${transitioning ? styles.active : ''}`} />

            <div className={styles.pageInner}>
                {/* ===== Sidebar ===== */}
                <aside className={styles.sidebar}>
                    {/* Logo card */}
                    <div className={styles.sidebarCard}>
                        <div className={styles.logoContainer}>
                            <div className={styles.logoFrame}>
                                <Image src="/logo.png" alt="CourseMate" width={256} height={256} className={styles.logoImage} />
                            </div>
                            <div>
                                <span className={styles.logoText}>CourseMate</span>
                                <p className={styles.logoSubtitle}>Course section exchange</p>
                            </div>
                        </div>
                        <div className={styles.themeToggleArea}>
                            <span className={styles.themeLabel}>Theme</span>
                            <ThemeToggle />
                        </div>
                    </div>

                    {/* Filter card */}
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
                </aside>

                {/* ===== Main Feed ===== */}
                <main className={styles.mainContent}>
                    {/* Search */}
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

                    {/* Posts */}
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

                                    return (<PostCard key={post.id} post={post} courseName={courses[post.course_code]} haveInstructor={haveSectionData?.instructor} wantInstructor={wantSectionData?.instructor} showContact={post.type !== 'swap'} />);
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
