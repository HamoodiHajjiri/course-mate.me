'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { courseColor, courseNumber } from '@/lib/courseColor';
import styles from './identity.module.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * A course's mark: a small tile in the course's colour carrying the number
 * students say aloud ("211" for 0401211). The same course always gets the
 * same tile, everywhere.
 *
 *   size  sm (24) | md (32) | lg (40)
 *   color override the hashed colour (the schedule uses cart order)
 */
export function CourseSwatch({ courseId, size = 'md', color, label, className = '' }) {
    return (
        <span
            className={cx(styles.swatch, styles[`swatch_${size}`], className)}
            style={{ '--c': color || courseColor(courseId) }}
            aria-hidden="true"
        >
            {label ?? courseNumber(courseId)}
        </span>
    );
}

/** A colour dot for a course, for dense rows. */
export function CourseDot({ courseId, color, className = '' }) {
    return <span className={cx(styles.dot, className)} style={{ '--c': color || courseColor(courseId) }} aria-hidden="true" />;
}

/**
 * The section ticket: CourseMate's mark for a section someone holds or
 * wants. A notch on each side, a perforation between the label stub and the
 * section number — sections are traded like seats, so they look like them.
 *
 *   tone   neutral | accent | swap | giveaway | request | muted
 *   size   sm | md | lg
 */
export function Ticket({ label, section, children, tone = 'neutral', size = 'md', className = '', title }) {
    return (
        <span className={cx(styles.ticket, styles[`ticket_${tone}`], styles[`ticket_${size}`], className)} title={title}>
            {label && <span className={styles.ticketStub}>{label}</span>}
            <span className={styles.ticketBody}>
                <span className={styles.ticketSection}>{section}</span>
                {children && <span className={styles.ticketMeta}>{children}</span>}
            </span>
        </span>
    );
}

/** Numbers that tick up to their value once, on first show. */
export function CountUp({ value, duration = 700, className = '' }) {
    const target = Number(value);
    const [shown, setShown] = useState(Number.isFinite(target) ? 0 : value);
    const from = useRef(0);

    useEffect(() => {
        if (!Number.isFinite(target)) { setShown(value); return undefined; }
        const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || target === from.current) { setShown(target); from.current = target; return undefined; }
        const start = performance.now();
        const begin = from.current;
        let raf;
        const tick = (t) => {
            const p = Math.min(1, (t - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setShown(Math.round(begin + (target - begin) * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
            else from.current = target;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, value, duration]);

    return <span className={cx(styles.count, className)}>{shown}</span>;
}

/**
 * Page-level tabs: where you are within a page. The current tab is marked by
 * the mint rule, the same mark the app bar uses for the current page.
 *
 * tabs: [{ value, label, icon?, count?, alert? }]
 */
export function Tabs({ tabs, value, onChange, label, className = '', size = 'md' }) {
    const listRef = useRef(null);
    const [bar, setBar] = useState(null);

    const measure = useCallback(() => {
        const el = listRef.current?.querySelector('[aria-selected="true"]');
        if (!el) { setBar(null); return; }
        setBar({ left: el.offsetLeft, width: el.offsetWidth });
    }, []);

    useLayoutEffect(() => {
        measure();
        const list = listRef.current;
        if (!list || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(measure);
        ro.observe(list);
        return () => ro.disconnect();
    }, [measure, value, tabs.length]);

    const onKeyDown = (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const idx = tabs.findIndex(t => t.value === value);
        const next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        e.preventDefault();
        onChange(next.value);
        requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.focus());
    };

    return (
        <div className={cx(styles.tabsWrap, size === 'sm' && styles.tabsSm, className)}>
            <div ref={listRef} role="tablist" aria-label={label} className={styles.tabs} onKeyDown={onKeyDown}>
                {tabs.map(t => {
                    const active = t.value === value;
                    return (
                        <button
                            key={t.value}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            tabIndex={active ? 0 : -1}
                            className={styles.tab}
                            onClick={() => onChange(t.value)}
                        >
                            {t.icon}
                            <span>{t.label}</span>
                            {t.count != null && t.count !== false && (
                                <span className={cx(styles.tabCount, t.alert && styles.tabCountAlert)}>{t.count}</span>
                            )}
                        </button>
                    );
                })}
                {bar && <span className={styles.tabBar} style={{ width: bar.width, transform: `translateX(${bar.left}px)` }} aria-hidden="true" />}
            </div>
        </div>
    );
}

/**
 * A label that appears on hover and keyboard focus. For icon buttons, whose
 * names otherwise live only in aria-label.
 */
export function Tooltip({ label, side = 'top', children, className = '' }) {
    return (
        <span className={cx(styles.tooltipWrap, className)}>
            {children}
            <span role="tooltip" className={cx(styles.tooltip, styles[`tooltip_${side}`])}>{label}</span>
        </span>
    );
}
