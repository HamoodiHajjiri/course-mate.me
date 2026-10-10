'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BUILDINGS, buildingInfo, fromOldCode } from '@/app/map/buildings';
import { setThemePreference } from '@/components/ThemeToggle/ThemeToggle';
import { CourseSwatch } from '@/components/ui';
import {
    ActivityIcon, ArrowLeftIcon, BellIcon, BuildingIcon, CalendarPlusIcon, HistoryIcon, HomeIcon, MapIcon,
    MoonIcon, PaletteIcon, PlusIcon, ProfileIcon, ScheduleIcon, SearchIcon, SunIcon, UserCheckIcon,
} from '@/components/Icons';
import styles from './CommandPalette.module.css';

// PostgREST's or() splits on commas and parentheses, and ilike treats % and _
// as wildcards, so those can't pass through from the box.
const cleanQuery = (q) => q.replace(/[,()%_*\\]/g, ' ').trim();

const PAGES = [
    { id: 'home', label: 'Home', hint: 'Your day at a glance', icon: HomeIcon, href: '/', keywords: 'dashboard today' },
    { id: 'browse', label: 'Browse posts', hint: 'Swaps, giveaways and requests', icon: SearchIcon, href: '/browse', account: true, keywords: 'marketplace feed' },
    { id: 'post', label: 'New post', hint: 'Swap, give away or request a section', icon: PlusIcon, href: '/post', account: true, keywords: 'create swap giveaway request' },
    { id: 'schedule', label: 'Build a schedule', hint: 'Generate timetables without clashes', icon: ScheduleIcon, href: '/schedule', keywords: 'timetable builder' },
    { id: 'instructor', label: 'Find an instructor', hint: 'See anyone’s teaching week', icon: UserCheckIcon, href: '/schedule?mode=instructor', keywords: 'professor doctor faculty' },
    { id: 'history', label: 'Course history', hint: 'How a course ran in past terms', icon: HistoryIcon, href: '/schedule?mode=history', keywords: 'past terms' },
    { id: 'activity', label: 'Activity', hint: 'Matches, your posts and history', icon: ActivityIcon, href: '/matches', account: true, keywords: 'matches swaps' },
    { id: 'notifications', label: 'Notifications', hint: 'Everything that happened', icon: BellIcon, href: '/notifications', account: true, keywords: 'alerts inbox' },
    { id: 'map', label: 'Campus map', hint: 'Buildings, rooms and places', icon: MapIcon, href: '/map', keywords: 'building room location' },
    { id: 'profile', label: 'Profile & settings', hint: 'Account, theme and alerts', icon: ProfileIcon, href: '/profile', account: true, keywords: 'account settings preferences' },
];

const THEMES = [
    { id: 'theme-system', value: 'system', label: 'Theme: Auto', hint: 'Follow your device', icon: PaletteIcon },
    { id: 'theme-light', value: 'light', label: 'Theme: Light', hint: 'Bright paper', icon: SunIcon },
    { id: 'theme-dark', value: 'dark', label: 'Theme: Navy', hint: 'Deep and calm', icon: MoonIcon },
    { id: 'theme-black', value: 'black', label: 'Theme: Black', hint: 'Pure black for OLED', icon: MoonIcon },
];

const BUILDING_LIST = Object.keys(BUILDINGS).map(id => buildingInfo(id));

const matches = (q, ...fields) => fields.some(f => (f || '').toLowerCase().includes(q));

/**
 * The command palette: one box to go anywhere in CourseMate. Ctrl/Cmd+K from
 * any page, or the search button in the app bar.
 *
 * Pages and settings match as you type; two characters also look up courses
 * (each opens a short menu: its history, add to your schedule, find posts)
 * and buildings on the campus map.
 */
export default function CommandPalette({ open, onClose, isGuest = false }) {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [courses, setCourses] = useState([]);
    const [searching, setSearching] = useState(false);
    const [course, setCourse] = useState(null); // a picked course, showing its actions
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const timer = useRef(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!open) return undefined;
        setQuery('');
        setCourse(null);
        setCourses([]);
        setActive(0);
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => inputRef.current?.focus());
        return () => { document.body.style.overflow = overflow; };
    }, [open]);

    // Courses, after a short pause in typing.
    useEffect(() => {
        clearTimeout(timer.current);
        const q = cleanQuery(query);
        if (!open || course || q.length < 2) { setCourses([]); setSearching(false); return undefined; }
        setSearching(true);
        timer.current = setTimeout(async () => {
            const { data } = await createClient().from('courses')
                .select('course_id, course_name')
                .or(`course_name.ilike.%${q}%,course_id.ilike.%${q}%`)
                .order('course_id')
                .limit(6);
            setCourses(data || []);
            setSearching(false);
        }, 180);
        return () => clearTimeout(timer.current);
    }, [query, open, course]);

    const go = useCallback((href) => {
        onClose();
        router.push(href);
    }, [onClose, router]);

    const groups = useMemo(() => {
        if (course) {
            const id = course.course_id;
            return [{
                label: `${id} · ${course.course_name || ''}`,
                items: [
                    { id: 'c-history', label: 'See how it ran in past terms', hint: 'Course history', icon: HistoryIcon, run: () => go(`/schedule?mode=history&course=${encodeURIComponent(id)}`) },
                    { id: 'c-add', label: 'Add it to my schedule', hint: 'Schedule builder', icon: CalendarPlusIcon, run: () => go(`/schedule?course=${encodeURIComponent(id)}`) },
                    ...(!isGuest ? [{ id: 'c-posts', label: 'Find posts for it', hint: 'Browse', icon: SearchIcon, run: () => go(`/browse?q=${encodeURIComponent(id)}`) }] : []),
                    { id: 'c-back', label: 'Back to search', hint: 'Esc', icon: ArrowLeftIcon, run: () => { setCourse(null); setActive(0); requestAnimationFrame(() => inputRef.current?.focus()); } },
                ],
            }];
        }

        const q = query.trim().toLowerCase();
        const pages = PAGES
            .filter(p => !(isGuest && p.account))
            .filter(p => !q || matches(q, p.label, p.hint, p.keywords))
            .map(p => ({ ...p, run: () => go(p.href) }));
        const themes = THEMES
            .filter(t => q ? matches(q, t.label, t.hint, 'theme dark light appearance mode') : false)
            .map(t => ({ ...t, run: () => { setThemePreference(t.value); onClose(); } }));

        let buildings = [];
        if (q.length >= 2) {
            const old = fromOldCode(q);
            buildings = BUILDING_LIST
                .filter(b => (old && old.includes(b.id)) || (b.code && b.code.toLowerCase().startsWith(q)) || (q.length >= 3 && matches(q, b.name, b.zoneName)))
                .slice(0, 4)
                .map(b => ({
                    id: `b-${b.id}`,
                    label: b.name || `Building ${b.code}`,
                    hint: [b.code, b.zoneName].filter(Boolean).join(' · '),
                    icon: BuildingIcon,
                    run: () => go(`/map?b=${encodeURIComponent(b.id)}`),
                }));
        }

        const courseItems = courses.map(c => ({
            id: `course-${c.course_id}`,
            label: c.course_name || c.course_id,
            hint: c.course_id,
            swatch: c.course_id,
            more: true,
            run: () => { setCourse(c); setActive(0); },
        }));

        return [
            { label: 'Go to', items: pages },
            { label: 'Courses', items: courseItems, loading: searching && courseItems.length === 0 },
            { label: 'On the map', items: buildings },
            { label: 'Appearance', items: themes },
        ].filter(g => g.items.length > 0 || g.loading);
    }, [course, query, courses, searching, isGuest, go, onClose]);

    const flat = groups.flatMap(g => g.items);

    useEffect(() => { setActive(0); }, [query, course]);

    // Keep the highlighted row in view.
    useEffect(() => {
        listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(flat.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); flat[active]?.run(); }
        else if (e.key === 'Escape') {
            e.preventDefault();
            if (course) { setCourse(null); setActive(0); } else onClose();
        } else if (e.key === 'Backspace' && course && !query) { setCourse(null); }
    };

    if (!mounted || !open) return null;

    let index = -1;

    return createPortal(
        <div className={styles.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Search CourseMate" onKeyDown={onKeyDown}>
                <div className={styles.inputRow}>
                    {course ? (
                        <button type="button" className={styles.crumb} onClick={() => setCourse(null)} aria-label="Back to search">
                            <ArrowLeftIcon />
                            <CourseSwatch courseId={course.course_id} size="sm" />
                        </button>
                    ) : (
                        <SearchIcon className={styles.inputIcon} />
                    )}
                    <input
                        ref={inputRef}
                        className={styles.input}
                        value={course ? '' : query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={course ? `What do you want to do with ${course.course_id}?` : 'Search pages, courses, buildings…'}
                        readOnly={!!course}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="cm-palette-list"
                        aria-activedescendant={flat[active] ? `cm-cmd-${flat[active].id}` : undefined}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className={styles.esc} onClick={onClose}>esc</kbd>
                </div>

                <div className={styles.list} id="cm-palette-list" role="listbox" ref={listRef}>
                    {groups.length === 0 && (
                        <div className={styles.empty}>
                            <strong>No results for &ldquo;{query}&rdquo;</strong>
                            <span>Try a course ID like 0401211, a building like A3, or a page name.</span>
                        </div>
                    )}
                    {groups.map(group => (
                        <div key={group.label} className={styles.group} role="presentation">
                            <div className={styles.groupLabel}>{group.label}</div>
                            {group.loading && <div className={styles.loadingRow}><span className={styles.spinner} /> Looking up courses…</div>}
                            {group.items.map(item => {
                                index += 1;
                                const i = index;
                                const Icon = item.icon;
                                const isActive = i === active;
                                return (
                                    <button
                                        key={item.id}
                                        id={`cm-cmd-${item.id}`}
                                        type="button"
                                        role="option"
                                        aria-selected={isActive}
                                        data-active={isActive}
                                        className={styles.item}
                                        onMouseMove={() => { if (active !== i) setActive(i); }}
                                        onClick={item.run}
                                    >
                                        {item.swatch
                                            ? <CourseSwatch courseId={item.swatch} size="md" />
                                            : <span className={styles.itemIcon}><Icon /></span>}
                                        <span className={styles.itemText}>
                                            <span className={styles.itemLabel}>{item.label}</span>
                                            {item.hint && <span className={styles.itemHint}>{item.hint}</span>}
                                        </span>
                                        <span className={styles.itemEnter} aria-hidden="true">{item.more ? 'Open ›' : '↵'}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>

                <div className={styles.footer}>
                    <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
                    <span><kbd>↵</kbd> open</span>
                    <span><kbd>esc</kbd> {course ? 'back' : 'close'}</span>
                </div>
            </div>
        </div>,
        document.body,
    );
}
