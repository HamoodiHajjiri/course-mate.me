'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import RoomLink from '@/components/RoomLink';
import { buildingInfo, buildingOfRoom, fromOldCode } from '@/app/map/buildings';
import { Timetable, parseClassTime } from './UserSchedulesModal';
import styles from '../admin.module.css';
import own from './MapTab.module.css';
import rs from './RoomsTab.module.css';

// "A3-007", "a3 007" and "A3007" all find the same room.
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const DAYS = [
    ['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'],
    ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday'],
];

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Today and the next hour on campus, from the last half hour, to start the
// free-room search on.
function campusNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dubai', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const part = (type) => parts.find(p => p.type === type)?.value;
    const from = Math.min(Math.floor((Number(part('hour')) * 60 + Number(part('minute'))) / 30) * 30, 22 * 60);
    return { day: part('weekday'), from: toHhmm(from), to: toHhmm(from + 60) };
}

/**
 * Whether a room matches the search. An old building code ("M10-102",
 * "w8 004") finds the room in the building that replaced it (A12-102,
 * C14-W8-004). No room today starts with M or W, so plain text matching
 * would only find stray hits like "COM106" for "M10".
 */
function roomSearch(query) {
    const q = squash(query);
    const old = /^\s*([MW]\d{1,2}[A-H]?)\b[\s-]*(.*)$/i.exec(query);
    const now = old && fromOldCode(old[1]);
    const matches = (room) => (now
        ? now.includes(buildingOfRoom(room)) && squash(room.replace(/^[^-]+-/, '')).includes(squash(old[2]))
        : squash(room).includes(q));
    return { matches, note: now && `${old[1].toUpperCase()} is now ${now.join(', ')}` };
}

const Ctx = createContext(null);

function RoomsProvider({ children }) {
    const [sections, setSections] = useState([]);
    const [courseMap, setCourseMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(null);
    const [query, setQuery] = useState('');
    // 'room' shows one room's week; 'free' lists the rooms free at a time.
    const [mode, setMode] = useState('room');
    const [when, setWhen] = useState(campusNow);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/admin/rooms');
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                setSections(data.sections || []);
                setCourseMap(data.courseMap || {});
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Room code to its sections, rooms in natural order (A3-007 before A12-004).
    const rooms = useMemo(() => {
        const byRoom = new Map();
        for (const s of sections) {
            const room = s.location.trim();
            if (!byRoom.has(room)) byRoom.set(room, []);
            byRoom.get(room).push(s);
        }
        for (const list of byRoom.values()) {
            list.sort((a, b) => a.course_id.localeCompare(b.course_id) || a.section_num.localeCompare(b.section_num, undefined, { numeric: true }));
        }
        return new Map([...byRoom].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })));
    }, [sections]);

    // Room code to its meetings in the week: [{ day: 'Mon', start, end }] in minutes.
    const meetings = useMemo(() => new Map(
        [...rooms].map(([room, list]) => [room, list.flatMap(s => parseClassTime(s.class_time))]),
    ), [rooms]);

    const openRoom = (room) => {
        setSelected(room);
        setMode('room');
    };

    return (
        <Ctx.Provider value={{
            rooms, meetings, courseMap, loading, error, selected, setSelected, openRoom,
            query, setQuery, mode, setMode, when, setWhen,
        }}>
            {children}
        </Ctx.Provider>
    );
}

function RoomsSidebar() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { rooms, loading, selected, setSelected, query, setQuery, mode, setMode, when, setWhen } = ctx;
    const { matches, note } = roomSearch(query);
    const matching = [...rooms].filter(([room]) => matches(room));

    return (
        <div className={styles.sidebarCard}>
            <div className={rs.modeSwitch} role="group" aria-label="Rooms view">
                {[['room', 'Find a room'], ['free', 'Free rooms']].map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        className={`${rs.modeBtn} ${mode === value ? rs.modeOn : ''}`}
                        aria-pressed={mode === value}
                        onClick={() => setMode(value)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {mode === 'free' && (
                <>
                    <p className={styles.sectionTitle}>Free on</p>
                    <select
                        className={styles.input}
                        value={when.day}
                        onChange={e => setWhen(w => ({ ...w, day: e.target.value }))}
                    >
                        {DAYS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <div className={rs.timeRow}>
                        <label className={rs.field}>
                            <span>From</span>
                            <input
                                type="time"
                                className={styles.input}
                                value={when.from}
                                onChange={e => e.target.value && setWhen(w => ({ ...w, from: e.target.value }))}
                            />
                        </label>
                        <label className={rs.field}>
                            <span>Until</span>
                            <input
                                type="time"
                                className={styles.input}
                                value={when.to}
                                onChange={e => e.target.value && setWhen(w => ({ ...w, to: e.target.value }))}
                            />
                        </label>
                    </div>
                    <p className={`${styles.sectionTitle} ${rs.where}`}>Where</p>
                </>
            )}

            {mode === 'room' && <p className={styles.sectionTitle}>Rooms</p>}
            <input
                className={styles.input}
                placeholder={mode === 'free' ? 'Every room, or A12, M10…' : 'A room, like A3-007 or M3-007'}
                aria-label="Find a room"
                value={query}
                onChange={e => setQuery(e.target.value)}
            />
            {note && <div className={`${styles.rowMeta} ${rs.note}`}>{note}</div>}

            {mode === 'room' && (
                <div className={`${styles.navList} ${own.buildingList}`}>
                    {!loading && matching.length === 0 && <div className={styles.rowMeta}>No room matches.</div>}
                    {matching.map(([room, list]) => (
                        <button
                            key={room}
                            type="button"
                            className={`${styles.navBtn} ${selected === room ? styles.navBtnActive : ''}`}
                            onClick={() => setSelected(room)}
                        >
                            <span className={own.navName}>{room}</span>
                            <span className={styles.navCount}>{list.length}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/** The rooms with no class in the chosen window, by building. */
function FreeRooms() {
    const { rooms, meetings, query, when, openRoom } = useContext(Ctx);
    const from = toMinutes(when.from);
    const to = toMinutes(when.to);
    const dayName = DAYS.find(([key]) => key === when.day)?.[1];

    if (to <= from) {
        return (
            <div className={styles.empty}>
                <div className={styles.emptyTitle}>The end has to come after the start.</div>
            </div>
        );
    }

    const { matches } = roomSearch(query);
    const searched = [...rooms.keys()].filter(matches);
    const free = searched.flatMap(room => {
        const day = meetings.get(room).filter(m => m.day === when.day);
        if (day.some(m => m.start < to && from < m.end)) return [];
        // How long it stays free: until its next class that day, if any.
        const next = Math.min(...day.filter(m => m.start >= to).map(m => m.start));
        return [{ room, note: day.length === 0 ? 'no classes that day' : Number.isFinite(next) ? `until ${toHhmm(next)}` : 'rest of the day' }];
    });

    const byBuilding = new Map();
    for (const f of free) {
        const code = buildingOfRoom(f.room);
        if (!byBuilding.has(code)) byBuilding.set(code, []);
        byBuilding.get(code).push(f);
    }

    return (
        <>
            <div className={own.mainHead}>
                <div>
                    <div className={own.mainTitle}>Free rooms</div>
                    <div className={styles.rowMeta}>
                        {dayName}, {when.from} to {when.to} · {free.length} of {searched.length} rooms free
                    </div>
                </div>
            </div>

            {free.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>No free rooms.</div>
                    <span>Every room here has a class at some point in that time.</span>
                </div>
            ) : (
                <div className={styles.feedList}>
                    {[...byBuilding].map(([code, list]) => (
                        <section key={code} className={rs.group}>
                            <h3 className={rs.groupHead}>
                                {code}
                                {buildingInfo(code)?.name && <span> · {buildingInfo(code).name}</span>}
                                <span className={rs.groupCount}>{list.length}</span>
                            </h3>
                            <div className={rs.chips}>
                                {list.map(f => (
                                    <button key={f.room} type="button" className={rs.chip} onClick={() => openRoom(f.room)}>
                                        {f.room}
                                        <span className={rs.chipNote}>{f.note}</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
            <p className={rs.footnote}>
                Only rooms with classes this term are known, so a room never booked for a class won&apos;t show up here.
            </p>
        </>
    );
}

function RoomsMain() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { rooms, courseMap, loading, error, selected, mode } = ctx;
    const list = (selected && rooms.get(selected)) || [];

    // One timetable colour per course, as on a student's schedule.
    const groups = [];
    for (const s of list) {
        const group = groups.find(g => g.courseId === s.course_id);
        if (group) group.sections.push(s);
        else groups.push({ courseId: s.course_id, sections: [s] });
    }

    const code = selected && buildingOfRoom(selected);
    const building = code && buildingInfo(code);

    return (
        <div className={styles.feedCard}>
            {error && <div className={styles.error}>{error}</div>}
            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} />Reading rooms…</div>
            ) : mode === 'free' ? (
                <FreeRooms />
            ) : !selected ? (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>Pick a room.</div>
                    <span>Its week of classes this term is drawn here, like a student&apos;s timetable.</span>
                </div>
            ) : (
                <>
                    <div className={own.mainHead}>
                        <div>
                            <div className={own.mainTitle}>{selected}</div>
                            <div className={styles.rowMeta}>
                                {[building?.name, `${list.length} section${list.length === 1 ? '' : 's'} this term`].filter(Boolean).join(' · ')}
                            </div>
                        </div>
                        <RoomLink room={selected} />
                    </div>

                    <Timetable schedule={groups} courseMap={courseMap} />

                    <div className={`${styles.tableWrap} ${rs.sections}`}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>Course</th><th>Section</th><th>When</th><th>Instructor</th><th>CRN</th></tr>
                            </thead>
                            <tbody>
                                {list.map(s => (
                                    <tr key={s.crn}>
                                        <td>
                                            <span className={`${styles.mono} ${styles.cellStrong}`}>{s.course_id}</span>
                                            {courseMap[s.course_id]?.name && <> {courseMap[s.course_id].name}</>}
                                        </td>
                                        <td className={styles.mono}>§{s.section_num}</td>
                                        <td>{s.class_time || <span className={styles.cellMuted}>no set time</span>}</td>
                                        <td>{s.instructor}</td>
                                        <td className={styles.mono}>{s.crn}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

const roomsTab = { Provider: RoomsProvider, Sidebar: RoomsSidebar, Main: RoomsMain };
export default roomsTab;
