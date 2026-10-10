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
import { parseClassTime, formatDuration, formatRange, formatTime, WEEKDAY_KEYS } from '@/lib/classTime';
import PageShell from '@/components/PageShell';
import SemesterPicker from '@/components/SemesterPicker';
import AnnouncementsModal from '@/components/AnnouncementsModal';
import RoomLink from '@/components/RoomLink';
import DayTimeline from '@/components/DayTimeline/DayTimeline';
import { Badge, Button, Callout, CountUp, CourseSwatch, EmptyState, ProgressBar, SegmentedControl, Skeleton } from '@/components/ui';
import {
    PlusIcon,
    ScheduleIcon,
    ActivityIcon,
    BookIcon,
    BellIcon,
    UserCheckIcon,
    SearchIcon,
    MapIcon,
    LockIcon,
    ArrowRightIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    PinIcon,
    LayersIcon,
    SparkleIcon,
    ClockIcon,
} from '@/components/Icons';
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

function relativeTime(iso) {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

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

// A home shortcut. A locked one (guest mode) stays visible but only nudges.
function ActionRow({ href, icon, label, sub, primary = false, locked = false }) {
    const body = (
        <>
            <span className={`${styles.actionIcon} ${primary ? styles.actionIconPrimary : ''}`}>{icon}</span>
            <span className={styles.actionText}>
                <span className={styles.actionLabel}>{label}</span>
                <span className={styles.actionSub}>{sub}</span>
            </span>
            {locked ? <LockIcon className={styles.actionEnd} /> : <ChevronRightIcon className={styles.actionEnd} />}
        </>
    );
    if (!locked) return <Link href={href} className={styles.action}>{body}</Link>;
    return (
        <button type="button" className={`${styles.action} ${styles.actionLocked}`} onClick={refuse} aria-disabled="true" aria-label={`${label}, needs an account`}>
            {body}
        </button>
    );
}

// One reading in the signals bar.
function Signal({ href, label, value, max, note, tone, icon, loading }) {
    return (
        <Link href={href} className={`${styles.signal} ${tone ? styles[`signal_${tone}`] : ''}`}>
            <span className={styles.signalTop}>
                <span className={styles.signalIcon}>{icon}</span>
                <span className={styles.signalLabel}>{label}</span>
                <ArrowRightIcon className={styles.signalArrow} />
            </span>
            {loading ? (
                <Skeleton width={56} height={30} radius={6} />
            ) : (
                <span className={styles.signalValue}>
                    <CountUp value={value} />
                    {max != null && <span className={styles.signalMax}>/ {max}</span>}
                </span>
            )}
            <span className={styles.signalNote}>{loading ? ' ' : note}</span>
        </Link>
    );
}

// The rows a loading electives list will be replaced by.
function ElectivesSkeleton() {
    return (
        <div className={styles.electiveList} aria-hidden="true">
            {[0, 1, 2, 3].map(i => (
                <div key={i} className={styles.electiveSkeletonRow}>
                    <Skeleton width={32} height={32} radius={9} />
                    <span className={styles.electiveSkeletonText}>
                        <Skeleton width={`${62 - i * 7}%`} height={13} />
                        <Skeleton width={120} height={10} />
                    </span>
                    <Skeleton width={72} height={30} radius={8} />
                </div>
            ))}
        </div>
    );
}

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

    const dateLabel = now ? now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : '';

    let statusLine = null;
    if (ready && isGuest) {
        statusLine = <>You&rsquo;re exploring as a guest. Build a timetable and find your way around campus; <Link href={SIGN_UP_HREF}>create an account</Link> to post swaps and get matched.</>;
    } else if (ready && !termLoading) {
        if (pendingMatchesCount > 0) {
            statusLine = <>You have <Link href="/matches">{pendingMatchesCount} swap {pendingMatchesCount === 1 ? 'match' : 'matches'}</Link> waiting for your answer.</>;
        } else if (activePostsCount > 0) {
            statusLine = <>{activePostsCount === 1 ? 'One of your posts is' : `${activePostsCount} of your posts are`} live. We&rsquo;ll tell you the moment {activePostsCount === 1 ? 'it matches' : 'one matches'}.</>;
        } else {
            statusLine = 'Plan your term, trade sections and find your way around campus.';
        }
    }

    const electivesLoading = !majorCourses || !univElectives || termLoading;

    // ===== Today panel content =====
    let today;
    if (!ready || !now || (!isGuest && (termLoading || week.loading))) {
        today = (
            <div className={styles.todayBody}>
                <Skeleton width="60%" height={14} style={{ opacity: 0.4 }} />
                <Skeleton height={44} radius={10} style={{ opacity: 0.25 }} />
            </div>
        );
    } else if (isGuest || !week.hasSchedule) {
        today = (
            <div className={styles.todayEmpty}>
                <p className={styles.todayEmptyTitle}>Your day will live here</p>
                <p className={styles.todayEmptyText}>
                    {isGuest
                        ? 'Build a timetable to see how your week fits together. Create an account to keep it, and today’s classes show up right here.'
                        : 'Save a schedule and today’s classes appear here, with where you need to be next.'}
                </p>
                <Link href="/schedule" className={styles.todayCta}>
                    <ScheduleIcon />
                    Build your schedule
                </Link>
            </div>
        );
    } else if (termProgress?.state === 'before') {
        today = (
            <div className={styles.todayEmpty}>
                <p className={styles.todayEmptyTitle}>Classes start in {termProgress.days} {termProgress.days === 1 ? 'day' : 'days'}</p>
                <p className={styles.todayEmptyText}>Your saved schedule is ready. Here&rsquo;s how {nextClassDay ? DAY_NAMES[nextClassDay.day] : 'your first day'} will look:</p>
                {nextClassDay && <DayTimeline tone="forest" slots={week.slots.filter(s => s.day === nextClassDay.day)} />}
            </div>
        );
    } else if (isHoliday || todaySlots.length === 0) {
        today = (
            <div className={styles.todayEmpty}>
                <p className={styles.todayEmptyTitle}>{isHoliday ? 'No classes today — it’s a day off' : 'No classes today'}</p>
                {nextClassDay ? (
                    <p className={styles.todayEmptyText}>
                        Next up: <strong>{nextClassDay.first.courseName || nextClassDay.first.courseId}</strong> on {DAY_NAMES[nextClassDay.day]} at {formatTime(nextClassDay.first.start)}
                        {nextClassDay.first.location ? <> in <RoomLink room={nextClassDay.first.location} className={styles.todayRoom} /></> : null}.
                    </p>
                ) : (
                    <p className={styles.todayEmptyText}>Enjoy the free time.</p>
                )}
            </div>
        );
    } else {
        const focus = liveSlot || nextSlot;
        today = (
            <div className={styles.todayBody}>
                <DayTimeline tone="forest" slots={todaySlots} now={nowMin} />
                {focus ? (
                    <div className={styles.upNext}>
                        <span className={`${styles.upNextTag} ${liveSlot ? styles.upNextLive : ''}`}>
                            {liveSlot ? 'Now' : 'Next'}
                        </span>
                        <CourseSwatch courseId={focus.courseId} size="sm" />
                        <span className={styles.upNextText}>
                            <span className={styles.upNextName}>{focus.courseName || focus.courseId}</span>
                            <span className={styles.upNextMeta}>
                                {formatRange(focus.start, focus.end)}
                                {!liveSlot && ` · in ${formatDuration(focus.start - nowMin)}`}
                            </span>
                        </span>
                        {focus.location && <RoomLink room={focus.location} className={styles.upNextRoom} />}
                    </div>
                ) : dayDone ? (
                    <div className={styles.upNext}>
                        <span className={styles.upNextTag}>Done</span>
                        <span className={styles.upNextText}>
                            <span className={styles.upNextName}>That&rsquo;s it for today</span>
                            <span className={styles.upNextMeta}>
                                {nextClassDay ? `Next: ${DAY_NAMES[nextClassDay.day]} at ${formatTime(nextClassDay.first.start)}` : 'Nothing else this week'}
                            </span>
                        </span>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <PageShell width="wide">
            <AnnouncementsModal ready={ready && !!user} />
            <div className={`${styles.transitionOverlay} ${transitioning ? styles.active : ''}`} />

            {/* ===== Today ===== */}
            <section className={styles.hero} aria-labelledby="home-greeting">
                <div className={styles.heroMain}>
                    <span className={styles.heroEyebrow}>
                        {dateLabel || ' '}
                        {currentSemesterName && (
                            <>
                                <span className={styles.heroDot} aria-hidden="true" />
                                {currentSemesterName}
                            </>
                        )}
                    </span>
                    <h1 id="home-greeting" className={styles.heroTitle}>
                        {!ready || !now ? (
                            <Skeleton width="min(320px, 70vw)" height={36} radius={8} style={{ opacity: 0.3 }} />
                        ) : isGuest ? (
                            <>Welcome to <span className={styles.heroName}>CourseMate</span></>
                        ) : (
                            <>{greetingFor(now)},<br className={styles.heroBreak} /> <span className={styles.heroName}>{firstName}</span></>
                        )}
                    </h1>
                    <p className={styles.heroStatus}>
                        {statusLine || <Skeleton width="min(380px, 80vw)" height={14} style={{ opacity: 0.3 }} />}
                    </p>

                    <div className={styles.heroFoot}>
                        {termProgress?.state === 'during' && (
                            <div className={styles.term}>
                                <span className={styles.termLabel}>
                                    Week <strong>{termProgress.week}</strong> of {termProgress.weeks}
                                </span>
                                <span className={styles.termTrack} aria-hidden="true">
                                    <span className={styles.termFill} style={{ width: `${termProgress.pct}%` }} />
                                </span>
                            </div>
                        )}
                        {termProgress?.state === 'after' && <span className={styles.termLabel}>{currentSemesterName} has finished</span>}
                        <div className={styles.heroPicker}>
                            <SemesterPicker />
                        </div>
                    </div>
                </div>

                <div className={styles.today}>
                    <div className={styles.todayHead}>
                        <span className={styles.todayTitle}>
                            <ClockIcon />
                            Today
                        </span>
                        {todaySlots.length > 0 && !isHoliday && (
                            <span className={styles.todayCount}>{todaySlots.length} {todaySlots.length === 1 ? 'class' : 'classes'}</span>
                        )}
                    </div>
                    {today}
                </div>
            </section>

            {/* ===== Profile completeness (only if incomplete) ===== */}
            {showProfileBanner && (
                <Callout
                    tone="accent"
                    title="Finish setting up your profile"
                    action={<Button size="sm" variant="primary" href="/profile">Complete profile</Button>}
                >
                    <span className={styles.profileNote}>
                        {profileCompletion.filled} of {profileCompletion.total} details added. Posting and matching need all of them.
                    </span>
                    <ProgressBar value={profileCompletion.pct} className={styles.profileProgress} label="Profile completion" />
                </Callout>
            )}

            {/* ===== Signals ===== */}
            {isGuest ? (
                <div className={styles.guestStrip}>
                    <span className={styles.guestStripIcon}><SparkleIcon /></span>
                    <div className={styles.guestStripText}>
                        <strong>Get the full CourseMate</strong>
                        <span>Post swaps and get matched automatically, save up to three schedules, and get alerts when a section opens.</span>
                    </div>
                    <Button variant="primary" href={SIGN_UP_HREF}>Create a free account</Button>
                </div>
            ) : (
                <nav className={styles.signals} aria-label="Your activity">
                    <Signal
                        href="/matches"
                        icon={<ActivityIcon />}
                        label="Pending matches"
                        value={pendingMatchesCount}
                        note={pendingMatchesCount > 0 ? 'Waiting for your answer' : 'Nothing to answer'}
                        tone={pendingMatchesCount > 0 ? 'alert' : null}
                        loading={termLoading}
                    />
                    <Signal
                        href="/matches"
                        icon={<LayersIcon />}
                        label="Active posts"
                        value={activePostsCount}
                        max={5}
                        note={activePostsCount >= 5 ? 'At the limit' : `${5 - activePostsCount} more allowed`}
                        loading={termLoading}
                    />
                    <Signal
                        href="/schedule"
                        icon={<ScheduleIcon />}
                        label="Saved schedules"
                        value={savedSchedules.length}
                        max={3}
                        note={savedSchedules[0]
                            ? `${latestScheduleCredits ?? '–'} credits · saved ${relativeTime(savedSchedules[0].created_at)}`
                            : 'None saved this term'}
                        loading={termLoading}
                    />
                    <Signal
                        href="/notifications"
                        icon={<BellIcon />}
                        label="Unread"
                        value={unreadAll}
                        note={unreadAll > 0 ? 'Notifications to read' : 'You’re all caught up'}
                        tone={unreadAll > 0 ? 'accent' : null}
                        loading={false}
                    />
                </nav>
            )}

            {/* ===== Map + start something ===== */}
            <div className={styles.overview}>
                <Link href="/map" className={styles.mapCard} aria-label="Open the campus map">
                    <span className={styles.mapArt} aria-hidden="true" />
                    <span className={styles.mapShade} aria-hidden="true" />
                    <span className={styles.mapChip}>
                        <MapIcon />
                        Campus map
                    </span>
                    <span className={styles.mapFooter}>
                        <span className={styles.mapText}>
                            <span className={styles.mapTitle}>Find any building, room or coffee spot</span>
                            <span className={styles.mapSub}>
                                <PinIcon />
                                Every room on your schedule links straight here
                            </span>
                        </span>
                        <span className={styles.mapCta}>
                            Open map
                            <ArrowRightIcon />
                        </span>
                    </span>
                </Link>

                <section className={styles.actions} aria-labelledby="home-start">
                    <h2 id="home-start" className={styles.panelTitle}>Start something</h2>
                    <div className={styles.actionList}>
                        <ActionRow
                            primary
                            href="/post"
                            icon={<PlusIcon strokeWidth={2.1} />}
                            label="Create a post"
                            sub="Swap, give away or request a section"
                            locked={isGuest}
                        />
                        <ActionRow
                            href="/schedule"
                            icon={<ScheduleIcon />}
                            label="Build a schedule"
                            sub={`Clash-free timetables for ${currentSemesterName || 'the term'}`}
                        />
                        <ActionRow
                            href="/browse"
                            icon={<SearchIcon />}
                            label="Browse the marketplace"
                            sub="Sections up for grabs in your major"
                            locked={isGuest}
                        />
                        <ActionRow
                            href="/schedule?mode=instructor"
                            icon={<UserCheckIcon />}
                            label="Find an instructor"
                            sub="See anyone’s teaching week"
                        />
                    </div>
                </section>
            </div>

            {/* ===== Electives ===== */}
            <section className={styles.electives} aria-labelledby="home-electives">
                <div className={styles.electivesHead}>
                    <div>
                        <h2 id="home-electives" className={styles.panelTitle}>
                            Electives open this term
                        </h2>
                        <p className={styles.electivesNote}>
                            Department and university electives with sections on your campus in {currentSemesterName || 'this semester'}.
                        </p>
                    </div>
                    {!electivesLoading && electiveRows.length > 0 && (
                        <SegmentedControl
                            size="sm"
                            label="Elective type"
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
                </div>

                {electivesLoading ? (
                    <ElectivesSkeleton />
                ) : electiveRows.length === 0 ? (
                    <EmptyState compact tone="neutral" icon={<BookIcon />} title="No electives open this term">
                        None of your major&rsquo;s department or university electives have sections on your campus in {currentSemesterName || 'this semester'}. Try another semester from the menu above.
                    </EmptyState>
                ) : filteredElectiveRows.length === 0 ? (
                    <EmptyState compact tone="neutral" icon={<BookIcon />} title="Nothing in this category">
                        No electives of this type are offered this semester.
                    </EmptyState>
                ) : (
                    <div className={styles.electiveList}>
                        {filteredElectiveRows.map(row => {
                            const key = `${row.kind}-${row.course_id}`;
                            const isOpen = openElectives.has(key);
                            const panelId = `sections-${key}`;
                            const courseName = decodeHtmlEntities(row.course_name);
                            const courseLabel = courseName || row.course_id;
                            const sectionsLabel = `${row.section_count} section${row.section_count === 1 ? '' : 's'}`;
                            return (
                                <div key={key} className={`${styles.electiveItem} ${isOpen ? styles.electiveItemOpen : ''}`}>
                                    <div className={styles.electiveHead}>
                                        <button
                                            type="button"
                                            className={styles.electiveRow}
                                            onClick={() => toggleElective(key)}
                                            aria-expanded={isOpen}
                                            aria-controls={panelId}
                                        >
                                            <CourseSwatch courseId={row.course_id} />
                                            <span className={styles.electiveMain}>
                                                <span className={styles.electiveName}>{courseName || 'Unnamed course'}</span>
                                                <span className={styles.electiveMeta}>
                                                    <span className={styles.electiveCode}>{row.course_id}</span>
                                                    <span className={styles.metaDot} aria-hidden="true" />
                                                    <span className={`${styles.kindLabel} ${styles[`kind_${row.tag}`]}`}>{KIND_LABELS[row.tag]}</span>
                                                    <span className={styles.metaDot} aria-hidden="true" />
                                                    <span>{sectionsLabel}</span>
                                                </span>
                                            </span>
                                            <ChevronDownIcon className={styles.electiveChevron} />
                                        </button>
                                        <Link
                                            href={`/schedule?course=${encodeURIComponent(row.course_id)}`}
                                            className={styles.addBtn}
                                            title={`Add ${courseLabel} to your schedule`}
                                            aria-label={`Add ${courseLabel} to your schedule`}
                                        >
                                            <PlusIcon />
                                            <span className={styles.addLabel}>Add<span className={styles.addLabelLong}> to schedule</span></span>
                                        </Link>
                                    </div>

                                    {isOpen && (
                                        <ul id={panelId} className={styles.sectionList}>
                                            {(sectionsByCourse[row.course_id] || []).map(sec => {
                                                const { days, time } = splitClassTime(sec.class_time);
                                                const kind = sectionKind(sec.section_num);
                                                const seats = seatStatus(sec);
                                                return (
                                                    <li key={sec.crn || sec.section_num} className={styles.sectionRow}>
                                                        <span className={styles.sectionId}>
                                                            <span className={styles.sectionNum}>{sec.section_num}</span>
                                                            {kind && <span className={styles.sectionKind}>{kind}</span>}
                                                        </span>
                                                        <span className={styles.sectionWhen}>
                                                            {days && <span className={styles.sectionDays}>{days}</span>}
                                                            <span className={styles.sectionTime}>{time || 'Time TBA'}</span>
                                                        </span>
                                                        <span className={styles.sectionWho}>
                                                            <span className={styles.sectionInstructor}>
                                                                {decodeHtmlEntities((sec.instructor || '').trim()) || 'Instructor TBA'}
                                                            </span>
                                                            {sec.location && <RoomLink room={sec.location} className={styles.sectionRoom} />}
                                                        </span>
                                                        <span className={styles.sectionEnd}>
                                                            {seats && (
                                                                <Badge size="sm" dot tone={seats.tone === 'open' ? 'success' : seats.tone === 'low' ? 'warning' : 'neutral'} title={seats.title}>
                                                                    {seats.label}
                                                                </Badge>
                                                            )}
                                                            <span className={styles.sectionCrn}>CRN {sec.crn}</span>
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </PageShell>
    );
}
