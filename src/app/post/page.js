'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { campusFilter } from '@/lib/campus';
import { useSemester } from '@/lib/SemesterContext';
import { seatStatus } from '@/lib/seats';
import PageShell from '@/components/PageShell';
import PostCard from '@/components/PostCard';
import {
    Button, Callout, CourseCode, CourseName, EmptyState, Field, Meter, Rubric, SearchInput, Section, Spinner, Status, Switch, Transfer,
} from '@/components/ui';
import { decodeSectionInstructors } from '@/lib/text';
import styles from './post.module.css';

const POST_TYPES = [
    {
        value: 'swap', label: 'Swap', description: 'Trade your section for another one',
        tips: ['Matched automatically, including three-way loops', 'Everyone in a match has 24 hours to accept', 'Contacts unlock only after all accept'],
    },
    {
        value: 'giveaway', label: 'Giveaway', description: 'Drop a section so someone else can take it',
        tips: ['Students watching this section get alerted', 'Interested students send you their contact', 'Mark it done once someone has the seat'],
    },
    {
        value: 'request', label: 'Request', description: 'Ask for a section you need',
        tips: ['Anyone dropping this section can find you', 'They can send you their contact by email', 'Your number stays private unless you share it'],
    },
];

// Messages handleSubmit raises, matched to the field each belongs under.
const FIELD_FOR_ERROR = {
    'Please select a course': 'course',
    'Please enter a valid course ID with available sections': 'course',
    'Please select a section': 'have',
    'Please select the section you want': 'want',
    'Have and want sections cannot be the same': 'want',
};

function PostContent() {
    const [postType, setPostType] = useState('swap');
    const [courseId, setCourseId] = useState('');
    const [courseSearch, setCourseSearch] = useState('');
    const [showCourseDropdown, setShowCourseDropdown] = useState(false);
    const [haveSection, setHaveSection] = useState('');
    const [wantSection, setWantSection] = useState('');
    const [shareContact, setShareContact] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [activeIdx, setActiveIdx] = useState(-1);
    const [profile, setProfile] = useState(null);
    // null until counted, so the header never shows a wrong number.
    const [activePostCount, setActivePostCount] = useState(null);
    const [courses, setCourses] = useState([]);
    const [sections, setSections] = useState([]);
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();
    const { selectedTerm } = useSemester();

    useEffect(() => {
        checkAuth();
    }, []);

    // Re-fetch courses when semester changes
    useEffect(() => {
        if (!selectedTerm || !profile) return;
        fetchCourses(profile.major, profile.gender);
        // Reset selected course/sections since they may not exist in new term
        setCourseId('');
        setCourseSearch('');
        setSections([]);
        setHaveSection('');
        setWantSection('');
    }, [selectedTerm]);

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
        fetchCourses(profileData.major, profileData.gender);

        // Count active posts across all semesters
        const { count } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .in('status', ['active', 'pending']);

        setActivePostCount(count || 0);
    };

    const fetchCourses = async (userMajor, gender) => {
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

            let mappedData = (data || []).map(c => ({ course_id: c.course_id, name: c.course_name }));

            // Filter to only courses that have sections in the selected term AND on allowed campuses
            const activeTerm = selectedTerm || localStorage.getItem('selectedTerm');
            const userGender = gender || profile?.gender;
            const campusFilterFor = campusFilter(userGender);

            if (activeTerm) {
                const { data: termSections } = await supabase
                    .from('sections')
                    .select('course_id')
                    .eq('term_code', activeTerm)
                    .in('course_id', courseIds)
                    .or(campusFilterFor).eq('is_active', true);

                const termCourseIds = new Set((termSections || []).map(s => s.course_id));
                mappedData = mappedData.filter(c => termCourseIds.has(c.course_id));
            }

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
        const campusFilterFor = campusFilter(profile?.gender);

        let query = supabase
            .from('sections')
            .select('*')
            .eq('course_id', courseId)
            .or(campusFilterFor).eq('is_active', true)
            .order('section_num');

        if (selectedTerm) query = query.eq('term_code', selectedTerm);

        const { data } = await query;
        setSections(decodeSectionInstructors(data || []));
    };

    // Tutorial sections (e.g. "62T") are bound to their parent lecture ("62") and
    // can't be exchanged on their own, so they're hidden from the post dropdowns.
    // Lab sections (e.g. "61L") are kept — some courses are lab-only.
    const isTutorialSection = (num) => String(num || '').toUpperCase().endsWith('T');
    const selectableSections = sections.filter(s => !isTutorialSection(s.section_num));

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
        setFieldErrors(fe => ({ ...fe, course: null }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setFieldErrors({});
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
            let dupQuery = supabase
                .from('posts')
                .select('id')
                .eq('user_id', currentUser?.id)
                .eq('course_code', courseId)
                .eq('have_section', haveSection)
                .in('status', ['active', 'pending']);

            if (selectedTerm) dupQuery = dupQuery.eq('term_code', selectedTerm);

            const { data: existingPosts } = await dupQuery;

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

            const { data: newPost, error: insertError } = await supabase
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
                    term_code: selectedTerm || '202610',
                    share_contact_publicly: postType !== 'swap' && shareContact,
                })
                .select('id')
                .single();

            if (insertError) throw insertError;

            // Alert anyone watching this section (swap/giveaway makes one available).
            if (newPost?.id && (postType === 'swap' || postType === 'giveaway')) {
                fetch('/api/notify-watchers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ postId: newPost.id }),
                    keepalive: true,
                }).catch(() => { });
            }

            // If swap, run the matching engine (finds the shortest cycle: a direct
            // 2-way reciprocal swap, or a 3-way A->B->C->A loop). All matching logic,
            // post-locking and in-app notifications happen server-side in the RPC.
            if (postType === 'swap' && newPost?.id) {
                const { data: matchId } = await supabase.rpc('find_match_for_post', {
                    p_post_id: newPost.id,
                });

                // Best-effort match emails (in-app notifications already sent by the RPC).
                if (matchId) {
                    try {
                        await fetch('/api/notify-match', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ matchId }),
                        });
                    } catch (emailErr) {
                        // Silent fail for email - don't block the user
                    }
                }
            }

            router.push('/browse');
        } catch (err) {
            // Validation lands under the field it's about; anything else
            // (a duplicate post, a database error) above the submit button.
            const field = FIELD_FOR_ERROR[err.message];
            if (field) setFieldErrors({ [field]: err.message });
            else setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const isMaxPosts = activePostCount >= 5;
    const typeConfig = POST_TYPES.find(t => t.value === postType) || POST_TYPES[0];
    const haveData = sections.find(s => s.section_num === haveSection);
    const wantData = sections.find(s => s.section_num === wantSection);
    const selectedCourse = courses.find(c => c.course_id === courseId);

    // What the post will look like on Browse, from what's filled in so far.
    const draft = {
        id: 'draft',
        type: postType,
        status: 'active',
        course_code: courseId || '0000000',
        course_name: selectedCourse?.name || 'Choose a course',
        have_section: haveSection || '—',
        want_section: postType === 'swap' ? (wantSection || '—') : null,
        have_section_time: haveData?.class_time || '',
        want_section_time: postType === 'swap' ? (wantData?.class_time || '') : null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        profile: profile ? { id: null, name: profile.name, student_id: profile.student_id } : null,
    };

    const onCourseKeyDown = (e) => {
        if (!showCourseDropdown || filteredCourses.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filteredCourses.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectCourse(filteredCourses[activeIdx]); }
        else if (e.key === 'Escape') setShowCourseDropdown(false);
    };

    const clearFieldError = (key) => setFieldErrors(fe => (fe[key] ? { ...fe, [key]: null } : fe));

    const haveLabel = postType === 'giveaway' ? 'Giving' : postType === 'request' ? 'Need' : 'Have';

    return (
        <PageShell width="standard">
            <header className={styles.head}>
                <h1 className={styles.title}>New post</h1>
                <div className={styles.sentence}>
                    {activePostCount === null ? (
                        <span>A post stays on the board for a week.</span>
                    ) : (
                        <>
                            <Meter value={activePostCount} max={5} warnAt={4} label={`${activePostCount} of 5 posts live`} />
                            <span>{activePostCount} of 5 posts live. A post stays on the board for a week.</span>
                        </>
                    )}
                </div>
            </header>

            {isMaxPosts ? (
                <EmptyState
                    title="You have five posts on the board."
                    actions={<Button variant="link" onClick={() => router.push('/matches')}>Go to your posts →</Button>}
                >
                    That&rsquo;s the limit, so the board stays current. Cancel one, or mark one done, to make room.
                </EmptyState>
            ) : (
                <div className={styles.layout}>
                    <form onSubmit={handleSubmit} className={styles.slip} noValidate>
                        {/* ===== 1. Kind ===== */}
                        <section className={styles.step} aria-labelledby="step-type">
                            <span className={styles.stepNum} aria-hidden="true">1</span>
                            <div className={styles.stepBody}>
                                <h2 id="step-type" className={styles.stepTitle}>What are you posting?</h2>
                                <div className={styles.kinds} role="radiogroup" aria-labelledby="step-type">
                                    {POST_TYPES.map((type) => {
                                        const selected = postType === type.value;
                                        return (
                                            <button
                                                key={type.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                onClick={() => setPostType(type.value)}
                                                className={`${styles.kind} ${styles[`kind_${type.value}`]}`}
                                            >
                                                <span className={styles.radio} aria-hidden="true" />
                                                <span className={styles.kindName}>{type.label}</span>
                                                <span className={styles.kindDesc}>{type.description}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>

                        {/* ===== 2. Course ===== */}
                        <section className={styles.step} aria-labelledby="step-course">
                            <span className={styles.stepNum} aria-hidden="true">2</span>
                            <div className={styles.stepBody}>
                                <h2 id="step-course" className={styles.stepTitle}>Which course?</h2>
                                <Field
                                    label="Course"
                                    htmlFor="post-course"
                                    error={fieldErrors.course}
                                    hint={courses.length > 0 ? `${courses.length} courses in your major have sections this term.` : 'Reading your major’s courses…'}
                                >
                                    <div className={styles.combo}>
                                        <SearchInput
                                            id="post-course"
                                            value={courseSearch}
                                            onChange={(e) => {
                                                setCourseSearch(e.target.value);
                                                setCourseId('');
                                                setShowCourseDropdown(true);
                                                setActiveIdx(-1);
                                                clearFieldError('course');
                                            }}
                                            onClear={() => { setCourseSearch(''); setCourseId(''); setShowCourseDropdown(false); }}
                                            onFocus={() => setShowCourseDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowCourseDropdown(false), 120)}
                                            onKeyDown={onCourseKeyDown}
                                            placeholder="Code or name"
                                            autoComplete="off"
                                            role="combobox"
                                            aria-expanded={showCourseDropdown && filteredCourses.length > 0}
                                            aria-controls="post-course-list"
                                            aria-invalid={!!fieldErrors.course || undefined}
                                        />
                                        {showCourseDropdown && filteredCourses.length > 0 && (
                                            <div id="post-course-list" role="listbox" className={styles.dropdown}>
                                                {filteredCourses.map((course, i) => (
                                                    <button
                                                        key={course.course_id}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={i === activeIdx}
                                                        className={`${styles.option} ${i === activeIdx ? styles.optionActive : ''}`}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => selectCourse(course)}
                                                    >
                                                        <CourseCode id={course.course_id} size="sm" />
                                                        <CourseName size="sm">{course.name}</CourseName>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {showCourseDropdown && courseSearch.length >= 2 && !courseId && filteredCourses.length === 0 && courses.length > 0 && (
                                            <div className={styles.dropdown}>
                                                <p className={styles.noOption}>No course in your major matches &ldquo;{courseSearch}&rdquo; this term.</p>
                                            </div>
                                        )}
                                    </div>
                                </Field>
                            </div>
                        </section>

                        {/* ===== 3. Sections ===== */}
                        <section className={`${styles.step} ${!courseId ? styles.stepIdle : ''}`} aria-labelledby="step-sections">
                            <span className={styles.stepNum} aria-hidden="true">3</span>
                            <div className={styles.stepBody}>
                                <h2 id="step-sections" className={styles.stepTitle}>
                                    {postType === 'swap' ? 'Which section do you have, and which do you want?' : postType === 'giveaway' ? 'Which section are you giving away?' : 'Which section do you need?'}
                                </h2>
                                {!courseId ? (
                                    <p className={styles.stepHint}>Choose a course and its sections are listed here, with their times and instructors side by side.</p>
                                ) : selectableSections.length === 0 ? (
                                    <p className={styles.stepHint}>No sections of this course on your campus this term.</p>
                                ) : (
                                    <div className={styles.tableWrap}>
                                        <table className={styles.sectionTable}>
                                            <thead>
                                                <tr>
                                                    <th scope="col">Section</th>
                                                    <th scope="col">When</th>
                                                    <th scope="col" className={styles.colWho}>Instructor</th>
                                                    <th scope="col" className={styles.colSeats}>Seats</th>
                                                    <th scope="col" className={styles.colPick}>{haveLabel}</th>
                                                    {postType === 'swap' && <th scope="col" className={styles.colPick}>Want</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectableSections.map(s => {
                                                    const seats = seatStatus(s);
                                                    const isHave = haveSection === s.section_num;
                                                    const isWant = wantSection === s.section_num;
                                                    return (
                                                        <tr key={s.section_num} className={`${isHave ? styles.rowHave : ''} ${isWant ? styles.rowWant : ''}`}>
                                                            <td><Section value={s.section_num} tone={isWant || (isHave && postType === 'request') ? 'mine' : 'plain'} /></td>
                                                            <td className={styles.when}>
                                                                {s.class_time || <span className={styles.none}>no set time</span>}
                                                                {/* On a phone the instructor and seat columns fold in under the time. */}
                                                                <span className={styles.whenMeta}>
                                                                    {s.instructor || <span className={styles.none}>staff</span>}
                                                                    {seats && <Status tone={seats.tone === 'open' ? 'go' : seats.tone === 'low' ? 'warn' : 'danger'} title={seats.title}>{seats.label}</Status>}
                                                                </span>
                                                            </td>
                                                            <td className={styles.colWho}>{s.instructor || <span className={styles.none}>staff</span>}</td>
                                                            <td className={styles.colSeats}>{seats && <Status tone={seats.tone === 'open' ? 'go' : seats.tone === 'low' ? 'warn' : 'danger'} title={seats.title}>{seats.label}</Status>}</td>
                                                            <td className={styles.colPick}>
                                                                <input
                                                                    type="radio"
                                                                    name="have"
                                                                    className={styles.pick}
                                                                    checked={isHave}
                                                                    onChange={() => { setHaveSection(s.section_num); if (wantSection === s.section_num) setWantSection(''); clearFieldError('have'); }}
                                                                    aria-label={`${haveLabel} section ${s.section_num}`}
                                                                />
                                                            </td>
                                                            {postType === 'swap' && (
                                                                <td className={styles.colPick}>
                                                                    <input
                                                                        type="radio"
                                                                        name="want"
                                                                        className={styles.pick}
                                                                        checked={isWant}
                                                                        disabled={isHave}
                                                                        onChange={() => { setWantSection(s.section_num); clearFieldError('want'); }}
                                                                        aria-label={`Want section ${s.section_num}`}
                                                                    />
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {(fieldErrors.have || fieldErrors.want) && (
                                    <p className={styles.fieldError} role="alert">{fieldErrors.have || fieldErrors.want}</p>
                                )}
                                {courseId && postType === 'swap' && haveSection && wantSection && (
                                    <Transfer from={haveSection} to={wantSection} toTone="mine" className={styles.summaryTransfer}>for</Transfer>
                                )}
                            </div>
                        </section>

                        {/* ===== 4. Contact ===== */}
                        <section className={styles.step} aria-labelledby="step-contact">
                            <span className={styles.stepNum} aria-hidden="true">4</span>
                            <div className={styles.stepBody}>
                                <h2 id="step-contact" className={styles.stepTitle}>How do people reach you?</h2>
                                {postType !== 'swap' && (
                                    <label className={styles.shareRow}>
                                        <span>
                                            <span className={styles.shareLabel}>Show my phone number on the post</span>
                                            <span className={styles.shareSub}>Anyone on the board can call or message you directly.</span>
                                        </span>
                                        <Switch checked={shareContact} onChange={setShareContact} label="Show my phone number on the post" />
                                    </label>
                                )}
                                <Callout tone={postType === 'swap' ? 'success' : shareContact ? 'warning' : 'info'}>
                                    {postType === 'swap'
                                        ? (<>Your number stays private. It&rsquo;s shared only once everyone in a match has accepted.</>)
                                        : shareContact
                                            ? (<>Your number will be visible to anyone who opens the board.</>)
                                            : (<>Your number stays private. People tap &ldquo;I&rsquo;m interested&rdquo; and you get their contact by email.</>)}
                                </Callout>
                            </div>
                        </section>

                        {/* ===== How it will look ===== */}
                        <section className={styles.previewBlock} aria-label="Preview">
                            <Rubric title="On the board, it will read" quiet />
                            <PostCard post={draft} isOwn standalone courseName={selectedCourse ? `${selectedCourse.course_id} · ${selectedCourse.name}` : undefined} />
                        </section>

                        {error && <Callout tone="danger" title="This post didn’t go up">{error}</Callout>}

                        <div className={styles.submitRow}>
                            <Button type="submit" variant="primary" size="lg" loading={loading}>
                                Post the {typeConfig.label.toLowerCase()}
                            </Button>
                            <ul className={styles.tips}>
                                {typeConfig.tips.map(tip => <li key={tip}>{tip}</li>)}
                            </ul>
                        </div>
                    </form>
                </div>
            )}
        </PageShell>
    );
}

export default function PostPage() {
    return (
        <Suspense fallback={
            <PageShell width="standard">
                <Spinner center size="lg" />
            </PageShell>
        }>
            <PostContent />
        </Suspense>
    );
}
