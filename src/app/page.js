'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { campusFilter } from '@/lib/campus';
import { seatStatus } from '@/lib/seats';
import { useSemester } from '@/lib/SemesterContext';
import { useRequireProfile } from '@/lib/useRequireProfile';
import useUnreadCount from '@/lib/useUnreadCount';
import { refuse, SIGN_UP_HREF } from '@/lib/guest';
import { parseClassTime, formatDuration, formatClock24, WEEKDAY_KEYS } from '@/lib/classTime';
import PageShell from '@/components/PageShell';
import AnnouncementsModal from '@/components/AnnouncementsModal';
import RoomLink from '@/components/RoomLink';
import DayTimeline from '@/components/DayTimeline/DayTimeline';
import {
    Button, Callout, CourseCode, CourseMark, CourseName, EmptyState, Figure, Rubric, Section, SegmentedControl, Skeleton, Status,
} from '@/components/ui';
import { ChevronDownIcon } from '@/components/Icons';
import { decodeHtmlEntities } from '@/lib/text';
import styles from './page.module.css';

const PROFILE_FIELDS = ['name', 'student_id', 'phone', 'major', 'gender'];

// class_time is one string holding both halves, e.g. "Mon/Wed 15:30-16:45".
// Split it so the days can be styled apart from the clock range; anything that
// doesn't match the expected shape is shown verbatim rather than dropped.
function splitClassTime(classTime) {
    const str = (classTime || '').trim();
    if (!str) return { days: '', time: '' };
    const m = str.match(/^(.+?)\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?\s*-\s*\d{1,2}:\d{2}(?:\s*[AP]M)?)$/i);
    if (!m) return { days: '', time: str };
    return { days: m[1].trim(), time: m[2].replace(/\s*-\s*/, '–') };
}

// Trailing letters mark a lab or tutorial attached to a lecture section — except
// A and E, which are language indicators on the lecture itself. Same rule the
// schedule builder uses, so the two pages label sections identically.
function sectionKind(sectionNum) {
    const suffix = (sectionNum || '').match(/[A-Za-z]+$/);
    if (!suffix) return null;
    const first = suffix[0][0].toUpperCase();
    if ((first === 'A' || first === 'E') && suffix[0].length === 1) return null;
    return sectionNum.toUpperCase().endsWith('T') ? 'Tutorial' : 'Lab';
}

const KIND_LABELS = { major: 'Department', support: 'Support', univ: 'University' };
const DAY_NAMES = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };

function greetingFor(date) {
    const h = date.getHours();
    if (h < 5) return 'Good evening';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function localDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Home: the day sheet. The date set large with the term's weeks under it,
 * today's classes in order with the live line, the few numbers that need
 * you, then electives as a catalogue and an index of where to go.
 */
export default function DashboardPage() {
    const { user, profile, ready, transitioning } = useRequireProfile();
    // A guest has a major and a campus but no account (see lib/guest).
    const isGuest = !!profile?.isGuest;
    const { semesters, selectedTerm } = useSemester();

    // Group A: user-scoped, runs once profile is ready
    const [majorCourses, setMajorCourses] = useState(null); // [{course_id, course_name, category, credit_hours}]
    const [univElectives, setUnivElectives] = useState(null); // [{course_id, course_name, university_elective_basket}]

    // Elective category filter (All / Department / University)
    const [electiveFilter, setElectiveFilter] = useState('all');
    // Which elective rows have their section list expanded. A Set rather than a
    // single id: picking an elective means comparing times across courses, so
    // opening one must not collapse the one you were comparing it against.
    const [openElectives, setOpenElectives] = useState(() => new Set());

    const toggleElective = (key) => {
        setOpenElectives(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    // Group B: term-scoped, refires on selectedTerm change
    const [termLoading, setTermLoading] = useState(true);
    const [activePostsCount, setActivePostsCount] = useState(0);
    const [pendingMatchesCount, setPendingMatchesCount] = useState(0);
    const [savedSchedules, setSavedSchedules] = useState([]);
    const [latestScheduleCredits, setLatestScheduleCredits] = useState(null);
    const [termSections, setTermSections] = useState([]); // sections for elective courses in selected term

    useEffect(() => {
        if (!ready || !profile?.major) return;
        const supabase = createClient();

        (async () => {
            const [{ data: mcRows }, { data: univRows }] = await Promise.all([
                supabase
                    .from('major_courses')
                    .select('course_id, category, courses(course_id, course_name)')
                    .eq('major_code', profile.major),
                supabase
                    .from('courses')
                    .select('course_id, course_name, university_elective_basket, restricted_majors')
                    .not('university_elective_basket', 'is', null),
            ]);

            const flat = (mcRows || []).map(r => ({
                course_id: r.course_id,
                category: r.category,
                course_name: r.courses?.course_name || '',
            }));
            setMajorCourses(flat);
            // Basket electives are shared with all majors unless restricted_majors limits them.
            const visibleUniv = (univRows || []).filter(c => {
                const r = c.restricted_majors;
                if (!r || r.length === 0) return true;
                return r.includes(profile.major);
            });
            setUnivElectives(visibleUniv);
        })();
    }, [ready, profile?.major]);

    useEffect(() => {
        if (!ready || !selectedTerm || !majorCourses || !univElectives) return;
        const supabase = createClient();
        let cancelled = false;

        setTermLoading(true);

        const campusFilterFor = campusFilter(profile?.gender);

        const courseIds = Array.from(new Set([
            ...majorCourses.map(mc => mc.course_id),
            ...univElectives.map(c => c.course_id),
        ]));

        // A guest owns no posts, matches or saved schedules.
        const none = Promise.resolve({ data: [], count: 0 });

        (async () => {
            const [postsRes, matchesRes, schedRes, sectionsRes] = await Promise.all([
                !user ? none : supabase
                    .from('posts')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .in('status', ['active', 'pending'])
                    .gt('expires_at', new Date().toISOString()),
                !user ? none : supabase
                    .from('match_participants')
                    .select('match_id, matches!inner(status, term_code)', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('matches.status', 'pending')
                    .eq('matches.term_code', selectedTerm),
                !user ? none : supabase
                    .from('saved_schedules')
                    .select('id, created_at, schedule_data')
                    .eq('user_id', user.id)
                    .eq('term_code', selectedTerm)
                    .order('created_at', { ascending: false }),
                courseIds.length > 0
                    ? supabase
                        .from('sections')
                        .select('course_id, section_num, crn, class_time, instructor, location, campus, term_code, seats_available, max_enrollment')
                        .in('course_id', courseIds)
                        .or(campusFilterFor).eq('is_active', true)
                        .eq('term_code', selectedTerm)
                        .order('section_num')
                    : Promise.resolve({ data: [] }),
            ]);

            if (cancelled) return;
            setActivePostsCount(postsRes?.count ?? 0);
            setPendingMatchesCount(matchesRes?.count ?? 0);
            setSavedSchedules(schedRes?.data || []);
            setTermSections(sectionsRes?.data || []);
            setTermLoading(false);
        })();

        return () => { cancelled = true; };
    }, [ready, user, selectedTerm, majorCourses, univElectives, profile?.gender]);

    // Total credit hours in the most recently saved schedule
    useEffect(() => {
        const latest = savedSchedules[0];
        if (!latest) { setLatestScheduleCredits(null); return; }
        const courses = latest.schedule_data?.selectedCourses || [];
        const realIds = courses
            .map(c => c.course_id)
            .filter(id => id && !String(id).startsWith('BASKET_'));
        if (realIds.length === 0) { setLatestScheduleCredits(0); return; }

        const supabase = createClient();
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('courses')
                .select('course_id, credit_hours')
                .in('course_id', realIds);
            if (cancelled) return;
            const total = (data || []).reduce((s, r) => s + (r.credit_hours || 0), 0);
            setLatestScheduleCredits(total);
        })();
        return () => { cancelled = true; };
    }, [savedSchedules]);

    // Sections offered this term, grouped by course. The section count on each
    // elective row is this list's length, so the badge and the expanded list can
    // never disagree.
    const sectionsByCourse = useMemo(() => {
        const map = {};
        for (const sec of termSections) {
            (map[sec.course_id] ||= []).push(sec);
        }
        for (const list of Object.values(map)) {
            list.sort((a, b) => (a.section_num || '').localeCompare(b.section_num || ''));
        }
        return map;
    }, [termSections]);

    // Unified elective rows (dept + university baskets), only offered courses
    const electiveRows = useMemo(() => {
        if (!majorCourses || !univElectives) return [];

        const dept = majorCourses
            .filter(mc => mc.category === 'Major Elective' || mc.category === 'Support Elective')
            .map(mc => ({
                course_id: mc.course_id,
                course_name: mc.course_name,
                kind: 'dept',
                tag: mc.category === 'Support Elective' ? 'support' : 'major',
                section_count: (sectionsByCourse[mc.course_id] || []).length,
            }));

        const univ = univElectives.map(c => ({
            course_id: c.course_id,
            course_name: c.course_name || '',
            kind: 'univ',
            tag: 'univ',
            section_count: (sectionsByCourse[c.course_id] || []).length,
        }));

        return [...dept, ...univ]
            .filter(r => r.section_count > 0)
            .sort((a, b) => a.course_id.localeCompare(b.course_id));
    }, [majorCourses, univElectives, sectionsByCourse]);

    const filteredElectiveRows = useMemo(() => {
        if (electiveFilter === 'all') return electiveRows;
        return electiveRows.filter(r => r.kind === electiveFilter);
    }, [electiveRows, electiveFilter]);

    const electiveCounts = useMemo(() => ({
        all: electiveRows.length,
        dept: electiveRows.filter(r => r.kind === 'dept').length,
        univ: electiveRows.filter(r => r.kind === 'univ').length,
    }), [electiveRows]);

    const profileCompletion = useMemo(() => {
        if (!profile) return { pct: 0, filled: 0, total: PROFILE_FIELDS.length };
        const filled = PROFILE_FIELDS.filter(f => profile[f]).length;
        return { pct: Math.round((filled / PROFILE_FIELDS.length) * 100), filled, total: PROFILE_FIELDS.length };
    }, [profile]);

    const firstName = (profile?.name || '').trim().split(/\s+/)[0] || 'there';
    const currentSemesterName = semesters.find(s => s.term_code === selectedTerm)?.name || '';
    const showProfileBanner = ready && profile && !isGuest && profileCompletion.pct < 100;

    const unreadAll = useUnreadCount('all');

    // The clock, worked out on the client after mount (so the server's never
    // disagrees with the student's) and ticked each minute for the timeline.
    const [now, setNow] = useState(null);
    useEffect(() => {
        setNow(new Date());
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, []);

    // The week of classes in the most recently saved schedule, for "Today".
    const [week, setWeek] = useState({ loading: true, slots: [], hasSchedule: false });
    useEffect(() => {
        if (termLoading) return undefined;
        const latest = savedSchedules[0];
        const crns = (latest?.schedule_data?.courseGroups || []).flatMap(g => g.sections || []);
        if (!latest || crns.length === 0) {
            setWeek({ loading: false, slots: [], hasSchedule: !!latest });
            return undefined;
        }
        const supabase = createClient();
        let cancelled = false;
        (async () => {
            const { data: secs } = await supabase
                .from('sections')
                .select('crn, course_id, section_num, class_time, location')
                .in('crn', crns)
                .eq('term_code', selectedTerm);
            const ids = [...new Set((secs || []).map(s => s.course_id))];
            const { data: names } = ids.length
                ? await supabase.from('courses').select('course_id, course_name').in('course_id', ids)
                : { data: [] };
            if (cancelled) return;
            const nameOf = Object.fromEntries((names || []).map(c => [c.course_id, decodeHtmlEntities(c.course_name)]));
            const slots = (secs || []).flatMap(s => parseClassTime(s.class_time).map(slot => ({
                ...slot,
                courseId: s.course_id,
                courseName: nameOf[s.course_id] || '',
                sectionNum: s.section_num,
                location: s.location,
            })));
            setWeek({ loading: false, slots, hasSchedule: true });
        })();
        return () => { cancelled = true; };
    }, [termLoading, savedSchedules, selectedTerm]);

    const term = semesters.find(s => s.term_code === selectedTerm);
    const termProgress = useMemo(() => {
        if (!now || !term?.classes_start || !term?.classes_end) return null;
        const start = new Date(term.classes_start);
        const end = new Date(term.classes_end);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
        const DAY = 86400000;
        if (now < start) return { state: 'before', days: Math.max(1, Math.ceil((start - now) / DAY)) };
        if (now > new Date(end.getTime() + DAY)) return { state: 'after' };
        const weeks = Math.max(1, Math.ceil((end - start + DAY) / (7 * DAY)));
        const weekNo = Math.min(weeks, Math.floor((now - start) / (7 * DAY)) + 1);
        return { state: 'during', week: weekNo, weeks, pct: Math.round(((now - start) / (end - start + DAY)) * 100) };
    }, [now, term]);

    const todayKey = now ? WEEKDAY_KEYS[now.getDay()] : null;
    const nowMin = now ? now.getHours() * 60 + now.getMinutes() : null;
    const isHoliday = !!(now && (term?.no_class_dates || []).includes(localDateKey(now)));
    const todaySlots = week.slots.filter(s => s.day === todayKey).sort((a, b) => a.start - b.start);
    const liveSlot = todaySlots.find(s => s.start <= nowMin && nowMin < s.end);
    const nextSlot = todaySlots.find(s => s.start > nowMin);
    const dayDone = todaySlots.length > 0 && !liveSlot && !nextSlot;

    // The next day this week (Sun–Thu order) that has classes.
    const nextClassDay = useMemo(() => {
        if (!todayKey || week.slots.length === 0) return null;
        const order = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const from = order.indexOf(todayKey);
        for (let i = 1; i <= 7; i++) {
            const d = order[(from + i) % 7];
            const first = week.slots.filter(s => s.day === d).sort((a, b) => a.start - b.start)[0];
            if (first) return { day: d, first };
        }
        return null;
    }, [todayKey, week.slots]);

    const weekday = now ? now.toLocaleDateString(undefined, { weekday: 'long' }) : '';
    const dayMonth = now ? now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : '';

    let statusLine = null;
    if (ready && isGuest) {
        statusLine = <>You&rsquo;re looking around as a guest. Build a timetable and find your way on campus; <Link href={SIGN_UP_HREF}>make an account</Link> to trade sections.</>;
    } else if (ready && !termLoading) {
        if (pendingMatchesCount > 0) {
            statusLine = <><Link href="/matches" className={styles.statusMark}>{pendingMatchesCount === 1 ? 'A swap is' : `${pendingMatchesCount} swaps are`} waiting for your answer.</Link></>;
        } else if (activePostsCount > 0) {
            statusLine = <>{activePostsCount === 1 ? 'Your post is' : `${activePostsCount} of your posts are`} on the board. We&rsquo;ll tell you when {activePostsCount === 1 ? 'it matches' : 'one matches'}.</>;
        } else {
            statusLine = 'Nothing needs you. Plan the term, or see what’s on the board.';
        }
    }

    const electivesLoading = !majorCourses || !univElectives || termLoading;

    // ===== Today =====
    const classRow = (s, i) => {
        const past = nowMin != null && s.end <= nowMin;
        const live = nowMin != null && s.start <= nowMin && nowMin < s.end;
        const next = !live && nextSlot && s === nextSlot;
        return (
            <li key={`${s.courseId}-${s.start}-${i}`} className={`${styles.class} ${past ? styles.classPast : ''} ${live ? styles.classLive : ''}`}>
                <span className={styles.classTime}>
                    <span>{formatClock24(s.start)}</span>
                    <span className={styles.classEnd}>{formatClock24(s.end)}</span>
                </span>
                <span className={styles.classMain}>
                    <span className={styles.classCode}>
                        <CourseMark courseId={s.courseId} size="sm" />
                        <CourseCode id={s.courseId} size="sm" />
                        {s.sectionNum && <Section value={s.sectionNum} size="sm" tone="mine" />}
                    </span>
                    <CourseName size="md" className={styles.className}>{s.courseName || s.courseId}</CourseName>
                </span>
                <span className={styles.classSide}>
                    {live && <Status tone="go" live>Now</Status>}
                    {next && <span className={styles.classIn}>in {formatDuration(s.start - nowMin)}</span>}
                    {s.location && <RoomLink room={s.location} className={styles.classRoom} />}
                </span>
            </li>
        );
    };

    let today;
    if (!ready || !now || (!isGuest && (termLoading || week.loading))) {
        today = (
            <div className={styles.todaySkeleton} aria-hidden="true">
                {[0, 1, 2].map(i => <Skeleton key={i} height={44} />)}
            </div>
        );
    } else if (isGuest || !week.hasSchedule) {
        today = (
            <EmptyState
                title="Your day will be set out here."
                actions={<Button variant="link" href="/schedule">Build your schedule →</Button>}
            >
                {isGuest
                    ? 'Build a timetable to see how your week fits. With an account it’s saved, and each day’s classes appear here with where to go next.'
                    : 'Save a schedule and each day’s classes appear here, in order, with the room you need to be in.'}
            </EmptyState>
        );
    } else if (termProgress?.state === 'before') {
        today = (
            <>
                <EmptyState compact title={`Classes start in ${termProgress.days} ${termProgress.days === 1 ? 'day' : 'days'}.`}>
                    Your saved schedule is ready. Here&rsquo;s {nextClassDay ? DAY_NAMES[nextClassDay.day] : 'your first day'}:
                </EmptyState>
                {nextClassDay && (
                    <ol className={styles.classes}>
                        {week.slots.filter(s => s.day === nextClassDay.day).sort((a, b) => a.start - b.start).map(classRow)}
                    </ol>
                )}
            </>
        );
    } else if (isHoliday || todaySlots.length === 0) {
        today = (
            <EmptyState compact title={isHoliday ? 'No classes today. It’s a day off.' : 'No classes today.'}>
                {nextClassDay ? (
                    <>Next: <strong>{nextClassDay.first.courseName || nextClassDay.first.courseId}</strong>, {DAY_NAMES[nextClassDay.day]} at {formatClock24(nextClassDay.first.start)}
                        {nextClassDay.first.location ? <> in <RoomLink room={nextClassDay.first.location} /></> : null}.</>
                ) : 'Nothing else on this week.'}
            </EmptyState>
        );
    } else {
        today = (
            <>
                <DayTimeline slots={todaySlots} now={nowMin} className={styles.ruler} />
                <ol className={styles.classes}>{todaySlots.map(classRow)}</ol>
                {dayDone && (
                    <p className={styles.dayDone}>
                        That&rsquo;s the day done.{nextClassDay ? ` Next: ${DAY_NAMES[nextClassDay.day]} at ${formatClock24(nextClassDay.first.start)}.` : ''}
                    </p>
                )}
            </>
        );
    }

    const figure = (href, value, of, label, tone) => (
        <Link href={href} className={styles.figureLink}>
            {termLoading ? <Skeleton width={48} height={34} /> : <Figure value={value} of={of} label={label} tone={tone} />}
        </Link>
    );

    return (
        <PageShell width="wide">
            <AnnouncementsModal ready={ready && !!user} />
            <div className={`${styles.transitionOverlay} ${transitioning ? styles.active : ''}`} />

            <div className={styles.top}>
                {/* ===== The date ===== */}
                <section className={styles.date} aria-labelledby="home-date">
                    <span className={styles.weekday}>{weekday || ' '}</span>
                    <h1 id="home-date" className={styles.dayMonth}>
                        {dayMonth || <Skeleton width={260} height={52} />}
                    </h1>
                    <div className={styles.termLine}>
                        {currentSemesterName && <span>{currentSemesterName}</span>}
                        {termProgress?.state === 'during' && <span>Week {termProgress.week} of {termProgress.weeks}</span>}
                        {termProgress?.state === 'before' && <span>Starts in {termProgress.days} {termProgress.days === 1 ? 'day' : 'days'}</span>}
                        {termProgress?.state === 'after' && <span>Finished</span>}
                    </div>
                    {termProgress?.state === 'during' && (
                        <div className={styles.weeks} role="img" aria-label={`Week ${termProgress.week} of ${termProgress.weeks}`}>
                            {Array.from({ length: termProgress.weeks }, (_, i) => (
                                <span key={i} className={`${styles.weekCell} ${i + 1 < termProgress.week ? styles.weekPast : ''} ${i + 1 === termProgress.week ? styles.weekNow : ''}`} />
                            ))}
                        </div>
                    )}

                    <p className={styles.greeting}>
                        {!ready || !now ? <Skeleton width={220} height={20} /> : isGuest ? 'Welcome to CourseMate.' : `${greetingFor(now)}, ${firstName}.`}
                    </p>
                    <p className={styles.status}>{statusLine || <Skeleton width="80%" height={14} />}</p>
                </section>

                {/* ===== Today ===== */}
                <section className={styles.today} aria-labelledby="home-today">
                    <Rubric
                        id="home-today"
                        title={termProgress?.state === 'before' && nextClassDay ? `${DAY_NAMES[nextClassDay.day]}, your first day` : 'Today'}
                        meta={todaySlots.length > 0 && !isHoliday && termProgress?.state !== 'before' ? `${todaySlots.length} ${todaySlots.length === 1 ? 'class' : 'classes'}` : null}
                        actions={week.hasSchedule && <Button variant="link" href="/schedule" className={styles.rubricLink}>Full week</Button>}
                    />
                    {today}
                </section>
            </div>

            {showProfileBanner && (
                <Callout
                    tone="accent"
                    title="Finish your profile to trade sections"
                    action={<Button size="sm" variant="secondary" href="/profile">Add the rest</Button>}
                >
                    {profileCompletion.filled} of {profileCompletion.total} details added. Posting and matching need all of them.
                </Callout>
            )}

            {/* ===== What's waiting ===== */}
            {isGuest ? (
                <section className={styles.guest} aria-label="Accounts">
                    <p className={styles.guestText}>
                        <strong>An account adds the trading.</strong> Post a section and get matched automatically, keep up to three schedules, and hear when a section you want opens up.
                    </p>
                    <Button variant="primary" href={SIGN_UP_HREF}>Make an account</Button>
                </section>
            ) : (
                <nav className={styles.figures} aria-label="Your numbers">
                    {figure('/matches', pendingMatchesCount, null, pendingMatchesCount === 1 ? 'swap to answer' : 'swaps to answer', pendingMatchesCount > 0 ? 'warn' : 'muted')}
                    {figure('/matches', activePostsCount, 5, 'posts on the board')}
                    {figure('/schedule', savedSchedules.length, 3, savedSchedules[0] ? `schedules · ${latestScheduleCredits ?? '–'} credits in the latest` : 'schedules saved')}
                    <Link href="/notifications" className={styles.figureLink}>
                        <Figure value={unreadAll} label="unread notifications" tone={unreadAll > 0 ? 'ink' : 'muted'} />
                    </Link>
                </nav>
            )}

            <div className={styles.lower}>
                {/* ===== Electives ===== */}
                <section className={styles.electives} aria-labelledby="home-electives">
                    <Rubric
                        id="home-electives"
                        title="Electives open this term"
                        meta={electivesLoading ? null : electiveRows.length}
                        description={`Department and university electives with sections on your campus in ${currentSemesterName || 'this term'}. Open one to compare its sections.`}
                    />
                    {!electivesLoading && electiveRows.length > 0 && (
                        <SegmentedControl
                            size="sm"
                            label="Kind of elective"
                            className={styles.electiveFilter}
                            value={electiveFilter}
                            onChange={setElectiveFilter}
                            options={[
                                { value: 'all', label: 'All', count: electiveCounts.all },
                                { value: 'dept', label: 'Department', count: electiveCounts.dept, disabled: electiveCounts.dept === 0 },
                                { value: 'univ', label: 'University', count: electiveCounts.univ, disabled: electiveCounts.univ === 0 },
                            ]}
                        />
                    )}

                    {electivesLoading ? (
                        <div className={styles.electiveSkeleton} aria-hidden="true">
                            {[0, 1, 2, 3].map(i => <Skeleton key={i} height={38} />)}
                        </div>
                    ) : electiveRows.length === 0 ? (
                        <EmptyState compact title="No electives open this term.">
                            None of your major&rsquo;s electives have sections on your campus in {currentSemesterName || 'this term'}. Try another term from the app bar.
                        </EmptyState>
                    ) : filteredElectiveRows.length === 0 ? (
                        <EmptyState compact title="None of this kind this term." />
                    ) : (
                        <ol className={styles.electiveList}>
                            {filteredElectiveRows.map(row => {
                                const key = `${row.kind}-${row.course_id}`;
                                const isOpen = openElectives.has(key);
                                const panelId = `sections-${key}`;
                                const courseName = decodeHtmlEntities(row.course_name);
                                const courseLabel = courseName || row.course_id;
                                return (
                                    <li key={key} className={`${styles.elective} ${isOpen ? styles.electiveOpen : ''}`}>
                                        <div className={styles.electiveHead}>
                                            <button
                                                type="button"
                                                className={styles.electiveRow}
                                                onClick={() => toggleElective(key)}
                                                aria-expanded={isOpen}
                                                aria-controls={panelId}
                                            >
                                                <span className={styles.electiveCode}>
                                                    <CourseMark courseId={row.course_id} size="sm" />
                                                    <CourseCode id={row.course_id} size="sm" />
                                                </span>
                                                <CourseName className={styles.electiveName}>{courseName || 'Unnamed course'}</CourseName>
                                                <span className={styles.electiveKind}>{KIND_LABELS[row.tag]}</span>
                                                <span className={styles.electiveCount}>{row.section_count} {row.section_count === 1 ? 'section' : 'sections'}</span>
                                                <ChevronDownIcon className={styles.electiveChevron} />
                                            </button>
                                            <Link
                                                href={`/schedule?course=${encodeURIComponent(row.course_id)}`}
                                                className={styles.add}
                                                aria-label={`Add ${courseLabel} to your schedule`}
                                            >
                                                Add
                                            </Link>
                                        </div>

                                        {isOpen && (
                                            <ul id={panelId} className={styles.sections}>
                                                {(sectionsByCourse[row.course_id] || []).map(sec => {
                                                    const { days, time } = splitClassTime(sec.class_time);
                                                    const kind = sectionKind(sec.section_num);
                                                    const seats = seatStatus(sec);
                                                    return (
                                                        <li key={sec.crn || sec.section_num} className={styles.sectionRow}>
                                                            <span className={styles.sectionId}>
                                                                <Section value={sec.section_num} size="sm" />
                                                                {kind && <span className={styles.sectionKind}>{kind}</span>}
                                                            </span>
                                                            <span className={styles.sectionWhen}>
                                                                {days && <span className={styles.sectionDays}>{days.replace(/\//g, ' ')}</span>}
                                                                <span>{time || 'time not listed'}</span>
                                                            </span>
                                                            <span className={styles.sectionWho}>{decodeHtmlEntities((sec.instructor || '').trim()) || 'Staff'}</span>
                                                            <span className={styles.sectionRoom}>{sec.location && <RoomLink room={sec.location} />}</span>
                                                            <span className={styles.sectionSeats}>
                                                                {seats && <Status tone={seats.tone === 'open' ? 'go' : seats.tone === 'low' ? 'warn' : 'danger'} title={seats.title}>{seats.label}</Status>}
                                                            </span>
                                                            <span className={styles.sectionCrn}>{sec.crn}</span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </section>

                {/* ===== Where to go ===== */}
                <aside className={styles.side}>
                    <Link href="/map" className={styles.map} aria-label="Open the campus map">
                        <span className={styles.mapArt} aria-hidden="true" />
                        <span className={styles.mapCaption}>
                            <span className={styles.mapTitle}>Campus map</span>
                            <span className={styles.mapSub}>Every room on your schedule opens here →</span>
                        </span>
                    </Link>

                    <nav aria-labelledby="home-go">
                        <Rubric id="home-go" title="Go to" quiet />
                        <ul className={styles.go}>
                            {[
                                { href: '/post', label: 'Post a section', sub: 'Swap, give away or ask for one', locked: isGuest },
                                { href: '/schedule', label: 'Build a schedule', sub: `Clash-free timetables for ${currentSemesterName || 'the term'}` },
                                { href: '/browse', label: 'The board', sub: 'Sections up for trade in your major', locked: isGuest },
                                { href: '/schedule?mode=instructor', label: 'Find an instructor', sub: 'Anyone’s teaching week and office hours' },
                                { href: '/schedule?mode=history', label: 'Course history', sub: 'How a course ran in past terms' },
                            ].map(item => (
                                <li key={item.href}>
                                    {item.locked ? (
                                        <button type="button" className={`${styles.goItem} ${styles.goLocked}`} onClick={refuse} aria-disabled="true" aria-label={`${item.label}, needs an account`}>
                                            <span className={styles.goLabel}>{item.label}</span>
                                            <span className={styles.goSub}>Needs an account</span>
                                        </button>
                                    ) : (
                                        <Link href={item.href} className={styles.goItem}>
                                            <span className={styles.goLabel}>{item.label}</span>
                                            <span className={styles.goSub}>{item.sub}</span>
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </nav>
                </aside>
            </div>
        </PageShell>
    );
}
