'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import useUnreadCount from '@/lib/useUnreadCount';
import useModKey from '@/lib/useModKey';
import ThemeToggle from '@/components/ThemeToggle';
import { Avatar } from '@/components/ui';
import {
    ActivityIcon, BellIcon, CheckIcon, ChevronRightIcon, LoginIcon, LogoutIcon, MapIcon,
    PaletteIcon, ProfileIcon, ScheduleIcon, SearchIcon, SparkleIcon,
} from '@/components/Icons';
import { useIsGuest, clearGuest, getGuest, SIGN_UP_HREF } from '@/lib/guest';
import styles from './AppMenu.module.css';

const DESKTOP_QUERY = '(min-width: 768px)';
const CAMPUS = { male: "Men's campus", female: "Women's campus" };

/**
 * The account menu behind the avatar in the app bar.
 *
 * Opens on who you are — name, major, student ID, campus — then the places
 * you go back to most, appearance, and the way out. Admin is NOT listed; it
 * is reachable only by typing /admin on an admin account.
 *
 * An anchored dropdown from 768px, a bottom sheet below that. Rendered through
 * a portal so no ancestor's stacking or blur can trap it.
 */
export default function AppMenu() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);
    const [anchorRect, setAnchorRect] = useState(null);
    const [profile, setProfile] = useState(null);
    const [majorName, setMajorName] = useState(null);
    const [guest, setGuestState] = useState(null);

    const panelRef = useRef(null);
    const triggerRef = useRef(null);
    const router = useRouter();
    const pathname = usePathname();
    const supabase = createClient();
    const isGuest = useIsGuest();
    const unreadAll = useUnreadCount('all');
    const unreadActivity = useUnreadCount('activity');
    const modKey = useModKey();

    useEffect(() => {
        setMounted(true);
        const mq = window.matchMedia(DESKTOP_QUERY);
        const sync = () => setIsDesktop(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const g = getGuest();
            const { data: { user } } = await supabase.auth.getUser();
            let major = g?.major || null;
            if (user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('name, student_id, major, gender')
                    .eq('id', user.id)
                    .single();
                if (cancelled) return;
                setProfile(data || null);
                major = data?.major || null;
            } else if (g) {
                setGuestState(g);
            }
            if (major) {
                const { data: m } = await supabase.from('majors').select('name').eq('code', major).maybeSingle();
                if (!cancelled) setMajorName(m?.name || major);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Close on route change, so tapping a link never leaves the menu open.
    useEffect(() => { setOpen(false); }, [pathname]);

    const measure = useCallback(() => {
        const el = triggerRef.current;
        if (el) setAnchorRect(el.getBoundingClientRect());
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const items = [...(panelRef.current?.querySelectorAll('[role="menuitem"]') || [])];
                if (items.length === 0) return;
                e.preventDefault();
                const idx = items.indexOf(document.activeElement);
                items[(idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
            }
        };
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        requestAnimationFrame(() => panelRef.current?.querySelector('[role="menuitem"]')?.focus());
        return () => {
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [open, measure]);

    const toggleOpen = () => {
        if (!open) measure();
        setOpen(o => !o);
    };

    const exitGuest = () => {
        setOpen(false);
        clearGuest();
        router.push('/auth');
    };

    const signOut = async () => {
        setOpen(false);
        await supabase.auth.signOut();
        router.push('/auth');
        router.refresh();
    };

    const openSearch = () => {
        setOpen(false);
        window.dispatchEvent(new Event('cm-open-palette'));
    };

    const displayName = isGuest ? 'Guest' : profile?.name || 'Your account';
    const campus = CAMPUS[isGuest ? guest?.gender : profile?.gender];

    const desktopStyle = isDesktop && anchorRect
        ? { top: `${anchorRect.bottom + 8}px`, right: `${Math.max(12, window.innerWidth - anchorRect.right)}px` }
        : undefined;

    const shortcut = (href, Icon, label, count) => (
        <Link href={href} className={styles.shortcut} role="menuitem">
            <span className={styles.shortcutIcon}><Icon /></span>
            <span className={styles.shortcutLabel}>{label}</span>
            {count > 0 && <span className={styles.shortcutCount}>{count > 9 ? '9+' : count}</span>}
        </Link>
    );

    const panel = (
        <>
            <div className={`${styles.scrim} ${isDesktop ? styles.scrimClear : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
            <div
                className={`${styles.panel} ${isDesktop ? styles.panelDesktop : styles.panelSheet}`}
                style={desktopStyle}
                ref={panelRef}
                role="menu"
                aria-label="Account menu"
            >
                {!isDesktop && <span className={styles.handle} aria-hidden="true" />}

                {/* Identity: who's signed in, on the brand's forest ground. */}
                <div className={styles.identity}>
                    <div className={styles.identityTop}>
                        <Avatar name={displayName} size={44} tone={isGuest ? 'neutral' : 'solid'} />
                        <div className={styles.identityText}>
                            <div className={styles.name}>{displayName}</div>
                            <div className={styles.major}>
                                {majorName || (isGuest ? 'Browsing without an account' : 'CourseMate student')}
                            </div>
                        </div>
                    </div>
                    {(profile?.student_id || campus || isGuest) && (
                        <div className={styles.facts}>
                            {profile?.student_id && <span className={styles.fact}><span className={styles.factMono}>{profile.student_id}</span></span>}
                            {campus && <span className={styles.fact}>{campus}</span>}
                            {isGuest && <span className={styles.fact}>Guest mode</span>}
                        </div>
                    )}
                </div>

                {isGuest ? (
                    <div className={styles.guestPitch}>
                        <ul className={styles.pitchList}>
                            {['Post swaps and get matched automatically', 'Save up to three schedules', 'Alerts when a section opens up'].map(t => (
                                <li key={t}><CheckIcon strokeWidth={2.25} />{t}</li>
                            ))}
                        </ul>
                        <Link href={SIGN_UP_HREF} className={styles.pitchCta} role="menuitem">
                            <SparkleIcon />
                            Create a free account
                        </Link>
                        <Link href="/auth" className={styles.row} role="menuitem">
                            <LoginIcon />
                            <span className={styles.rowLabel}>I already have an account</span>
                            <ChevronRightIcon className={styles.chevron} />
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className={styles.shortcuts}>
                            {shortcut('/matches', ActivityIcon, 'Activity', unreadActivity)}
                            {shortcut('/notifications', BellIcon, 'Notifications', unreadAll)}
                            {shortcut('/schedule', ScheduleIcon, 'Schedules', 0)}
                            {shortcut('/map', MapIcon, 'Campus map', 0)}
                        </div>
                        <div className={styles.group}>
                            <Link href="/profile" className={styles.row} role="menuitem">
                                <ProfileIcon />
                                <span className={styles.rowLabel}>Profile &amp; settings</span>
                                <ChevronRightIcon className={styles.chevron} />
                            </Link>
                            <button type="button" className={styles.row} role="menuitem" onClick={openSearch}>
                                <SearchIcon />
                                <span className={styles.rowLabel}>Search CourseMate</span>
                                <span className={styles.rowKeys}><kbd>{modKey}</kbd><kbd>K</kbd></span>
                            </button>
                        </div>
                    </>
                )}

                <div className={styles.themeBlock}>
                    <span className={styles.themeLabel}>
                        <PaletteIcon />
                        Appearance
                    </span>
                    <ThemeToggle compact />
                </div>

                <div className={styles.group}>
                    <button
                        type="button"
                        className={`${styles.row} ${styles.signOut}`}
                        role="menuitem"
                        onClick={isGuest ? exitGuest : signOut}
                    >
                        <LogoutIcon />
                        <span className={styles.rowLabel}>{isGuest ? 'Exit guest mode' : 'Sign out'}</span>
                    </button>
                </div>
            </div>
        </>
    );

    return (
        <div className={styles.anchor}>
            <button
                type="button"
                ref={triggerRef}
                className={styles.trigger}
                onClick={toggleOpen}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label="Account menu"
            >
                <Avatar name={displayName} size={30} tone={isGuest ? 'neutral' : 'accent'} />
            </button>

            {open && mounted && createPortal(panel, document.body)}
        </div>
    );
}
