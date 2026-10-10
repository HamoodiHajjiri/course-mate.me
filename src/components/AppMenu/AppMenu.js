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
import { useIsGuest, clearGuest, getGuest, SIGN_UP_HREF } from '@/lib/guest';
import styles from './AppMenu.module.css';

const DESKTOP_QUERY = '(min-width: 768px)';
const CAMPUS = { male: "Men's campus", female: "Women's campus" };

/**
 * The account menu behind your initials in the app bar.
 *
 * It reads like the top of a student record: your name in the serif, your
 * major and campus, your ID in mono. Then the places you return to, as words
 * with their counts, the theme, and the way out. No icons: every row is a
 * word you'd look for. Admin isn't listed; it's reached by typing /admin.
 *
 * Anchored under the trigger from 768px, a bottom sheet below that.
 */
export default function AppMenu() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);
    const [anchorRect, setAnchorRect] = useState(null);
    const [profile, setProfile] = useState(null);
    const [email, setEmail] = useState(null);
    const [majorName, setMajorName] = useState(null);
    const [guest, setGuestState] = useState(null);
    const [loaded, setLoaded] = useState(false);

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
                setEmail(user.email || '');
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
            if (!cancelled) setLoaded(true);
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
    // Before a name is set, the avatar takes the email's first letter rather
    // than the initials of "Your account".
    const avatarName = isGuest ? 'Guest' : profile?.name || email || '';
    const campus = CAMPUS[isGuest ? guest?.gender : profile?.gender];

    const desktopStyle = isDesktop && anchorRect
        ? { top: `${anchorRect.bottom + 8}px`, right: `${Math.max(12, window.innerWidth - anchorRect.right)}px` }
        : undefined;

    const row = (href, label, count) => (
        <Link href={href} className={`${styles.row} ${pathname === href ? styles.rowCurrent : ''}`} role="menuitem">
            <span className={styles.rowLabel}>{label}</span>
            {count > 0 && <span className={styles.rowCount}>{count > 99 ? '99+' : count} new</span>}
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

                <div className={styles.record}>
                    <div className={styles.name}>{displayName}</div>
                    <div className={styles.facts}>
                        {majorName || (isGuest ? 'Browsing without an account' : 'CourseMate student')}
                        {campus && <> · {campus}</>}
                    </div>
                    {profile?.student_id && <div className={styles.id}>{profile.student_id}</div>}
                </div>

                {isGuest ? (
                    <div className={styles.pitch}>
                        <p className={styles.pitchLead}>An account adds what guest mode can&rsquo;t:</p>
                        <ul className={styles.pitchList}>
                            <li>Post sections and get matched automatically</li>
                            <li>Keep up to three saved schedules</li>
                            <li>Hear when a section you want opens up</li>
                        </ul>
                        <Link href={SIGN_UP_HREF} className={styles.pitchCta} role="menuitem">Create an account</Link>
                        <Link href="/auth" className={styles.pitchAlt} role="menuitem">I already have one</Link>
                    </div>
                ) : (
                    <nav className={styles.group} aria-label="Your places">
                        {row('/matches', 'Activity', unreadActivity)}
                        {row('/notifications', 'Notifications', unreadAll)}
                        {row('/schedule', 'Schedules')}
                        {row('/map', 'Campus map')}
                        {row('/profile', 'Profile and settings')}
                        <button type="button" className={styles.row} role="menuitem" onClick={openSearch}>
                            <span className={styles.rowLabel}>Search</span>
                            <span className={styles.rowKeys}>{modKey} K</span>
                        </button>
                    </nav>
                )}

                <div className={styles.theme}>
                    <span className={styles.themeLabel}>Theme</span>
                    <ThemeToggle compact />
                </div>

                <button
                    type="button"
                    className={styles.out}
                    role="menuitem"
                    onClick={isGuest ? exitGuest : signOut}
                >
                    {isGuest ? 'Leave guest mode' : 'Sign out'}
                </button>
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
                {loaded && (isGuest || email !== null)
                    ? <Avatar name={avatarName} size={30} tone={isGuest ? 'outline' : 'solid'} />
                    : <span className={styles.placeholder} aria-hidden="true" />}
            </button>

            {open && mounted && createPortal(panel, document.body)}
        </div>
    );
}
