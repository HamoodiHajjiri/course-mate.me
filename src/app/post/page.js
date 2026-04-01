'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './post.module.css';

const POST_TYPES = [
    { value: 'swap', label: 'Swap', description: 'Exchange your section for another' },
    { value: 'giveaway', label: 'Giveaway', description: 'Drop a section for others' },
    { value: 'request', label: 'Request', description: 'Looking for a specific section' },
];

function PostContent() {
    const [postType, setPostType] = useState('swap');
    const [courseId, setCourseId] = useState('');
    const [courseSearch, setCourseSearch] = useState('');
    const [showCourseDropdown, setShowCourseDropdown] = useState(false);
    const [haveSection, setHaveSection] = useState('');
    const [wantSection, setWantSection] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [profile, setProfile] = useState(null);
    const [activePostCount, setActivePostCount] = useState(0);
    const [courses, setCourses] = useState([]);
    const [sections, setSections] = useState([]);
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (courseId) {
            fetchSections(courseId);
        } else {
            setSections([]);
        }
    }, [courseId]);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/auth');
            return;
        }

        // Fetch profile
        const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        // Check if profile is complete (required fields filled) and has major
        const isProfileComplete = profileData?.name && profileData?.student_id && profileData?.phone;
        const hasMajor = !!profileData?.major;
        if (!isProfileComplete || !hasMajor) {
            router.push('/profile?selectMajor=true');
            return;
        }

        setProfile(profileData);

        // Fetch courses for user's major
        fetchCourses(profileData.major);

        // Count active posts
        const { count } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .in('status', ['active', 'pending']);

        setActivePostCount(count || 0);
    };

    const fetchCourses = async (userMajor) => {
        if (!userMajor) return;

        try {
            // Fetch course IDs for the user's major from major_courses junction table
            const { data: majorCourses, error: majorError } = await supabase
                .from('major_courses')
                .select('course_id')
                .eq('major_code', userMajor);

            if (majorError || !majorCourses?.length) {
                console.error('Error fetching major courses:', majorError);
                setCourses([]);
                return;
            }

            // Get the list of course IDs for this major
            const courseIds = majorCourses.map(mc => mc.course_id);

            // Fetch the actual course details
            const { data, error } = await supabase
                .from('courses')
                .select('course_id, course_name')
                .in('course_id', courseIds)
                .order('course_id');

            // Map course_name to name for consistency
            const mappedData = (data || []).map(c => ({ course_id: c.course_id, name: c.course_name }));
            setCourses(mappedData);

            // Pre-fill from URL params
            const paramType = searchParams.get('type');
            const paramCourse = searchParams.get('course');
            const paramSection = searchParams.get('section');
            if (paramType) setPostType(paramType);
            if (paramCourse) {
                const match = mappedData.find(c => c.course_id === paramCourse);
                if (match) {
                    setCourseId(match.course_id);
                    setCourseSearch(`${match.course_id} - ${match.name}`);
                }
            }
            if (paramSection) setHaveSection(paramSection);
        } catch (err) {
            console.error('fetchCourses exception:', err);
        }
    };

    const fetchSections = async (courseId) => {
        // Filter sections by campus based on user gender
        const allowedCampuses = profile?.gender === 'male'
            ? ['main', 'men']
            : ['main', 'women'];

        const { data } = await supabase
            .from('sections')
            .select('*')
            .eq('course_id', courseId)
            .in('campus', allowedCampuses)
            .order('section_num');
        setSections(data || []);
    };

    // Filter courses based on search (by name or ID)
    const filteredCourses = courseSearch.length >= 2
        ? courses.filter(c =>
            c.name?.toLowerCase().includes(courseSearch.toLowerCase()) ||
            c.course_id?.includes(courseSearch)
        ).slice(0, 10) // Limit to 10 results
        : [];



    const selectCourse = (course) => {
        setCourseId(course.course_id);
        setCourseSearch(`${course.course_id} - ${course.name}`);
        setShowCourseDropdown(false);
        setHaveSection('');
        setWantSection('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Validation
            if (!courseId) throw new Error('Please select a course');
            if (!haveSection) throw new Error('Please select a section');
            if (postType === 'swap' && !wantSection) throw new Error('Please select the section you want');
            if (postType === 'swap' && haveSection === wantSection) throw new Error('Have and want sections cannot be the same');

            // Verify course exists by checking if sections were loaded
            if (sections.length === 0) throw new Error('Please enter a valid course ID with available sections');

            // Check for duplicate posts from this user only
            const currentUser = (await supabase.auth.getUser()).data.user;
            const { data: existingPosts } = await supabase
                .from('posts')
                .select('id')
                .eq('user_id', currentUser?.id)
                .eq('course_code', courseId)
                .eq('have_section', haveSection)
                .in('status', ['active', 'pending']);

            if (existingPosts?.length > 0) {
                throw new Error('You already have an active post for this course/section combination');
            }

            // Get course name for the post
            const courseName = courses.find(c => c.course_id === courseId)?.name || '';

            // Get class times from sections
            const haveTime = sections.find(s => s.section_num === haveSection)?.class_time || '';
            const wantTime = postType === 'swap'
                ? sections.find(s => s.section_num === wantSection)?.class_time || ''
                : null;

            // Posts expire after 1 week
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            const { error: insertError } = await supabase
                .from('posts')
                .insert({
                    user_id: (await supabase.auth.getUser()).data.user?.id,
                    type: postType,
                    course_code: courseId,
                    course_name: courseName,
                    have_section: haveSection,
                    have_section_time: haveTime,
                    want_section: postType === 'swap' ? wantSection : null,
                    want_section_time: wantTime,
                    expires_at: expiresAt.toISOString(),
                });

            if (insertError) throw insertError;

            // If swap, check for matches
            if (postType === 'swap') {
                // Find matching posts (someone who has what I want and wants what I have)
                const { data: matchingPosts } = await supabase
                    .from('posts')
                    .select('*, profile:profiles!posts_user_id_fkey(id, name, email)')
                    .eq('type', 'swap')
                    .eq('course_code', courseId)
                    .eq('have_section', wantSection)
                    .eq('want_section', haveSection)
                    .eq('status', 'active')
                    .neq('user_id', currentUser?.id);

                if (matchingPosts?.length > 0) {
                    const matchingPost = matchingPosts[0];

                    // Get my newly created post
                    const { data: myPosts } = await supabase
                        .from('posts')
                        .select('id')
                        .eq('user_id', currentUser?.id)
                        .eq('course_code', courseId)
                        .eq('have_section', haveSection)
                        .in('status', ['active', 'pending'])
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (myPosts?.length > 0) {
                        const myPost = myPosts[0];

                        // Create match with 24-hour expiration
                        const matchExpiresAt = new Date();
                        matchExpiresAt.setHours(matchExpiresAt.getHours() + 24);

                        await supabase.from('matches').insert({
                            post_a_id: myPost.id,
                            post_b_id: matchingPost.id,
                            user_a_id: currentUser?.id,
                            user_b_id: matchingPost.user_id,
                            status: 'pending',
                            expires_at: matchExpiresAt.toISOString(),
                        });

                        // Lock both posts
                        await supabase
                            .from('posts')
                            .update({ status: 'pending' })
                            .in('id', [myPost.id, matchingPost.id]);

                        // Send email notifications
                        try {
                            await fetch('/api/notify-match', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    userAId: currentUser?.id,
                                    userBId: matchingPost.user_id,
                                    courseCode: courseId,
                                    courseName: courseName,
                                    userASection: haveSection,
                                    userBSection: matchingPost.have_section,
                                    userAName: profile?.name,
                                    userBName: matchingPost.profile?.name,
                                }),
                            });
                        } catch (emailErr) {
                            // Silent fail for email - don't block the user
                        }
                    }
                }
            }

            router.push('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const isMaxPosts = activePostCount >= 5;

    return (
        <div className={styles.page}>
            <div className={styles.pageInner}>
            <header className={styles.header}>
                <h1>Create Post</h1>
                <ThemeToggle />
            </header>

            <main className={styles.main}>
                {isMaxPosts ? (
                    <div className={styles.maxPostsNotice}>
                        <span className={styles.noticeIcon}></span>
                        <h3>Maximum Posts Reached</h3>
                        <p>You have {activePostCount} active posts. Mark some as completed to create new ones.</p>
                        <button onClick={() => router.push('/matches')} className={styles.manageBtn}>
                            Manage Posts
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className={styles.form}>
                        {/* Post Type Selection */}
                        <div className={styles.typeSelection}>
                            {POST_TYPES.map((type) => (
                                <button key={type.value} type="button" onClick={() => setPostType(type.value)} className={`${styles.typeBtn} ${postType === type.value ? styles[`typeBtn${type.value}`] : ''}`}>
                                    <span className={styles.typeLabel}>{type.label}</span>
                                    <span className={styles.typeDesc}>{type.description}</span>
                                </button>
                            ))}
                        </div>

                        {/* Course Selection */}
                        <div className={styles.card}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Course *</label>
                                <div className={styles.searchWrapper}>
                                    <input type="text" value={courseSearch} onChange={(e) => {
                                        setCourseSearch(e.target.value);
                                        setCourseId('');
                                        setShowCourseDropdown(true);
                                    }} onFocus={() => setShowCourseDropdown(true)} className={styles.input} placeholder="Search by course name or enter ID..." autoComplete="off" />
                                    {showCourseDropdown && filteredCourses.length > 0 && (
                                        <div className={styles.dropdown}>
                                            {filteredCourses.map(course => (
                                                <button key={course.course_id} type="button" className={styles.dropdownItem} onClick={() => selectCourse(course)}>
                                                    <span className={styles.dropdownId}>{course.course_id}</span>
                                                    <span className={styles.dropdownName}>{course.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    {postType === 'giveaway' ? 'Section to Give Away *' : postType === 'request' ? 'Section Needed *' : 'Section You Have *'}
                                </label>
                                <select value={haveSection} onChange={(e) => setHaveSection(e.target.value)} className={`${styles.input} ${styles.select}`} required>
                                    <option value="">Select section</option>
                                    {sections.map(s => (
                                        <option key={s.section_num} value={s.section_num}>
                                            Section {s.section_num} {s.professor ? `- ${s.professor}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {postType === 'swap' && (
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Section You Want *</label>
                                    <select value={wantSection} onChange={(e) => setWantSection(e.target.value)} className={`${styles.input} ${styles.select}`} required>
                                        <option value="">Select section</option>
                                        {sections.filter(s => s.section_num !== haveSection).map(s => (
                                            <option key={s.section_num} value={s.section_num}>
                                                Section {s.section_num} {s.professor ? `- ${s.professor}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Info Notice */}
                        <div className={styles.infoNotice}>
                            {postType === 'swap' ? (<>Contact info will only be shared after both parties accept the match</>) : (<>Your phone number will be visible to everyone</>)}
                        </div>

                        {error && <div className={styles.error}>{error}</div>}

                        <button type="submit" className={styles.submitBtn} disabled={loading}>
                            {loading ? <span className={styles.spinner}></span> : 'Create Post'}
                        </button>

                        <p className={styles.postCount}>
                            {activePostCount}/5 active posts
                        </p>
                    </form>
                )}
            </main>
            </div>

            <BottomNav />
        </div>
    );
}

export default function PostPage() {
    return (
        <Suspense fallback={
            <div className={styles.page}>
                <div className={styles.spinner}></div>
            </div>
        }>
            <PostContent />
        </Suspense>
    );
}
