'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import useUnreadCount from '@/lib/useUnreadCount';
import AppMenu from '@/components/AppMenu';
import AlertsBell from '@/components/AlertsBell';
import SemesterPicker from '@/components/SemesterPicker';
import CommandPalette from '@/components/CommandPalette/CommandPalette';
import { Count } from '@/components/ui';
import { useIsGuest, refuse } from '@/lib/guest';
import useModKey from '@/lib/useModKey';
import { HomeIcon, SearchIcon, ScheduleIcon, PlusIcon, ActivityIcon, MapIcon } from '../Icons';
import styles from './TopBar.module.css';

// Icons are for the phone tab bar, where labels are small; the desktop bar is
// words only.
export const NAV_ITEMS = [
    { href: '/', icon: HomeIcon, label: 'Home' },
    { href: '/browse', icon: SearchIcon, label: 'Browse', account: true },
    { href: '/schedule', icon: ScheduleIcon, label: 'Schedule' },
    { href: '/matches', icon: ActivityIcon, label: 'Activity', account: true },
    { href: '/map', icon: MapIcon, label: 'Map', desktopOnly: true },
];

export const isActiveRoute = (pathname, href) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

/**
 * The app bar: a ruled band across the top of every page.
 *
 * Desktop: the wordmark, five destinations as words with an ink rule under
 * the current one (it slides when you move, so you see where you went), then
 * the term, search, new post, the bell and you.
 * Phone and tablet: the wordmark, search, the bell and you; destinations move
 * to the tab bar at the bottom.
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
        const onOpen = () => setPaletteOpen(true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('cm-open-palette', onOpen);
        return () => {
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('cm-open-palette', onOpen);
        };
    }, []);

    const measure = useCallback(() => {
        const el = navRef.current?.querySelector('[aria-current="page"]');
        if (!el) { setRule(null); return; }
        setRule({ left: el.offsetLeft, width: el.offsetWidth });
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
    const postActive = isActiveRoute(pathname, '/post');

    return (
        <header className={styles.bar}>
            <div className={styles.inner}>
                <Link href="/" className={styles.brand} aria-label="CourseMate home">
                    <Image src="/logo.png" alt="" width={56} height={56} className={styles.logo} priority />
                    <span className={styles.wordmark}>CourseMate</span>
                </Link>

                <nav className={styles.nav} aria-label="Main" ref={navRef}>
                    {NAV_ITEMS.map(item => {
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
                                    title="Needs an account"
                                >
                                    {item.label}
                                </button>
                            );
                        }
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={styles.navItem}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {item.label}
                                <Count value={badge} />
                            </Link>
                        );
                    })}
                    {rule && <span className={styles.rule} style={{ width: rule.width, transform: `translateX(${rule.left}px)` }} aria-hidden="true" />}
                </nav>

                <div className={styles.actions}>
                    <div className={styles.term}><SemesterPicker /></div>
                    <button
                        type="button"
                        className={styles.search}
                        onClick={() => setPaletteOpen(true)}
                        aria-label="Search CourseMate"
                        aria-keyshortcuts="Control+K Meta+K"
                    >
                        <SearchIcon />
                        <span className={styles.searchLabel}>Courses, rooms, pages</span>
                        <span className={styles.searchKeys} aria-hidden="true">{modKey} K</span>
                    </button>
                    {isGuest ? (
                        <button type="button" className={`${styles.newPost} ${styles.locked}`} onClick={refuse} aria-disabled="true" aria-label="New post, needs an account">
                            <PlusIcon />
                            Post
                        </button>
                    ) : (
                        <Link href="/post" className={styles.newPost} aria-current={postActive ? 'page' : undefined}>
                            <PlusIcon />
                            Post
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
