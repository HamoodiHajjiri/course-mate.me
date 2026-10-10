'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import useUnreadCount from '@/lib/useUnreadCount';
import AppMenu from '@/components/AppMenu';
import AlertsBell from '@/components/AlertsBell';
import CommandPalette from '@/components/CommandPalette/CommandPalette';
import { Count } from '@/components/ui';
import { useIsGuest, refuse } from '@/lib/guest';
import useModKey from '@/lib/useModKey';
import { HomeIcon, SearchIcon, ScheduleIcon, PlusIcon, ActivityIcon, LockIcon } from '../Icons';
import styles from './TopBar.module.css';

export const NAV_ITEMS = [
    { href: '/', icon: HomeIcon, label: 'Home' },
    { href: '/browse', icon: SearchIcon, label: 'Browse', account: true },
    { href: '/schedule', icon: ScheduleIcon, label: 'Schedule' },
    { href: '/matches', icon: ActivityIcon, label: 'Activity', account: true },
];

export const isActiveRoute = (pathname, href) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

/**
 * The app bar, on every screen size.
 *
 * Phone and tablet: brand, search, the bell and the account menu —
 * destinations live in the tab bar at the bottom (BottomNav).
 * Desktop (1024px+): the four destinations sit in the middle, the current one
 * marked by a mint rule that slides along the bar's bottom edge.
 *
 * Search opens the command palette, also on Ctrl/Cmd+K from anywhere.
 */
export default function TopBar() {
    const pathname = usePathname();
    const unread = useUnreadCount('activity');
    const isGuest = useIsGuest();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const modKey = useModKey();
    const navRef = useRef(null);
    const [rule, setRule] = useState(null);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteOpen(o => !o);
            }
        };
        // The account menu's "Search CourseMate" row.
        const onOpen = () => setPaletteOpen(true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('cm-open-palette', onOpen);
        return () => {
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('cm-open-palette', onOpen);
        };
    }, []);

    // The mint rule follows the current destination.
    const measure = useCallback(() => {
        const el = navRef.current?.querySelector('[aria-current="page"]');
        if (!el) { setRule(null); return; }
        setRule({ left: el.offsetLeft + 12, width: el.offsetWidth - 24 });
    }, []);

    useLayoutEffect(() => {
        measure();
        const nav = navRef.current;
        if (!nav || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(measure);
        ro.observe(nav);
        return () => ro.disconnect();
    }, [measure, pathname, isGuest]);

    const closePalette = useCallback(() => setPaletteOpen(false), []);

    return (
        <header className={styles.bar}>
            <div className={styles.inner}>
                <Link href="/" className={styles.brand} aria-label="CourseMate home">
                    <span className={styles.logo}>
                        <Image src="/logo.png" alt="" width={64} height={64} className={styles.logoImage} priority />
                    </span>
                    <span className={styles.wordmark}>CourseMate</span>
                </Link>

                <nav className={styles.nav} aria-label="Main" ref={navRef}>
                    {NAV_ITEMS.map(item => {
                        const Icon = item.icon;
                        const isActive = isActiveRoute(pathname, item.href);
                        const badge = item.href === '/matches' ? unread : 0;
                        if (isGuest && item.account) {
                            return (
                                <button
                                    key={item.href}
                                    type="button"
                                    className={`${styles.navItem} ${styles.locked}`}
                                    onClick={refuse}
                                    aria-disabled="true"
                                    aria-label={`${item.label}, needs an account`}
                                    title="Create an account to use this"
                                >
                                    <Icon />
                                    {item.label}
                                    <LockIcon className={styles.lock} />
                                </button>
                            );
                        }
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                <Icon />
                                {item.label}
                                <Count value={badge} />
                            </Link>
                        );
                    })}
                    {rule && <span className={styles.rule} style={{ width: rule.width, transform: `translateX(${rule.left}px)` }} aria-hidden="true" />}
                </nav>

                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles.search}
                        onClick={() => setPaletteOpen(true)}
                        aria-label="Search CourseMate"
                        aria-keyshortcuts="Control+K Meta+K"
                    >
                        <SearchIcon />
                        <span className={styles.searchLabel}>Search</span>
                        <span className={styles.searchKeys} aria-hidden="true">
                            <kbd>{modKey}</kbd><kbd>K</kbd>
                        </span>
                    </button>
                    {isGuest ? (
                        <button
                            type="button"
                            className={`${styles.newPost} ${styles.newPostLocked}`}
                            onClick={refuse}
                            aria-disabled="true"
                            aria-label="New post, needs an account"
                        >
                            <LockIcon />
                            New post
                        </button>
                    ) : (
                        <Link
                            href="/post"
                            className={`${styles.newPost} ${isActiveRoute(pathname, '/post') ? styles.newPostCurrent : ''}`}
                            aria-current={isActiveRoute(pathname, '/post') ? 'page' : undefined}
                        >
                            <PlusIcon strokeWidth={2.25} />
                            New post
                        </Link>
                    )}
                    <AlertsBell />
                    <AppMenu />
                </div>
            </div>
            <CommandPalette open={paletteOpen} onClose={closePalette} isGuest={isGuest} />
        </header>
    );
}
