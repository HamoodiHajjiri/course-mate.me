'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSemester } from '@/lib/SemesterContext';
import { courseColor } from '@/lib/courseColor';
import {
    historyTerms, termLabel, fetchCourseHistory, startGrid, meetingText, formatClock, CAMPUS_LABELS,
} from '@/lib/courseHistory';
import RoomLink from '@/components/RoomLink';
import {
    Button, CourseCode, CourseMark, CourseName, EmptyState, Field, Rubric, SearchInput, Section, SegmentedControl, Skeleton, Status,
} from '@/components/ui';
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
                <Button variant="link" onClick={onBackToBuild} className={styles.back}>← Back to your schedule</Button>
            )}

            {!detail && (
                <section className={styles.searchPanel} ref={searchRef}>
                    <Field label="Look up any course" htmlFor="history-search">
                        <div className={styles.combo}>
                            <SearchInput
                                id="history-search"
                                size="lg"
                                placeholder="A course code or name"
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
                                            <CourseCode id={c.course_id} size="sm" />
                                            <CourseName size="sm">{c.name}</CourseName>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Field>
                </section>
            )}

            {loading && (
                <div className={styles.loading} aria-busy="true">
                    <Skeleton width={120} height={12} />
                    <Skeleton width={340} height={28} />
                    <Skeleton height={64} />
                    {[0, 1, 2].map(i => <Skeleton key={i} height={40} />)}
                </div>
            )}

            {failed && (
                <EmptyState title="This course’s history didn’t load." actions={<Button variant="link" onClick={() => selectCourse(course)}>Try again</Button>}>
                    It&rsquo;s usually a blip in the connection.
                </EmptyState>
            )}

            {!course && !loading && (
                <EmptyState title="How did a course run before?">
                    {terms.length
                        ? `Times, instructors and sections from ${pastLabels.slice().reverse().join(', ')}. Useful when a course isn’t open yet, or to see who usually teaches it.`
                        : 'Pick a term first.'}
                </EmptyState>
            )}

            {course && history && !loading && !detail && (
                <article className={styles.card}>
                    <header className={styles.head}>
                        <span className={styles.headCode}>
                            <CourseMark courseId={course.course_id} />
                            <CourseCode id={course.course_id} />
                            {course.credit_hours > 0 && <span className={styles.credits}>{course.credit_hours} credits</span>}
                        </span>
                        <CourseName as="h2" size="xl">{course.name}</CourseName>
                        {openNow != null && (
                            <Status tone={openNow > 0 ? 'go' : 'muted'}>
                                {openNow > 0
                                    ? `${openNow} ${openNow === 1 ? 'section' : 'sections'} open in ${termLabel(selectedTerm)}`
                                    : `Not open in ${termLabel(selectedTerm)}`}
                            </Status>
                        )}
                    </header>

                    <dl className={styles.figures}>
                        <div><dt>Terms offered</dt><dd>{history.offeredCount}<small>/{terms.length}</small></dd></div>
                        <div><dt>Sections a term</dt><dd>{history.sectionsPerTerm}</dd></div>
                        <div><dt>{history.instructors.length === 1 ? 'Instructor' : 'Instructors'}</dt><dd>{history.instructors.length}</dd></div>
                    </dl>

                    <section aria-label="Past terms">
                        <Rubric title="Past terms" meta="newest first" quiet />
                        <ol className={styles.terms}>
                            {history.terms.map(t => t.offered ? (
                                <li key={t.code}>
                                    <button type="button" className={styles.term} onClick={() => setOpenTerm(t.code)}>
                                        <span className={styles.termName}>{t.label}</span>
                                        <span className={styles.termCount}>{t.sections.length} §</span>
                                        <span className={styles.termWhen}>
                                            {t.dayPatterns.slice(0, 3).join(', ')}
                                            {t.earliest != null && <span className={styles.termClock}>{formatClock(t.earliest)}–{formatClock(t.latest)}</span>}
                                        </span>
                                        <span className={styles.termWho}>{t.instructors.length === 1 ? t.instructors[0] : `${t.instructors.length} instructors`}</span>
                                        <span className={styles.termFill}>
                                            {t.fill != null && (
                                                <>
                                                    <span className={styles.fillLine}><span style={{ width: `${Math.min(100, t.fill)}%` }} /></span>
                                                    <span className={styles.fillPct}>{t.fill}%</span>
                                                </>
                                            )}
                                        </span>
                                        <span className={styles.termOpen} aria-hidden="true">→</span>
                                    </button>
                                </li>
                            ) : (
                                <li key={t.code} className={styles.termOff}>
                                    <span className={styles.termName}>{t.label}</span>
                                    <span className={styles.termCount}>—</span>
                                    <span className={styles.termWhen}>not offered</span>
                                </li>
                            ))}
                        </ol>
                    </section>

                    <p className={styles.footnote}>Past terms show what ran, not what will: times and instructors change every term.</p>
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
            <Button variant="link" onClick={onBack} className={styles.back}>← All terms</Button>
            <header className={styles.head}>
                <span className={styles.headCode}>
                    <CourseMark courseId={course.course_id} />
                    <CourseCode id={course.course_id} />
                </span>
                <CourseName as="h2" size="lg">{course.name}</CourseName>
            </header>

            <SegmentedControl
                label="Term"
                size="sm"
                value={term.code}
                onChange={onPickTerm}
                options={history.terms.map(t => ({ value: t.code, label: t.label, disabled: !t.offered, title: t.offered ? undefined : 'Not offered' }))}
            />

            {grid.starts.length > 0 && (
                <section className={styles.heatBlock}>
                    <Rubric title="When sections started" quiet description="Darker cells are times more sections began." />
                    <div className={styles.heat} style={{ gridTemplateColumns: `52px repeat(${grid.days.length}, minmax(0, 1fr))` }}>
                        <span />
                        {grid.days.map(d => <span key={d} className={styles.heatDay}>{d}</span>)}
                        {grid.starts.map((start, r) => (
                            <StartRow key={start} label={formatClock(start)} row={grid.cells[r]} days={grid.days} max={maxCell} />
                        ))}
                    </div>
                </section>
            )}

            <section aria-label="Sections">
                <Rubric title="Sections" meta={term.sections.length} quiet description={anySeats ? 'Enrolment as last checked.' : undefined} />
                <ul className={styles.sections}>
                    {term.sections.map(s => {
                        const hasSeats = s.enrollment != null && s.max_enrollment > 0;
                        const pct = hasSeats ? Math.min(100, Math.round((s.enrollment / s.max_enrollment) * 100)) : 0;
                        return (
                            <li key={s.crn} className={styles.sectionRow}>
                                <Section value={s.section_num} size="sm" />
                                <span className={styles.sectionTime}>{meetingText(s.class_time)}</span>
                                <span className={styles.sectionWho}>{s.instructor || 'not listed'}</span>
                                <span className={styles.sectionRoom}>{s.location && <RoomLink room={s.location} />}</span>
                                <span className={styles.sectionCampus}>{s.campus ? (CAMPUS_LABELS[s.campus] || s.campus) : ''}</span>
                                <span className={styles.sectionFill}>
                                    {hasSeats && (
                                        <>
                                            <span className={styles.fillLine}><span style={{ width: `${pct}%` }} /></span>
                                            <span className={styles.fillPct}>{s.enrollment}/{s.max_enrollment}</span>
                                        </>
                                    )}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </article>
    );
}

// How many sections started in each slot: the course's colour at growing
// strength, in square cells.
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
