'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckIcon } from '@/components/Icons';
import styles from './ThemeToggle.module.css';

// "dark" still means the navy theme so anyone's saved choice survives; "black"
// is the true-black variant. "system" follows the OS and keeps following it.
const OPTIONS = [
    { value: 'system', label: 'Auto', title: 'Follow your device setting', note: 'Matches your device' },
    { value: 'light', label: 'Light', title: 'Light theme', note: 'Bright and crisp' },
    { value: 'dark', label: 'Navy', title: 'Dark theme, navy background', note: 'Deep and calm' },
    { value: 'black', label: 'Black', title: 'True black, best on OLED screens', note: 'Pure black, for OLED' },
];

// A miniature of the app in a given theme: the bar, the forest panel every
// page leads with, a card with two lines and a mint action.
function Miniature({ theme, className = '' }) {
    return (
        <span className={`${styles.preview} ${styles[`preview_${theme}`]} ${className}`}>
            <span className={styles.pvBar}><span className={styles.pvDot} /><span className={styles.pvBarLine} /></span>
            <span className={styles.pvForest}><span className={styles.pvForestLine} /></span>
            <span className={styles.pvCard}>
                <span className={styles.pvLines}>
                    <span className={styles.pvLine} />
                    <span className={`${styles.pvLine} ${styles.pvLineShort}`} />
                </span>
                <span className={styles.pvPill} />
            </span>
        </span>
    );
}

const DARK_QUERY = '(prefers-color-scheme: dark)';
const THEME_COLORS = { light: '#F5F4EF', dark: '#070D16', black: '#000000' };

// System dark resolves to navy, not black: navy is the app's dark identity and
// black is a deliberate choice for OLED or low light.
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
 *   compact   four swatches in a segmented control — the account menu and
 *             the admin bar
 *   default   four preview cards, each a miniature of the app in that theme —
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
    // shows the wrong option selected for a frame. The placeholder holds the
    // space so the layout doesn't jump.
    if (!mounted) return <div className={compact ? styles.compactPlaceholder : styles.gridPlaceholder} aria-hidden="true" />;

    if (compact) {
        return (
            <div className={styles.compact} role="radiogroup" aria-label="Colour theme">
                {OPTIONS.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={preference === option.value}
                        aria-label={option.label}
                        title={option.label}
                        className={styles.swatchBtn}
                        onClick={() => choose(option.value)}
                    >
                        <span className={`${styles.swatch} ${styles[`swatch_${option.value}`]}`} aria-hidden="true" />
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className={styles.grid} role="radiogroup" aria-label="Colour theme">
            {OPTIONS.map(option => {
                const selected = preference === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={option.title}
                        className={styles.card}
                        onClick={() => choose(option.value)}
                    >
                        <span className={styles.previewFrame} aria-hidden="true">
                            {option.value === 'system' ? (
                                <>
                                    <Miniature theme="light" />
                                    <Miniature theme="dark" className={styles.previewHalf} />
                                </>
                            ) : (
                                <Miniature theme={option.value} />
                            )}
                        </span>
                        <span className={styles.cardText}>
                            <span className={styles.cardLabel}>
                                {option.label}
                                {selected && <span className={styles.check}><CheckIcon strokeWidth={2.5} /></span>}
                            </span>
                            <span className={styles.cardNote}>{option.note}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
