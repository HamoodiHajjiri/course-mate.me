'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { EyeIcon, EyeOffIcon } from '@/components/Icons';
import styles from '../auth.module.css';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [ready, setReady] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setReady(true);
            } else {
                setError('This reset link is invalid or has expired. Please request a new one.');
                setReady(true);
            }
        };
        checkSession();
    }, []);

    const handleReset = async (e) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: password,
            });

            if (error) throw error;
            setSuccess(true);

            setTimeout(() => {
                router.push('/');
                router.refresh();
            }, 2000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!ready) {
        return (
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.logoWrapper}>
                        <div className={styles.logoFrame}>
                            <Image src="/logo-v2.png" alt="CourseMate" width={72} height={72} className={styles.logo} />
                        </div>
                        <h1 className={styles.title}>CourseMate</h1>
                        <p className={styles.subtitle}>Verifying reset link...</p>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                        <span className={styles.spinner} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.logoWrapper}>
                    <div className={styles.logoFrame}>
                        <Image src="/logo-v2.png" alt="CourseMate" width={72} height={72} className={styles.logo} />
                    </div>
                    <h1 className={styles.title}>CourseMate</h1>
                    <p className={styles.subtitle}>Reset your password</p>
                </div>

                {success ? (
                    <div className={styles.resetSentMessage}>
                        <div className={styles.resetSentTitle}>Password updated</div>
                        <div className={styles.resetSentText}>
                            Your password has been reset successfully. Redirecting...
                        </div>
                    </div>
                ) : error && !password ? (
                    <div className={styles.resetSentMessage}>
                        <div className={styles.error}>{error}</div>
                        <button
                            type="button"
                            className={styles.submitBtn}
                            onClick={() => router.push('/auth')}
                            style={{ marginTop: '16px' }}
                        >
                            Back to Sign In
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleReset} className={styles.form}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>New Password</label>
                            <div className={styles.passwordWrapper}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={`${styles.input} ${styles.inputPassword}`}
                                    placeholder="Enter new password"
                                    required
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className={styles.passwordToggle}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeIcon width={20} height={20} /> : <EyeOffIcon width={20} height={20} />}
                                </button>
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Confirm Password</label>
                            <div className={styles.passwordWrapper}>
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`${styles.input} ${styles.inputPassword}`}
                                    placeholder="Confirm new password"
                                    required
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className={styles.passwordToggle}
                                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                                    tabIndex={-1}
                                >
                                    {showConfirmPassword ? <EyeIcon width={20} height={20} /> : <EyeOffIcon width={20} height={20} />}
                                </button>
                            </div>
                        </div>

                        {error && <div className={styles.error}>{error}</div>}

                        <button type="submit" className={styles.submitBtn} disabled={loading}>
                            {loading ? <span className={styles.spinner} /> : 'Reset Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
