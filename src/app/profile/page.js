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
    Avatar, Badge, Button, Callout, Field, Input, SearchInput, Select, Skeleton, Switch, useConfirm, useToast,
} from '@/components/ui';
import {
    ActivityIcon, BellIcon, CheckIcon, ChevronRightIcon, EditIcon, GitHubIcon, GraduationIcon, LayersIcon,
    LockIcon, LogoutIcon, MailIcon, PaletteIcon, PhoneIcon, ProfileIcon, ScheduleIcon, ShieldIcon,
} from '@/components/Icons';
import styles from './profile.module.css';

const CAMPUS = { male: "Men's campus", female: "Women's campus" };

const SECTIONS = [
    { id: 'details', label: 'Personal details', icon: ProfileIcon },
    { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
    { id: 'notifications', label: 'Notifications', icon: BellIcon },
    { id: 'account', label: 'Account', icon: ShieldIcon },
];

const EMAIL_PREFS = [
    { field: 'email_match_alerts', label: 'Swap matches', sub: 'When a swap match is found for you', icon: ActivityIcon },
    { field: 'email_interest_alerts', label: 'Interest in your posts', sub: "When someone's interested in your giveaway or request", icon: LayersIcon },
    { field: 'email_watch_alerts', label: 'Section alerts', sub: "When a section you're watching becomes available", icon: BellIcon },
    // Separate from the watch alert above: that one fires when a section you
    // already know about frees a seat, this one when a section appears that
    // was never there before.
    { field: 'email_new_section_alerts', label: 'New sections', sub: "When a new section opens in a course you're planning", icon: ScheduleIcon },
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
                    <Skeleton height={180} radius={22} />
                    <div className={styles.loadingGrid}>
                        <Skeleton height={160} radius={12} />
                        <Skeleton height={320} radius={18} />
                    </div>
                </div>
            </PageShell>
        );
    }

    const needsMajor = !profile?.major;
    const needsGender = !profile?.gender;

    // ===== Onboarding: the two answers CourseMate can't work without =====
    if (showMajorSelect && (needsMajor || needsGender)) {
        const canContinue = (!needsMajor || selectedMajor) && (!needsGender || selectedGender);
        const steps = [needsMajor && 'major', needsGender && 'campus'].filter(Boolean);
        return (
            <PageShell width="reading" nav={false}>
                <div className={styles.onboarding}>
                    <div className={styles.onboardHero}>
                        <span className={styles.onboardLogo}>
                            <Image src="/logo.png" alt="" width={64} height={64} />
                        </span>
                        <span className={styles.onboardEyebrow}>Almost there</span>
                        <h1 className={styles.onboardTitle}>Two quick answers and you&rsquo;re in</h1>
                        <p className={styles.onboardText}>
                            CourseMate shows you the courses in your major and only the sections open on your campus, so your schedules and swaps actually work.
                        </p>
                    </div>

                    <div className={styles.onboardBody}>
                        {needsMajor && (
                            <section className={styles.onboardStep}>
                                <div className={styles.onboardStepHead}>
                                    <span className={styles.onboardNum}>{steps.indexOf('major') + 1}</span>
                                    <h2>What&rsquo;s your major?</h2>
                                </div>
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
                                            className={styles.majorOption}
                                            onClick={() => setSelectedMajor(m.code)}
                                            disabled={saving}
                                        >
                                            <span className={styles.majorCode}>{m.code}</span>
                                            <span className={styles.majorName}>{m.name}</span>
                                            <span className={styles.radioMark} aria-hidden="true"><CheckIcon strokeWidth={2.5} /></span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {needsGender && (
                            <section className={styles.onboardStep}>
                                <div className={styles.onboardStepHead}>
                                    <span className={styles.onboardNum}>{steps.indexOf('campus') + 1}</span>
                                    <h2>Which campus do you study on?</h2>
                                </div>
                                <div className={styles.campusGrid} role="radiogroup" aria-label="Campus">
                                    {[['male', "Men's campus"], ['female', "Women's campus"]].map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={selectedGender === value}
                                            className={styles.campusOption}
                                            onClick={() => setSelectedGender(value)}
                                            disabled={saving}
                                        >
                                            <GraduationIcon />
                                            <span>{label}</span>
                                            <span className={styles.radioMark} aria-hidden="true"><CheckIcon strokeWidth={2.5} /></span>
                                        </button>
                                    ))}
                                </div>
                                <p className={styles.onboardNote}>
                                    <LockIcon />
                                    Never shown to other students. It only decides which sections you see.
                                </p>
                            </section>
                        )}

                        <Button variant="primary" size="lg" block onClick={handleSaveSetup} disabled={!canContinue} loading={saving}>
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

    const detailRow = (label, value, Icon, opts = {}) => (
        <div className={styles.detail}>
            <dt className={styles.detailLabel}><Icon />{label}</dt>
            <dd className={`${styles.detailValue} ${opts.mono ? styles.mono : ''} ${!value ? styles.detailEmpty : ''}`}>{value || 'Not set'}</dd>
        </div>
    );

    return (
        <PageShell width="standard">
            {/* ===== Identity ===== */}
            <section className={styles.hero} aria-label="Your profile">
                <Avatar name={profile?.name} size={72} tone="solid" className={styles.heroAvatar} />
                <div className={styles.heroText}>
                    <span className={styles.heroEyebrow}>Profile</span>
                    <h1 className={styles.heroName}>{profile?.name || 'Your profile'}</h1>
                    <p className={styles.heroMajor}>{majorName || 'No major set'}</p>
                    <div className={styles.heroFacts}>
                        {profile?.student_id && <span className={styles.fact}><span className={styles.factMono}>{profile.student_id}</span></span>}
                        {profile?.gender && <span className={styles.fact}>{CAMPUS[profile.gender]}</span>}
                        {memberSince && <span className={styles.fact}>Member since {memberSince}</span>}
                    </div>
                </div>
                <div className={styles.heroSide}>
                    <Link href="/matches" className={styles.heroStat}>
                        <span className={styles.heroStatValue}>{myPosts.length}<small>/5</small></span>
                        <span className={styles.heroStatLabel}>active posts</span>
                    </Link>
                    <a href="#section-notifications" className={styles.heroStat}>
                        <span className={styles.heroStatValue}>{emailOn}<small>/{EMAIL_PREFS.length}</small></span>
                        <span className={styles.heroStatLabel}>email alerts on</span>
                    </a>
                </div>
            </section>

            <div className={styles.layout}>
                <nav className={styles.sectionNav} aria-label="Profile sections">
                    {SECTIONS.map(s => {
                        const Icon = s.icon;
                        return (
                            <a
                                key={s.id}
                                href={`#section-${s.id}`}
                                className={`${styles.navItem} ${activeSection === s.id ? styles.navItemActive : ''}`}
                                aria-current={activeSection === s.id ? 'true' : undefined}
                            >
                                <Icon />
                                {s.label}
                            </a>
                        );
                    })}
                </nav>

                <div className={styles.sections}>
                    {/* ===== Personal details ===== */}
                    <section id="section-details" className={styles.card} aria-labelledby="h-details">
                        <header className={styles.cardHead}>
                            <div>
                                <h2 id="h-details" className={styles.cardTitle}>Personal details</h2>
                                <p className={styles.cardSub}>Used to match you with classmates and to put you in touch once a swap is agreed.</p>
                            </div>
                            {!isEditing && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<EditIcon />}
                                    onClick={handleStartEdit}
                                    disabled={!canEdit}
                                    title={canEdit ? 'Edit your details' : 'Finish or cancel your active posts first'}
                                >
                                    Edit
                                </Button>
                            )}
                        </header>

                        {isEditing ? (
                            <form className={styles.editForm} onSubmit={handleSaveProfile} noValidate>
                                <div className={styles.formGrid}>
                                    <Field label="Full name" error={typeof errors.name === 'string' ? errors.name : null} className={styles.span2}>
                                        {({ id, invalid, describedBy }) => (
                                            <Input id={id} invalid={invalid} aria-describedby={describedBy} value={editForm.name} autoComplete="name" onChange={(e) => {
                                                setEditForm({ ...editForm, name: e.target.value });
                                                if (errors.name) setErrors({ ...errors, name: false });
                                            }} placeholder="As on your university ID" />
                                        )}
                                    </Field>
                                    <Field label="University ID" error={typeof errors.student_id === 'string' ? errors.student_id : null} hint="Like U24101234">
                                        {({ id, invalid, describedBy }) => (
                                            <Input id={id} invalid={invalid} aria-describedby={describedBy} mono value={editForm.student_id} onChange={(e) => {
                                                setEditForm({ ...editForm, student_id: e.target.value.toUpperCase() });
                                                if (errors.student_id) setErrors({ ...errors, student_id: false });
                                            }} placeholder="U24101234" />
                                        )}
                                    </Field>
                                    <Field label="Phone number" error={typeof errors.phone === 'string' ? errors.phone : null} hint="Shared only after a swap is accepted">
                                        {({ id, invalid, describedBy }) => (
                                            <Input id={id} invalid={invalid} aria-describedby={describedBy} type="tel" autoComplete="tel" value={editForm.phone} onChange={(e) => {
                                                setEditForm({ ...editForm, phone: e.target.value });
                                                if (errors.phone) setErrors({ ...errors, phone: false });
                                            }} placeholder="05X XXX XXXX" />
                                        )}
                                    </Field>
                                    <Field label="Major" error={typeof errors.major === 'string' ? errors.major : null}>
                                        {({ id, invalid, describedBy }) => (
                                            <Select id={id} invalid={invalid} aria-describedby={describedBy} value={editForm.major} onChange={(e) => {
                                                setEditForm({ ...editForm, major: e.target.value });
                                                if (errors.major) setErrors({ ...errors, major: false });
                                            }}>
                                                <option value="">Select your major</option>
                                                {majors.map(m => (
                                                    <option key={m.code} value={m.code}>{m.name}</option>
                                                ))}
                                            </Select>
                                        )}
                                    </Field>
                                    <Field label="Campus" error={typeof errors.gender === 'string' ? errors.gender : null}>
                                        {({ id, invalid, describedBy }) => (
                                            <Select id={id} invalid={invalid} aria-describedby={describedBy} value={editForm.gender} onChange={(e) => {
                                                setEditForm({ ...editForm, gender: e.target.value });
                                                if (errors.gender) setErrors({ ...errors, gender: false });
                                            }}>
                                                <option value="">Select your campus</option>
                                                <option value="male">Men&apos;s campus</option>
                                                <option value="female">Women&apos;s campus</option>
                                            </Select>
                                        )}
                                    </Field>
                                </div>
                                {(editForm.major !== profile.major || editForm.gender !== profile.gender) && editForm.major && editForm.gender && (
                                    <Callout tone="warning" title="This will clear your saved schedules">
                                        Saved schedules pin sections for your current {editForm.major !== profile.major ? 'major' : 'campus'}, so they&rsquo;re removed when it changes.
                                    </Callout>
                                )}
                                <div className={styles.editActions}>
                                    <Button variant="ghost" onClick={handleCancelEdit} disabled={saving}>Cancel</Button>
                                    <Button variant="primary" type="submit" loading={saving} icon={<CheckIcon strokeWidth={2.25} />}>Save changes</Button>
                                </div>
                            </form>
                        ) : (
                            <dl className={styles.details}>
                                {detailRow('Full name', profile?.name, ProfileIcon)}
                                {detailRow('University ID', profile?.student_id, ShieldIcon, { mono: true })}
                                {detailRow('Phone', profile?.phone, PhoneIcon, { mono: true })}
                                {detailRow('Major', majorName, GraduationIcon)}
                                {detailRow('Campus', CAMPUS[profile?.gender], LockIcon)}
                                {profile?.email && detailRow('Email', profile.email, MailIcon)}
                            </dl>
                        )}

                        {!canEdit && !isEditing && (
                            <Callout tone="info" icon={<LockIcon />} action={<Button size="sm" variant="ghost" href="/matches" trailingIcon={<ChevronRightIcon />}>Your posts</Button>}>
                                Your details are locked while you have {myPosts.length} active {myPosts.length === 1 ? 'post' : 'posts'}, so matches stay accurate. Complete or cancel them to edit.
                            </Callout>
                        )}
                    </section>

                    {/* ===== Appearance ===== */}
                    <section id="section-appearance" className={styles.card} aria-labelledby="h-appearance">
                        <header className={styles.cardHead}>
                            <div>
                                <h2 id="h-appearance" className={styles.cardTitle}>Appearance</h2>
                                <p className={styles.cardSub}>Saved to this device. Auto follows your phone or computer&rsquo;s setting.</p>
                            </div>
                        </header>
                        <ThemeToggle />
                    </section>

                    {/* ===== Notifications ===== */}
                    <section id="section-notifications" className={styles.card} aria-labelledby="h-notifications">
                        <header className={styles.cardHead}>
                            <div>
                                <h2 id="h-notifications" className={styles.cardTitle}>Notifications</h2>
                                <p className={styles.cardSub}>Choose how CourseMate reaches you when something happens.</p>
                            </div>
                        </header>

                        <div className={styles.prefGroup}>
                            <span className={styles.prefGroupLabel}>In the app</span>
                            <div className={styles.prefRow}>
                                <span className={styles.prefIcon}><BellIcon /></span>
                                <span className={styles.prefText}>
                                    <span className={styles.prefLabel}>Notification centre</span>
                                    <span className={styles.prefSub}>Everything always lands in your notifications, with a badge on the bell.</span>
                                </span>
                                <Badge tone="accent" icon={<CheckIcon strokeWidth={2.5} />}>Always on</Badge>
                            </div>
                        </div>

                        <div className={styles.prefGroup}>
                            <span className={styles.prefGroupLabel}>On this device</span>
                            <label className={styles.prefRow}>
                                <span className={styles.prefIcon}><PhoneIcon /></span>
                                <span className={styles.prefText}>
                                    <span className={styles.prefLabel}>
                                        Push notifications
                                        {savedField === 'push' && <span className={styles.saved}><CheckIcon strokeWidth={2.5} />Saved</span>}
                                    </span>
                                    <span className={styles.prefSub}>
                                        {pushSupported
                                            ? 'Matches, interest and section alerts, straight to this device.'
                                            : 'Not available in this browser. On iPhone, add CourseMate to your Home Screen first.'}
                                    </span>
                                    {pushError && <span className={styles.prefError}>{pushError}</span>}
                                </span>
                                <Switch
                                    checked={pushEnabled}
                                    onChange={togglePush}
                                    disabled={!pushSupported}
                                    busy={pushBusy}
                                    label="Push notifications on this device"
                                />
                            </label>
                        </div>

                        <div className={styles.prefGroup}>
                            <span className={styles.prefGroupLabel}>
                                By email
                                <span className={styles.prefCount}>{emailOn} of {EMAIL_PREFS.length} on</span>
                            </span>
                            {EMAIL_PREFS.map(p => {
                                const Icon = p.icon;
                                return (
                                    <label key={p.field} className={styles.prefRow}>
                                        <span className={styles.prefIcon}><Icon /></span>
                                        <span className={styles.prefText}>
                                            <span className={styles.prefLabel}>
                                                {p.label}
                                                {savedField === p.field && <span className={styles.saved}><CheckIcon strokeWidth={2.5} />Saved</span>}
                                            </span>
                                            <span className={styles.prefSub}>{p.sub}</span>
                                        </span>
                                        <Switch checked={isPrefOn(p.field)} onChange={() => togglePref(p.field)} label={`Email: ${p.label}`} />
                                    </label>
                                );
                            })}
                        </div>
                    </section>

                    {/* ===== Account ===== */}
                    <section id="section-account" className={styles.card} aria-labelledby="h-account">
                        <header className={styles.cardHead}>
                            <div>
                                <h2 id="h-account" className={styles.cardTitle}>Account</h2>
                                <p className={styles.cardSub}>{profile?.email ? <>Signed in as <strong>{profile.email}</strong></> : 'Signed in'}{firstName ? `. Thanks for being here, ${firstName}.` : '.'}</p>
                            </div>
                        </header>
                        <div className={styles.accountRows}>
                            <a href="https://github.com/Karam-Kreidli/CourseMate" target="_blank" rel="noopener noreferrer" className={styles.accountRow}>
                                <span className={styles.prefIcon}><GitHubIcon /></span>
                                <span className={styles.prefText}>
                                    <span className={styles.prefLabel}>Contribute on GitHub</span>
                                    <span className={styles.prefSub}>CourseMate is open source. Ideas and fixes welcome.</span>
                                </span>
                                <ChevronRightIcon className={styles.rowChevron} />
                            </a>
                            <button type="button" className={`${styles.accountRow} ${styles.signOut}`} onClick={handleSignOut}>
                                <span className={styles.prefIcon}><LogoutIcon /></span>
                                <span className={styles.prefText}>
                                    <span className={styles.prefLabel}>Sign out</span>
                                    <span className={styles.prefSub}>You can sign back in any time.</span>
                                </span>
                            </button>
                        </div>
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
                <Skeleton height={180} radius={22} />
            </PageShell>
        }>
            <ProfileContent />
        </Suspense>
    );
}
