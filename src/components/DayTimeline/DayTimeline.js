'use client';

import { courseColor, courseNumber } from '@/lib/courseColor';
import { formatHour, formatRange } from '@/lib/classTime';
import styles from './DayTimeline.module.css';

/**
 * One day as a ruler: the hours across, the day's classes as blocks in their
 * course colours, and a "now" line while the day is under way.
 *
 *   slots   [{ start, end, courseId, courseName, sectionNum, location }]
 *   now     minutes past midnight, or null to hide the line
 *   tone    'forest' (on the brand panel) | 'surface'
 */
export default function DayTimeline({ slots, now = null, tone = 'surface', className = '' }) {
    const earliest = slots.length ? Math.min(...slots.map(s => s.start)) : 8 * 60;
    const latest = slots.length ? Math.max(...slots.map(s => s.end)) : 17 * 60;
    const from = Math.min(8 * 60, Math.floor(earliest / 60) * 60);
    const to = Math.max(17 * 60, Math.ceil(latest / 60) * 60);
    const span = to - from;
    const pct = (m) => `${((m - from) / span) * 100}%`;

    const hours = [];
    for (let h = from; h <= to; h += 60) hours.push(h);
    const showNow = now != null && now >= from && now <= to;

    return (
        <div className={`${styles.timeline} ${styles[`tone_${tone}`] || ''} ${className}`}>
            <div className={styles.track}>
                {hours.map((h, i) => (
                    <span key={h} className={styles.tick} style={{ left: pct(h) }}>
                        {(i % 2 === 0 || hours.length <= 7) && <span className={styles.tickLabel}>{formatHour(h)}</span>}
                    </span>
                ))}
                {slots.map((s, i) => {
                    const past = now != null && s.end <= now;
                    const live = now != null && s.start <= now && now < s.end;
                    return (
                        <span
                            key={`${s.courseId}-${s.start}-${i}`}
                            className={`${styles.block} ${past ? styles.blockPast : ''} ${live ? styles.blockLive : ''}`}
                            style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})`, '--c': courseColor(s.courseId) }}
                            title={`${s.courseId}${s.courseName ? ` ${s.courseName}` : ''} · ${formatRange(s.start, s.end)}${s.location ? ` · ${s.location}` : ''}`}
                        >
                            <span className={styles.blockCode}>{courseNumber(s.courseId)}</span>
                        </span>
                    );
                })}
                {showNow && (
                    <span className={styles.now} style={{ left: pct(now) }} aria-hidden="true">
                        <span className={styles.nowDot} />
                    </span>
                )}
            </div>
        </div>
    );
}
