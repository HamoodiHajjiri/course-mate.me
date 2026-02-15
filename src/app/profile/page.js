'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './profile.module.css';

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

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '',
        student_id: '',
        phone: '',
        major: '',
        major: '',
        gender: ''
    });
    const [errors, setErrors] = useState({});

    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

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
    }, [searchParams]);

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
            setProfile(data);
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
            const allowedCampuses = newGender === 'male' ? ['main', 'men'] : ['main', 'women'];

            // Check if courses have sections in allowed campuses
            const { data: validSections } = await supabase
                .from('sections')
                .select('course_id')
                .in('course_id', courseIds)
                .in('campus', allowedCampuses);

            const validCampusCourseIds = new Set((validSections || []).map(s => s.course_id));

            // Filter (must match BOTH major and campus availability)
            const validCourseIds = courseIds.filter(id =>
                validMajorCourseIds.has(id) && validCampusCourseIds.has(id)
            );

            // Update localStorage
            // Always unsave (savedIdx: null) because changing major/gender invalidates the specific schedule permutation
            const newData = {
                courseIds: validCourseIds,
                savedIdx: null
            };
            localStorage.setItem('schedule_saved', JSON.stringify(newData));
        } catch (e) {
            console.error('Error cleaning schedule:', e);
        }
    };

    const handleSaveMajor = async () => {
        if (!selectedMajor) return;

        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('profiles')
            .update({ major: selectedMajor })
            .eq('id', user.id);

        if (!error) {
            // Refresh profile and redirect
            const majorData = majors.find(m => m.code === selectedMajor);
            setMajorName(majorData?.name || selectedMajor);
            setProfile({ ...profile, major: selectedMajor });

            // Clean up schedule
            await validateAndCleanSchedule(selectedMajor, profile.gender);

            setShowMajorSelect(false);
            router.push('/');
        }
        setSaving(false);
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

    const handleSaveProfile = async () => {
        if (!canEdit) return;

        // Validation: Verify no fields are empty
        const newErrors = {};
        if (!editForm.name.trim()) newErrors.name = true;
        if (!editForm.student_id.trim()) newErrors.student_id = true;
        if (!editForm.phone.trim()) newErrors.phone = true;
        if (!editForm.major) newErrors.major = true;
        if (!editForm.gender) newErrors.gender = true;

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();

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
            // Update local state
            setProfile({
                ...profile,
                name: editForm.name,
                student_id: editForm.student_id,
                phone: editForm.phone,
                major: editForm.major,
                gender: editForm.gender
            });

            // Update major name
            const majorData = majors.find(m => m.code === editForm.major);
            setMajorName(majorData?.name || editForm.major);

            // Clean up schedule
            await validateAndCleanSchedule(editForm.major, editForm.gender);

            setIsEditing(false);
        }
        setSaving(false);
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/auth');
        router.refresh();
    };

    if (loading) {
        return (
            <div className={styles.page}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                </div>
                <BottomNav />
            </div>
        );
    }

    // Show major/gender selection modal if needed

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

            // Clean up schedule
            const finalMajor = updates.major || profile.major;
            const finalGender = updates.gender || profile.gender;
            await validateAndCleanSchedule(finalMajor, finalGender);

            setShowMajorSelect(false);
            router.push('/');
        }
        setSaving(false);
    };

    const needsMajor = !profile?.major;
    const needsGender = !profile?.gender;

    if (showMajorSelect && (needsMajor || needsGender)) {
        const canContinue = (!needsMajor || selectedMajor) && (!needsGender || selectedGender);
        return (
            <div className={styles.page}>
                <header className={styles.header}>
                    <h1>Complete Your Profile</h1>
                    <ThemeToggle />
                </header>

                <main className={styles.main}>
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>Complete Your Profile</h2>
                        <p className={styles.cardDesc}>
                            Please fill in the missing information to continue.
                        </p>

                        {needsMajor && (
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Major</label>
                                <select
                                    value={selectedMajor}
                                    onChange={(e) => setSelectedMajor(e.target.value)}
                                    className={styles.select}
                                    disabled={saving}
                                >
                                    <option value="">Select your major</option>
                                    {majors.map(m => (
                                        <option key={m.code} value={m.code}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {needsGender && (
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Gender</label>
                                <select
                                    value={selectedGender}
                                    onChange={(e) => setSelectedGender(e.target.value)}
                                    className={styles.select}
                                    disabled={saving}
                                >
                                    <option value="">Select your gender</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
                            </div>
                        )}

                        <button
                            onClick={handleSaveSetup}
                            className={styles.saveBtn}
                            disabled={!canContinue || saving}
                        >
                            {saving ? 'Saving...' : 'Continue'}
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h1>Profile</h1>
                <ThemeToggle />
            </header>

            <main className={styles.main}>
                {/* Profile Info */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}>Personal Information</h2>
                        {!isEditing && canEdit && (
                            <button
                                onClick={handleStartEdit}
                                className={styles.editBtn}
                            >
                                Edit
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                        /* Edit Mode */
                        <div className={styles.editForm}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Full Name</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => {
                                        setEditForm({ ...editForm, name: e.target.value });
                                        if (errors.name) setErrors({ ...errors, name: false });
                                    }}
                                    className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
                                    placeholder="Enter your full name"
                                />
                                {errors.name && <span className={styles.fieldError}>Name cannot be empty</span>}
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>University ID</label>
                                <input
                                    type="text"
                                    value={editForm.student_id}
                                    onChange={(e) => {
                                        setEditForm({ ...editForm, student_id: e.target.value });
                                        if (errors.student_id) setErrors({ ...errors, student_id: false });
                                    }}
                                    className={`${styles.input} ${errors.student_id ? styles.inputError : ''}`}
                                    placeholder="Enter your student ID"
                                />
                                {errors.student_id && <span className={styles.fieldError}>Student ID cannot be empty</span>}
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Phone Number</label>
                                <input
                                    type="tel"
                                    value={editForm.phone}
                                    onChange={(e) => {
                                        setEditForm({ ...editForm, phone: e.target.value });
                                        if (errors.phone) setErrors({ ...errors, phone: false });
                                    }}
                                    className={`${styles.input} ${errors.phone ? styles.inputError : ''}`}
                                    placeholder="Enter your phone number"
                                />
                                {errors.phone && <span className={styles.fieldError}>Phone number cannot be empty</span>}
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Major</label>
                                <select
                                    value={editForm.major}
                                    onChange={(e) => {
                                        setEditForm({ ...editForm, major: e.target.value });
                                        if (errors.major) setErrors({ ...errors, major: false });
                                    }}
                                    className={`${styles.select} ${errors.major ? styles.inputError : ''}`}
                                >
                                    <option value="">Select your major</option>
                                    {majors.map(m => (
                                        <option key={m.code} value={m.code}>{m.name}</option>
                                    ))}
                                </select>
                                {errors.major && <span className={styles.fieldError}>Please select a major</span>}
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Gender</label>
                                <select
                                    value={editForm.gender}
                                    onChange={(e) => {
                                        setEditForm({ ...editForm, gender: e.target.value });
                                        if (errors.gender) setErrors({ ...errors, gender: false });
                                    }}
                                    className={`${styles.select} ${errors.gender ? styles.inputError : ''}`}
                                >
                                    <option value="">Select your gender</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
                                {errors.gender && <span className={styles.fieldError}>Please select a gender</span>}
                            </div>
                            <div className={styles.editActions}>
                                <button
                                    onClick={handleCancelEdit}
                                    className={styles.cancelBtn}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveProfile}
                                    className={styles.saveBtn}
                                    disabled={saving}
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* View Mode */
                        <div className={styles.profileInfo}>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Full Name</span>
                                <span className={styles.infoValue}>{profile?.name || 'Not set'}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>University ID</span>
                                <span className={styles.infoValue}>{profile?.student_id || 'Not set'}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Phone Number</span>
                                <span className={styles.infoValue}>{profile?.phone || 'Not set'}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Major</span>
                                <span className={styles.infoValue}>{majorName || 'Not set'}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Gender</span>
                                <span className={styles.infoValue}>{profile?.gender ? (profile.gender === 'male' ? 'Male' : 'Female') : 'Not set'}</span>
                            </div>
                        </div>
                    )}

                    {/* Show warning if user has posts */}
                    {!canEdit && !isEditing && (
                        <div className={styles.editWarning}>
                            Complete or cancel your active posts to edit your profile
                        </div>
                    )}
                </div>

                {/* Stats */}
                <div className={styles.statsCard}>
                    <h3>Your Activity</h3>
                    <div className={styles.stats}>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{myPosts.length}</span>
                            <span className={styles.statLabel}>Active Posts</span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{5 - myPosts.length}</span>
                            <span className={styles.statLabel}>Posts Left</span>
                        </div>
                    </div>
                </div>

                {/* Sign Out */}
                <button onClick={handleSignOut} className={styles.signOutBtn}>
                    Sign Out
                </button>
            </main>

            <BottomNav />
        </div>
    );
}

// Main export with Suspense wrapper for useSearchParams
export default function ProfilePage() {
    return (
        <Suspense fallback={
            <div className={styles.page}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                </div>
            </div>
        }>
            <ProfileContent />
        </Suspense>
    );
}
