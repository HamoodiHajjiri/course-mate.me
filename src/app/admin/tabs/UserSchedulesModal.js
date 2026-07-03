'use client';

import { useEffect, useState } from 'react';
import styles from '../admin.module.css';

const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const BG_COLORS = [
    'rgba(59,130,246,0.15)', 'rgba(16,185,129,0.15)', 'rgba(245,158,11,0.15)', 'rgba(239,68,68,0.15)',
    'rgba(139,92,246,0.15)', 'rgba(236,72,153,0.15)', 'rgba(20,184,166,0.15)', 'rgba(249,115,22,0.15)',
];

function parseDays(dayStr) {
    const map = {
        'Mon': 'Mon', 'Tue': 'Tue', 'Wed': 'Wed', 'Thu': 'Thu',
        'Sun': 'Sun', 'Sat': 'Sat', 'Fri': 'Fri',
        'M': 'Mon', 'T': 'Tue', 'W': 'Wed', 'R': 'Thu', 'Su': 'Sun', 'S': 'Sat',
    };
    return dayStr.trim().split(/[\s\/]+/).map(p => map[p]).filter(Boolean);
}

function parseTimeToMinutes(s) {
    const str = s.trim();
    const m12 = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m12) {
        let h = parseInt(m12[1]);
        const period = m12[3].toUpperCase();
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return h * 60 + parseInt(m12[2]);
    }
    const m24 = str.match(/(\d{1,2}):(\d{2})/);
    if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
    return 0;
}

function parseClassTime(s) {
    if (!s) return [];
    const m = s.match(/^(.+?)\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*-\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)$/i);
    if (!m) return [];
    const days = parseDays(m[1]);
    const start = parseTimeToMinutes(m[2]);
    const end = parseTimeToMinutes(m[3]);
    return days.map(day => ({ day, start, end }));
}

function formatTimeShort(min) {
    const h = Math.floor(min / 60);
    const period = h >= 12 ? 'PM' : 'AM';
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${dh} ${period}`;
}

function Timetable({ schedule, courseMap }) {
    const blocks = [];
    schedule.forEach((group, gIdx) => {
        group.sections.forEach(sec => {
            parseClassTime(sec.class_time).forEach(slot => {
                blocks.push({ ...slot, courseId: group.courseId, sectionNum: sec.section_num, colorIdx: gIdx % 8 });
            });
        });
    });

    if (blocks.length === 0) {
        return <div className={styles.empty}>No time slots could be parsed.</div>;
    }

    const usedDays = [...new Set(blocks.map(b => b.day))];
    const days = ALL_DAYS.filter(d => usedDays.includes(d));
    const minTime = Math.min(...blocks.map(b => b.start));
    const maxTime = Math.max(...blocks.map(b => b.end));
    const startHour = Math.floor(minTime / 60);
    const endHour = Math.ceil(maxTime / 60);
    const PX_PER_MIN = 0.8;
    const gridHeight = (endHour - startHour) * 60 * PX_PER_MIN;
    const hours = [];
    for (let h = startHour; h <= endHour; h++) hours.push(h);

    return (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <div style={{ position: 'relative', width: 44, height: gridHeight, flexShrink: 0 }}>
                {hours.map(h => (
                    <div key={h} style={{ position: 'absolute', top: (h - startHour) * 60 * PX_PER_MIN, fontSize: 11, color: 'var(--text-secondary)' }}>
                        {formatTimeShort(h * 60)}
                    </div>
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 4, flex: 1 }}>
                {days.map(day => (
                    <div key={day} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, paddingBottom: 4, color: 'var(--text-secondary)' }}>{day}</div>
                        <div style={{ position: 'relative', height: gridHeight, background: 'var(--bg-tertiary)', borderRadius: 6 }}>
                            {hours.slice(0, -1).map(h => (
                                <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - startHour) * 60 * PX_PER_MIN, borderTop: '1px dashed var(--border-color)' }} />
                            ))}
                            {blocks.filter(b => b.day === day).map((block, i) => (
                                <div
                                    key={i}
                                    style={{
                                        position: 'absolute',
                                        left: 2,
                                        right: 2,
                                        top: (block.start - startHour * 60) * PX_PER_MIN,
                                        height: (block.end - block.start) * PX_PER_MIN,
                                        background: BG_COLORS[block.colorIdx],
                                        borderLeft: `3px solid ${COLORS[block.colorIdx]}`,
                                        borderRadius: 4,
                                        padding: '2px 4px',
                                        fontSize: 10,
                                        color: COLORS[block.colorIdx],
                                        overflow: 'hidden',
                                        lineHeight: 1.2,
                                    }}
                                >
                                    <div style={{ fontWeight: 700 }}>{block.courseId}</div>
                                    {courseMap[block.courseId]?.name && (
                                        <div style={{ fontSize: 9, opacity: 0.85, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                            {courseMap[block.courseId].name}
                                        </div>
                                    )}
                                    <div style={{ fontSize: 9 }}>{block.sectionNum}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
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
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
                display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
                paddingTop: 40, paddingBottom: 40, overflowY: 'auto', zIndex: 100,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 920,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 16, padding: 20,
                    boxShadow: 'var(--shadow-xl)',
                    margin: '0 16px',
                    color: 'var(--text-primary)',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{user.name || '(no name)'}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user.email} · {user.student_id || '—'}</div>
                    </div>
                    <button className={styles.btn} onClick={onClose}>Close</button>
                </div>

                {loading && <div className={styles.loading}>Loading schedules...</div>}
                {error && <div className={styles.error}>{error}</div>}
                {!loading && !error && schedules.length === 0 && (
                    <div className={styles.empty}>This user has no saved schedules.</div>
                )}

                {schedules.map((sch, i) => (
                    <div key={sch.id} style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>
                                Schedule #{i + 1} <span className={styles.badge}>{sch.term_code}</span>
                                {typeof sch.score === 'number' && <span className={styles.badge}>score {Math.round(sch.score)}</span>}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                {new Date(sch.created_at).toLocaleDateString()}
                            </div>
                        </div>

                        {sch.warnings.length > 0 && (
                            <div className={styles.error} style={{ marginBottom: 8 }}>
                                {sch.warnings.join(' · ')}
                            </div>
                        )}

                        <Timetable schedule={sch.schedule} courseMap={courseMap} />

                        <details style={{ marginTop: 10 }}>
                            <summary style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Section details</summary>
                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {sch.schedule.flatMap(g => g.sections.map((sec, idx) => (
                                    <div key={`${g.courseId}-${sec.crn || idx}`} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        <strong style={{ color: 'var(--text-primary)' }}>{sec.course_id || g.courseId}</strong>
                                        {courseMap[sec.course_id || g.courseId]?.name && ` · ${courseMap[sec.course_id || g.courseId].name}`}
                                        {' · '}{sec.section_num}
                                        {sec.class_time && ` · ${sec.class_time}`}
                                        {sec.instructor && ` · ${sec.instructor}`}
                                        {sec.isMissing && ' ⚠️'}
                                    </div>
                                )))}
                            </div>
                        </details>
                    </div>
                ))}
            </div>
        </div>
    );
}
