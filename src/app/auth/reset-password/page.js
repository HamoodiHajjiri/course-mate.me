'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { EyeIcon, EyeOffIcon } from '@/components/Icons';
import { Button, Callout, Field, Input, Spinner } from '@/components/ui';
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
        const setup = async () => {
            // Check if there's a code to exchange (redirected from root page)
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');

            if (code) {
                // Exchange the code for a session
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                if (!error) {
                    // Clean up URL
                    window.history.replaceState({}, '', '/auth/reset-password');
                    setReady(true);
                    return;
                }
            }

            // No code — check if we already have a session
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setReady(true);
            } else {
                setError('This reset link is invalid or has expired. Please request a new one.');
                setReady(true);
            }
        };
        setup();
    }, []);

    const handleReset = async (e) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('The password needs at least 6 characters.');
            return;
        }

        if (password !== confirmPassword) {
            setError('The two passwords don’t match.');
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

    const passwordField = (label, value, set, shown, setShown, autoFocus) => (
        <Field label={label}>
            {({ id }) => (
                <span className={styles.passwordWrap}>
                    <Input
                        id={id}
                        size="lg"
                        type={shown ? 'text' : 'password'}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        autoComplete="new-password"
                        required
                        disabled={loading}
                        data-autofocus={autoFocus || undefined}
                    />
                    <button type="button" onClick={() => setShown(!shown)} className={styles.reveal} aria-label={shown ? 'Hide password' : 'Show password'}>
                        {shown ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                </span>
            )}
        </Field>
    );

    let body;
    if (!ready) {
        body = (
            <div className={styles.form}>
                <header className={styles.formHead}>
                    <h2 className={styles.formTitle}>Checking your link…</h2>
                </header>
                <Spinner />
            </div>
        );
    } else if (success) {
        body = (
            <div className={styles.form}>
                <header className={styles.formHead}>
                    <h2 className={styles.formTitle}>Password changed</h2>
                    <p className={styles.formLead}>Taking you to CourseMate…</p>
                </header>
            </div>
        );
    } else if (error && !password) {
        body = (
            <div className={styles.form}>
                <header className={styles.formHead}>
                    <h2 className={styles.formTitle}>This link doesn&rsquo;t work</h2>
                    <p className={styles.formLead}>{error}</p>
                </header>
                <Button variant="secondary" size="lg" block onClick={() => router.push('/auth')}>Back to signing in</Button>
            </div>
        );
    } else {
        body = (
            <form onSubmit={handleReset} className={styles.form} noValidate>
                <header className={styles.formHead}>
                    <h2 className={styles.formTitle}>Choose a new password</h2>
                    <p className={styles.formLead}>At least 6 characters.</p>
                </header>
                {passwordField('New password', password, setPassword, showPassword, setShowPassword, true)}
                {passwordField('New password again', confirmPassword, setConfirmPassword, showConfirmPassword, setShowConfirmPassword)}
                {error && <Callout tone="danger">{error}</Callout>}
                <Button type="submit" variant="primary" size="lg" block loading={loading}>Save the new password</Button>
            </form>
        );
    }

    return (
        <div className={`${styles.page} ${styles.pageNarrow}`}>
            <section className={styles.brand} aria-label="CourseMate">
                <span className={styles.wordmark}>
                    <Image src="/logo.png" alt="" width={56} height={56} priority />
                    CourseMate
                </span>
                <h1 className={styles.statement}>A new<br />password.</h1>
            </section>
            <section className={styles.panel}>
                <div className={styles.panelInner}>{body}</div>
            </section>
        </div>
    );
}
