'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

// Stored values stay as they were ("dark" is the navy theme), so everyone's
// saved choice survives the renaming. "system" follows the OS.
const OPTIONS = [
    { value: 'system', label: 'Auto', note: 'Paper by day, Blueprint by night' },
    { value: 'light', label: 'Paper', note: 'Warm paper, ink type' },
    { value: 'dark', label: 'Blueprint', note: 'Navy, drawn in light' },
    { value: 'black', label: 'Night', note: 'True black, for OLED' },
];

// A specimen of the theme: a corner of the timetable as it would print in
// it — ruled day columns, three classes, and the now line.
function Specimen({ theme, className = '' }) {
    return (
        <span className={`${styles.specimen} ${styles[`sp_${theme}`]} ${className}`}>
            <span className={styles.spTitle} />
            <span className={styles.spGrid}>
                <span className={`${styles.spBlock} ${styles.spBlockA}`} />
                <span className={`${styles.spBlock} ${styles.spBlockB}`} />
                <span className={`${styles.spBlock} ${styles.spBlockC}`} />
                <span className={styles.spNow} />
            </span>
        </span>
    );
}

const DARK_QUERY = '(prefers-color-scheme: dark)';
const THEME_COLORS = { light: '#F3F1EA', dark: '#0C1826', black: '#000000' };

// System dark resolves to Blueprint, not Night: navy is the app's dark
// identity and black is a deliberate choice for OLED or low light.
function resolveTheme(preference) {
    if (preference !== 'system') return preference;
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function applyTheme(preference) {
    const theme = resolveTheme(preference);
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.light);
}

const THEME_EVENT = 'cm-theme';

/**
 * Set the theme from anywhere (the command palette): saves it, applies it,
 * and tells any open pickers so they show the new choice.
 */
export function setThemePreference(value) {
    try { localStorage.setItem('theme', value); } catch { }
    applyTheme(value);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: value }));
}

/**
 * The theme picker.
 *
 *   compact   the four names as a choice line — the account menu, admin
 *   default   four specimens, each a corner of the timetable in that theme —
 *             Profile's Appearance section
 */
export default function ThemeToggle({ compact = false }) {
    const [preference, setPreference] = useState('system');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('theme');
        const initial = OPTIONS.some(o => o.value === saved) ? saved : 'system';
        setPreference(initial);
        applyTheme(initial);
        setMounted(true);
    }, []);

    // Only while following the system: keep up if the OS flips mid-session.
    useEffect(() => {
        if (preference !== 'system') return undefined;
        const media = window.matchMedia(DARK_QUERY);
        const onChange = () => applyTheme('system');
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, [preference]);

    // Another picker (or the command palette) changed it.
    useEffect(() => {
        const onTheme = (e) => setPreference(e.detail);
        window.addEventListener(THEME_EVENT, onTheme);
        return () => window.removeEventListener(THEME_EVENT, onTheme);
    }, []);

    const choose = useCallback((value) => {
        setPreference(value);
        setThemePreference(value);
    }, []);

    // Nothing renders until the saved choice is known, so the control never
    // shows the wrong option selected for a frame.
    if (!mounted) return <div className={compact ? styles.compactPlaceholder : styles.gridPlaceholder} aria-hidden="true" />;

    if (compact) {
        return (
            <div className={styles.compact} role="radiogroup" aria-label="Theme">
                {OPTIONS.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={preference === option.value}
                        title={option.note}
                        className={styles.word}
                        onClick={() => choose(option.value)}
                    >
                        <span>{option.label}</span>
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className={styles.grid} role="radiogroup" aria-label="Theme">
            {OPTIONS.map(option => {
                const selected = preference === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={styles.card}
                        onClick={() => choose(option.value)}
                    >
                        <span className={styles.frame} aria-hidden="true">
                            {option.value === 'system' ? (
                                <>
                                    <Specimen theme="light" />
                                    <Specimen theme="dark" className={styles.half} />
                                </>
                            ) : (
                                <Specimen theme={option.value} />
                            )}
                        </span>
                        <span className={styles.cardLabel}><span>{option.label}</span></span>
                        <span className={styles.cardNote}>{option.note}</span>
                    </button>
                );
            })}
        </div>
    );
}
