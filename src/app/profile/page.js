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

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '',
        student_id: '',
        phone: '',
        major: ''
    });

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
                major: data.major || ''
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
            major: profile?.major || ''
        });
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditForm({
            name: profile?.name || '',
            student_id: profile?.student_id || '',
            phone: profile?.phone || '',
            major: profile?.major || ''
        });
    };

    const handleSaveProfile = async () => {
        if (!canEdit) return;

        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('profiles')
            .update({
                name: editForm.name,
                student_id: editForm.student_id,
                phone: editForm.phone,
                major: editForm.major
            })
            .eq('id', user.id);

        if (!error) {
            // Update local state
            setProfile({
                ...profile,
                name: editForm.name,
                student_id: editForm.student_id,
                phone: editForm.phone,
                major: editForm.major
            });

            // Update major name
            const majorData = majors.find(m => m.code === editForm.major);
            setMajorName(majorData?.name || editForm.major);

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

    // Show major selection modal if needed
    if (showMajorSelect && !profile?.major) {
        return (
            <div className={styles.page}>
                <header className={styles.header}>
                    <h1>🎓 Select Your Major</h1>
                    <ThemeToggle />
                </header>

                <main className={styles.main}>
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>Complete Your Profile</h2>
                        <p className={styles.cardDesc}>
                            Please select your major to see relevant course swaps.
                        </p>

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

                        <button
                            onClick={handleSaveMajor}
                            className={styles.saveBtn}
                            disabled={!selectedMajor || saving}
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
                <h1>👤 Profile</h1>
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
                                ✏️ Edit
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
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className={styles.input}
                                    placeholder="Enter your full name"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>University ID</label>
                                <input
                                    type="text"
                                    value={editForm.student_id}
                                    onChange={(e) => setEditForm({ ...editForm, student_id: e.target.value })}
                                    className={styles.input}
                                    placeholder="Enter your student ID"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Phone Number</label>
                                <input
                                    type="tel"
                                    value={editForm.phone}
                                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                    className={styles.input}
                                    placeholder="Enter your phone number"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Major</label>
                                <select
                                    value={editForm.major}
                                    onChange={(e) => setEditForm({ ...editForm, major: e.target.value })}
                                    className={styles.select}
                                >
                                    <option value="">Select your major</option>
                                    {majors.map(m => (
                                        <option key={m.code} value={m.code}>{m.name}</option>
                                    ))}
                                </select>
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
                        </div>
                    )}

                    {/* Show warning if user has posts */}
                    {!canEdit && !isEditing && (
                        <div className={styles.editWarning}>
                            ⚠️ Complete or cancel your active posts to edit your profile
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
                    🚪 Sign Out
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
