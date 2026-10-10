'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { campusFilter } from '@/lib/campus';
import { useSemester } from '@/lib/SemesterContext';
import { isPushSupported, getPushState, subscribeToPush, unsubscribeFromPush } from '@/lib/push/client';
import PageShell from '@/components/PageShell';
import ThemeToggle from '@/components/ThemeToggle';
import {
    Button, Callout, Field, Input, Rubric, SearchInput, Select, Skeleton, Switch, useConfirm, useToast,
} from '@/components/ui';
import styles from './profile.module.css';

const CAMPUS = { male: "Men's campus", female: "Women's campus" };

const SECTIONS = [
    { id: 'details', label: 'Details' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'account', label: 'Account' },
];

const EMAIL_PREFS = [
    { field: 'email_match_alerts', label: 'Swap matches', sub: 'When a swap match is found for you' },
    { field: 'email_interest_alerts', label: 'Interest in your posts', sub: "When someone's interested in your giveaway or request" },
    { field: 'email_watch_alerts', label: 'Section alerts', sub: "When a section you're watching becomes available" },
    // Separate from the watch alert above: that one fires when a section you
    // already know about frees a seat, this one when a section appears that
    // was never there before.
    { field: 'email_new_section_alerts', label: 'New sections', sub: "When a new section opens in a course you're planning" },
];

// Inner component that uses useSearchParams
function ProfileContent() {
    const [profile, setProfile] = useState(null);
    const [majorName, setMajorName] = useState(null);
    const [majors, setMajors] = useState([]);
    const [selectedMajor, setSelectedMajor] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [myPosts, setMyPosts] = useState([]);
    const [showMajorSelect, setShowMajorSelect] = useState(false);
    const [selectedGender, setSelectedGender] = useState('');
    const [majorQuery, setMajorQuery] = useState('');
    const [savedField, setSavedField] = useState(null);
    const [activeSection, setActiveSection] = useState('details');

    // Web Push (per-device) state
    const [pushSupported, setPushSupported] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [pushError, setPushError] = useState('');

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '',
        student_id: '',
        phone: '',
        major: '',
        gender: ''
    });
    const [errors, setErrors] = useState({});

    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();
    const { selectedTerm } = useSemester();
    const confirm = useConfirm();
    const toast = useToast();

    // Check if user can edit (no active posts)
    const canEdit = myPosts.length === 0;

    useEffect(() => {
        fetchProfile();
        fetchMyPosts();
        fetchMajors();

        // Check if user was redirected to select major
        if (searchParams.get('selectMajor') === 'true') {
            setShowMajorSelect(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // The section nav follows the scroll.
    useEffect(() => {
        if (loading || typeof IntersectionObserver === 'undefined') return undefined;
        const els = SECTIONS.map(s => document.getElementById(`section-${s.id}`)).filter(Boolean);
        const io = new IntersectionObserver((entries) => {
            const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            if (visible[0]) setActiveSection(visible[0].target.id.replace('section-', ''));
        }, { rootMargin: '-80px 0px -60% 0px' });
        els.forEach(el => io.observe(el));
        return () => io.disconnect();
    }, [loading, showMajorSelect]);

    const fetchMajors = async () => {
        const { data } = await supabase
            .from('majors')
            .select('code, name')
            .order('name');
        setMajors(data || []);
    };

    const fetchProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/auth');
            return;
        }

        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (data) {
            setProfile({ ...data, email: data.email || user.email });
            setSelectedMajor(data.major || '');
            setEditForm({
                name: data.name || '',
                student_id: data.student_id || '',
                phone: data.phone || '',
                major: data.major || '',
                gender: data.gender || ''
            });
            // Fetch major name if user has a major set
            if (data.major) {
                const { data: majorData } = await supabase
                    .from('majors')
                    .select('name')
                    .eq('code', data.major)
                    .single();
                setMajorName(majorData?.name || data.major);
            } else {
                // Show major select if user has no major
                setShowMajorSelect(true);
            }
            // Also show setup if user has no gender
            if (!data.gender) {
                setShowMajorSelect(true);
            }
        }
        setLoading(false);
    };

    const fetchMyPosts = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('posts')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['active', 'pending'])
            .order('created_at', { ascending: false });

        setMyPosts(data || []);
    };

    const validateAndCleanSchedule = async (newMajor, newGender) => {
        try {
            const saved = localStorage.getItem('schedule_saved');
            if (!saved) return;
            const { courseIds } = JSON.parse(saved);
            if (!courseIds || courseIds.length === 0) return;

            // 1. Validate Major
            const { data: majorCourses } = await supabase
                .from('major_courses')
                .select('course_id')
                .eq('major_code', newMajor);

            const validMajorCourseIds = new Set((majorCourses || []).map(mc => mc.course_id));

            // 2. Validate Gender/Campus
            const campusFilterFor = campusFilter(newGender);

            // Check if courses have sections in allowed campuses
            let sectionQuery = supabase
                .from('sections')
                .select('course_id')
                .in('course_id', courseIds)
                .or(campusFilterFor).eq('is_active', true);

            if (selectedTerm) sectionQuery = sectionQuery.eq('term_code', selectedTerm);

            const { data: validSections } = await sectionQuery;

            const validCampusCourseIds = new Set((validSections || []).map(s => s.course_id));

            // Filter (must match BOTH major and campus availability)
            const validCourseIds = courseIds.filter(id =>
                validMajorCourseIds.has(id) && validCampusCourseIds.has(id)
            );

            const newData = {
                courseIds: validCourseIds,
                savedIdx: null
            };
            localStorage.setItem('schedule_saved', JSON.stringify(newData));
        } catch (e) {
            console.error('Error cleaning schedule:', e);
        }
    };

    // A major or gender change invalidates every starred schedule on the
    // account (saved_schedules), since a saved schedule pins specific
    // sections that may no longer be valid for the new major or campus.
    const clearSavedSchedules = async (userId) => {
        try {
            localStorage.removeItem('schedule_saved');
        } catch (e) {
            console.error('Error clearing local schedule:', e);
        }
        await supabase.from('saved_schedules').delete().eq('user_id', userId);
    };

    // The in-progress course basket (profiles.schedule_cart, per term) only
    // needs wiping on a real major change — courses are gated by major, not
    // by gender/campus, so a gender-only change can keep the same basket.
    const clearScheduleCart = async (userId) => {
        await supabase.from('profiles').update({ schedule_cart: null }).eq('id', userId);
    };

    const handleStartEdit = () => {
        if (!canEdit) return;
        setEditForm({
            name: profile?.name || '',
            student_id: profile?.student_id || '',
            phone: profile?.phone || '',
            major: profile?.major || '',
            gender: profile?.gender || ''
        });
        setErrors({});
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditForm({
            name: profile?.name || '',
            student_id: profile?.student_id || '',
            phone: profile?.phone || '',
            major: profile?.major || '',
            gender: profile?.gender || ''
        });
        setErrors({});
    };

    const handleSaveProfile = async (e) => {
        e?.preventDefault();
        if (!canEdit) return;

        const newErrors = {};
        if (!editForm.name.trim()) newErrors.name = 'Your name can’t be empty';
        if (!editForm.student_id.trim()) newErrors.student_id = 'Your University ID can’t be empty';
        if (!editForm.phone.trim()) newErrors.phone = 'Your phone number can’t be empty';
        if (!editForm.major) newErrors.major = 'Choose your major';
        if (!editForm.gender) newErrors.gender = 'Choose your campus';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        // Changing major or campus clears saved schedules: say so before it happens.
        const majorChanged = editForm.major !== profile.major;
        const campusChanged = editForm.gender !== profile.gender;
        if (majorChanged || campusChanged) {
            const ok = await confirm({
                title: majorChanged ? 'Change your major?' : 'Change your campus?',
                body: majorChanged
                    ? 'Your saved schedules and the courses in your schedule builder will be cleared, because they belong to your current major.'
                    : 'Your saved schedules will be cleared, because their sections may not be open on the other campus. Courses in your builder stay.',
                confirmLabel: 'Change and clear',
                tone: 'danger',
            });
            if (!ok) return;
        }

        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (editForm.student_id !== profile.student_id) {
            // Other students' profiles aren't readable, so the database checks.
            const { data: taken } = await supabase.rpc('student_id_taken', { p_student_id: editForm.student_id });

            if (taken) {
                setErrors({ student_id: 'This University ID is already registered' });
                setSaving(false);
                return;
            }
        }

        const { error } = await supabase
            .from('profiles')
            .update({
                name: editForm.name,
                student_id: editForm.student_id,
                phone: editForm.phone,
                major: editForm.major,
                gender: editForm.gender
            })
            .eq('id', user.id);

        if (!error) {
            setProfile({
                ...profile,
                name: editForm.name,
                student_id: editForm.student_id,
                phone: editForm.phone,
                major: editForm.major,
                gender: editForm.gender
            });

            const majorData = majors.find(m => m.code === editForm.major);
            setMajorName(majorData?.name || editForm.major);

            if (majorChanged) {
                // Major changed — courses eligible for the plan are different now.
                await clearSavedSchedules(user.id);
                await clearScheduleCart(user.id);
            } else if (campusChanged) {
                // Gender-only change — same courses, just a different campus, so
                // the in-progress basket is still valid; only starred schedules
                // (which pin specific sections) need clearing.
                await clearSavedSchedules(user.id);
            }

            setIsEditing(false);
            toast.success('Profile saved');
        } else {
            toast.error('Couldn’t save your profile. Try again.');
        }
        setSaving(false);
    };

    // Detect push support and whether this device is already subscribed.
    useEffect(() => {
        let active = true;
        (async () => {
            const supported = isPushSupported();
            if (!active) return;
            setPushSupported(supported);
            if (supported) {
                try {
                    const state = await getPushState();
                    if (active) setPushEnabled(state);
                } catch {
                    /* ignore */
                }
            }
        })();
        return () => { active = false; };
    }, []);

    const togglePush = async () => {
        if (pushBusy) return;
        setPushError('');
        setPushBusy(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            if (pushEnabled) {
                await unsubscribeFromPush(supabase);
                setPushEnabled(false);
            } else {
                await subscribeToPush(supabase, user.id);
                setPushEnabled(true);
            }
            flashSaved('push');
        } catch (e) {
            setPushError(e?.message || 'Could not update push notifications.');
        } finally {
            setPushBusy(false);
        }
    };

    const flashSaved = (field) => {
        setSavedField(field);
        setTimeout(() => setSavedField(f => (f === field ? null : f)), 1800);
    };

    const isPrefOn = (field) => profile?.[field] !== false;

    const togglePref = async (field) => {
        const newVal = !isPrefOn(field);
        setProfile(p => ({ ...p, [field]: newVal }));
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('profiles').update({ [field]: newVal }).eq('id', user.id);
        if (error) {
            setProfile(p => ({ ...p, [field]: !newVal }));
            toast.error('Couldn’t save that change.');
            return;
        }
        flashSaved(field);
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/auth');
        router.refresh();
    };

    const handleSaveSetup = async () => {
        const updates = {};
        if (!profile?.major && selectedMajor) updates.major = selectedMajor;
        if (!profile?.gender && selectedGender) updates.gender = selectedGender;
        if (Object.keys(updates).length === 0) return;

        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id);

        if (!error) {
            if (updates.major) {
                const majorData = majors.find(m => m.code === updates.major);
                setMajorName(majorData?.name || updates.major);
            }
            setProfile({ ...profile, ...updates });

            const finalMajor = updates.major || profile.major;
            const finalGender = updates.gender || profile.gender;
            await validateAndCleanSchedule(finalMajor, finalGender);

            setShowMajorSelect(false);
            router.push('/');
        } else {
            toast.error('Couldn’t save. Try again.');
        }
        setSaving(false);
    };

    const filteredMajors = useMemo(() => {
        const q = majorQuery.trim().toLowerCase();
        return q ? majors.filter(m => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)) : majors;
    }, [majors, majorQuery]);

    if (loading) {
        return (
            <PageShell width="standard">
                <div className={styles.loading} aria-busy="true">
                    <Skeleton width={120} height={11} />
                    <Skeleton width={340} height={44} />
                    <Skeleton width={260} height={14} />
                    <Skeleton height={140} />
                </div>
            </PageShell>
        );
    }

    const needsMajor = !profile?.major;
    const needsGender = !profile?.gender;

    // ===== First run: the two answers CourseMate can't work without =====
    if (showMajorSelect && (needsMajor || needsGender)) {
        const canContinue = (!needsMajor || selectedMajor) && (!needsGender || selectedGender);
        const steps = [needsMajor && 'major', needsGender && 'campus'].filter(Boolean);
        return (
            <PageShell width="reading" nav={false}>
                <div className={styles.onboarding}>
                    <header className={styles.onboardHead}>
                        <span className={styles.onboardBrand}>
                            <Image src="/logo.png" alt="" width={56} height={56} />
                            CourseMate
                        </span>
                        <h1 className={styles.onboardTitle}>{steps.length === 2 ? 'Two answers' : 'One answer'} and you&rsquo;re in.</h1>
                        <p className={styles.onboardText}>
                            CourseMate lists the courses in your major and only the sections open on your campus, so every schedule and swap it suggests is one you can actually take.
                        </p>
                    </header>

                    {needsMajor && (
                        <section className={styles.onboardStep} aria-labelledby="ob-major">
                            <span className={styles.onboardNum} aria-hidden="true">{steps.indexOf('major') + 1}</span>
                            <div className={styles.onboardBody}>
                                <h2 id="ob-major" className={styles.onboardQ}>What&rsquo;s your major?</h2>
                                <SearchInput
                                    value={majorQuery}
                                    onChange={(e) => setMajorQuery(e.target.value)}
                                    placeholder="Search majors"
                                    aria-label="Search majors"
                                />
                                <div className={styles.majorList} role="radiogroup" aria-label="Major">
                                    {filteredMajors.length === 0 && <p className={styles.majorEmpty}>No major matches &ldquo;{majorQuery}&rdquo;.</p>}
                                    {filteredMajors.map(m => (
                                        <button
                                            key={m.code}
                                            type="button"
                                            role="radio"
                                            aria-checked={selectedMajor === m.code}
                                            className={styles.choice}
                                            onClick={() => setSelectedMajor(m.code)}
                                            disabled={saving}
                                        >
                                            <span className={styles.square} aria-hidden="true" />
                                            <span className={styles.majorName}>{m.name}</span>
                                            <span className={styles.majorCode}>{m.code}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}

                    {needsGender && (
                        <section className={styles.onboardStep} aria-labelledby="ob-campus">
                            <span className={styles.onboardNum} aria-hidden="true">{steps.indexOf('campus') + 1}</span>
                            <div className={styles.onboardBody}>
                                <h2 id="ob-campus" className={styles.onboardQ}>Which campus do you study on?</h2>
                                <div className={styles.campusList} role="radiogroup" aria-label="Campus">
                                    {[['male', "Men's campus"], ['female', "Women's campus"]].map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={selectedGender === value}
                                            className={styles.choice}
                                            onClick={() => setSelectedGender(value)}
                                            disabled={saving}
                                        >
                                            <span className={styles.square} aria-hidden="true" />
                                            <span className={styles.majorName}>{label}</span>
                                        </button>
                                    ))}
                                </div>
                                <p className={styles.onboardNote}>Never shown to other students. It only decides which sections you see.</p>
                            </div>
                        </section>
                    )}

                    <div className={styles.onboardFoot}>
                        <Button variant="primary" size="lg" onClick={handleSaveSetup} disabled={!canContinue} loading={saving}>
                            Continue to CourseMate
                        </Button>
                    </div>
                </div>
            </PageShell>
        );
    }

    const firstName = (profile?.name || '').trim().split(/\s+/)[0];
    const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
    const emailOn = EMAIL_PREFS.filter(p => isPrefOn(p.field)).length;

    // One field of the record: its label, then either the value or, while
    // editing, the control that changes it, in the same place.
    const recordField = (key, label, value, control, opts = {}) => (
        <div className={`${styles.field} ${opts.wide ? styles.fieldWide : ''}`}>
            <dt className={styles.fieldLabel}>{label}</dt>
            <dd className={`${styles.fieldValue} ${opts.mono ? styles.mono : ''} ${!value ? styles.fieldEmpty : ''}`}>
                {isEditing && control ? control : (value || 'not set')}
            </dd>
        </div>
    );

    const input = (key, props = {}) => (
        <Field error={typeof errors[key] === 'string' ? errors[key] : null} hint={props.hint}>
            {({ id, invalid, describedBy }) => (
                <Input
                    id={id}
                    invalid={invalid}
                    aria-describedby={describedBy}
                    aria-label={props.label}
                    mono={props.mono}
                    type={props.type}
                    autoComplete={props.autoComplete}
                    value={editForm[key]}
                    placeholder={props.placeholder}
                    onChange={(e) => {
                        setEditForm({ ...editForm, [key]: props.upper ? e.target.value.toUpperCase() : e.target.value });
                        if (errors[key]) setErrors({ ...errors, [key]: false });
                    }}
                />
            )}
        </Field>
    );

    const select = (key, label, options, placeholder) => (
        <Field error={typeof errors[key] === 'string' ? errors[key] : null}>
            {({ id, invalid, describedBy }) => (
                <Select id={id} invalid={invalid} aria-describedby={describedBy} aria-label={label} value={editForm[key]} onChange={(e) => {
                    setEditForm({ ...editForm, [key]: e.target.value });
                    if (errors[key]) setErrors({ ...errors, [key]: false });
                }}>
                    <option value="">{placeholder}</option>
                    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
            )}
        </Field>
    );

    const pref = (field, label, sub, control) => (
        <label key={field} className={styles.pref}>
            <span className={styles.prefText}>
                <span className={styles.prefLabel}>
                    {label}
                    {savedField === field && <span className={styles.saved}>saved</span>}
                </span>
                <span className={styles.prefSub}>{sub}</span>
            </span>
            {control}
        </label>
    );

    return (
        <PageShell width="standard">
            <div className={styles.layout}>
                <nav className={styles.index} aria-label="Profile sections">
                    {SECTIONS.map(s => (
                        <a
                            key={s.id}
                            href={`#section-${s.id}`}
                            className={styles.indexItem}
                            aria-current={activeSection === s.id ? 'true' : undefined}
                        >
                            {s.label}
                        </a>
                    ))}
                </nav>

                <div className={styles.record}>
                    {/* ===== Who ===== */}
                    <header className={styles.head}>
                        <span className={styles.eyebrow}>Student record</span>
                        <h1 className={styles.name}>{profile?.name || 'Your profile'}</h1>
                        <p className={styles.facts}>
                            {majorName || 'No major set'}
                            {profile?.gender && <> · {CAMPUS[profile.gender]}</>}
                            {memberSince && <> · on CourseMate since {memberSince}</>}
                        </p>
                        <p className={styles.standing}>
                            <Link href="/matches">{myPosts.length} of 5 posts</Link> on the board
                            {' · '}
                            <a href="#section-notifications">{emailOn} of {EMAIL_PREFS.length} email alerts</a> on
                        </p>
                    </header>

                    {/* ===== Details ===== */}
                    <section id="section-details" className={styles.section} aria-labelledby="h-details">
                        <Rubric
                            id="h-details"
                            title="Details"
                            description="Used to match you with classmates, and shared only once a swap is agreed."
                            actions={!isEditing && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleStartEdit}
                                    disabled={!canEdit}
                                    title={canEdit ? 'Edit your details' : 'Finish or cancel your posts first'}
                                >
                                    Edit
                                </Button>
                            )}
                        />

                        <form onSubmit={handleSaveProfile} noValidate>
                            <dl className={`${styles.fields} ${isEditing ? styles.fieldsEditing : ''}`}>
                                {recordField('name', 'Full name', profile?.name, input('name', { label: 'Full name', autoComplete: 'name', placeholder: 'As on your university ID' }), { wide: true })}
                                {recordField('student_id', 'University ID', profile?.student_id, input('student_id', { label: 'University ID', mono: true, upper: true, placeholder: 'U24101234' }), { mono: true })}
                                {recordField('phone', 'Phone', profile?.phone, input('phone', { label: 'Phone', type: 'tel', autoComplete: 'tel', placeholder: '05X XXX XXXX', hint: 'Shared only after a swap is accepted' }), { mono: true })}
                                {recordField('major', 'Major', majorName, select('major', 'Major', majors.map(m => [m.code, m.name]), 'Choose your major'))}
                                {recordField('gender', 'Campus', CAMPUS[profile?.gender], select('gender', 'Campus', [['male', "Men's campus"], ['female', "Women's campus"]], 'Choose your campus'))}
                                {profile?.email && recordField('email', 'Email', profile.email, null)}
                            </dl>

                            {isEditing && (editForm.major !== profile.major || editForm.gender !== profile.gender) && editForm.major && editForm.gender && (
                                <Callout tone="warning" title="This clears your saved schedules">
                                    Saved schedules pin sections for your current {editForm.major !== profile.major ? 'major' : 'campus'}, so they&rsquo;re removed when it changes.
                                </Callout>
                            )}

                            {isEditing && (
                                <div className={styles.editActions}>
                                    <Button variant="primary" type="submit" loading={saving}>Save details</Button>
                                    <Button variant="ghost" onClick={handleCancelEdit} disabled={saving}>Cancel</Button>
                                </div>
                            )}
                        </form>

                        {!canEdit && !isEditing && (
                            <Callout action={<Button size="sm" variant="link" href="/matches">Your posts →</Button>}>
                                Your details are locked while you have {myPosts.length} {myPosts.length === 1 ? 'post' : 'posts'} on the board, so matches stay accurate.
                            </Callout>
                        )}
                    </section>

                    {/* ===== Appearance ===== */}
                    <section id="section-appearance" className={styles.section} aria-labelledby="h-appearance">
                        <Rubric id="h-appearance" title="Appearance" description="Saved to this device. Auto follows your phone or computer." />
                        <ThemeToggle />
                    </section>

                    {/* ===== Notifications ===== */}
                    <section id="section-notifications" className={styles.section} aria-labelledby="h-notifications">
                        <Rubric id="h-notifications" title="Notifications" description="Everything always lands in your notifications. Choose what else reaches you." />

                        <div className={styles.prefGroup}>
                            <span className={styles.prefGroupLabel}>On this device</span>
                            {pref('push', 'Push notifications',
                                <>
                                    {pushSupported ? 'Matches, interest and section alerts, straight to this device.' : 'Not available in this browser. On iPhone, add CourseMate to your Home Screen first.'}
                                    {pushError && <span className={styles.prefError}> {pushError}</span>}
                                </>,
                                <Switch checked={pushEnabled} onChange={togglePush} disabled={!pushSupported} busy={pushBusy} label="Push notifications on this device" />)}
                        </div>

                        <div className={styles.prefGroup}>
                            <span className={styles.prefGroupLabel}>By email <span className={styles.prefCount}>{emailOn} of {EMAIL_PREFS.length} on</span></span>
                            {EMAIL_PREFS.map(p => pref(p.field, p.label, p.sub,
                                <Switch checked={isPrefOn(p.field)} onChange={() => togglePref(p.field)} label={`Email: ${p.label}`} />))}
                        </div>
                    </section>

                    {/* ===== Account ===== */}
                    <section id="section-account" className={styles.section} aria-labelledby="h-account">
                        <Rubric id="h-account" title="Account" description={profile?.email ? `Signed in as ${profile.email}.` : 'Signed in.'} />
                        <ul className={styles.accountRows}>
                            <li>
                                <a href="https://github.com/Karam-Kreidli/CourseMate" target="_blank" rel="noopener noreferrer" className={styles.accountRow}>
                                    <span className={styles.prefLabel}>CourseMate is open source</span>
                                    <span className={styles.prefSub}>Ideas and fixes are welcome on GitHub ↗</span>
                                </a>
                            </li>
                            <li>
                                <button type="button" className={`${styles.accountRow} ${styles.signOut}`} onClick={handleSignOut}>
                                    <span className={styles.prefLabel}>Sign out</span>
                                    <span className={styles.prefSub}>{firstName ? `See you soon, ${firstName}.` : 'You can sign back in any time.'}</span>
                                </button>
                            </li>
                        </ul>
                    </section>
                </div>
            </div>
        </PageShell>
    );
}

// Main export with Suspense wrapper for useSearchParams
export default function ProfilePage() {
    return (
        <Suspense fallback={
            <PageShell nav={false} width="standard">
                <Skeleton height={180} />
            </PageShell>
        }>
            <ProfileContent />
        </Suspense>
    );
}
