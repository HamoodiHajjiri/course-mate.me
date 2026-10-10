'use client';

import { formatHour, formatRange } from '@/lib/classTime';
import styles from './WeekGrid.module.css';

const DAY_FULL = { Sat: 'Saturday', Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };

/**
 * CourseMate's timetable. Every week view in the product draws through this
 * one component — a student's generated schedules, an instructor's week, a
 * room's week, a user's saved schedules in admin — so they look and behave
 * the same.
 *
 *   days    ['Sun', 'Mon', ...] in display order
 *   blocks  [{ day, start, end, color, code, section, name, meta, title,
 *              lane, lanes, variant }]   minutes past midnight
 *           variant 'office' draws office hours (dashed, no fill)
 *   pxPerMin  vertical scale (1 = an hour is 60px)
 */
export default function WeekGrid({ days, blocks, startHour, endHour, pxPerMin = 1, className = '' }) {
    const from = startHour ?? Math.floor(Math.min(...blocks.map(b => b.start)) / 60);
    const to = endHour ?? Math.ceil(Math.max(...blocks.map(b => b.end)) / 60);
    const hours = [];
    for (let h = from; h <= to; h++) hours.push(h);
    const gridHeight = (to - from) * 60 * pxPerMin;

    return (
        <div className={`${styles.timetable} ${className}`}>
            <div className={styles.grid} style={{ '--cols': days.length }}>
                <div className={styles.corner} />
                {days.map(day => (
                    <div key={day} className={styles.dayHeader}>
                        <span className={styles.dayLong}>{DAY_FULL[day] || day}</span>
                        <span className={styles.dayShort}>{day}</span>
                    </div>
                ))}

                <div className={styles.timeAxis} style={{ height: gridHeight }}>
                    {hours.map(h => (
                        <span key={h} className={styles.timeLabel} style={{ top: (h - from) * 60 * pxPerMin }}>
                            {formatHour(h * 60)}
                        </span>
                    ))}
                </div>

                {days.map(day => (
                    <div key={day} className={styles.dayBody} style={{ height: gridHeight }}>
                        {hours.slice(0, -1).map(h => (
                            <span key={`h-${h}`} className={styles.gridLine} style={{ top: (h - from) * 60 * pxPerMin }} />
                        ))}
                        {hours.slice(0, -1).map(h => (
                            <span key={`m-${h}`} className={`${styles.gridLine} ${styles.gridLineHalf}`} style={{ top: ((h - from) * 60 + 30) * pxPerMin }} />
                        ))}

                        {blocks.filter(b => b.day === day).map((b, i) => {
                            const top = (b.start - from * 60) * pxPerMin;
                            const height = (b.end - b.start) * pxPerMin;
                            const lanes = b.lanes || 1;
                            const lane = b.lane || 0;
                            const nameLines = Math.max(0, Math.floor((height - 46) / 13));
                            const laneStyle = lanes > 1
                                ? { left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, right: 'auto' }
                                : null;
                            if (b.variant === 'office') {
                                return (
                                    <div key={`o-${i}`} className={styles.office} title={b.title} style={{ top, height, ...laneStyle }}>
                                        {height >= 18 && <span>{b.name || 'Office hours'}</span>}
                                    </div>
                                );
                            }
                            return (
                                <div
                                    key={i}
                                    className={styles.block}
                                    title={b.title || [b.code, b.name, b.section && `section ${b.section}`, formatRange(b.start, b.end), b.meta].filter(Boolean).join(' · ')}
                                    style={{ top, height, '--c': b.color || 'var(--course-1)', ...laneStyle }}
                                >
                                    <span className={styles.blockTop}>
                                        <span className={styles.blockCode}>{b.code}</span>
                                        {b.section && height >= 40 && lanes === 1 && <span className={styles.blockSection}>{b.section}</span>}
                                    </span>
                                    {b.name && nameLines > 0 && (
                                        <span className={styles.blockName} style={{ WebkitLineClamp: nameLines }}>{b.name}</span>
                                    )}
                                    {height >= 34 && (
                                        <span className={styles.blockMeta}>
                                            {formatRange(b.start, b.end)}
                                            {b.meta && height >= 58 ? ` · ${b.meta}` : ''}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
