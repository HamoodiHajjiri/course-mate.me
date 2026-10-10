'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/fetchAll';
import { campusFilter } from '@/lib/campus';
import { useSemester } from '@/lib/SemesterContext';
import { ActivityIcon, GiftIcon, HandIcon, InboxIcon, LayersIcon, PlusIcon, SearchIcon } from '@/components/Icons';
import PageShell from '@/components/PageShell';
import PageHeader from '@/components/PageHeader';
import PostCard from '@/components/PostCard';
import { Button, CourseSwatch, EmptyState, Kbd, SearchInput, SegmentedControl, Select, Skeleton, useConfirm, useToast } from '@/components/ui';
import SectionAlerts from '@/components/SectionAlerts';
import { decodeSectionInstructors } from '@/lib/text';
import styles from './page.module.css';

const TYPE_FILTERS = [
    { value: 'all', label: 'All posts', singular: 'post', icon: LayersIcon },
    { value: 'swap', label: 'Swaps', singular: 'swap', icon: ActivityIcon, cta: 'Post a swap', empty: 'Nobody is offering a swap in your major right now. Post yours and the matcher will look for a direct swap or a three-way loop.' },
    { value: 'giveaway', label: 'Giveaways', singular: 'giveaway', icon: GiftIcon, cta: 'Give a section away', empty: 'No one is giving a section away right now. Set a section alert and we\u2019ll tell you the moment one is posted.' },
    { value: 'request', label: 'Requests', singular: 'request', icon: HandIcon, cta: 'Request a section', empty: 'No open requests right now. If you need a section, post a request so anyone dropping it can find you.' },
];

export default function BrowsePage() {
    const [posts, setPosts] = useState([]);
    const [courses, setCourses] = useState({});
    const [sections, setSections] = useState([]);
    const [majorCourses, setMajorCourses] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [courseFilter, setCourseFilter] = useState('');
    const [sort, setSort] = useState('newest');
    const [showAllCourses, setShowAllCourses] = useState(false);
    const [user, setUser] = useState(null);
    const [interestedPostIds, setInterestedPostIds] = useState(new Set());
    const [userMajor, setUserMajor] = useState(null);
    const [userGender, setUserGender] = useState(null);
    const [transitioning, setTransitioning] = useState(false);
    const router = useRouter();
    const supabase = createClient();
    // Semester is chosen on the home page; Browse just follows the shared selection.
    const { selectedTerm, semesters } = useSemester();
    const confirm = useConfirm();
    const toast = useToast();
    const searchRef = useRef(null);

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

    // Live updates: someone else creating, cancelling, or getting matched on a
    // post in this term shows up here immediately, with no manual refresh.
    // No server-side filter here on purpose: Postgres only ships the primary
    // key for a DELETE's old row (unless REPLICA IDENTITY FULL is set), so a
    // filter on term_code would silently never match cancellations — fetchPosts
    // itself already re-queries scoped to selectedTerm.
    useEffect(() => {
        if (!selectedTerm || !user || typeof supabase.channel !== 'function') return;
        const channel = supabase
            .channel(`browse-posts-${selectedTerm}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => fetchPosts())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTerm, user]);

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
        // A search handed over by the command palette or a shared link.
        const q = urlParams.get('q');
        if (q) setSearch(q);

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

        let courseIds = [];
        if (profile?.major) {
            setUserMajor(profile.major);
            setUserGender(profile.gender);
            const { data: majorCoursesData } = await supabase
                .from('major_courses')
                .select('course_id')
                .eq('major_code', profile.major);

            courseIds = majorCoursesData?.map(mc => mc.course_id) || [];
            setMajorCourses(courseIds);
        } else {
            navigateWithTransition('/profile?selectMajor=true');
            return;
        }

        fetchCourses();
        // The state set just above is not readable yet, so hand the ids over.
        fetchSections(profile?.gender, courseIds);
        fetchPosts();
    };

    const fetchMyInterests = async (userId) => {
        const { data } = await supabase
            .from('post_interests')
            .select('post_id')
            .eq('interested_user_id', userId);
        if (data) setInterestedPostIds(new Set(data.map(r => r.post_id)));
    };

    // Only the name is used here, and the table carries every course Banner
    // lists, so this reads two columns and pages through them.
    const fetchCourses = async () => {
        const { data, error } = await fetchAllRows(() => supabase
            .from('courses')
            .select('course_id, course_name'));

        if (error) return;

        if (data) {
            const courseMap = {};
            data.forEach(c => courseMap[c.course_id] = c.name || c.course_name);
            setCourses(courseMap);
        }
    };

    // Scoped to the student's own courses: posts and section alerts are both
    // limited to their major, and a term now holds every course's sections.
    const fetchSections = async (gender, courseIds = majorCourses) => {
        const campusFilterFor = campusFilter(gender);
        if (!courseIds?.length) return;

        const { data, error } = await fetchAllRows(() => {
            let query = supabase
                .from('sections')
                .select('*')
                .in('course_id', courseIds)
                .or(campusFilterFor).eq('is_active', true);

            if (selectedTerm) query = query.eq('term_code', selectedTerm);
            return query;
        });

        if (!error && data) {
            // Decode here rather than in PostCard: every consumer of `sections`
            // wants the readable name, and this is the only place it enters.
            setSections(decodeSectionInstructors(data));
        }
    };

    const fetchPosts = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('posts')
                .select(`
          *,
          profile:profiles_public!posts_user_id_fkey(id, name, student_id)
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
        const ok = await confirm({
            title: 'Cancel this post?',
            body: 'It will be removed from Browse for everyone. You can post it again later.',
            confirmLabel: 'Cancel post',
            cancelLabel: 'Keep it',
            tone: 'danger',
        });
        if (!ok) return;
        // cancel_post cleans up stale match_participant rows (the FK used to
        // silently block the delete) and refuses posts tied to a live match.
        const { error } = await supabase.rpc('cancel_post', { p_post_id: postId });
        if (error) {
            toast.error(error.message || 'Failed to cancel post.');
            return;
        }
        setPosts(prev => prev.filter(p => p.id !== postId));
        toast.success('Post cancelled');
    };

    const inMajor = (post) => !(majorCourses && majorCourses.length > 0) || majorCourses.includes(post.course_code);

    const matchesSearch = (post) => {
        if (!search) return true;
        const searchLower = search.toLowerCase();
        const courseName = (post.course_name || courses[post.course_code] || '').toLowerCase();
        const matchesCourseCode = post.course_code?.includes(search);
        const matchesCourseName = courseName.includes(searchLower);

        const matchesCRN = sections.some(section =>
            section.crn?.toLowerCase().includes(searchLower) &&
            section.course_id === post.course_code &&
            (section.section_num === post.have_section || section.section_num === post.want_section)
        );

        return matchesCourseCode || matchesCourseName || matchesCRN;
    };

    // Faceted: each filter's counts ignore that filter itself, so every option
    // says how many it would show.
    const base = posts.filter(post => inMajor(post) && matchesSearch(post));
    const byType = (p) => filter === 'all' || p.type === filter;
    const byCourse = (p) => !courseFilter || p.course_code === courseFilter;
    const filteredPosts = base
        .filter(p => byType(p) && byCourse(p))
        .sort((a, b) => (sort === 'expiring'
            ? new Date(a.expires_at || 8.64e15) - new Date(b.expires_at || 8.64e15)
            : new Date(b.created_at) - new Date(a.created_at)));
    const forTypes = base.filter(byCourse);
    const typeCounts = {
        all: forTypes.length,
        swap: forTypes.filter(p => p.type === 'swap').length,
        giveaway: forTypes.filter(p => p.type === 'giveaway').length,
        request: forTypes.filter(p => p.type === 'request').length,
    };
    const courseCounts = [...base.filter(byType).reduce((m, p) => m.set(p.course_code, (m.get(p.course_code) || 0) + 1), new Map())]
        .map(([code, count]) => ({ code, count, name: courses[code] || base.find(p => p.course_code === code)?.course_name || '' }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    if (courseFilter && !courseCounts.some(c => c.code === courseFilter)) {
        courseCounts.unshift({ code: courseFilter, count: 0, name: courses[courseFilter] || '' });
    }
    const shownCourses = showAllCourses ? courseCounts : courseCounts.slice(0, 6);

    // "/" jumps to the search box from anywhere on the page.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
            e.preventDefault();
            searchRef.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const termName = semesters.find(s => s.term_code === selectedTerm)?.name;
    const activeType = TYPE_FILTERS.find(t => t.value === filter);
    const ActiveTypeIcon = activeType.icon;
    const hasQuery = !!search.trim();
    const anyFilter = hasQuery || filter !== 'all' || !!courseFilter;
    const clearAll = () => { setSearch(''); setFilter('all'); setCourseFilter(''); };

    return (
        <PageShell width="wide">
            <div className={`${styles.transitionOverlay} ${transitioning ? styles.active : ''}`} />

            <PageHeader
                title="Browse"
                subtitle={`Sections your classmates are swapping, giving away and looking for${termName ? ` in ${termName}` : ''}.`}
            >
                <Button variant="primary" href="/post" icon={<PlusIcon strokeWidth={2.1} />} className={styles.headerPost}>New post</Button>
            </PageHeader>

            <div className={styles.layout}>
                <aside className={styles.rail} aria-label="Filters">
                    <nav className={styles.facet} aria-label="Filter by type">
                        <span className={styles.railLabel}>Type</span>
                        <div className={styles.typeNav}>
                            {TYPE_FILTERS.map(t => {
                                const Icon = t.icon;
                                const isActive = filter === t.value;
                                return (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setFilter(t.value)}
                                        className={`${styles.typeBtn} ${styles[`type_${t.value}`]} ${isActive ? styles.typeBtnActive : ''}`}
                                        aria-pressed={isActive}
                                    >
                                        <span className={styles.typeIcon}><Icon /></span>
                                        <span className={styles.typeLabel}>{t.label}</span>
                                        <span className={styles.typeCount}>{loading ? '–' : typeCounts[t.value]}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </nav>

                    {!loading && courseCounts.length > 0 && (
                        <nav className={`${styles.facet} ${styles.courseFacet}`} aria-label="Filter by course">
                            <span className={styles.railLabel}>
                                Courses
                                {courseFilter && <button type="button" className={styles.facetClear} onClick={() => setCourseFilter('')}>Clear</button>}
                            </span>
                            <div className={styles.courseList}>
                                {shownCourses.map(c => {
                                    const isActive = courseFilter === c.code;
                                    return (
                                        <button
                                            key={c.code}
                                            type="button"
                                            className={`${styles.courseBtn} ${isActive ? styles.courseBtnActive : ''}`}
                                            onClick={() => setCourseFilter(isActive ? '' : c.code)}
                                            aria-pressed={isActive}
                                            title={c.name}
                                        >
                                            <CourseSwatch courseId={c.code} size="sm" />
                                            <span className={styles.courseText}>
                                                <span className={styles.courseName}>{c.name || c.code}</span>
                                                <span className={styles.courseCode}>{c.code}</span>
                                            </span>
                                            <span className={styles.typeCount}>{c.count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {courseCounts.length > 6 && (
                                <button type="button" className={styles.showMore} onClick={() => setShowAllCourses(v => !v)}>
                                    {showAllCourses ? 'Show fewer' : `Show all ${courseCounts.length} courses`}
                                </button>
                            )}
                        </nav>
                    )}

                    <SectionAlerts term={selectedTerm} courses={courses} sections={sections} majorCourses={majorCourses} />
                </aside>

                <section className={styles.main} aria-label="Posts">
                    <div className={styles.searchBar}>
                        <SearchInput
                            ref={searchRef}
                            size="lg"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by course ID, name or CRN"
                            aria-label="Search posts by course ID, name or CRN"
                            trailing={<span className={styles.searchHint}><Kbd>/</Kbd></span>}
                        />
                    </div>

                    <div className={styles.toolbar}>
                        <p className={styles.resultsCount} aria-live="polite">
                            {loading ? 'Loading posts…' : (
                                <>
                                    <strong>{filteredPosts.length}</strong>
                                    {' '}
                                    {filter === 'all'
                                        ? (filteredPosts.length === 1 ? 'post' : 'posts')
                                        : (filteredPosts.length === 1 ? activeType.singular : activeType.label.toLowerCase())}
                                    {courseFilter && <> in <span className={styles.mono}>{courseFilter}</span></>}
                                    {hasQuery && <> matching &ldquo;{search.trim()}&rdquo;</>}
                                </>
                            )}
                        </p>
                        <div className={styles.toolbarEnd}>
                            {anyFilter && !loading && (
                                <button type="button" className={styles.clearFilters} onClick={clearAll}>
                                    Clear filters
                                </button>
                            )}
                            {!loading && courseCounts.length > 0 && (
                                <Select
                                    size="sm"
                                    wrapClassName={styles.courseSelect}
                                    value={courseFilter}
                                    onChange={(e) => setCourseFilter(e.target.value)}
                                    aria-label="Filter by course"
                                >
                                    <option value="">All courses</option>
                                    {courseCounts.map(c => <option key={c.code} value={c.code}>{c.code} · {c.name} ({c.count})</option>)}
                                </Select>
                            )}
                            <SegmentedControl
                                size="sm"
                                label="Sort posts"
                                value={sort}
                                onChange={setSort}
                                options={[
                                    { value: 'newest', label: 'Newest' },
                                    { value: 'expiring', label: 'Ending soon' },
                                ]}
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className={styles.postGrid} aria-hidden="true">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className={styles.skeletonCard}>
                                    <div className={styles.skeletonRow}>
                                        <Skeleton width={32} height={32} radius={9} />
                                        <span className={styles.skeletonStack}>
                                            <Skeleton width="70%" height={14} />
                                            <Skeleton width={110} height={10} />
                                        </span>
                                        <Skeleton width={66} height={22} radius={6} />
                                    </div>
                                    <div className={styles.skeletonTickets}>
                                        <Skeleton height={86} radius={10} />
                                        <Skeleton height={86} radius={10} />
                                    </div>
                                    <div className={styles.skeletonRow}>
                                        <Skeleton width={150} height={26} radius={13} />
                                        <Skeleton width={110} height={32} radius={8} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredPosts.length === 0 ? (
                        <div className={styles.emptyWrap}>
                            {hasQuery || courseFilter ? (
                                <EmptyState
                                    tone="neutral"
                                    icon={<SearchIcon />}
                                    title={hasQuery ? `Nothing matches “${search.trim()}”` : `No ${filter === 'all' ? 'posts' : activeType.label.toLowerCase()} for ${courseFilter} yet`}
                                    actions={(
                                        <>
                                            <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
                                            <Button variant="primary" href={courseFilter ? `/post?course=${courseFilter}` : '/post'} icon={<PlusIcon />}>Post it yourself</Button>
                                        </>
                                    )}
                                >
                                    {hasQuery
                                        ? <>Try a course ID like 0401211, part of a course name, or a section&rsquo;s CRN. Only courses in your major are listed.</>
                                        : <>Be the first: post the section you have or need, or set a section alert below and we&rsquo;ll tell you when one appears.</>}
                                </EmptyState>
                            ) : filter !== 'all' ? (
                                <EmptyState
                                    tone="neutral"
                                    icon={<ActiveTypeIcon />}
                                    title={`No ${activeType.label.toLowerCase()} right now`}
                                    actions={(
                                        <>
                                            <Button variant="secondary" onClick={() => setFilter('all')}>Show all posts</Button>
                                            <Button variant="primary" href={`/post?type=${filter}`} icon={<PlusIcon />}>{activeType.cta}</Button>
                                        </>
                                    )}
                                >
                                    {activeType.empty}
                                </EmptyState>
                            ) : (
                                <EmptyState
                                    icon={<InboxIcon />}
                                    title="The marketplace is quiet"
                                    actions={(
                                        <Button variant="primary" href="/post" icon={<PlusIcon />}>Create the first post</Button>
                                    )}
                                >
                                    No one in your major has posted a section{termName ? ` for ${termName}` : ''} yet. Post yours, or set a section alert and we&rsquo;ll tell you when one appears.
                                </EmptyState>
                            )}
                        </div>
                    ) : (
                        <div className={styles.postGrid}>
                            {filteredPosts.map((post) => {
                                const haveSectionData = sections.find(s => s.course_id === post.course_code && s.section_num === post.have_section);
                                const wantSectionData = post.want_section ? sections.find(s => s.course_id === post.course_code && s.section_num === post.want_section) : null;

                                const isOwn = user?.id && post.user_id === user.id;
                                return (
                                    <PostCard
                                        key={post.id}
                                        post={post}
                                        courseName={courses[post.course_code]}
                                        haveInstructor={haveSectionData?.instructor}
                                        wantInstructor={wantSectionData?.instructor}
                                        haveSeats={haveSectionData}
                                        wantSeats={wantSectionData}
                                        showContact={post.type !== 'swap'}
                                        showActions={isOwn}
                                        isOwn={isOwn}
                                        onDelete={handleDeletePost}
                                        interestAlreadySent={interestedPostIds.has(post.id)}
                                    />
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </PageShell>
    );
}
