'use client';

import { formatClock24, formatSpan } from '@/lib/classTime';
import { splitCourseCode } from '@/lib/courseColor';
import styles from './WeekGrid.module.css';

const DAY_FULL = { Sat: 'Saturday', Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };

/**
 * The timetable. Every week in CourseMate is drawn by this one component —
 * a generated schedule, an instructor's week, a room's week, a saved
 * schedule in admin — and it's drawn like the printed thing: an ink rule
 * under the day heads, hairline columns, dotted half hours, and each class a
 * square block in its course's tint with the course colour along its top
 * edge, like a tab on a form.
 *
 *   days     ['Sun', 'Mon', ...] in display order
 *   blocks   [{ key?, day, start, end, color, code, section, name, meta,
 *               title, lane, lanes, variant?, conflict? }]  (minutes)
 *            variant 'office' — office hours: an outline, not a class
 *            conflict — drawn hatched, the drafting mark for a clash
 *   today    a day key to mark as today (its column is washed, its head
 *            highlighted)
 *   now      minutes past midnight: the live line in today's column
 *   pxPerMin vertical scale (1 = an hour is 60px)
 *
 * Blocks keep their identity between renders (course and day), so switching
 * between two schedules slides each class to its new time instead of
 * redrawing the sheet; a new `key` on the grid replays the placing animation.
 */
export default function WeekGrid({ days, blocks, startHour, endHour, pxPerMin = 1, today = null, now = null, className = '' }) {
    const from = startHour ?? Math.floor(Math.min(...blocks.map(b => b.start)) / 60);
    const to = endHour ?? Math.ceil(Math.max(...blocks.map(b => b.end)) / 60);
    const hours = [];
    for (let h = from; h <= to; h++) hours.push(h);
    const gridHeight = (to - from) * 60 * pxPerMin;
    const showNow = today && now != null && now >= from * 60 && now <= to * 60;
    const nowTop = showNow ? (now - from * 60) * pxPerMin : 0;

    const seen = {};
    const keyOf = (b) => {
        const base = b.key || `${b.variant || 'c'}-${b.code || b.name}-${b.day}`;
        seen[base] = (seen[base] || 0) + 1;
        return `${base}-${seen[base]}`;
    };

    return (
        <div className={`${styles.timetable} ${className}`}>
            <div className={styles.grid} style={{ '--cols': days.length }}>
                <div className={styles.corner} />
                {days.map(day => (
                    <div key={day} className={`${styles.dayHeader} ${day === today ? styles.dayToday : ''}`}>
                        <span className={styles.dayLong}>{DAY_FULL[day] || day}</span>
                        <span className={styles.dayShort}>{day}</span>
                    </div>
                ))}

                <div className={styles.timeAxis} style={{ height: gridHeight }}>
                    {hours.map(h => (
                        <span key={h} className={styles.timeLabel} style={{ top: (h - from) * 60 * pxPerMin }}>
                            {String(h).padStart(2, '0')}
                        </span>
                    ))}
                    {showNow && (
                        <span className={styles.nowLabel} style={{ top: nowTop }}>{formatClock24(now)}</span>
                    )}
                </div>

                {days.map((day, dayIndex) => (
                    <div key={day} className={`${styles.dayBody} ${day === today ? styles.dayBodyToday : ''}`} style={{ height: gridHeight }}>
                        {hours.slice(1, -1).map(h => (
                            <span key={`h-${h}`} className={styles.hourLine} style={{ top: (h - from) * 60 * pxPerMin }} />
                        ))}
                        {hours.slice(0, -1).map(h => (
                            <span key={`m-${h}`} className={styles.halfLine} style={{ top: ((h - from) * 60 + 30) * pxPerMin }} />
                        ))}

                        {blocks.filter(b => b.day === day).map(b => {
                            const key = keyOf(b);
                            const top = (b.start - from * 60) * pxPerMin;
                            const height = (b.end - b.start) * pxPerMin;
                            const lanes = b.lanes || 1;
                            const lane = b.lane || 0;
                            const laneStyle = lanes > 1
                                ? { left: `calc(${(lane / lanes) * 100}% + 1px)`, width: `calc(${100 / lanes}% - 2px)`, right: 'auto' }
                                : null;

                            if (b.variant === 'office') {
                                return (
                                    <div key={key} className={styles.office} title={b.title} style={{ top, height, ...laneStyle }}>
                                        {height >= 18 && <span>{b.name || 'Office hours'}</span>}
                                    </div>
                                );
                            }

                            const code = splitCourseCode(b.code);
                            const nameLines = Math.max(0, Math.floor((height - 40) / 15));
                            return (
                                <div
                                    key={key}
                                    className={`${styles.block} ${b.conflict ? styles.blockConflict : ''} ${lanes > 1 ? styles.blockNarrow : ''}`}
                                    title={b.title || [b.code, b.name, b.section && `§${b.section}`, formatSpan(b.start, b.end), b.meta].filter(Boolean).join(' · ')}
                                    style={{ top, height, '--c': b.color || 'var(--course-1)', '--d': dayIndex, ...laneStyle }}
                                >
                                    <span className={styles.blockHead}>
                                        <span className={styles.blockCode}>
                                            {code ? <><span className={styles.blockDept}>{code.dept}</span>{code.num}</> : b.code}
                                        </span>
                                        {b.section && height >= 36 && lanes === 1 && (
                                            <span className={styles.blockSection}><span aria-hidden="true">§</span>{b.section}</span>
                                        )}
                                    </span>
                                    {b.name && nameLines > 0 && (
                                        <span className={styles.blockName} style={{ WebkitLineClamp: nameLines }}>{b.name}</span>
                                    )}
                                    {height >= 30 && (
                                        <span className={styles.blockFoot}>
                                            <span className={styles.blockTime}>{formatSpan(b.start, b.end)}</span>
                                            {b.meta && height >= 54 && <span className={styles.blockRoom}>{b.meta}</span>}
                                        </span>
                                    )}
                                </div>
                            );
                        })}

                        {showNow && day === today && (
                            <span className={styles.now} style={{ top: nowTop }} aria-hidden="true" />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
