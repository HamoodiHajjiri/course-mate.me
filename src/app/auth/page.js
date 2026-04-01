'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from '@/components/ThemeToggle';
import { EyeIcon, EyeOffIcon } from '@/components/Icons';
import styles from './auth.module.css';

export default function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    // Profile fields for signup
    const [name, setName] = useState('');
    const [studentId, setStudentId] = useState('');
    const [phone, setPhone] = useState('');
    const [major, setMajor] = useState('');
    const [gender, setGender] = useState('');
    const [majors, setMajors] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    // Fetch available majors on mount
    useEffect(() => {
        const fetchMajors = async () => {
            const { data } = await supabase
                .from('majors')
                .select('code, name')
                .order('name');
            setMajors(data || []);
        };
        fetchMajors();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                // Login
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;
                router.push('/');
                router.refresh();
            } else {
                // Signup - validate all fields
                if (!name.trim()) {
                    throw new Error('Please enter your full name');
                }

                // Validate student ID format: UYYSSXXXX
                const studentIdRegex = /^U\d{2}(10|20)\d{4}$/;
                if (!studentIdRegex.test(studentId)) {
                    throw new Error('Student ID must follow the format UYYSSXXXX (e.g., U2410xxxx for Fall 2024)');
                }

                // Validate phone format
                const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
                if (!phoneRegex.test(phone)) {
                    throw new Error('Please enter a valid phone number');
                }

                if (!major) {
                    throw new Error('Please select your major');
                }

                if (!gender) {
                    throw new Error('Please select your gender');
                }

                // Check if University ID is already taken
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('student_id')
                    .eq('student_id', studentId)
                    .single();

                if (existingProfile) {
                    throw new Error('This University ID is already registered.wha');
                }

                if (password !== confirmPassword) {
                    throw new Error('Passwords do not match');
                }

                if (password.length < 6) {
                    throw new Error('Password must be at least 6 characters');
                }

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
                if (!emailRegex.test(email.trim())) {
                    throw new Error('Please enter a valid email address');
                }

                // Check if student ID is already taken (for signup)
                if (!isLogin) {
                    const { data: existingId } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('student_id', studentId)
                        .single();

                    if (existingId) {
                        throw new Error('This Student ID is already registered');
                    }
                }

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (error) throw error;

                // Check if user already exists
                if (data?.user?.identities?.length === 0) {
                    throw new Error('An account with this email already exists. Please sign in instead.');
                }

                // Auto login after signup
                const { error: loginError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (loginError) throw loginError;

                // Create/update profile with the provided info
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({
                        name: name.trim(),
                        student_id: studentId,
                        phone: phone.trim(),
                        email: email.trim(),
                        major: major,
                        gender: gender,
                    })
                    .eq('id', data.user.id);

                if (profileError) {
                    console.error('Profile update error:', profileError);
                }

                router.push('/');
                router.refresh();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
            if (!emailRegex.test(email.trim())) {
                throw new Error('Please enter a valid email address');
            }

            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/auth/callback`,
            });

            if (error) throw error;
            setResetSent(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setIsLogin(!isLogin);
        setError('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setName('');
        setStudentId('');
        setPhone('');
        setMajor('');
        setGender('');
        setIsForgotPassword(false);
        setResetSent(false);
    };

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.themeToggleWrapper}>
                    <ThemeToggle />
                </div>
                {/* Logo */}
                <div className={styles.logoWrapper}>
                    <div className={styles.logoFrame}>
                        <Image src="/logo.png" alt="CourseMate" width={256} height={256} className={styles.logo} />
                    </div>
                    <h1 className={styles.title}>CourseMate</h1>
                    <p className={styles.subtitle}>University course section exchange</p>
                </div>

                {/* Forgot Password Form */}
                {isForgotPassword ? (
                    <>
                        {resetSent ? (
                            <div className={styles.resetSentMessage}>
                                <div className={styles.resetSentTitle}>Check your email</div>
                                <div className={styles.resetSentText}>
                                    We sent a password reset link to <strong>{email}</strong>. Check your inbox and follow the link to reset your password.
                                </div>
                                <button type="button" className={styles.submitBtn} onClick={() => { setIsForgotPassword(false); setResetSent(false); setEmail(''); setError(''); }} style={{ marginTop: '16px' }}>
                                    Back to Sign In
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleForgotPassword} className={styles.form}>
                                <div className={styles.resetSentText} style={{ marginBottom: '16px' }}>
                                    Enter your email address and we will send you a link to reset your password.
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Email</label>
                                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} placeholder="Enter your email" required disabled={loading} />
                                </div>

                                {error && <div className={styles.error}>{error}</div>}

                                <button type="submit" className={styles.submitBtn} disabled={loading}>
                                    {loading ? <span className={styles.spinner} /> : 'Send Reset Link'}
                                </button>
                            </form>
                        )}

                        {!resetSent && (
                            <div className={styles.toggle} style={{ marginTop: '16px' }}>
                                <button type="button" onClick={() => { setIsForgotPassword(false); setError(''); }} className={styles.toggleBtn} disabled={loading}>
                                    Back to Sign In
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* Normal Login/Signup Form */}
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Email</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} placeholder="Enter your email" required disabled={loading} />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Password</label>
                                <div className={styles.passwordWrapper}>
                                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`${styles.input} ${styles.inputPassword}`} placeholder="Enter password" required disabled={loading} />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className={styles.passwordToggle} aria-label={showPassword ? "Hide password" : "Show password"} tabIndex={-1}>
                                        {showPassword ? <EyeIcon width={20} height={20} /> : <EyeOffIcon width={20} height={20} />}
                                    </button>
                                </div>
                            </div>

                            {!isLogin && (
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Confirm Password</label>
                                    <div className={styles.passwordWrapper}>
                                        <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={`${styles.input} ${styles.inputPassword}`} placeholder="Confirm password" required disabled={loading} />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className={styles.passwordToggle} aria-label={showConfirmPassword ? "Hide password" : "Show password"} tabIndex={-1}>
                                            {showConfirmPassword ? <EyeIcon width={20} height={20} /> : <EyeOffIcon width={20} height={20} />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Profile fields for signup */}
                            {!isLogin && (
                                <>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Full Name</label>
                                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={styles.input} placeholder="Enter your full name" required disabled={loading} />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>University ID</label>
                                        <input type="text" value={studentId} onChange={(e) => setStudentId(e.target.value.toUpperCase())} className={styles.input} placeholder="e.g., U24101234" required disabled={loading} />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Phone Number</label>
                                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={styles.input} placeholder="Enter your phone number" required disabled={loading} />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Major</label>
                                        <select value={major} onChange={(e) => setMajor(e.target.value)} className={styles.input} required disabled={loading}>
                                            <option value="">Select your major</option>
                                            {majors.map(m => (
                                                <option key={m.code} value={m.code}>{m.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Gender</label>
                                        <select value={gender} onChange={(e) => setGender(e.target.value)} className={styles.input} required disabled={loading}>
                                            <option value="">Select your gender</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            {isLogin && (
                                <div className={styles.forgotPassword}>
                                    <button type="button" onClick={() => { setIsForgotPassword(true); setError(''); }} className={styles.forgotBtn} disabled={loading}>
                                        Forgot Password?
                                    </button>
                                </div>
                            )}

                            {error && <div className={styles.error}>{error}</div>}

                            <button type="submit" className={styles.submitBtn} disabled={loading}>
                                {loading ? (
                                    <span className={styles.spinner} />
                                ) : (
                                    isLogin ? 'Sign In' : 'Create Account'
                                )}
                            </button>
                        </form>

                        {/* Toggle */}
                        <div className={styles.toggle}>
                            <span className={styles.toggleText}>
                                {isLogin ? "Don't have an account?" : 'Already have an account?'}
                            </span>
                            <button type="button" onClick={toggleMode} className={styles.toggleBtn} disabled={loading}>
                                {isLogin ? 'Sign Up' : 'Sign In'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div >
    );
}
