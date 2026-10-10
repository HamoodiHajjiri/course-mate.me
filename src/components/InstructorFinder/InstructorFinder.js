'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSemester } from '@/lib/SemesterContext';
import { decodeHtmlEntities } from '@/lib/text';
import { parseClassTime, formatTime } from '@/lib/classTime';
import { courseColor } from '@/lib/courseColor';
import { seatStatus } from '@/lib/seats';
import { OFFICE_HOUR_DAYS, formatClock, fetchOfficeHours, layoutOfficeHours } from '@/lib/officeHours';
import RoomLink from '@/components/RoomLink';
import WeekGrid from '@/components/WeekGrid/WeekGrid';
import { Avatar, Badge, Callout, CourseSwatch, EmptyState, Field, SearchInput, Skeleton, Ticket } from '@/components/ui';
import { ClockIcon, ExternalIcon, InfoIcon, UserCheckIcon } from '@/components/Icons';
import styles from './InstructorFinder.module.css';

function encodeForSearch(text) {
    if (!text) return text;
    return text.replace(/'/g, '&#39;');
}

// Office hours and office locations are Find My Prof's work; credited below.
const FIND_MY_PROF_URL = 'https://uos-findmyprof.vercel.app';
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'];

/**
 * Instructor timetable lookup — the "Find instructor" mode of the Schedule
 * page (/schedule?mode=instructor; the old /instructors route redirects
 * there). It answers the same question the builder does (when does this
 * happen), so it sits beside it as a peer.
 */
export default function InstructorFinder() {
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const [selectedInstructor, setSelectedInstructor] = useState(null);
    const [instructorSections, setInstructorSections] = useState([]);
    const [courseData, setCourseData] = useState({});
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    // The selected instructor's Find My Prof entry ({ name, office, hours }),
    // or null when Find My Prof does not list them.
    const [officeHours, setOfficeHours] = useState(null);

    const supabase = createClient();
    const { selectedTerm, semesters } = useSemester();
    const currentSemesterName = semesters?.find(s => s.term_code === selectedTerm)?.name || selectedTerm;
    const searchRef = useRef(null);
    const searchTimeout = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Clear search and results when semester changes
    useEffect(() => {
        setSearchQuery('');
        setSuggestions([]);
        setSelectedInstructor(null);
        setInstructorSections([]);
        setOfficeHours(null);
    }, [selectedTerm]);

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        setActiveIdx(-1);

        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        if (!query.trim() || !selectedTerm) {
            setSuggestions([]);
            setShowDropdown(false);
            setSearching(false);
            return;
        }

        const encodedQuery = encodeForSearch(query);
        setSearching(true);

        searchTimeout.current = setTimeout(async () => {
            const { data } = await supabase
                .from('sections')
                .select('instructor')
                .eq('term_code', selectedTerm)
                .eq('is_active', true)
                .ilike('instructor', `%${encodedQuery}%`)
                .not('instructor', 'is', null)
                .limit(300);

            setSearching(false);
            if (data) {
                const unique = [...new Set(data.map(d => d.instructor))].slice(0, 10);
                setSuggestions(unique);
                setShowDropdown(true);
            }
        }, 300);
    };

    const handleSelectInstructor = async (name) => {
        setSearchQuery(decodeHtmlEntities(name));
        setShowDropdown(false);
        setSelectedInstructor(name);
        setOfficeHours(null);
        setLoading(true);

        // Fetch sections
        const { data: sections } = await supabase
            .from('sections')
            .select('*')
            .eq('term_code', selectedTerm)
            .eq('is_active', true)
            .eq('instructor', name);

        if (!sections || sections.length === 0) {
            setInstructorSections([]);
            setLoading(false);
            return;
        }

        // Fetch course details, and the instructor's office hours when Find My
        // Prof has them (joined by the email Banner lists for their sections).
        const courseIds = [...new Set(sections.map(s => s.course_id))];
        const email = sections.find(s => s.instructor_email)?.instructor_email || null;
        const [{ data: courses }, hoursByEmail] = await Promise.all([
            supabase
                .from('courses')
                .select('course_id, course_name')
                .in('course_id', courseIds),
            fetchOfficeHours(supabase, email ? [email] : []),
        ]);
        setOfficeHours((email && hoursByEmail[email]) || null);

        const courseMap = {};
        if (courses) {
            courses.forEach(c => {
                courseMap[c.course_id] = decodeHtmlEntities(c.course_name);
            });
        }

        setCourseData(courseMap);
        setInstructorSections(sections);
        setLoading(false);
    };

    const onKeyDown = (e) => {
        if (!showDropdown || suggestions.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(suggestions.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelectInstructor(suggestions[activeIdx]); }
        else if (e.key === 'Escape') setShowDropdown(false);
    };

    // ===== The week =====
    const classBlocks = instructorSections.flatMap(sec => parseClassTime(sec.class_time).map(slot => ({
        ...slot,
        color: courseColor(sec.course_id),
        code: sec.course_id,
        section: sec.section_num,
        name: courseData[sec.course_id] || '',
        meta: sec.location,
    })));

    // Office hours, in the time the instructor is not teaching.
    const officeBlocks = [];
    (officeHours?.hours || []).forEach(h => h.days.forEach(d => {
        const day = OFFICE_HOUR_DAYS[d];
        if (!WEEK.includes(day)) return;
        officeBlocks.push({
            day,
            start: h.start,
            end: h.end,
            variant: 'office',
            name: 'Office hours',
            title: `Office hours ${formatClock(h.start)}-${formatClock(h.end)}${h.location ? `, ${h.location}` : ''}`,
        });
    }));
    const officeSegments = layoutOfficeHours(classBlocks, officeBlocks);
    const timed = [...classBlocks, ...officeSegments];
    const days = WEEK.filter(d => d !== 'Sun' || timed.some(b => b.day === 'Sun'));
    const minTime = timed.length > 0 ? Math.min(...timed.map(b => b.start)) : 8 * 60;
    const maxTime = timed.length > 0 ? Math.max(...timed.map(b => b.end)) : 17 * 60;
    const startHour = Math.min(8, Math.floor(minTime / 60));
    const endHour = Math.max(17, Math.ceil(maxTime / 60));

    // Find My Prof sometimes holds a placeholder like "M5-XXX" instead of a room.
    // It files offices under M5/W5, the same buildings students know as A9/C9
    // (and that its own office-hour rooms use), so the room is shown that way.
    const officeLocation = officeHours?.office && !/x{2,}/i.test(officeHours.office)
        ? officeHours.office.replace(/^(M5|W5)-/, (_, building) => (building === 'M5' ? 'A9-' : 'C9-'))
        : null;
    const hasOfficeHours = (officeHours?.hours?.length || 0) > 0;
    const courseCount = new Set(instructorSections.map(s => s.course_id)).size;
    const displayName = selectedInstructor ? decodeHtmlEntities(selectedInstructor) : '';
    const sortedSections = [...instructorSections].sort((a, b) => a.course_id.localeCompare(b.course_id) || a.section_num.localeCompare(b.section_num, undefined, { numeric: true }));

    return (
        <div className={styles.main}>
            <section className={styles.searchPanel} ref={searchRef}>
                <Field label={`Instructor teaching in ${currentSemesterName || 'this term'}`} htmlFor="instructor-search">
                    <div className={styles.combo}>
                        <SearchInput
                            id="instructor-search"
                            size="lg"
                            placeholder="Type a name, like Mheidat or Ahmed"
                            value={searchQuery}
                            onChange={handleSearchChange}
                            onClear={() => { setSearchQuery(''); setSuggestions([]); setShowDropdown(false); }}
                            onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                            onKeyDown={onKeyDown}
                            autoComplete="off"
                            role="combobox"
                            aria-expanded={showDropdown && suggestions.length > 0}
                            aria-controls="instructor-list"
                        />
                        {showDropdown && (suggestions.length > 0 || (!searching && searchQuery.trim())) && (
                            <div className={styles.dropdown} id="instructor-list" role="listbox">
                                {suggestions.length === 0 ? (
                                    <p className={styles.noMatch}>Nobody teaching this term matches &ldquo;{searchQuery}&rdquo;.</p>
                                ) : suggestions.map((name, i) => (
                                    <button
                                        key={name}
                                        type="button"
                                        role="option"
                                        aria-selected={i === activeIdx}
                                        className={`${styles.option} ${i === activeIdx ? styles.optionActive : ''}`}
                                        onClick={() => handleSelectInstructor(name)}
                                    >
                                        <Avatar name={decodeHtmlEntities(name).replace(',', '')} size={28} tone="neutral" />
                                        {decodeHtmlEntities(name)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </Field>
            </section>

            {loading && (
                <div className={styles.loadingCard} aria-busy="true">
                    <div className={styles.loadingHead}>
                        <Skeleton width={56} height={56} radius={28} />
                        <span className={styles.loadingText}>
                            <Skeleton width={220} height={18} />
                            <Skeleton width={140} height={12} />
                        </span>
                    </div>
                    <Skeleton height={360} radius={12} />
                </div>
            )}

            {!loading && !selectedInstructor && (
                <EmptyState icon={<UserCheckIcon />} title="See anyone’s teaching week">
                    Search for an instructor to see every class they teach in {currentSemesterName || 'this term'}, with their office and office hours where they&rsquo;re posted. Handy before you swap into their section.
                </EmptyState>
            )}

            {!loading && selectedInstructor && instructorSections.length === 0 && (
                <EmptyState tone="neutral" icon={<UserCheckIcon />} title={`${displayName} isn’t teaching in ${currentSemesterName}`}>
                    No active sections list them this term. Try another spelling, or check Course history for past terms.
                </EmptyState>
            )}

            {!loading && selectedInstructor && instructorSections.length > 0 && (
                <article className={styles.result}>
                    <header className={styles.profile}>
                        <Avatar name={displayName.replace(',', '')} size={56} tone="solid" />
                        <div className={styles.profileText}>
                            <h2 className={styles.name}>{displayName}</h2>
                            <div className={styles.facts}>
                                <Badge>{instructorSections.length} {instructorSections.length === 1 ? 'section' : 'sections'}</Badge>
                                <Badge>{courseCount} {courseCount === 1 ? 'course' : 'courses'}</Badge>
                                <Badge tone={hasOfficeHours ? 'accent' : 'neutral'} icon={<ClockIcon />}>
                                    {hasOfficeHours ? 'Office hours posted' : 'No office hours posted'}
                                </Badge>
                                {officeLocation && (
                                    <span className={styles.office}>Office <RoomLink room={officeLocation} /></span>
                                )}
                            </div>
                        </div>
                    </header>

                    <div className={styles.gridWrap}>
                        <WeekGrid
                            days={days}
                            startHour={startHour}
                            endHour={endHour}
                            blocks={[...officeSegments, ...classBlocks]}
                        />
                    </div>

                    <div className={styles.notes}>
                        <Callout tone="neutral" icon={<InfoIcon />}>
                            {hasOfficeHours
                                ? <>The week shows classes and office hours only. Meetings and other commitments aren&rsquo;t listed.</>
                                : <>The week shows class times only. No office hours are posted for them, and meetings aren&rsquo;t listed.</>}
                            {officeHours && (
                                <> Office details come from{' '}
                                    <a href={FIND_MY_PROF_URL} target="_blank" rel="noopener noreferrer" className={styles.credit}>
                                        Find My Prof <ExternalIcon />
                                    </a>.
                                </>
                            )}
                        </Callout>
                    </div>

                    <ul className={styles.sections}>
                        {sortedSections.map(sec => {
                            const seats = seatStatus(sec);
                            const meetings = parseClassTime(sec.class_time);
                            return (
                                <li key={sec.crn} className={styles.sectionRow}>
                                    <CourseSwatch courseId={sec.course_id} />
                                    <span className={styles.sectionMain}>
                                        <span className={styles.sectionName}>{courseData[sec.course_id] || sec.course_id}</span>
                                        <span className={styles.sectionMeta}>
                                            <span className={styles.mono}>{sec.course_id}</span>
                                            <span>{meetings.length ? `${[...new Set(meetings.map(m => m.day))].join('/')} ${formatTime(meetings[0].start)}` : 'No set time'}</span>
                                            {sec.location && <RoomLink room={sec.location} className={styles.room} />}
                                        </span>
                                    </span>
                                    <span className={styles.sectionSide}>
                                        <Ticket size="sm" label="Sec" section={sec.section_num} />
                                        <span className={styles.crn}>CRN {sec.crn}</span>
                                        {seats && (
                                            <Badge size="sm" dot tone={seats.tone === 'open' ? 'success' : seats.tone === 'low' ? 'warning' : 'neutral'} title={seats.title}>
                                                {seats.label}
                                            </Badge>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </article>
            )}
        </div>
    );
}
