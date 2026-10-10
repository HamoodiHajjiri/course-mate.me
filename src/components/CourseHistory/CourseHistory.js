'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSemester } from '@/lib/SemesterContext';
import { courseColor } from '@/lib/courseColor';
import { HistoryIcon, ChevronLeftIcon, ChevronRightIcon, AlertIcon } from '@/components/Icons';
import {
    historyTerms, termLabel, fetchCourseHistory, startGrid, meetingText, formatClock, CAMPUS_LABELS,
} from '@/lib/courseHistory';
import RoomLink from '@/components/RoomLink';
import { Badge, Button, CourseSwatch, EmptyState, Field, SearchInput, SegmentedControl, Skeleton, Ticket } from '@/components/ui';
import styles from './CourseHistory.module.css';

// PostgREST's or() splits on commas and parentheses, and ilike treats % and _
// as wildcards, so those can't pass through from the search box.
function cleanQuery(q) {
    return q.replace(/[,()%_*\\]/g, ' ').trim();
}

/**
 * The Schedule page's History tab: how a course ran in recent past terms.
 *
 * `request` opens a course straight away ({ courseId, courseName, term,
 * fromBuild }); the build tab's shortcuts send one. `onBackToBuild` is shown
 * as a back link when the student came from building a schedule.
 */
export default function CourseHistory({ request, onBackToBuild }) {
    const supabase = createClient();
    const { selectedTerm } = useSemester();
    const terms = historyTerms(selectedTerm);

    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const [course, setCourse] = useState(null);
    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    // Sections of this course in the term being planned; null while unknown or
    // when that term has no sections loaded at all.
    const [openNow, setOpenNow] = useState(null);
    const [openTerm, setOpenTerm] = useState(null);
    const searchRef = useRef(null);
    const searchTimeout = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selectCourse = async (picked, term = null) => {
        setCourse(picked);
        setQuery(picked.name || picked.course_id);
        setShowDropdown(false);
        setOpenTerm(term);
        setHistory(null);
        setOpenNow(null);
        setFailed(false);
        if (!terms.length) return;
        setLoading(true);
        try {
            const [result, now, termAny] = await Promise.all([
                fetchCourseHistory(supabase, picked.course_id, terms),
                supabase.from('sections').select('crn', { count: 'exact', head: true })
                    .eq('term_code', selectedTerm).eq('course_id', picked.course_id).eq('is_active', true),
                supabase.from('sections').select('crn', { count: 'exact', head: true })
                    .eq('term_code', selectedTerm).eq('is_active', true),
            ]);
            setHistory(result);
            setOpenNow(termAny.count > 0 ? (now.count || 0) : null);
            // A term with nothing to show can't be opened; fall back to the list.
            if (term && !result.terms.find(t => t.code === term)?.offered) setOpenTerm(null);
        } catch {
            setFailed(true);
        }
        setLoading(false);
    };

    // A shortcut from the build tab, or a link like /schedule?mode=history&course=0401211.
    useEffect(() => {
        if (!request?.courseId || !selectedTerm) return;
        (async () => {
            let picked = { course_id: request.courseId, name: request.courseName, credit_hours: null };
            const { data } = await supabase.from('courses')
                .select('course_id, course_name, credit_hours').eq('course_id', request.courseId).maybeSingle();
            if (data) picked = { course_id: data.course_id, name: data.course_name, credit_hours: data.credit_hours };
            selectCourse(picked, request.term || null);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request, selectedTerm]);

    // Another term being planned means another set of past terms.
    useEffect(() => {
        if (course && !request?.courseId) selectCourse(course);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTerm]);

    const handleSearchChange = (e) => {
        const value = e.target.value;
        setQuery(value);
        setActiveIdx(-1);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        const q = cleanQuery(value);
        if (q.length < 2) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }
        searchTimeout.current = setTimeout(async () => {
            const { data } = await supabase.from('courses')
                .select('course_id, course_name, credit_hours')
                .or(`course_name.ilike.%${q}%,course_id.ilike.%${q}%`)
                .order('course_id')
                .limit(8);
            setSuggestions((data || []).map(c => ({ course_id: c.course_id, name: c.course_name, credit_hours: c.credit_hours })));
            setShowDropdown(true);
        }, 250);
    };

    const onKeyDown = (e) => {
        if (!showDropdown || suggestions.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(suggestions.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectCourse(suggestions[activeIdx]); }
        else if (e.key === 'Escape') setShowDropdown(false);
    };

    const pastLabels = terms.map(termLabel);
    const detail = history && openTerm ? history.terms.find(t => t.code === openTerm) : null;

    return (
        <div className={styles.main}>
            {onBackToBuild && (
                <Button variant="ghost" size="sm" icon={<ChevronLeftIcon />} onClick={onBackToBuild} className={styles.back}>
                    Back to your schedule
                </Button>
            )}

            {!detail && (
                <section className={styles.searchPanel} ref={searchRef}>
                    <Field label="Look up any course" htmlFor="history-search">
                        <div className={styles.combo}>
                            <SearchInput
                                id="history-search"
                                size="lg"
                                placeholder="Search by course name or ID"
                                autoComplete="off"
                                value={query}
                                onChange={handleSearchChange}
                                onClear={() => { setQuery(''); setSuggestions([]); setShowDropdown(false); }}
                                onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                                onKeyDown={onKeyDown}
                                role="combobox"
                                aria-expanded={showDropdown && suggestions.length > 0}
                                aria-controls="history-list"
                            />
                            {showDropdown && suggestions.length > 0 && (
                                <div className={styles.dropdown} id="history-list" role="listbox">
                                    {suggestions.map((c, i) => (
                                        <button
                                            key={c.course_id}
                                            type="button"
                                            role="option"
                                            aria-selected={i === activeIdx}
                                            className={`${styles.option} ${i === activeIdx ? styles.optionActive : ''}`}
                                            onClick={() => selectCourse(c)}
                                        >
                                            <CourseSwatch courseId={c.course_id} size="sm" />
                                            <span className={styles.optionName}>{c.name}</span>
                                            <span className={styles.optionId}>{c.course_id}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Field>
                </section>
            )}

            {loading && (
                <div className={styles.loadingCard} aria-busy="true">
                    <div className={styles.headRow}>
                        <Skeleton width={40} height={40} radius={11} />
                        <span className={styles.loadingText}>
                            <Skeleton width={260} height={18} />
                            <Skeleton width={90} height={12} />
                        </span>
                    </div>
                    <div className={styles.loadingStats}>
                        <Skeleton height={56} radius={10} />
                        <Skeleton height={56} radius={10} />
                        <Skeleton height={56} radius={10} />
                    </div>
                    {[0, 1, 2].map(i => <Skeleton key={i} height={62} radius={12} />)}
                </div>
            )}

            {failed && (
                <EmptyState tone="neutral" icon={<AlertIcon />} title="Couldn’t load this course’s history" actions={<Button variant="secondary" onClick={() => selectCourse(course)}>Try again</Button>}>
                    Something went wrong fetching past terms. It&rsquo;s usually a blip; try again in a moment.
                </EmptyState>
            )}

            {!course && !loading && (
                <EmptyState icon={<HistoryIcon />} title="See how a course ran before">
                    {terms.length
                        ? `Times, instructors and sections from ${pastLabels.slice().reverse().join(', ')}. Useful when a course isn’t open yet, or you want to know who usually teaches it.`
                        : 'Pick a semester first.'}
                </EmptyState>
            )}

            {course && history && !loading && !detail && (
                <article className={styles.card}>
                    <header className={styles.headRow}>
                        <CourseSwatch courseId={course.course_id} size="lg" />
                        <div className={styles.courseTitle}>
                            <h2 className={styles.courseName}>{course.name}</h2>
                            <span className={styles.courseMeta}>
                                <span className={styles.mono}>{course.course_id}</span>
                                {course.credit_hours > 0 && <span>{course.credit_hours} credits</span>}
                            </span>
                        </div>
                        {openNow != null && (
                            <Badge tone={openNow > 0 ? 'success' : 'neutral'} dot className={styles.nowBadge}>
                                {openNow > 0
                                    ? `${openNow} ${openNow === 1 ? 'section' : 'sections'} open in ${termLabel(selectedTerm)}`
                                    : `Not open in ${termLabel(selectedTerm)}`}
                            </Badge>
                        )}
                    </header>

                    <div className={styles.stats}>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{history.offeredCount}<small>/{terms.length}</small></span>
                            <span className={styles.statLabel}>terms offered</span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{history.sectionsPerTerm}</span>
                            <span className={styles.statLabel}>sections a term</span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{history.instructors.length}</span>
                            <span className={styles.statLabel}>{history.instructors.length === 1 ? 'instructor' : 'instructors'}</span>
                        </div>
                    </div>

                    <div className={styles.timeline}>
                        <span className={styles.timelineLabel}>Past terms, newest first</span>
                        <ol className={styles.terms} style={{ '--c': courseColor(course.course_id) }}>
                            {history.terms.map(t => t.offered ? (
                                <li key={t.code} className={styles.termItem}>
                                    <span className={styles.termDot} aria-hidden="true" />
                                    <button type="button" className={styles.termRow} onClick={() => setOpenTerm(t.code)}>
                                        <span className={styles.termRowHead}>
                                            <span className={styles.termName}>{t.label}</span>
                                            <span className={styles.termCount}>
                                                {t.sections.length} {t.sections.length === 1 ? 'section' : 'sections'}
                                                {t.fill != null && ` · ${t.fill}% full`}
                                            </span>
                                            <ChevronRightIcon className={styles.termChevron} />
                                        </span>
                                        <span className={styles.chips}>
                                            {t.dayPatterns.slice(0, 3).map(d => <span key={d} className={styles.chip}>{d}</span>)}
                                            {t.earliest != null && <span className={styles.chip}>{formatClock(t.earliest)}–{formatClock(t.latest)}</span>}
                                            <span className={styles.chip}>
                                                {t.instructors.length === 1 ? t.instructors[0] : `${t.instructors.length} instructors`}
                                            </span>
                                            {t.campuses.length === 1 && <span className={styles.chip}>{CAMPUS_LABELS[t.campuses[0]] || t.campuses[0]} campus only</span>}
                                        </span>
                                    </button>
                                </li>
                            ) : (
                                <li key={t.code} className={`${styles.termItem} ${styles.termOff}`}>
                                    <span className={styles.termDot} aria-hidden="true" />
                                    <span className={styles.termRowOff}>
                                        <span className={styles.termName}>{t.label}</span>
                                        <span className={styles.termCount}>Not offered</span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>

                    <p className={styles.footnote}>Past terms show what ran, not what will. Times and instructors change every term.</p>
                </article>
            )}

            {detail && (
                <TermDetail
                    course={course}
                    history={history}
                    term={detail}
                    onPickTerm={setOpenTerm}
                    onBack={() => setOpenTerm(null)}
                />
            )}
        </div>
    );
}

function TermDetail({ course, history, term, onPickTerm, onBack }) {
    const grid = startGrid(term.sections);
    const anySeats = term.sections.some(s => s.enrollment != null && s.max_enrollment);
    const maxCell = Math.max(1, ...grid.cells.flat());

    return (
        <article className={styles.card} style={{ '--c': courseColor(course.course_id) }}>
            <header className={styles.headRow}>
                <Button variant="ghost" size="sm" icon={<ChevronLeftIcon />} onClick={onBack} aria-label="Back to all terms" />
                <CourseSwatch courseId={course.course_id} />
                <div className={styles.courseTitle}>
                    <h2 className={styles.courseNameSm}>{course.name}</h2>
                    <span className={styles.courseMeta}>
                        <span className={styles.mono}>{course.course_id}</span>
                        <span>{term.label}</span>
                    </span>
                </div>
            </header>

            <div className={styles.termPicker}>
                <SegmentedControl
                    label="Term"
                    size="sm"
                    value={term.code}
                    onChange={onPickTerm}
                    options={history.terms.map(t => ({ value: t.code, label: t.label, disabled: !t.offered, title: t.offered ? undefined : 'Not offered' }))}
                />
            </div>

            {grid.starts.length > 0 && (
                <section className={styles.heatBlock}>
                    <span className={styles.timelineLabel}>When sections started</span>
                    <div className={styles.heat} style={{ gridTemplateColumns: `52px repeat(${grid.days.length}, minmax(0, 1fr))` }}>
                        <span />
                        {grid.days.map(d => <span key={d} className={styles.heatDay}>{d}</span>)}
                        {grid.starts.map((start, r) => (
                            <StartRow key={start} label={formatClock(start)} row={grid.cells[r]} days={grid.days} max={maxCell} />
                        ))}
                    </div>
                </section>
            )}

            <section className={styles.sectionBlock}>
                <div className={styles.listHead}>
                    <span className={styles.timelineLabel}>{term.sections.length} {term.sections.length === 1 ? 'section' : 'sections'}</span>
                    {anySeats && <span className={styles.listNote}>Enrolment when last checked</span>}
                </div>
                <div className={styles.sectionGrid}>
                    {term.sections.map(s => {
                        const hasSeats = s.enrollment != null && s.max_enrollment > 0;
                        const pct = hasSeats ? Math.min(100, Math.round((s.enrollment / s.max_enrollment) * 100)) : 0;
                        return (
                            <div key={s.crn} className={styles.sectionCard}>
                                <div className={styles.sectionTop}>
                                    <Ticket size="sm" label="Sec" section={s.section_num} />
                                    {s.campus && <Badge size="sm">{CAMPUS_LABELS[s.campus] || s.campus}</Badge>}
                                </div>
                                <span className={styles.sectionTime}>{meetingText(s.class_time)}</span>
                                <span className={styles.sectionWho}>{s.instructor || 'Instructor not listed'}</span>
                                {s.location && <span className={styles.sectionRoom}><RoomLink room={s.location} /></span>}
                                {hasSeats && (
                                    <div className={styles.fillRow}>
                                        <div className={styles.fillTrack}><div className={styles.fillBar} style={{ width: `${pct}%` }} /></div>
                                        <span className={styles.fillText}>{s.enrollment}/{s.max_enrollment}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>
        </article>
    );
}

// How many sections started in each slot, as the course's own colour at
// growing strength.
function StartRow({ label, row, days, max }) {
    return (
        <>
            <span className={styles.heatHour}>{label}</span>
            {row.map((n, i) => (
                <span
                    key={days[i]}
                    className={`${styles.heatCell} ${n ? styles.heatOn : ''}`}
                    style={n ? { '--level': `${18 + Math.round((n / max) * 62)}%` } : undefined}
                    title={n ? `${n} ${n === 1 ? 'section' : 'sections'} starting ${days[i]} ${label}` : undefined}
                >
                    {n > 0 ? n : ''}
                </span>
            ))}
        </>
    );
}
