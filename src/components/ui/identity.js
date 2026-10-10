'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { courseColor, splitCourseCode } from '@/lib/courseColor';
import styles from './identity.module.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/*
 * The academic vocabulary. Each kind of thing a student reads in CourseMate
 * has exactly one look, so a code, a section or a course name is recognised
 * before it's read.
 */

/**
 * A UOS course code, set the way it's structured: the department (0401) in
 * the background, the course number students say aloud (211) in front.
 * Anything that isn't a 7-digit code is shown as it is.
 */
export function CourseCode({ id, size = 'md', className = '', ...props }) {
    const parts = splitCourseCode(id);
    return (
        <span className={cx(styles.code, styles[`code_${size}`], className)} {...props}>
            {parts ? (
                <>
                    <span className={styles.codeDept}>{parts.dept}</span>
                    <span className={styles.codeNum}>{parts.num}</span>
                </>
            ) : <span className={styles.codeNum}>{id}</span>}
        </span>
    );
}

/** A course's name, always in the catalogue serif. */
export function CourseName({ children, as: Tag = 'span', size = 'md', className = '', ...props }) {
    return <Tag className={cx(styles.name, styles[`name_${size}`], className)} {...props}>{children}</Tag>;
}

/**
 * A section, written with the section sign: §01, §51E. The sign is quiet,
 * the number is the point.
 *
 *   tone  plain | mine (highlighted: a section you hold) | muted | struck
 */
export function Section({ value, tone = 'plain', size = 'md', className = '', title }) {
    if (value == null || value === '') return null;
    return (
        <span className={cx(styles.sec, styles[`sec_${tone}`], styles[`sec_${size}`], className)} title={title}>
            <span className={styles.secSign} aria-hidden="true">§</span>
            <span className={styles.secNum}>{value}</span>
            <span className="sr-only">section {value}</span>
        </span>
    );
}

/**
 * The transfer line: a section moving from one holder to another. A rule
 * that stretches between the two sections and ends in an arrowhead, so a
 * column of swaps reads like a timetable of departures.
 *
 *   from, to   section numbers (to may be empty for a giveaway: "→ open")
 *   kind       swap | giveaway | request
 *   label      words on the line (e.g. "for"), optional
 */
export function Transfer({ from, to, kind = 'swap', fromTone = 'plain', toTone = 'plain', size = 'md', className = '', children }) {
    return (
        <span className={cx(styles.transfer, styles[`transfer_${kind}`], styles[`transfer_${size}`], className)}>
            {from != null && <Section value={from} tone={fromTone} size={size} />}
            <span className={styles.transferLine} aria-hidden="true">
                {children && <span className={styles.transferLabel}>{children}</span>}
            </span>
            {to != null && to !== '' ? <Section value={to} tone={toTone} size={size} /> : (
                <span className={styles.transferOpen}>{kind === 'request' ? 'wanted' : 'anyone'}</span>
            )}
        </span>
    );
}

/**
 * A course's colour, as a square — the shape of a timetable cell. Squares
 * mean courses everywhere in CourseMate; circles mean people.
 */
export function CourseMark({ courseId, color, size = 'md', className = '', title }) {
    return (
        <span
            className={cx(styles.mark, styles[`mark_${size}`], className)}
            style={{ '--c': color || courseColor(courseId) }}
            aria-hidden={title ? undefined : 'true'}
            title={title}
        />
    );
}

/* Older names, kept so every caller lands on the same vocabulary. */
export function CourseSwatch({ courseId, size = 'md', color, className = '' }) {
    return <CourseMark courseId={courseId} color={color} size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'} className={className} />;
}

export function CourseDot({ courseId, color, className = '' }) {
    return <CourseMark courseId={courseId} color={color} size="sm" className={className} />;
}

/** A section with a small label before it ("Have §01"). */
export function Ticket({ label, section, children, tone = 'neutral', size = 'md', className = '', title }) {
    return (
        <span className={cx(styles.ticket, className)} title={title}>
            {label && <span className={styles.ticketLabel}>{label}</span>}
            <Section value={section} tone={tone === 'accent' ? 'mine' : tone === 'muted' ? 'muted' : 'plain'} size={size} />
            {children && <span className={styles.ticketMeta}>{children}</span>}
        </span>
    );
}

/** A number, set in tabular figures. (It used to count up; numbers now just are.) */
export function CountUp({ value, className = '' }) {
    return <span className={cx(styles.count, className)}>{value}</span>;
}

/**
 * Page tabs: where you are within a page. An ink rule under the current tab,
 * sitting on the page's hairline; it moves when the tab changes, so the eye
 * follows it.
 *
 * tabs: [{ value, label, count?, alert? }]
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

/** A label on hover and keyboard focus, for controls named only by an icon. */
export function Tooltip({ label, side = 'top', children, className = '' }) {
    return (
        <span className={cx(styles.tooltipWrap, className)}>
            {children}
            <span role="tooltip" className={cx(styles.tooltip, styles[`tooltip_${side}`])}>{label}</span>
        </span>
    );
}
