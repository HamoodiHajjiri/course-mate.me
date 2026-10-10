'use client';

import { useEffect, useState } from 'react';
import WeekGrid from '@/components/WeekGrid/WeekGrid';
import { Dialog, Status } from '@/components/ui';
import { parseClassTime as parseMeetings } from '@/lib/classTime';
import { paletteFor } from '@/lib/courseColor';
import styles from '../admin.module.css';

// The whole week, in the order the PNG export uses; only days with classes show.
const ALL_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// "Mon/Wed 14:00-15:15", or a few of those joined by commas when the
// meetings differ ("Tue 14:00-14:50, Thu 15:30-18:00").
export function parseClassTime(s) {
    return parseMeetings(s);
}

/**
 * `schedule` ([{ courseId, sections: [{ class_time, section_num }] }]) on the
 * product's own timetable, one colour per course. Classes that overlap
 * (cross-listed sections in one room) share their slot side by side.
 */
export function Timetable({ schedule, courseMap }) {
    const blocks = [];
    schedule.forEach((group, gIdx) => {
        group.sections.forEach(sec => {
            parseClassTime(sec.class_time).forEach(slot => {
                blocks.push({
                    ...slot,
                    color: paletteFor(gIdx),
                    code: group.courseId,
                    section: sec.section_num,
                    name: courseMap[group.courseId]?.name || '',
                    meta: sec.location || '',
                });
            });
        });
    });
    for (const b of blocks) {
        const clash = blocks.filter(o => o.day === b.day && o.start < b.end && b.start < o.end);
        b.lane = clash.indexOf(b);
        b.lanes = clash.length;
    }

    if (blocks.length === 0) {
        return <p className={styles.previewMuted}>None of these classes has a time that could be read.</p>;
    }

    const usedDays = [...new Set(blocks.map(b => b.day))];
    const days = ALL_DAYS.filter(d => usedDays.includes(d));
    const startHour = Math.floor(Math.min(...blocks.map(b => b.start)) / 60);
    const endHour = Math.ceil(Math.max(...blocks.map(b => b.end)) / 60);

    return <WeekGrid days={days} blocks={blocks} startHour={startHour} endHour={endHour} pxPerMin={0.8} />;
}

export default function UserSchedulesModal({ user, onClose }) {
    const [schedules, setSchedules] = useState([]);
    const [courseMap, setCourseMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/admin/users/${user.id}/schedules`);
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                setSchedules(data.schedules || []);
                setCourseMap(data.courseMap || {});
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [user.id]);

    return (
        <Dialog
            open
            onClose={onClose}
            size="xl"
            title={user.name || 'No name'}
            description={[user.email, user.student_id].filter(Boolean).join(' · ') || undefined}
        >
            {loading && <div className={styles.loading}><div className={styles.spinner} />Reading their schedules…</div>}
            {error && <div className={styles.error}>{error}</div>}
            {!loading && !error && schedules.length === 0 && (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>No saved schedules.</div>
                </div>
            )}

            {schedules.map((sch, i) => (
                <section key={sch.id} className={styles.card} style={{ marginBottom: 24 }}>
                    <div className={styles.toolbar}>
                        <span className={styles.sectionTitle}>Schedule {i + 1}</span>
                        <span className={styles.mono}>{sch.term_code}</span>
                        {typeof sch.score === 'number' && <span className={styles.mono}>fit {Math.round(sch.score)}</span>}
                        <span className={styles.updated} style={{ marginLeft: 'auto' }}>saved {new Date(sch.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>

                    {sch.warnings.length > 0 && <div className={styles.error}>{sch.warnings.join(' · ')}</div>}

                    <Timetable schedule={sch.schedule} courseMap={courseMap} />

                    <details>
                        <summary className={styles.previewMuted} style={{ cursor: 'pointer' }}>Sections</summary>
                        <div className={styles.tableWrap} style={{ marginTop: 8 }}>
                            <table className={styles.table}>
                                <thead>
                                    <tr><th>Course</th><th>Section</th><th>When</th><th>Instructor</th><th>CRN</th></tr>
                                </thead>
                                <tbody>
                                    {sch.schedule.flatMap(g => g.sections.map((sec, idx) => (
                                        <tr key={`${g.courseId}-${sec.crn || idx}`}>
                                            <td>
                                                <span className={styles.mono}>{sec.course_id || g.courseId}</span>
                                                {courseMap[sec.course_id || g.courseId]?.name && <> {courseMap[sec.course_id || g.courseId].name}</>}
                                            </td>
                                            <td className={styles.mono}>§{sec.section_num}</td>
                                            <td>{sec.isMissing ? <Status tone="danger">no longer offered</Status> : sec.class_time}</td>
                                            <td>{sec.instructor}</td>
                                            <td className={styles.mono}>{sec.crn}</td>
                                        </tr>
                                    )))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </section>
            ))}
        </Dialog>
    );
}
