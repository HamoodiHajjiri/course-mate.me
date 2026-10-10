'use client';

import { courseColor, courseNumber } from '@/lib/courseColor';
import { formatSpan } from '@/lib/classTime';
import styles from './DayTimeline.module.css';

/**
 * One day as a ruler: hours along a rule, the day's classes as blocks in
 * their course colours (the same blocks as the timetable, laid on their
 * side), and the live line while the day is under way. Classes already over
 * fade back; the one in progress is outlined.
 *
 *   slots   [{ start, end, courseId, courseName, sectionNum, location }]
 *   now     minutes past midnight, or null to hide the line
 */
export default function DayTimeline({ slots, now = null, className = '' }) {
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
        <div className={`${styles.timeline} ${className}`}>
            <div className={styles.track}>
                {hours.map(h => (
                    <span key={h} className={styles.tick} style={{ left: pct(h) }}>
                        <span className={styles.tickLabel}>{String(h / 60).padStart(2, '0')}</span>
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
                            title={`${s.courseId}${s.courseName ? ` ${s.courseName}` : ''} · ${formatSpan(s.start, s.end)}${s.location ? ` · ${s.location}` : ''}`}
                        >
                            <span className={styles.blockCode}>{courseNumber(s.courseId)}</span>
                        </span>
                    );
                })}
                {showNow && <span className={styles.now} style={{ left: pct(now) }} aria-hidden="true" />}
            </div>
        </div>
    );
}
