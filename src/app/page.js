'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import PostCard from '@/components/PostCard';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './page.module.css';

export default function HomePage() {
    const [posts, setPosts] = useState([]);
    const [courses, setCourses] = useState({});
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [user, setUser] = useState(null);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        checkAuth();
        fetchPosts();
        fetchCourses();
        fetchSections();
    }, []);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/auth');
            return;
        }
        setUser(user);
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

    const fetchSections = async () => {
        const { data, error } = await supabase
            .from('sections')
            .select('*');

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
          profile:profiles!posts_user_id_fkey(name, student_id, phone)
        `)
                .in('status', ['active', 'pending'])
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

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.headerTop}>
                    <div className={styles.logoContainer}>
                        <Image src="/logo.png" alt="Course Swap" width={36} height={36} className={styles.logoImage} />
                        <span className={styles.logoText}>Course Swap</span>
                    </div>
                    <ThemeToggle />
                </div>

                {/* Search */}
                <div className={styles.searchWrapper}>
                    <span className={styles.searchIcon}>🔍</span>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={styles.searchInput}
                        placeholder="Search by course ID, name, or CRN..."
                    />
                </div>

                {/* Filters */}
                <div className={styles.filters}>
                    {['all', 'swap', 'giveaway', 'request'].map((type) => (
                        <button
                            key={type}
                            onClick={() => setFilter(type)}
                            className={`${styles.filterBtn} ${filter === type ? styles.filterBtnActive : ''}`}
                        >
                            {type === 'all' ? '📋 All' :
                                type === 'swap' ? '🔄 Swaps' :
                                    type === 'giveaway' ? '🎁 Giveaways' : '🙋 Requests'}
                        </button>
                    ))}
                </div>
            </header>

            <main className={styles.main}>
                {loading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner}></div>
                        <p>Loading posts...</p>
                    </div>
                ) : filteredPosts.length === 0 ? (
                    <div className={styles.empty}>
                        <span className={styles.emptyIcon}>📭</span>
                        <h3>No posts found</h3>
                        <p>
                            {search ? 'Try a different search term' : 'Be the first to create a post!'}
                        </p>
                    </div>
                ) : (
                    <div className={styles.postList}>
                        {filteredPosts.map((post) => (
                            <PostCard
                                key={post.id}
                                post={post}
                                courseName={courses[post.course_code]}
                                showContact={post.type !== 'swap'}
                            />
                        ))}
                    </div>
                )}
            </main>

            <BottomNav />
        </div>
    );
}
