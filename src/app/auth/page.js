'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { EyeIcon, EyeOffIcon } from '@/components/Icons';
import { setGuest, clearGuest } from '@/lib/guest';
import { Button, Callout, Field, Input, Select, Tabs } from '@/components/ui';
import styles from './auth.module.css';

// Validation messages, matched to the field each belongs under. Anything
// else (a wrong password, a network failure) shows above the button.
const FIELD_FOR_ERROR = {
    'Please enter your full name': 'name',
    'Student ID must follow the format UYYSSXXXX (e.g., U2410xxxx for Fall 2024)': 'studentId',
    'This University ID is already registered.': 'studentId',
    'Please enter a valid phone number': 'phone',
    'Please select your major': 'major',
    'Please select your gender': 'gender',
    'Passwords do not match': 'confirm',
    'Password must be at least 6 characters': 'password',
    'Please enter a valid email address': 'email',
};

// Friendlier words for the same rules, shown under the field.
const FIELD_WORDS = {
    'Please enter your full name': 'Your name as it is on your university ID.',
    'Student ID must follow the format UYYSSXXXX (e.g., U2410xxxx for Fall 2024)': 'Use the format U + year + term + number, like U24101234.',
    'This University ID is already registered.': 'This ID already has an account. Sign in instead.',
    'Please enter a valid phone number': 'At least 10 digits.',
    'Please select your major': 'Choose your major.',
    'Please select your gender': 'Choose your campus.',
    'Passwords do not match': 'This doesn’t match the password above.',
    'Password must be at least 6 characters': 'At least 6 characters.',
    'Please enter a valid email address': 'That doesn’t look like an email address.',
};

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
    const [fieldErrors, setFieldErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [transitioning, setTransitioning] = useState(false);
    // Guest entry: a major and a campus instead of an account.
    const [isGuestEntry, setIsGuestEntry] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const navigateWithTransition = (path) => {
        setTransitioning(true);
        setTimeout(() => {
            router.push(path);
            router.refresh();
        }, 320);
    };

    // Locked features send guests to /auth?signup=1, straight to the sign-up form.
    useEffect(() => {
        if (new URLSearchParams(window.location.search).has('signup')) setIsLogin(false);
    }, []);

    useEffect(() => {
        const fetchMajors = async () => {
            const { data } = await supabase
                .from('majors')
                .select('code, name')
                .order('name');
            setMajors(data || []);
        };
        fetchMajors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fail = (err) => {
        const field = FIELD_FOR_ERROR[err.message];
        if (field) setFieldErrors({ [field]: FIELD_WORDS[err.message] || err.message });
        else setError(err.message);
    };

    const clearError = (key) => setFieldErrors(fe => (fe[key] ? { ...fe, [key]: null } : fe));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setFieldErrors({});
        setLoading(true);

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;
                clearGuest();
                navigateWithTransition('/');
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

                // Profiles aren't readable before sign-in, so ask the
                // database whether the ID is taken rather than looking it up.
                const { data: idTaken } = await supabase.rpc('student_id_taken', { p_student_id: studentId });
                if (idTaken) {
                    throw new Error('This University ID is already registered.');
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

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (error) throw error;

                if (data?.user?.identities?.length === 0) {
                    throw new Error('An account with this email already exists. Please sign in instead.');
                }

                // Auto login after signup
                const { error: loginError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (loginError) throw loginError;

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

                clearGuest();
                navigateWithTransition('/');
            }
        } catch (err) {
            fail(err);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setError('');
        setFieldErrors({});
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
            fail(err);
        } finally {
            setLoading(false);
        }
    };

    const enterAsGuest = (e) => {
        e.preventDefault();
        const missing = {};
        if (!major) missing.major = 'Choose a major to see its courses.';
        if (!gender) missing.gender = 'Choose a campus to see its sections.';
        if (Object.keys(missing).length) { setFieldErrors(missing); return; }
        setGuest({ major, gender });
        navigateWithTransition('/');
    };

    const switchMode = (mode) => {
        const login = mode === 'in';
        if (login === isLogin) return;
        setIsLogin(login);
        setError('');
        setFieldErrors({});
        setPassword('');
        setConfirmPassword('');
        setIsForgotPassword(false);
        setResetSent(false);
    };

    const passwordInput = (value, set, shown, setShown, key, placeholder) => (
        <Field label={key === 'confirm' ? 'Password again' : 'Password'} error={fieldErrors[key]} hint={key === 'password' && !isLogin ? 'At least 6 characters.' : undefined}>
            {({ id, invalid, describedBy }) => (
                <span className={styles.passwordWrap}>
                    <Input
                        id={id}
                        type={shown ? 'text' : 'password'}
                        value={value}
                        onChange={(e) => { set(e.target.value); clearError(key); }}
                        invalid={invalid}
                        aria-describedby={describedBy}
                        placeholder={placeholder}
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        required
                        disabled={loading}
                        size="lg"
                    />
                    <button type="button" onClick={() => setShown(!shown)} className={styles.reveal} aria-label={shown ? 'Hide password' : 'Show password'}>
                        {shown ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                </span>
            )}
        </Field>
    );

    const majorSelect = (
        <Field label="Major" error={fieldErrors.major}>
            {({ id, invalid, describedBy }) => (
                <Select id={id} size="lg" invalid={invalid} aria-describedby={describedBy} value={major} onChange={(e) => { setMajor(e.target.value); clearError('major'); }} disabled={loading}>
                    <option value="">Choose your major</option>
                    {majors.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
                </Select>
            )}
        </Field>
    );

    const campusSelect = (
        <Field label="Campus" error={fieldErrors.gender} hint="Decides which sections you see. Never shown to anyone.">
            {({ id, invalid, describedBy }) => (
                <Select id={id} size="lg" invalid={invalid} aria-describedby={describedBy} value={gender} onChange={(e) => { setGender(e.target.value); clearError('gender'); }} disabled={loading}>
                    <option value="">Choose your campus</option>
                    <option value="male">Men&apos;s campus</option>
                    <option value="female">Women&apos;s campus</option>
                </Select>
            )}
        </Field>
    );

    let form;
    if (isGuestEntry) {
        form = (
            <form onSubmit={enterAsGuest} className={styles.form} noValidate>
                <header className={styles.formHead}>
                    <h2 className={styles.formTitle}>Look around first</h2>
                    <p className={styles.formLead}>Build timetables and use the map without an account. Saving schedules and trading sections need one. Nothing is kept beyond this browser.</p>
                </header>
                {majorSelect}
                {campusSelect}
                <Button type="submit" variant="primary" size="lg" block>Continue as a guest</Button>
                <button type="button" onClick={() => { setIsGuestEntry(false); setError(''); setFieldErrors({}); }} className={styles.textLink}>← Back to signing in</button>
            </form>
        );
    } else if (isForgotPassword) {
        form = resetSent ? (
            <div className={styles.form}>
                <header className={styles.formHead}>
                    <h2 className={styles.formTitle}>Check your email</h2>
                    <p className={styles.formLead}>A link to reset your password is on its way to <strong>{email}</strong>.</p>
                </header>
                <Button variant="secondary" size="lg" block onClick={() => { setIsForgotPassword(false); setResetSent(false); setError(''); }}>Back to signing in</Button>
            </div>
        ) : (
            <form onSubmit={handleForgotPassword} className={styles.form} noValidate>
                <header className={styles.formHead}>
                    <h2 className={styles.formTitle}>Reset your password</h2>
                    <p className={styles.formLead}>We&rsquo;ll email you a link to choose a new one.</p>
                </header>
                <Field label="Email" error={fieldErrors.email}>
                    {({ id, invalid, describedBy }) => (
                        <Input id={id} type="email" size="lg" value={email} invalid={invalid} aria-describedby={describedBy} onChange={(e) => { setEmail(e.target.value); clearError('email'); }} autoComplete="email" required disabled={loading} />
                    )}
                </Field>
                {error && <Callout tone="danger">{error}</Callout>}
                <Button type="submit" variant="primary" size="lg" block loading={loading}>Send the link</Button>
                <button type="button" onClick={() => { setIsForgotPassword(false); setError(''); setFieldErrors({}); }} className={styles.textLink} disabled={loading}>← Back to signing in</button>
            </form>
        );
    } else {
        form = (
            <form onSubmit={handleSubmit} className={styles.form} noValidate>
                <Tabs
                    label="Account"
                    value={isLogin ? 'in' : 'up'}
                    onChange={switchMode}
                    tabs={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create an account' }]}
                />

                {!isLogin && <span className={styles.groupLabel}>Your account</span>}
                <Field label="Email" error={fieldErrors.email}>
                    {({ id, invalid, describedBy }) => (
                        <Input id={id} type="email" size="lg" value={email} invalid={invalid} aria-describedby={describedBy} onChange={(e) => { setEmail(e.target.value); clearError('email'); }} autoComplete="email" placeholder="you@sharjah.ac.ae" required disabled={loading} />
                    )}
                </Field>
                {passwordInput(password, setPassword, showPassword, setShowPassword, 'password')}
                {!isLogin && passwordInput(confirmPassword, setConfirmPassword, showConfirmPassword, setShowConfirmPassword, 'confirm')}

                {!isLogin && (
                    <>
                        <span className={styles.groupLabel}>About you</span>
                        <Field label="Full name" error={fieldErrors.name}>
                            {({ id, invalid, describedBy }) => (
                                <Input id={id} size="lg" value={name} invalid={invalid} aria-describedby={describedBy} onChange={(e) => { setName(e.target.value); clearError('name'); }} autoComplete="name" placeholder="As on your university ID" required disabled={loading} />
                            )}
                        </Field>
                        <div className={styles.pair}>
                            <Field label="University ID" error={fieldErrors.studentId}>
                                {({ id, invalid, describedBy }) => (
                                    <Input id={id} size="lg" mono value={studentId} invalid={invalid} aria-describedby={describedBy} onChange={(e) => { setStudentId(e.target.value.toUpperCase()); clearError('studentId'); }} placeholder="U24101234" required disabled={loading} />
                                )}
                            </Field>
                            <Field label="Phone" error={fieldErrors.phone}>
                                {({ id, invalid, describedBy }) => (
                                    <Input id={id} size="lg" type="tel" value={phone} invalid={invalid} aria-describedby={describedBy} onChange={(e) => { setPhone(e.target.value); clearError('phone'); }} autoComplete="tel" placeholder="05X XXX XXXX" required disabled={loading} />
                                )}
                            </Field>
                        </div>
                        {majorSelect}
                        {campusSelect}
                    </>
                )}

                {isLogin && (
                    <button type="button" onClick={() => { setIsForgotPassword(true); setError(''); setFieldErrors({}); }} className={styles.forgot} disabled={loading}>
                        Forgot your password?
                    </button>
                )}

                {error && <Callout tone="danger">{error}</Callout>}

                <Button type="submit" variant="primary" size="lg" block loading={loading}>
                    {isLogin ? 'Sign in' : 'Create the account'}
                </Button>

                <button type="button" onClick={() => { setIsGuestEntry(true); setError(''); setFieldErrors({}); }} className={styles.textLink} disabled={loading}>
                    Look around without an account →
                </button>
            </form>
        );
    }

    return (
        <div className={`${styles.page} ${transitioning ? styles.leaving : ''}`}>
            <section className={styles.brand} aria-label="CourseMate">
                <span className={styles.wordmark}>
                    <Image src="/logo.png" alt="" width={56} height={56} priority />
                    CourseMate
                </span>
                <h1 className={styles.statement}>
                    Trade sections,<br />
                    plan the week,<br />
                    find the room.
                </h1>
                <dl className={styles.notation}>
                    <div>
                        <dt><span className={styles.sec}>§12</span><span className={styles.line} /><span className={styles.sec}>§03</span></dt>
                        <dd>Swap sections with classmates. CourseMate finds the route, two people or a loop of three.</dd>
                    </div>
                    <div>
                        <dt><span className={styles.span}>08:00–09:15</span></dt>
                        <dd>Every combination of your courses&rsquo; sections, kept only if nothing clashes.</dd>
                    </div>
                    <div>
                        <dt><span className={styles.room}>A3-007 ↗</span></dt>
                        <dd>Every room on your timetable opens on the campus map.</dd>
                    </div>
                </dl>
                <p className={styles.footnote}>For students of the University of Sharjah.</p>
            </section>

            <section className={styles.panel}>
                <div className={styles.panelInner}>{form}</div>
            </section>
        </div>
    );
}
