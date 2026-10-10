'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { campusFilter } from '@/lib/campus';
import { seatStatus } from '@/lib/seats';
import { useSemester } from '@/lib/SemesterContext';
import { getGuest, setGuest, clearGuest, guestProfile, refuse } from '@/lib/guest';
import PageShell from '@/components/PageShell';
import PageHeader from '@/components/PageHeader';
import SemesterPicker from '@/components/SemesterPicker';
import InstructorFinder from '@/components/InstructorFinder';
import CourseHistory, { HistorySheet } from '@/components/CourseHistory';
import {
    Badge, Button, Callout, Checkbox, CourseSwatch, Dialog, EmptyState, Field, Input, SearchInput,
    SegmentedControl, Select, Skeleton, Spinner, Switch, Tabs, Ticket, Tooltip, useConfirm, useToast,
} from '@/components/ui';
import {
    AlertIcon, CalendarPlusIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, CopyIcon, DownloadIcon,
    EditIcon, HistoryIcon, LayersIcon, LockIcon, PlusIcon, RefreshIcon, ScheduleIcon, SlidersIcon, SparkleIcon,
    StarIcon, UserCheckIcon,
} from '@/components/Icons';
import { formatDuration, formatRange } from '@/lib/classTime';
import { paletteFor } from '@/lib/courseColor';
import { historyTerms, termLabel, fetchHistoryCounts } from '@/lib/courseHistory';
import { decodeHtmlEntities } from '@/lib/text';
import { downloadSchedulePng, copySchedulePng } from '@/lib/schedulePng';
import { downloadScheduleIcs } from '@/lib/scheduleIcs';
import RoomLink from '@/components/RoomLink';
import WeekGrid from '@/components/WeekGrid/WeekGrid';
import styles from './schedule.module.css';

// ===== TIME PARSING UTILITIES =====

function parseDays(dayStr) {
    const dayMap = {
        'Mon': 'Mon', 'Tue': 'Tue', 'Wed': 'Wed', 'Thu': 'Thu',
        'Sun': 'Sun', 'Sat': 'Sat', 'Fri': 'Fri',
        // Legacy single-letter format
        'M': 'Mon', 'T': 'Tue', 'W': 'Wed', 'R': 'Thu', 'Su': 'Sun', 'S': 'Sat',
    };
    const days = [];
    // Handle both "Mon/Wed" and "M W" formats
    const parts = dayStr.trim().split(/[\s\/]+/);
    for (const p of parts) {
        if (dayMap[p]) days.push(dayMap[p]);
    }
    return days;
}

function parseTimeToMinutes(timeStr) {
    const str = timeStr.trim();
    // Try 12h format first: "08:00 AM"
    const match12 = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match12) {
        let hours = parseInt(match12[1]);
        const minutes = parseInt(match12[2]);
        const period = match12[3].toUpperCase();
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
    }
    // 24h format: "08:00", "14:50", "09:15"
    const match24 = str.match(/(\d{1,2}):(\d{2})/);
    if (match24) {
        return parseInt(match24[1]) * 60 + parseInt(match24[2]);
    }
    return 0;
}

function parseClassTime(classTimeStr) {
    // Handles both:
    //   "Mon/Wed 08:00-09:15"  (current DB format)
    //   "M W 08:00 AM-09:15 AM" (legacy format)
    //   "Mon 13:00-14:40" (single day)
    if (!classTimeStr) return [];
    // Split into day part and time part
    // Match: (day names or letters) then (time-time)
    const match = classTimeStr.match(/^(.+?)\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*-\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)$/i);
    if (!match) return [];
    const days = parseDays(match[1]);
    const startMin = parseTimeToMinutes(match[2]);
    const endMin = parseTimeToMinutes(match[3]);
    return days.map(day => ({ day, start: startMin, end: endMin }));
}

function mapSectionsData(data) {
    if (!data) return [];
    return data.map(sec => ({
        ...sec,
        instructor: decodeHtmlEntities(sec.instructor)
    }));
}



// Display helper only -- used to label and order sections in the picker, never
// to decide which sections go together. Pairing comes from Banner (linkMap).
function getBaseSection(sectionNum) {
    // Strip trailing lab/tutorial letters, but preserve language indicators (A, E)
    // For example, '01A' -> '01A', '01AL' -> '01A', '51AT' -> '51A', '01X' -> '01', '01' -> '01'
    return sectionNum.replace(/[A-Za-z]+$/, (match) => {
        // If the suffix starts with A or E (language indicator), keep just that letter
        if (match[0].toUpperCase() === 'A' || match[0].toUpperCase() === 'E') {
            return match[0];
        }
        // Otherwise, strip all trailing letters
        return '';
    });
}

// Banner states outright which sections must be taken together; section_links
// holds that answer, and it is the only source of pairing in this file.
//
// Returns the partner sections, or null when Banner links this section to
// nothing -- which means it stands alone, not that we should guess.
function linkedPartners(section, courseSecs, linkMap) {
    const crns = linkMap && linkMap[section.crn];
    if (!crns || crns.length === 0) return null;
    const byCrn = new Map(courseSecs.map(s => [s.crn, s]));
    const found = crns.map(crn => byCrn.get(crn)).filter(Boolean);
    return found.length > 0 ? found : null;
}

const isTutorial = sec => sec.section_num.endsWith('T');

function timeSlotsConflict(slotsA, slotsB) {
    for (const a of slotsA) {
        for (const b of slotsB) {
            if (a.day === b.day && a.start < b.end && b.start < a.end) {
                return true;
            }
        }
    }
    return false;
}

// ===== SCHEDULE ALGORITHM =====

// Which sections must be taken together comes entirely from Banner
// (section_links). There is no naming rule here on purpose: section numbers
// stopped predicting the pairing once registration was reorganised. 1502232
// has lectures 01/31 with labs 61L-64L, 0402202 pairs lecture 61 with either
// 61T or 65T, and 1502201 pairs link group D7 with T3. Any rule that guesses
// from '61L' -> '61' gets those wrong.
//
// Sections Banner does not link are standalone options: an all-lab course like
// 0402203 (61L-64L, no lecture) is four separate choices, not a lab hanging off
// something that does not exist.
function buildSectionGroups(sections, courseId, linkMap) {
    const courseSecs = sections.filter(sec => sec.course_id === courseId);
    if (courseSecs.length === 0) return [];

    const byCrn = new Map(courseSecs.map(s => [s.crn, s]));
    const partnersOf = sec => ((linkMap && linkMap[sec.crn]) || [])
        .map(crn => byCrn.get(crn))
        .filter(Boolean);

    const result = [];
    const visited = new Set();

    for (const start of courseSecs) {
        if (visited.has(start.crn)) continue;

        // Walk the links to collect everything that must be registered together.
        const component = [];
        const queue = [start];
        visited.add(start.crn);
        while (queue.length > 0) {
            const current = queue.shift();
            component.push(current);
            for (const partner of partnersOf(current)) {
                if (!visited.has(partner.crn)) {
                    visited.add(partner.crn);
                    queue.push(partner);
                }
            }
        }

        if (component.length === 1) {
            result.push({
                sections: component,
                slots: parseClassTime(start.class_time),
                courseId
            });
            continue;
        }

        // Banner wants one section from each link group in the component. Every
        // cross-group pair in the current data is linked, so the product of the
        // groups is exactly the set of legal combinations.
        const groups = new Map();
        for (const sec of component) {
            const key = sec.link_identifier || sec.crn;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(sec);
        }

        let combos = [[]];
        for (const members of groups.values()) {
            const next = [];
            for (const combo of combos) {
                for (const member of members) next.push([...combo, member]);
            }
            combos = next;
        }

        for (const combined of combos) {
            result.push({
                sections: combined,
                slots: combined.flatMap(sec => parseClassTime(sec.class_time)),
                courseId
            });
        }
    }

    return result;
}

function groupConflicts(groupA, groupB) {
    return timeSlotsConflict(groupA.slots, groupB.slots);
}

function generateSchedules(courseGroups, prefs, courseNames) {
    // courseGroups = { courseId: [group1, group2, ...], ... }
    const courseIds = Object.keys(courseGroups);
    if (courseIds.length === 0) return [];

    const beforeMin = prefs.noClassesBefore ? parseTimeToMinutes(prefs.noClassesBefore) : 0;
    const afterMin = prefs.noClassesAfter ? parseTimeToMinutes(prefs.noClassesAfter) : 24 * 60;
    const hasTimeConstraints = prefs.noClassesBefore || prefs.noClassesAfter;

    function applyFilters(useTimeConstraint) {
        const filtered = {};
        for (const cid of courseIds) {
            let groups = courseGroups[cid];

            // Pin filter (always hard)
            if (prefs.pinnedSections[cid]) {
                const pinnedBase = prefs.pinnedSections[cid];
                // Base pin means we must have the exact base section included
                groups = groups.filter(g =>
                    g.sections.some(s => s.section_num === pinnedBase)
                );
            }

            // Pin lab filter
            if (prefs.pinnedLabs && prefs.pinnedLabs[cid]) {
                const pinnedLab = prefs.pinnedLabs[cid];
                // Lab pin means we must have the exact lab section included
                groups = groups.filter(g =>
                    g.sections.some(s => s.section_num === pinnedLab)
                );
            }

            // Time range filter (only when useTimeConstraint is true)
            if (useTimeConstraint && hasTimeConstraints) {
                groups = groups.filter(g =>
                    g.slots.every(s => s.start >= beforeMin && s.end <= afterMin)
                );
            }

            // Language filter
            if (prefs.languagePref === 'english') {
                groups = groups.filter(g =>
                    g.sections.every(s => !s.section_num.endsWith('A'))
                );
            } else if (prefs.languagePref === 'arabic') {
                groups = groups.filter(g =>
                    g.sections.every(s => !s.section_num.endsWith('E'))
                );
            }

            // Mixed sections filter
            if (prefs.hideMixedSections) {
                groups = groups.filter(g =>
                    g.sections.every(s => s.campus !== 'main')
                );
            }

            // Hard elective filter for basket courses
            if (cid.startsWith('BASKET_')) {
                const prefsKey = cid.startsWith('BASKET_DEPT_') ? 'BASKET_DEPT' : cid;
                if (prefs.hardElectiveFilter?.[prefsKey]) {
                    const preferred = prefs.preferredElectives?.[prefsKey] || [];
                    if (preferred.length > 0) {
                        groups = groups.filter(g =>
                            g.sections.some(s => preferred.includes(s.course_id))
                        );
                    }
                }
            }

            filtered[cid] = groups;
        }
        return filtered;
    }

    function solve(filteredGroups) {
        const results = [];
        const MAX_RESULTS = 100;

        function backtrack(idx, currentSchedule) {
            if (results.length >= MAX_RESULTS) return;
            if (idx === courseIds.length) {
                results.push([...currentSchedule]);
                return;
            }
            const cid = courseIds[idx];
            for (const group of filteredGroups[cid]) {
                let conflict = false;

                // For baskets (including DEPT_ELECTIVE), ensure we don't pick the same actual course twice
                const actualCourseId = group.courseId;

                for (const selected of currentSchedule) {
                    if (groupConflicts(group, selected)) {
                        conflict = true;
                        break;
                    }
                    if (actualCourseId === selected.courseId) {
                        conflict = true; // Same actual course selected for different slots
                        break;
                    }
                }
                if (!conflict) {
                    currentSchedule.push(group);
                    backtrack(idx + 1, currentSchedule);
                    currentSchedule.pop();
                }
            }
        }

        backtrack(0, []);
        return results;
    }

    // Try with time constraints first
    let results = solve(applyFilters(true));
    let timeRelaxed = false;

    // If no results and we had time constraints, relax them (unless strict mode)
    if (results.length === 0 && hasTimeConstraints && !prefs.strictTime) {
        results = solve(applyFilters(false));
        timeRelaxed = true;
    }

    // Score each schedule
    const scored = results.map(schedule => {
        let score = 80;
        const warnings = [];
        const allSlots = schedule.flatMap(g => g.slots);

        // Time constraint violation penalty (when relaxed)
        if (timeRelaxed && hasTimeConstraints) {
            let totalPenalty = 0;
            let maxEarly = 0;
            let maxLate = 0;
            let earlyCount = 0;
            let lateCount = 0;

            for (const s of allSlots) {
                if (prefs.noClassesBefore && s.start < beforeMin) {
                    const diff = beforeMin - s.start;
                    totalPenalty += 20 + (diff / 10);
                    maxEarly = Math.max(maxEarly, diff);
                    earlyCount++;
                }
                if (prefs.noClassesAfter && s.end > afterMin) {
                    const diff = s.end - afterMin;
                    totalPenalty += 20 + (diff / 10);
                    maxLate = Math.max(maxLate, diff);
                    lateCount++;
                }
            }
            score -= totalPenalty;

            if (earlyCount > 0) {
                warnings.push(`${earlyCount} class${earlyCount > 1 ? 'es' : ''} start${earlyCount === 1 ? 's' : ''} up to ${maxEarly} min early`);
            }
            if (lateCount > 0) {
                warnings.push(`${lateCount} class${lateCount > 1 ? 'es' : ''} end${lateCount === 1 ? 's' : ''} up to ${maxLate} min late`);
            }
        }

        // Gap preference scoring
        const daySlots = {};
        for (const s of allSlots) {
            if (!daySlots[s.day]) daySlots[s.day] = [];
            daySlots[s.day].push(s);
        }
        let totalGap = 0;
        for (const day of Object.keys(daySlots)) {
            const sorted = daySlots[day].sort((a, b) => a.start - b.start);
            for (let i = 1; i < sorted.length; i++) {
                totalGap += sorted[i].start - sorted[i - 1].end;
            }
        }
        if (prefs.gapPref === 'minimize') {
            score -= totalGap / 30; // Still penalize long gaps
        } else if (prefs.gapPref === 'prefer') {
            // Penalize for NOT having enough gaps (target ~120 mins)
            if (totalGap < 120) {
                score -= Math.max(0, (120 - totalGap) / 10);
            }
        }

        // Day compactness scoring
        const daysUsed = Object.keys(daySlots).length;
        if (prefs.compactPref === 'fewer') {
            // Penalize for more days (target 2 days)
            // 3 days = -5, 4 days = -10, 5 days = -15
            score -= Math.max(0, (daysUsed - 2) * 5);
        } else if (prefs.compactPref === 'spread') {
            // Penalize for fewer days (target 5 days)
            // 4 days = -5, 3 days = -10, 2 days = -15
            score -= Math.max(0, (5 - daysUsed) * 5);
        }

        // Instructor preference scoring
        for (const group of schedule) {
            const cid = group.courseId;
            if (prefs.preferredInstructors[cid]) {
                const pref = prefs.preferredInstructors[cid];
                const hasPref = group.sections.some(s => s.instructor === pref);

                if (!hasPref) {
                    score -= 15;
                    warnings.push(`Different instructor for ${courseNames[cid] || cid}`);
                } else {
                    // Instructor is present in at least ONE section (e.g., they teach the lab)
                    const lecture = group.sections.find(s => s.section_num === getBaseSection(s.section_num));
                    const labs = group.sections.filter(s => s.section_num !== getBaseSection(s.section_num) && !s.section_num.endsWith('T'));

                    if (lecture && lecture.instructor && lecture.instructor !== pref) {
                        warnings.push(`Different lecture instructor for ${courseNames[cid] || cid}`);
                    }

                    const differentLab = labs.find(l => l.instructor && l.instructor !== pref);
                    if (differentLab) {
                        warnings.push(`Different lab instructor for ${courseNames[cid] || cid}`);
                    }
                }
            }

            // Preferred elective scoring (soft boost)
            const basketId = group.originalCourseId;
            if (basketId?.startsWith('BASKET_')) {
                const isDept = basketId.startsWith('BASKET_DEPT_');
                const isSupport = basketId.startsWith('BASKET_SUPPORT_');
                const prefsKey = isDept ? 'BASKET_DEPT' : isSupport ? 'BASKET_SUPPORT' : basketId;

                if (!prefs.hardElectiveFilter?.[prefsKey]) {
                    const preferred = prefs.preferredElectives?.[prefsKey] || [];
                    if (preferred.length > 0 && preferred.includes(group.courseId)) {
                        if (isDept) {
                            const deptCount = schedule.filter(g => g.originalCourseId?.startsWith('BASKET_DEPT_')).length;
                            score += (20 / deptCount);
                        } else if (isSupport) {
                            const supportCount = schedule.filter(g => g.originalCourseId?.startsWith('BASKET_SUPPORT_')).length;
                            score += (20 / supportCount);
                        } else {
                            score += 20;
                        }
                    }
                }
            }
        }

        // Clamp & Round score
        score = Math.round(Math.max(0, Math.min(100, score)));

        return { schedule, score, warnings };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    return scored;
}

// ===== TIMETABLE RENDERING =====

const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
const TIME_SLOTS = [];
for (let h = 8; h <= 20; h++) {
    TIME_SLOTS.push(h * 60); // Every hour from 8 AM to 8 PM
}

function formatTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

function formatTimeShort(minutes) {
    const h = Math.floor(minutes / 60);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH} ${period}`;
}

// ===== MAIN COMPONENT =====

export default function SchedulePage() {
    const [profile, setProfile] = useState(null);
    // 'build' | 'instructor' | 'history': peer modes of this page.
    const [mode, setMode] = useState('build');
    // What the History tab should open: { courseId, courseName, term }. A new
    // object each time, so asking for the same course twice still reopens it.
    const [historyRequest, setHistoryRequest] = useState(null);
    // Whether History was reached from a build-tab shortcut, to offer the way back.
    const [historyFromBuild, setHistoryFromBuild] = useState(false);
    // The course whose quick look sheet is open, or null.
    const [sheetCourse, setSheetCourse] = useState(null);
    // course_id -> [{ term, sections }] for the term being planned and the past
    // terms History covers; null until loaded. Drives the picker's
    // "Not open this term, last ran ..." hint.
    const [termCounts, setTermCounts] = useState(null);
    const [majorInfo, setMajorInfo] = useState(null);
    const [courses, setCourses] = useState([]);
    const [selectedCourses, setSelectedCourses] = useState([]);
    const [courseSearch, setCourseSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [allSections, setAllSections] = useState({});
    // crn -> [partner crns], straight from Banner. Loaded once per term; the
    // whole term is a couple of hundred rows.
    const [linkMap, setLinkMap] = useState({});
    const [prefsOpen, setPrefsOpen] = useState(false);
    const [prefs, setPrefs] = useState({
        noClassesBefore: '',
        noClassesAfter: '',
        gapPref: 'none',
        compactPref: 'none',
        preferredInstructors: {},
        pinnedSections: {},
        pinnedLabs: {},
        strictTime: false,
        languagePref: 'any',
        preferredElectives: {},    // { BASKET_1: ['CS101', ...], BASKET_2: [] }
        hardElectiveFilter: {},    // { BASKET_1: false, BASKET_2: true }
        hideMixedSections: false,
    });
    const [generating, setGenerating] = useState(false);
    const [results, setResults] = useState(null);
    const [extraCourseNames, setExtraCourseNames] = useState({});
    const [extraCourseCredits, setExtraCourseCredits] = useState({});
    const [loadingCourseIds, setLoadingCourseIds] = useState(new Set());
    const [showCount, setShowCount] = useState(3);
    const [error, setError] = useState('');
    const [savedScheduleIdx, setSavedScheduleIdx] = useState(null);
    const [dbSavedSchedules, setDbSavedSchedules] = useState([]);
    const [showAlternatives, setShowAlternatives] = useState(false);
    const [restoringFromSave, setRestoringFromSave] = useState(false);
    const [xorCourseIds, setXorCourseIds] = useState(new Set());
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);
    // Whether the saved cart has been read back. Until it has, the autosave
    // below must not run: it would write an empty cart over the real one if
    // the restore took longer than the autosave's one-second wait.
    const [cartReady, setCartReady] = useState(false);
    // course_id -> [cart course ids Banner lists as its prerequisites]. UOS
    // files corequisites in the same list, so this only ever drives a warning.
    const [prereqMap, setPrereqMap] = useState({});
    const router = useRouter();
    const supabase = createClient();
    const { selectedTerm } = useSemester();

    useEffect(() => { checkAuth(); }, []);

    // /schedule?mode=instructor opens the finder directly. Home's quick action
    // links here, and the old /instructors route redirects here.
    // /schedule?mode=history&course=0401211 opens History on that course.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const requested = params.get('mode');
        if (requested === 'instructor') setMode('instructor');
        if (requested === 'history') {
            setMode('history');
            if (params.get('course')) setHistoryRequest({ courseId: params.get('course') });
        }
    }, []);

    // Keep the URL in step with the mode, so a refresh or a shared link lands
    // on the same one.
    const switchMode = (next, courseId = null) => {
        setMode(next);
        if (next !== 'history') setHistoryFromBuild(false);
        const url = new URL(window.location.href);
        if (next === 'build') url.searchParams.delete('mode');
        else url.searchParams.set('mode', next);
        if (next === 'history' && courseId) url.searchParams.set('course', courseId);
        else url.searchParams.delete('course');
        window.history.replaceState(null, '', url);
    };

    // A build-tab shortcut into History: the cart's quick look sheet, or the
    // picker's hint on a course that isn't open this term.
    const openHistory = (course, term = null) => {
        setSheetCourse(null);
        setShowDropdown(false);
        setHistoryRequest({ courseId: course.course_id, courseName: course.name, term });
        setHistoryFromBuild(true);
        switchMode('history', course.course_id);
        window.scrollTo({ top: 0 });
    };

    // Sections per course this term and in History's past terms, for the
    // picker. One grouped query covers the whole major.
    useEffect(() => {
        setTermCounts(null);
        if (!selectedTerm || courses.length === 0) return;
        let cancelled = false;
        fetchHistoryCounts(supabase, courses.map(c => c.course_id), [selectedTerm, ...historyTerms(selectedTerm)])
            .then(counts => { if (!cancelled) setTermCounts(counts); })
            .catch(() => {});
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courses, selectedTerm]);

    // Reset state when semester changes
    // Load Banner's section pairings for the term.
    useEffect(() => {
        if (!selectedTerm) { setLinkMap({}); return; }
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('section_links')
                .select('crn, linked_crn')
                .eq('term_code', selectedTerm);
            if (cancelled) return;
            if (error || !data) { setLinkMap({}); return; }
            const map = {};
            for (const row of data) {
                (map[row.crn] = map[row.crn] || []).push(row.linked_crn);
            }
            setLinkMap(map);
        })();
        return () => { cancelled = true; };
    }, [selectedTerm]);

    // Prerequisite pairs inside the cart: a course and one it lists as a
    // prerequisite, both selected. Filtering both ends to the cart keeps this
    // to the handful of rows that can actually warn.
    const cartCourseKey = selectedCourses
        .map(c => c.course_id).filter(id => !id.startsWith('BASKET_')).sort().join(',');
    useEffect(() => {
        const ids = cartCourseKey ? cartCourseKey.split(',') : [];
        if (!selectedTerm || ids.length < 2) { setPrereqMap({}); return; }
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('course_prerequisites')
                .select('course_id, required_course_id')
                .eq('term_code', selectedTerm)
                .in('course_id', ids)
                .in('required_course_id', ids);
            if (cancelled) return;
            if (error || !data) { setPrereqMap({}); return; }
            const map = {};
            for (const row of data) {
                (map[row.course_id] = map[row.course_id] || []).push(row.required_course_id);
            }
            setPrereqMap(map);
        })();
        return () => { cancelled = true; };
    }, [selectedTerm, cartCourseKey]);

    useEffect(() => {
        if (!selectedTerm || !profile) return;
        setAllSections({});
        setResults(null);
        setError('');
        // Re-fetch sections for selected courses
        for (const c of selectedCourses) {
            fetchSectionsForCourse(c.course_id);
        }
    }, [selectedTerm]);

    // Fetch saved schedules whenever the profile or selected term settles.
    // Keyed on both so it fires once auth completes (client-side navigation,
    // where the term is already set at mount) and re-fires when the term
    // changes — instead of relying on a stale selectedTerm captured in checkAuth.
    useEffect(() => {
        if (!profile || profile.isGuest) return;
        fetchDbSavedSchedules(profile, selectedTerm);
    }, [profile, selectedTerm]);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        let profileData;
        if (user) {
            clearGuest();
            ({ data: profileData } = await supabase
                .from('profiles').select('*').eq('id', user.id).single());
            const isComplete = profileData?.name && profileData?.student_id && profileData?.phone;
            if (!isComplete || !profileData?.major) { router.push('/profile?selectMajor=true'); return; }
        } else {
            const guest = getGuest();
            if (!guest) { router.push('/auth'); return; }
            profileData = guestProfile(guest);
        }

        // Fetch major info
        let majorData;
        {
            const { data, error } = await supabase
                .from('majors').select('dept_electives_count, support_electives_count').eq('code', profileData.major).single();
            if (error) {
                // Fallback: support_electives_count column might not exist yet
                const { data: fallback } = await supabase
                    .from('majors').select('dept_electives_count').eq('code', profileData.major).single();
                majorData = fallback ? { ...fallback, support_electives_count: 0 } : null;
            } else {
                majorData = data;
            }
        }

        setMajorInfo(majorData || { dept_electives_count: 0 });
        setProfile(profileData);
        fetchCourses(profileData.major);

        // Saved schedules are fetched by a dedicated [profile, selectedTerm]
        // effect, so we don't fetch them here (which would capture a stale term).

        // Always restore the user's active "draft" selected courses cart
        const restored = await restoreSelectedCourses(profileData);

        // If we arrived via /schedule?course=ID (e.g. from the dashboard
        // "Electives offered" list), add that course to the cart.
        await addCourseFromQuery(profileData, restored || []);
        setCartReady(true);
    };

    const fetchDbSavedSchedules = async (prof, term) => {
        let query = supabase
            .from('saved_schedules')
            .select('*')
            .eq('user_id', prof.id)
            .order('created_at', { ascending: true });

        if (term) query = query.eq('term_code', term);

        const { data: savedData, error: savedError } = await query;

        if (savedError || !savedData || savedData.length === 0) {
            setDbSavedSchedules([]);
            return;
        }

        // Gather all unique CRNs and courseIDs to fetch
        const allCrns = new Set();
        const allCourseIds = new Set();
        savedData.forEach(dbObj => {
            const { courseGroups, selectedCourses: rawSelected } = dbObj.schedule_data;
            courseGroups.forEach(g => {
                if (g.sections) g.sections.forEach(crn => allCrns.add(crn));
            });
            rawSelected.forEach(c => allCourseIds.add(c.course_id));
        });

        // Fetch live section data
        const { data: rawLiveSections } = await supabase
            .from('sections')
            .select('*')
            .in('crn', Array.from(allCrns));
        // Same decoding every other section fetch gets — without it a restored
        // schedule showed "Mo&#39;ath" where a freshly built one showed "Mo'ath".
        const liveSections = mapSectionsData(rawLiveSections);

        // Fetch courses to update names/credits
        const { data: coursesData } = await supabase
            .from('courses')
            .select('course_id, course_name, credit_hours')
            .in('course_id', Array.from(allCourseIds));

        if (coursesData) {
            const newNames = {};
            const newCredits = {};
            coursesData.forEach(c => {
                newNames[c.course_id] = c.course_name;
                newCredits[c.course_id] = c.credit_hours;
            });
            setExtraCourseNames(prev => ({ ...prev, ...newNames }));
            setExtraCourseCredits(prev => ({ ...prev, ...newCredits }));
        }

        const sectionMap = {};
        if (liveSections) {
            liveSections.forEach(sec => { sectionMap[sec.crn] = sec; });
        }

        // Reconstruct
        const computedSchedules = [];
        savedData.forEach(dbObj => {
            const { score, warnings, courseGroups, selectedCourses: rawSelected } = dbObj.schedule_data;
            let missingFlag = false;

            const reconstructedGroups = courseGroups.map(g => {
                const mappedSections = g.sections.map(crn => {
                    if (sectionMap[crn]) return sectionMap[crn];
                    missingFlag = true;
                    return {
                        crn,
                        course_id: g.courseId,
                        section_num: 'CLOSED',
                        class_time: 'MISSING',
                        instructor: 'Section Unavailable',
                        isMissing: true,
                        campus: 'main'
                    };
                });
                return {
                    courseId: g.courseId,
                    originalCourseId: g.originalCourseId,
                    sections: mappedSections,
                    slots: mappedSections.filter(s => !s.isMissing).flatMap(s => parseClassTime(s.class_time))
                };
            });

            const updatedWarnings = [...(warnings || [])];
            if (missingFlag) {
                updatedWarnings.unshift("⚠️ One or more sections in this schedule are now CLOSED or DELETED from the catalogue.");
            }

            computedSchedules.push({
                dbId: dbObj.id,
                name: dbObj.name || null,
                schedule: reconstructedGroups,
                score,
                warnings: updatedWarnings,
                storedSelectedCourses: rawSelected
            });
        });

        setDbSavedSchedules(computedSchedules);
    };

    const getScheduleSignature = (schedule) => {
        return schedule
            .map(g => g.sections.map(s => s.crn || s.section_num).sort().join('-'))
            .sort()
            .join('|');
    };

    const savedSignatures = useMemo(() => {
        const map = new Map();
        dbSavedSchedules.forEach(savedObj => {
            map.set(getScheduleSignature(savedObj.schedule), savedObj.dbId);
        });
        return map;
    }, [dbSavedSchedules]);

    const handleSaveSchedule = async (resultToSave, name) => {
        if (isSavingSchedule) return;

        const newSig = getScheduleSignature(resultToSave.schedule);
        if (savedSignatures.has(newSig)) {
            setError('This exact schedule is already saved.');
            return;
        }

        if (dbSavedSchedules.length >= 3) {
            setError('You can only store up to 3 saved schedules at a time. Please delete one first.');
            return;
        }

        setIsSavingSchedule(true);
        try {
            const { schedule, score, warnings } = resultToSave;
            const scheduleData = {
                score,
                warnings,
                courseGroups: schedule.map(g => ({
                    courseId: g.courseId,
                    originalCourseId: g.originalCourseId,
                    sections: g.sections.map(s => s.crn)
                })),
                selectedCourses: selectedCourses.map(c => ({ course_id: c.course_id, name: c.name }))
            };

            const { error: saveError } = await supabase
                .from('saved_schedules')
                .insert([{ user_id: profile.id, schedule_data: scheduleData, term_code: selectedTerm, name: name?.trim().slice(0, 60) || null }]);

            if (saveError) {
                setError('Database Error: ' + saveError.message);
                return;
            }

            await fetchDbSavedSchedules(profile, selectedTerm);
        } finally {
            setIsSavingSchedule(false);
        }
    };

    const handleDeleteSavedSchedule = async (dbId) => {
        if (isSavingSchedule) return;
        setIsSavingSchedule(true);
        try {
            const { error: delError } = await supabase.from('saved_schedules').delete().eq('id', dbId);
            if (delError) {
                setError('Failed to delete schedule: ' + delError.message);
                return;
            }
            setDbSavedSchedules(prev => prev.filter(s => s.dbId !== dbId));
        } finally {
            setIsSavingSchedule(false);
        }
    };

    const restoreSelectedCourses = async (prof) => {
        try {
            // A guest's cart is kept in this browser, beside their major and campus.
            let rawCart = getGuest()?.cart;
            if (!prof.isGuest) {
                const { data: cartData } = await supabase
                    .from('profiles')
                    .select('schedule_cart')
                    .eq('id', prof.id)
                    .single();
                rawCart = cartData?.schedule_cart;
            }
            if (!rawCart) return [];

            // Determine the active term — selectedTerm may not be ready yet on first load
            const activeTerm = selectedTerm || localStorage.getItem('selectedTerm');

            // Support both old format { courses, xor } and new per-term format { termCode: { courses, xor } }
            let cart;
            if (rawCart.courses) {
                // Old format — treat as current term and migrate
                cart = rawCart;
                // Migrate to new format in background
                if (activeTerm) {
                    const newFormat = { [activeTerm]: rawCart };
                    supabase.from('profiles').update({ schedule_cart: newFormat }).eq('id', prof.id);
                }
            } else if (activeTerm && rawCart[activeTerm]) {
                cart = rawCart[activeTerm];
            } else {
                return [];
            }

            if (!cart?.courses?.length) return [];

            const savedCourses = cart.courses;
            const savedXor = cart.xor || [];

            // Separate basket/special courses from real course IDs
            const realCourseIds = savedCourses.filter(c => !c.course_id.startsWith('BASKET_')).map(c => c.course_id);
            const basketCourses = savedCourses.filter(c => c.course_id.startsWith('BASKET_'));

            let restoredCourses = [...basketCourses];

            if (realCourseIds.length > 0) {
                const { data: courseData } = await supabase
                    .from('courses').select('course_id, course_name, credit_hours').in('course_id', realCourseIds);
                if (courseData) {
                    restoredCourses = restoredCourses.concat(
                        courseData.map(c => ({ course_id: c.course_id, name: c.course_name, credit_hours: c.credit_hours || 0 }))
                    );
                }
            }

            if (restoredCourses.length === 0) return [];

            setSelectedCourses(restoredCourses);
            if (savedXor.length) {
                setXorCourseIds(new Set(savedXor));
            }

            for (const c of restoredCourses) {
                fetchSectionsForCourse(c.course_id, prof);
            }
            return restoredCourses;
        } catch (e) {
            console.error('Error restoring cart from DB:', e);
            return [];
        }
    };

    // Add the course passed via ?course=COURSE_ID (e.g. from the dashboard
    // "Electives offered" list) to the cart, deduping against whatever was
    // just restored. Called after restoreSelectedCourses so its setState
    // doesn't clobber the addition.
    const addCourseFromQuery = async (prof, currentCourses) => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        // ?mode=history&course=… opens that course's history; it isn't a
        // request to add it to the cart.
        if (params.get('mode') === 'history') return;
        const courseId = params.get('course');
        if (!courseId || courseId.startsWith('BASKET_')) return;

        // Strip the param so a refresh doesn't re-add the course.
        window.history.replaceState({}, '', '/schedule');

        if (currentCourses.find(c => c.course_id === courseId)) return;
        if (currentCourses.length >= 8) {
            setError('You can add at most 8 courses to a schedule.');
            return;
        }

        const { data } = await supabase
            .from('courses').select('course_id, course_name, credit_hours')
            .eq('course_id', courseId).single();
        if (!data) return;

        const courseObj = { course_id: data.course_id, name: data.course_name, credit_hours: data.credit_hours || 0 };
        setSelectedCourses(prev => prev.find(c => c.course_id === courseObj.course_id) ? prev : [...prev, courseObj]);
        setResults(null);
        fetchSectionsForCourse(courseObj.course_id, prof);
    };

    // Persist selected courses to Supabase (debounced, keyed by term)
    useEffect(() => {
        if (!profile || !selectedTerm || !cartReady) return;
        // Don't save on initial mount — wait for restore to finish
        const activeTerm = selectedTerm;
        const timer = setTimeout(async () => {
            if (profile.isGuest) {
                const guest = getGuest();
                if (!guest) return;
                const cart = { ...guest.cart };
                if (selectedCourses.length > 0) cart[activeTerm] = { courses: selectedCourses, xor: [...xorCourseIds] };
                else delete cart[activeTerm];
                setGuest({ ...guest, cart });
                return;
            }

            // Read current cart object, update only the current term's key
            const { data: current } = await supabase
                .from('profiles')
                .select('schedule_cart')
                .eq('id', profile.id)
                .single();

            let existingCart = current?.schedule_cart || {};
            // If old format, migrate first
            if (existingCart.courses) {
                existingCart = { [activeTerm]: existingCart };
            }

            if (selectedCourses.length > 0) {
                existingCart[activeTerm] = { courses: selectedCourses, xor: [...xorCourseIds] };
            } else {
                delete existingCart[activeTerm];
            }

            await supabase
                .from('profiles')
                .update({ schedule_cart: Object.keys(existingCart).length > 0 ? existingCart : null })
                .eq('id', profile.id);
        }, 1000);
        return () => clearTimeout(timer);
    }, [selectedCourses, xorCourseIds, profile, selectedTerm, cartReady]);

    // Guest mode: the campus a profile would supply, picked on the page instead.
    // Reloads the cart's sections for it, as a term change does.
    const switchGuestCampus = (gender) => {
        if (gender === profile.gender) return;
        const next = { ...profile, gender };
        setGuest({ ...getGuest(), gender });
        setProfile(next);
        setAllSections({});
        setResults(null);
        for (const c of selectedCourses) fetchSectionsForCourse(c.course_id, next);
    };

    const fetchCourses = async (userMajor) => {
        if (!userMajor) return;
        const { data: majorCourses } = await supabase
            .from('major_courses').select('course_id').eq('major_code', userMajor);
        if (!majorCourses?.length) return;
        const courseIds = majorCourses.map(mc => mc.course_id);
        const { data } = await supabase
            .from('courses').select('course_id, course_name, credit_hours').in('course_id', courseIds).order('course_id');

        setCourses((data || []).map(c => ({ course_id: c.course_id, name: c.course_name, credit_hours: c.credit_hours || 0 })));
    };

    // Some courses split their sections between majors by instructor (e.g. a
    // course taught by one professor for CPE and another for CYBER). Those rules
    // live in course_major_rules. If a course has rules, keep only the sections
    // whose instructor is allowed for the student's major; an instructor with no
    // rule for that course is treated as unrestricted. Courses with no rules are
    // returned untouched (the common case — one extra tiny indexed lookup).
    const applyMajorRules = async (courseId, sections, prof) => {
        const major = prof?.major;
        if (!major || sections.length === 0) return sections;

        const { data: rules } = await supabase
            .from('course_major_rules')
            .select('instructor, allowed_major')
            .eq('course_id', courseId);
        if (!rules || rules.length === 0) return sections;

        const norm = v => decodeHtmlEntities(String(v || '')).trim().toLowerCase();
        const ruledInstructors = new Set(rules.map(r => norm(r.instructor)));
        const allowedForMajor = new Set(
            rules.filter(r => r.allowed_major === major).map(r => norm(r.instructor))
        );

        return sections.filter(s => {
            const instr = norm(s.instructor);
            if (!ruledInstructors.has(instr)) return true; // unclassified instructor → unrestricted
            return allowedForMajor.has(instr);             // classified → must match major
        });
    };

    const fetchSectionsForCourse = async (courseId, profileOverride) => {
        setLoadingCourseIds(prev => new Set([...prev, courseId]));
        const prof = profileOverride || profile;
        const campusFilterFor = campusFilter(prof?.gender);

        try {
            // Handle Department Electives
            if (courseId.startsWith('BASKET_DEPT')) {
                if (!prof?.major) {
                    setAllSections(prev => ({ ...prev, [courseId]: [] })); // Use passed courseId (e.g. BASKET_DEPT_1)
                    return;
                }

                // 1. Get courses in this major marked as 'Major Elective'
                const { data: majorElectives } = await supabase
                    .from('major_courses')
                    .select('course_id')
                    .eq('major_code', prof.major)
                    .eq('category', 'Major Elective');

                if (!majorElectives?.length) {
                    setAllSections(prev => ({ ...prev, [courseId]: [] }));
                    return;
                }

                const electiveIds = majorElectives.map(mc => mc.course_id);

                // Need course names for the dropdown/display
                const { data: courseData } = await supabase
                    .from('courses')
                    .select('course_id, course_name, credit_hours')
                    .in('course_id', electiveIds);

                const newExtraNames = {};
                const newExtraCredits = {};
                if (courseData) {
                    courseData.forEach(c => {
                        newExtraNames[c.course_id] = c.course_name;
                        newExtraCredits[c.course_id] = c.credit_hours || 0;
                    });
                    setExtraCourseNames(prev => ({ ...prev, ...newExtraNames }));
                    setExtraCourseCredits(prev => ({ ...prev, ...newExtraCredits }));
                }

                // 2. Get sections for these courses
                let electiveQuery = supabase
                    .from('sections')
                    .select('*')
                    .in('course_id', electiveIds)
                    .or(campusFilterFor).eq('is_active', true)
                    .order('section_num');
                if (selectedTerm) electiveQuery = electiveQuery.eq('term_code', selectedTerm);
                const { data } = await electiveQuery;

                setAllSections(prev => ({ ...prev, [courseId]: mapSectionsData(data) || [] })); // Assign to specific slot
                return;
            }

            // Handle Support Electives
            if (courseId.startsWith('BASKET_SUPPORT')) {
                if (!prof?.major) {
                    setAllSections(prev => ({ ...prev, [courseId]: [] }));
                    return;
                }

                // Get courses in this major marked as 'Support Elective'
                const { data: supportElectives } = await supabase
                    .from('major_courses')
                    .select('course_id')
                    .eq('major_code', prof.major)
                    .eq('category', 'Support Elective');

                if (!supportElectives?.length) {
                    setAllSections(prev => ({ ...prev, [courseId]: [] }));
                    return;
                }

                const electiveIds = supportElectives.map(mc => mc.course_id);

                const { data: courseData } = await supabase
                    .from('courses')
                    .select('course_id, course_name, credit_hours')
                    .in('course_id', electiveIds);

                const newExtraNames = {};
                const newExtraCredits = {};
                if (courseData) {
                    courseData.forEach(c => {
                        newExtraNames[c.course_id] = c.course_name;
                        newExtraCredits[c.course_id] = c.credit_hours || 0;
                    });
                    setExtraCourseNames(prev => ({ ...prev, ...newExtraNames }));
                    setExtraCourseCredits(prev => ({ ...prev, ...newExtraCredits }));
                }

                let supportQuery = supabase
                    .from('sections')
                    .select('*')
                    .in('course_id', electiveIds)
                    .or(campusFilterFor).eq('is_active', true)
                    .order('section_num');
                if (selectedTerm) supportQuery = supportQuery.eq('term_code', selectedTerm);
                const { data } = await supportQuery;

                setAllSections(prev => ({ ...prev, [courseId]: mapSectionsData(data) || [] }));
                return;
            }

            // Handle Basket Wildcards
            if (courseId.startsWith('BASKET_')) {
                const basketName = courseId === 'BASKET_1' ? 'Basket 1' : 'Basket 2';
                // 1. Get courses in this basket
                const { data: basketCoursesRaw } = await supabase
                    .from('courses')
                    .select('course_id, course_name, credit_hours, restricted_majors')
                    .eq('university_elective_basket', basketName);

                // Basket courses are shared across all majors unless restricted_majors
                // names specific majors — then only those majors may take the course.
                const basketCourses = (basketCoursesRaw || []).filter(c => {
                    const r = c.restricted_majors;
                    if (!r || r.length === 0) return true;
                    return prof?.major && r.includes(prof.major);
                });

                if (!basketCourses.length) {
                    setAllSections(prev => ({ ...prev, [courseId]: [] }));
                    return;
                }

                const newExtraNames = {};
                const newExtraCredits = {};
                basketCourses.forEach(c => {
                    newExtraNames[c.course_id] = c.course_name;
                    newExtraCredits[c.course_id] = c.credit_hours || 0;
                });
                setExtraCourseNames(prev => ({ ...prev, ...newExtraNames }));
                setExtraCourseCredits(prev => ({ ...prev, ...newExtraCredits }));

                const courseIds = basketCourses.map(c => c.course_id);

                // 2. Get sections for these courses
                let basketQuery = supabase
                    .from('sections')
                    .select('*')
                    .in('course_id', courseIds)
                    .or(campusFilterFor).eq('is_active', true)
                    .order('section_num');
                if (selectedTerm) basketQuery = basketQuery.eq('term_code', selectedTerm);
                const { data } = await basketQuery;

                setAllSections(prev => ({ ...prev, [courseId]: mapSectionsData(data) || [] }));
                return;
            }

            let regularQuery = supabase
                .from('sections').select('*').eq('course_id', courseId)
                .or(campusFilterFor).eq('is_active', true).order('section_num');
            if (selectedTerm) regularQuery = regularQuery.eq('term_code', selectedTerm);
            const { data } = await regularQuery;
            const mapped = await applyMajorRules(courseId, mapSectionsData(data) || [], prof);
            setAllSections(prev => ({ ...prev, [courseId]: mapped }));
        } finally {
            setLoadingCourseIds(prev => {
                const next = new Set(prev);
                next.delete(courseId);
                return next;
            });
        }
    };

    const addCourse = (course) => {
        if (selectedCourses.find(c => c.course_id === course.course_id)) return;
        if (selectedCourses.length >= 8) return;
        setSelectedCourses(prev => [...prev, course]);
        setCourseSearch('');
        setShowDropdown(false);
        setResults(null);
        fetchSectionsForCourse(course.course_id);
    };

    const addDeptElective = () => {
        const maxElectives = majorInfo?.dept_electives_count || 0;
        const hasSupportElectives = majorInfo?.support_electives_count > 0;
        const label = hasSupportElectives ? 'Major Elective' : 'Department Elective';

        if (maxElectives === 0) {
            setError(`Your major does not have ${label.toLowerCase()}s configured.`);
            return;
        }

        // Find next available department elective ID
        let nextIndex = 1;
        while (selectedCourses.find(c => c.course_id === `BASKET_DEPT_${nextIndex}`)) {
            nextIndex++;
        }

        // Max based on major
        if (nextIndex > maxElectives) {
            setError(`Maximum of ${maxElectives} ${label.toLowerCase()}s allowed for your major.`);
            return;
        }

        addCourse({
            course_id: `BASKET_DEPT_${nextIndex}`,
            name: `${label} ${nextIndex}`,
            is_basket: true,
            basket_name: label
        });
    };

    const addSupportElective = () => {
        const maxElectives = majorInfo?.support_electives_count || 0;

        if (maxElectives === 0) {
            setError('Your major does not have support electives configured.');
            return;
        }

        let nextIndex = 1;
        while (selectedCourses.find(c => c.course_id === `BASKET_SUPPORT_${nextIndex}`)) {
            nextIndex++;
        }

        if (nextIndex > maxElectives) {
            setError(`Maximum of ${maxElectives} support electives allowed for your major.`);
            return;
        }

        addCourse({
            course_id: `BASKET_SUPPORT_${nextIndex}`,
            name: `Support Elective ${nextIndex}`,
            is_basket: true,
            basket_name: 'Support Elective'
        });
    };

    const removeCourse = (courseId) => {
        setSelectedCourses(prev => {
            const next = prev.filter(c => c.course_id !== courseId);

            // Cleanup shared BASKET_DEPT preferences if the last one was removed
            if (courseId.startsWith('BASKET_DEPT_') && !next.some(c => c.course_id.startsWith('BASKET_DEPT_'))) {
                setPrefs(p => {
                    const pe = { ...p.preferredElectives }; delete pe['BASKET_DEPT'];
                    const hf = { ...p.hardElectiveFilter }; delete hf['BASKET_DEPT'];
                    return { ...p, preferredElectives: pe, hardElectiveFilter: hf };
                });
            }
            // Cleanup shared BASKET_SUPPORT preferences if the last one was removed
            if (courseId.startsWith('BASKET_SUPPORT_') && !next.some(c => c.course_id.startsWith('BASKET_SUPPORT_'))) {
                setPrefs(p => {
                    const pe = { ...p.preferredElectives }; delete pe['BASKET_SUPPORT'];
                    const hf = { ...p.hardElectiveFilter }; delete hf['BASKET_SUPPORT'];
                    return { ...p, preferredElectives: pe, hardElectiveFilter: hf };
                });
            }
            return next;
        });
        setAllSections(prev => { const n = { ...prev }; delete n[courseId]; return n; });
        setPrefs(prev => {
            const pi = { ...prev.preferredInstructors }; delete pi[courseId];
            const ps = { ...prev.pinnedSections }; delete ps[courseId];
            const pl = { ...prev.pinnedLabs }; delete pl[courseId];
            const pe = { ...prev.preferredElectives }; delete pe[courseId];
            const hf = { ...prev.hardElectiveFilter }; delete hf[courseId];
            return { ...prev, preferredInstructors: pi, pinnedSections: ps, pinnedLabs: pl, preferredElectives: pe, hardElectiveFilter: hf };
        });
        // Clean up XOR set
        setXorCourseIds(prev => {
            const next = new Set(prev);
            next.delete(courseId);
            return next;
        });
        setResults(null);
    };

    const toggleXor = (courseId) => {
        setXorCourseIds(prev => {
            const next = new Set(prev);
            if (next.has(courseId)) {
                next.delete(courseId);
            } else {
                next.add(courseId);
            }
            return next;
        });
        setResults(null);
    };

    const filteredCourses = courseSearch.length >= 2
        ? courses.filter(c =>
            !selectedCourses.find(sc => sc.course_id === c.course_id) && (
                c.name?.toLowerCase().includes(courseSearch.toLowerCase()) ||
                c.course_id?.includes(courseSearch)
            )
        ).slice(0, 8)
        : [];

    // For a picker course with no sections in the term being planned, what to
    // say about it instead: when it last ran, if in History's terms. Null when
    // it is open, or while the term's own sections aren't known (a term not
    // loaded yet would otherwise mark every course closed).
    const notOpenNote = (courseId) => {
        if (!termCounts) return null;
        const termLoaded = Object.values(termCounts).some(list => list.some(e => e.term === selectedTerm));
        if (!termLoaded) return null;
        const list = termCounts[courseId] || [];
        if (list.some(e => e.term === selectedTerm)) return null;
        const last = list.find(e => e.term !== selectedTerm);
        const closed = `Not open in ${termLabel(selectedTerm)}.`;
        return last
            ? `${closed} Last ran ${termLabel(last.term)}, ${last.sections} ${last.sections === 1 ? 'section' : 'sections'}.`
            : `${closed} Not offered in the last ${historyTerms(selectedTerm).length} terms either.`;
    };

    // Get unique instructors for a course
    const getInstructors = (courseId) => {
        const secs = allSections[courseId] || [];
        const instructors = new Set();
        secs.forEach(s => { if (s.instructor) instructors.add(s.instructor); });
        return [...instructors].sort();
    };

    // Get unique base (lecture) sections
    const getBaseSections = (courseId) => {
        const secs = allSections[courseId] || [];
        const baseMap = {};
        for (const s of secs) {
            const base = getBaseSection(s.section_num);
            if (!baseMap[base]) {
                baseMap[base] = s;
            } else if (s.section_num === base) {
                baseMap[base] = s;
            }
        }
        return Object.values(baseMap).sort((a, b) =>
            getBaseSection(a.section_num).localeCompare(getBaseSection(b.section_num))
        );
    };

    // Labs offered for a pinned lecture come from Banner's links only. A course
    // Banner does not link has no attached labs by definition -- its lab
    // sections are standalone options and appear in their own right.
    const getLabSections = (courseId, pinnedBase) => {
        const secs = allSections[courseId] || [];
        if (!pinnedBase) {
            return secs.filter(s => linkMap[s.crn] && !isTutorial(s))
                .sort((a, b) => a.section_num.localeCompare(b.section_num));
        }

        const pinnedSec = secs.find(s => s.section_num === pinnedBase);
        const partners = pinnedSec ? linkedPartners(pinnedSec, secs, linkMap) : null;
        if (!partners) return [];

        return partners.filter(s => !isTutorial(s))
            .sort((a, b) => a.section_num.localeCompare(b.section_num));
    };

    // Every legal way to take one cart course: its Banner-linked section
    // groups, or for an elective slot, the groups of every course in it.
    const buildGroupsForCourse = (c) => {
        const sections = allSections[c.course_id] || [];
        if (c.course_id.startsWith('BASKET_')) {
            const sectionsByCourse = {};
            for (const sec of sections) {
                if (!sectionsByCourse[sec.course_id]) sectionsByCourse[sec.course_id] = [];
                sectionsByCourse[sec.course_id].push(sec);
            }
            let basketOptions = [];
            for (const [subCourseId, subSections] of Object.entries(sectionsByCourse)) {
                const subGroups = buildSectionGroups(subSections, subCourseId, linkMap);
                subGroups.forEach(g => g.originalCourseId = c.course_id);
                basketOptions = basketOptions.concat(subGroups);
            }
            return basketOptions;
        }
        return buildSectionGroups(sections, c.course_id, linkMap);
    };

    const handleGenerate = () => {
        setError('');
        if (selectedCourses.length === 0) { setError('Please add at least one course'); return; }

        // Check if all sections are loaded
        const missing = selectedCourses.filter(c => !allSections[c.course_id]);
        if (missing.length > 0) { setError('Still loading section data...'); return; }

        setGenerating(true);
        setResults(null);
        setShowCount(3);

        // Use setTimeout to avoid blocking the UI
        setTimeout(() => {
            try {
                // Build course name map
                const courseNames = {};
                for (const c of selectedCourses) {
                    courseNames[c.course_id] = c.name;
                }

                // Split courses into normal and XOR
                const activeXor = selectedCourses.filter(c => xorCourseIds.has(c.course_id));
                const normalCourses = selectedCourses.filter(c => !xorCourseIds.has(c.course_id));

                // Build groups for normal courses
                const baseCourseGroups = {};
                for (const c of normalCourses) {
                    baseCourseGroups[c.course_id] = buildGroupsForCourse(c);
                }

                // Check if any normal course has no available groups
                for (const c of normalCourses) {
                    if (baseCourseGroups[c.course_id].length === 0) {
                        setError(`No available sections found for ${c.name} (${c.course_id})`);
                        setGenerating(false);
                        return;
                    }
                }

                let allScored;

                if (activeXor.length <= 1) {
                    // No XOR logic needed (0 or 1 XOR course = normal behavior)
                    const courseGroups = { ...baseCourseGroups };
                    for (const c of activeXor) {
                        courseGroups[c.course_id] = buildGroupsForCourse(c);
                    }
                    // Check XOR course groups too
                    for (const c of activeXor) {
                        if (courseGroups[c.course_id].length === 0) {
                            setError(`No available sections found for ${c.name} (${c.course_id})`);
                            setGenerating(false);
                            return;
                        }
                    }
                    allScored = generateSchedules(courseGroups, prefs, courseNames);
                } else {
                    // XOR logic: generate schedules for each XOR course individually,
                    // combined with all normal courses, then merge results
                    allScored = [];
                    for (const xorCourse of activeXor) {
                        const groups = buildGroupsForCourse(xorCourse);
                        if (groups.length === 0) continue; // Skip XOR courses with no sections

                        const courseGroups = { ...baseCourseGroups, [xorCourse.course_id]: groups };
                        const scored = generateSchedules(courseGroups, prefs, courseNames);
                        scored.forEach(r => {
                            r.xorSelected = { id: xorCourse.course_id, name: xorCourse.name };
                        });
                        allScored = allScored.concat(scored);
                    }
                    // Re-sort merged results by score and cap at 100
                    allScored.sort((a, b) => b.score - a.score);
                    allScored = allScored.slice(0, 100);
                }

                setResults(allScored);
                setSavedScheduleIdx(null);
                setShowAlternatives(false);
                // Clear saved schedule when regenerating
                localStorage.removeItem('schedule_saved');
            } catch (e) {
                setError('Error generating schedules: ' + e.message);
            }
            setGenerating(false);
        }, 50);
    };

    const handleGenerateBestEffort = () => {
        setError('');
        setGenerating(true);
        setResults(null);
        setShowCount(3);

        setTimeout(() => {
            try {
                const courseNames = {};
                const allCourseGroups = {};
                for (const c of selectedCourses) {
                    courseNames[c.course_id] = c.name;
                    const groups = buildGroupsForCourse(c);
                    if (groups.length > 0) {
                        allCourseGroups[c.course_id] = groups;
                    }
                }
                const courseIds = Object.keys(allCourseGroups);

                // Generate all combinations of a given size
                const getCombinations = (arr, size) => {
                    if (size === 0) return [[]];
                    if (arr.length < size) return [];
                    const out = [];
                    for (let i = 0; i <= arr.length - size; i++) {
                        const rest = getCombinations(arr.slice(i + 1), size - 1);
                        for (const combo of rest) {
                            out.push([arr[i], ...combo]);
                        }
                    }
                    return out;
                };

                // Try subsets from largest (N-1) to smallest (1)
                let allScored = [];
                for (let size = courseIds.length - 1; size >= 1; size--) {
                    const combos = getCombinations(courseIds, size);
                    for (const combo of combos) {
                        const subGroups = {};
                        for (const cid of combo) {
                            subGroups[cid] = allCourseGroups[cid];
                        }
                        const scored = generateSchedules(subGroups, prefs, courseNames);
                        // Tag each result with which courses were dropped
                        const dropped = courseIds.filter(id => !combo.includes(id));
                        const droppedNames = dropped.map(id => courseNames[id] || id);
                        scored.forEach(r => {
                            r.warnings = [
                                `Excluded: ${droppedNames.join(', ')}`,
                                ...r.warnings
                            ];
                        });
                        allScored = allScored.concat(scored);
                    }
                    if (allScored.length > 0) break; // Found results at this size, stop
                }

                allScored.sort((a, b) => b.score - a.score);
                allScored = allScored.slice(0, 100);

                setResults(allScored);
                setSavedScheduleIdx(null);
                setShowAlternatives(false);
                localStorage.removeItem('schedule_saved');
            } catch (e) {
                setError('Error generating schedules: ' + e.message);
            }
            setGenerating(false);
        }, 50);
    };

    const courseNameMap = useMemo(() => {
        const m = { ...extraCourseNames };
        selectedCourses.forEach(c => { m[c.course_id] = c.name; });
        return m;
    }, [selectedCourses, extraCourseNames]);

    const courseCreditsMap = useMemo(() => {
        const m = { ...extraCourseCredits };
        selectedCourses.forEach(c => { m[c.course_id] = c.credit_hours || 0; });
        return m;
    }, [selectedCourses, extraCourseCredits]);

    // When nothing fits: the pairs of courses that clash in every possible
    // combination of their sections, so the student knows what to change.
    const conflictPairs = useMemo(() => {
        if (!results || results.length !== 0) return [];
        const list = selectedCourses
            .filter(c => !xorCourseIds.has(c.course_id))
            .map(c => ({ c, groups: buildGroupsForCourse(c) }))
            .filter(x => x.groups.length > 0 && x.groups.length <= 400);
        const pairs = [];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = list[i];
                const b = list[j];
                const always = a.groups.every(ga => b.groups.every(gb => groupConflicts(ga, gb) || ga.courseId === gb.courseId));
                if (always) pairs.push([a.c, b.c]);
            }
        }
        return pairs;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results, selectedCourses, xorCourseIds, allSections, linkMap]);

    // Warning text for a course whose listed prerequisite is also in the cart.
    const prereqNote = (courseId) => {
        const names = (prereqMap[courseId] || []).map(id => courseNameMap[id] || id);
        if (names.length === 0) return null;
        const one = names.length === 1;
        const list = one ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        return `${list} ${one ? 'is' : 'are'} listed as ${one ? 'a prerequisite' : 'prerequisites'}. `
            + `Taking both together only works if ${one ? "it's a co-requisite" : "they're co-requisites"}. Check before you register.`;
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handler = () => setShowDropdown(false);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    // Scroll to top when an error appears
    useEffect(() => {
        if (error) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [error]);

    const [activeIdx, setActiveIdx] = useState(-1);
    useEffect(() => { setActiveIdx(-1); }, [courseSearch]);

    if (!profile) {
        return (
            <PageShell width="wide">
                <div className={styles.loadingPage} aria-busy="true">
                    <Skeleton width={180} height={30} radius={8} />
                    <Skeleton width={360} height={14} />
                    <div className={styles.loadingGrid}>
                        <Skeleton height={420} radius={18} />
                        <Skeleton height={420} radius={18} />
                    </div>
                </div>
            </PageShell>
        );
    }

    const hasResults = !!(results && results.length > 0);
    const cartCredits = selectedCourses.reduce((sum, c) => sum + (c.is_basket || c.course_id.startsWith('BASKET_') ? 0 : (c.credit_hours || 0)), 0);
    const hasBasketCredits = selectedCourses.some(c => c.course_id.startsWith('BASKET_'));
    const prefCount = [
        prefs.noClassesBefore, prefs.noClassesAfter, prefs.languagePref !== 'any', prefs.gapPref !== 'none',
        prefs.compactPref !== 'none', prefs.hideMixedSections, prefs.strictTime,
        ...Object.values(prefs.preferredInstructors).filter(Boolean),
        ...Object.values(prefs.pinnedSections).filter(Boolean),
        ...Object.values(prefs.pinnedLabs || {}).filter(Boolean),
        ...Object.values(prefs.preferredElectives || {}).filter(v => v && v.length),
    ].filter(Boolean).length;
    const loadingAny = loadingCourseIds.size > 0;
    const cartIndex = (id) => selectedCourses.findIndex(c => c.course_id === id);

    const onCourseKeyDown = (e) => {
        if (!showDropdown || filteredCourses.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filteredCourses.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' && activeIdx >= 0) {
            e.preventDefault();
            const course = filteredCourses[activeIdx];
            if (!notOpenNote(course.course_id)) addCourse(course);
        } else if (e.key === 'Escape') setShowDropdown(false);
    };

    const segment = (value, label) => ({ value, label });

    return (
        <PageShell width="wide">
            <PageHeader
                title="Schedule"
                subtitle={mode === 'build'
                    ? 'Pick your courses and CourseMate finds every timetable that fits, ranked by your preferences.'
                    : mode === 'instructor'
                        ? 'Look up anyone teaching this term and see their whole week.'
                        : 'See how a course ran in recent terms before you plan around it.'}
            >
                <SemesterPicker />
            </PageHeader>

            {/* Building a timetable, looking up an instructor and checking a
                course's past answer the same question — when does this
                happen — so they are peer modes of one page. */}
            <Tabs
                label="Schedule mode"
                value={mode}
                onChange={switchMode}
                tabs={[
                    { value: 'build', label: 'Build', icon: <ScheduleIcon /> },
                    { value: 'instructor', label: 'Find instructor', icon: <UserCheckIcon /> },
                    { value: 'history', label: 'Course history', icon: <HistoryIcon /> },
                ]}
            />

            {mode === 'instructor' && <InstructorFinder />}

            {mode === 'history' && (
                <CourseHistory
                    request={historyRequest}
                    onBackToBuild={historyFromBuild ? () => switchMode('build') : null}
                />
            )}

            {sheetCourse && (
                <HistorySheet
                    course={sheetCourse}
                    onClose={() => setSheetCourse(null)}
                    onSeeAll={(term) => openHistory(sheetCourse, term)}
                />
            )}

            <div className={`${styles.workspace} ${hasResults ? styles.hasResults : ''}`} hidden={mode !== 'build'}>
                {/* ===== Builder ===== */}
                <aside className={styles.builder} aria-label="Your courses and preferences">
                    {/* Phones, once there are results: the cart folds to a strip. */}
                    {hasResults && (
                        <div className={styles.compactBar}>
                            <div className={styles.compactCourses}>
                                {selectedCourses.map(c => (
                                    <span
                                        key={c.course_id}
                                        className={`${styles.compactChip} ${prereqMap[c.course_id] ? styles.compactChipPrereq : ''}`}
                                        title={prereqNote(c.course_id) || c.name}
                                    >
                                        <span className={styles.compactDot} style={{ '--c': paletteFor(cartIndex(c.course_id)) }} />
                                        {c.course_id.startsWith('BASKET_') ? c.name.replace(/University Elective \(Basket (\d)\)/, 'Univ. elective $1') : c.course_id}
                                    </span>
                                ))}
                            </div>
                            <Button size="sm" variant="secondary" icon={<EditIcon />} onClick={() => setResults(null)}>Edit</Button>
                        </div>
                    )}

                    <div className={styles.builderStack}>
                        {/* A guest has no profile campus, so they pick which sections to see. */}
                        {profile.isGuest && (
                            <section className={styles.panel}>
                                <div className={styles.panelHead}>
                                    <h2 className={styles.panelTitle}>Campus</h2>
                                    <span className={styles.panelMeta}>Which sections you can take</span>
                                </div>
                                <SegmentedControl
                                    full
                                    label="Campus"
                                    value={profile.gender}
                                    onChange={switchGuestCampus}
                                    options={[
                                        { value: 'male', label: "Men's campus" },
                                        { value: 'female', label: "Women's campus" },
                                    ]}
                                />
                            </section>
                        )}

                        {/* ===== Courses ===== */}
                        <section className={styles.panel} aria-labelledby="cart-title">
                            <div className={styles.panelHead}>
                                <h2 id="cart-title" className={styles.panelTitle}>Courses</h2>
                                <span className={styles.panelMeta}>
                                    <strong>{selectedCourses.length}</strong> of 8
                                    {cartCredits > 0 && <> · <strong>{cartCredits}</strong>{hasBasketCredits ? '+' : ''} credits</>}
                                </span>
                            </div>

                            <div className={styles.searchWrapper} onClick={e => e.stopPropagation()}>
                                <SearchInput
                                    value={courseSearch}
                                    onChange={(e) => { setCourseSearch(e.target.value); setShowDropdown(true); }}
                                    onFocus={() => setShowDropdown(true)}
                                    onKeyDown={onCourseKeyDown}
                                    placeholder={selectedCourses.length >= 8 ? 'Eight courses is the most' : 'Add a course by name or ID'}
                                    disabled={selectedCourses.length >= 8}
                                    autoComplete="off"
                                    role="combobox"
                                    aria-expanded={showDropdown && filteredCourses.length > 0}
                                    aria-controls="cart-search-list"
                                    aria-label="Add a course"
                                />
                                {showDropdown && filteredCourses.length > 0 && (
                                    <div className={styles.dropdown} id="cart-search-list" role="listbox">
                                        {filteredCourses.map((course, i) => {
                                            const closedNote = notOpenNote(course.course_id);
                                            if (!closedNote) {
                                                return (
                                                    <button
                                                        key={course.course_id}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={i === activeIdx}
                                                        className={`${styles.dropdownItem} ${i === activeIdx ? styles.dropdownItemActive : ''}`}
                                                        onClick={() => addCourse(course)}
                                                    >
                                                        <CourseSwatch courseId={course.course_id} size="sm" />
                                                        <span className={styles.dropdownText}>
                                                            <span className={styles.dropdownName}>{course.name}</span>
                                                            <span className={styles.dropdownId}>{course.course_id}{course.credit_hours ? ` · ${course.credit_hours} credits` : ''}</span>
                                                        </span>
                                                        <PlusIcon className={styles.dropdownAdd} />
                                                    </button>
                                                );
                                            }
                                            return (
                                                <div key={course.course_id} className={styles.dropdownClosed}>
                                                    <CourseSwatch courseId={course.course_id} size="sm" className={styles.dropdownClosedSwatch} />
                                                    <span className={styles.dropdownText}>
                                                        <span className={styles.dropdownName}>{course.name}</span>
                                                        <span className={styles.dropdownClosedNote}>{closedNote}</span>
                                                    </span>
                                                    <Button size="sm" variant="ghost" icon={<HistoryIcon />} onClick={() => openHistory(course)}>History</Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {selectedCourses.length > 0 ? (
                                <ul className={styles.cart}>
                                    {selectedCourses.map((c, i) => {
                                        const isBasket = c.course_id.startsWith('BASKET_');
                                        const isXor = xorCourseIds.has(c.course_id);
                                        return (
                                            <li key={c.course_id} className={`${styles.cartItem} ${isXor ? styles.cartItemXor : ''}`}>
                                                <div className={styles.cartRow}>
                                                    <CourseSwatch
                                                        courseId={c.course_id}
                                                        color={paletteFor(i)}
                                                        label={isBasket ? (c.course_id.startsWith('BASKET_DEPT') ? 'D' : c.course_id.startsWith('BASKET_SUPPORT') ? 'S' : `U${c.course_id.slice(-1)}`) : undefined}
                                                    />
                                                    <span className={styles.cartText}>
                                                        <span className={styles.cartName}>{c.name}</span>
                                                        <span className={styles.cartMeta}>
                                                            {isBasket ? 'Any course in this slot' : c.course_id}
                                                            {!isBasket && c.credit_hours ? ` · ${c.credit_hours} cr` : ''}
                                                            {loadingCourseIds.has(c.course_id) && <span className={styles.cartLoading}><Spinner /> loading sections</span>}
                                                        </span>
                                                    </span>
                                                    <span className={styles.cartActions}>
                                                        <Tooltip label={isXor ? 'Either-or: on' : 'Either-or'}>
                                                            <button
                                                                type="button"
                                                                className={`${styles.xorToggle} ${isXor ? styles.xorToggleActive : ''}`}
                                                                onClick={() => toggleXor(c.course_id)}
                                                                aria-pressed={isXor}
                                                                aria-label={`Either-or for ${c.name}: only one either-or course appears per schedule`}
                                                            >
                                                                OR
                                                            </button>
                                                        </Tooltip>
                                                        {/^\d+$/.test(c.course_id) && (
                                                            <Tooltip label="Past terms">
                                                                <button
                                                                    type="button"
                                                                    className={styles.iconBtn}
                                                                    onClick={() => setSheetCourse(c)}
                                                                    aria-label={`Past terms for ${c.name}`}
                                                                >
                                                                    <HistoryIcon />
                                                                </button>
                                                            </Tooltip>
                                                        )}
                                                        <Tooltip label="Remove">
                                                            <button
                                                                type="button"
                                                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                                onClick={() => removeCourse(c.course_id)}
                                                                aria-label={`Remove ${c.name}`}
                                                            >
                                                                <CloseIcon />
                                                            </button>
                                                        </Tooltip>
                                                    </span>
                                                </div>
                                                {prereqMap[c.course_id] && (
                                                    <p className={styles.prereqNote}>
                                                        <AlertIcon />
                                                        <span>{prereqNote(c.course_id)}</span>
                                                    </p>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <div className={styles.cartEmpty}>
                                    <span className={styles.cartEmptyIcon}><LayersIcon /></span>
                                    <span>
                                        <strong>Start with the courses you plan to take.</strong>
                                        Search above, or hold a place for an elective below and let the builder pick it.
                                    </span>
                                </div>
                            )}

                            {xorCourseIds.size >= 1 && (
                                <p className={styles.xorInfo}>
                                    <strong>Either-or:</strong> each schedule includes only one of the courses marked OR.
                                </p>
                            )}

                            <div className={styles.slots}>
                                <span className={styles.slotsLabel}>Elective slots</span>
                                <div className={styles.slotGrid}>
                                    <button type="button" className={styles.slotBtn} onClick={() => addCourse({ course_id: 'BASKET_1', name: 'University Elective (Basket 1)', is_basket: true, basket_name: 'Basket 1' })}>
                                        <PlusIcon />University elective 1
                                    </button>
                                    <button type="button" className={styles.slotBtn} onClick={() => addCourse({ course_id: 'BASKET_2', name: 'University Elective (Basket 2)', is_basket: true, basket_name: 'Basket 2' })}>
                                        <PlusIcon />University elective 2
                                    </button>
                                    {majorInfo?.dept_electives_count > 0 && majorInfo?.support_electives_count > 0 ? (
                                        <>
                                            <button type="button" className={styles.slotBtn} onClick={addDeptElective}>
                                                <PlusIcon />Major elective
                                            </button>
                                            <button type="button" className={styles.slotBtn} onClick={addSupportElective}>
                                                <PlusIcon />Support elective
                                            </button>
                                        </>
                                    ) : majorInfo?.dept_electives_count > 0 ? (
                                        <button type="button" className={`${styles.slotBtn} ${styles.slotBtnWide}`} onClick={addDeptElective}>
                                            <PlusIcon />Department elective
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </section>

                        {/* ===== Preferences ===== */}
                        {selectedCourses.length > 0 && (
                            <section className={`${styles.panel} ${styles.prefsPanel}`}>
                                <button type="button" className={styles.prefsHeader} onClick={() => setPrefsOpen(!prefsOpen)} aria-expanded={prefsOpen}>
                                    <span className={styles.prefsHeaderIcon}><SlidersIcon /></span>
                                    <span className={styles.prefsHeaderText}>
                                        <span className={styles.panelTitle}>Preferences</span>
                                        <span className={styles.panelMeta}>{prefCount > 0 ? `${prefCount} set` : 'Times, days, gaps, instructors'}</span>
                                    </span>
                                    <ChevronDownIcon className={`${styles.prefsChevron} ${prefsOpen ? styles.prefsChevronOpen : ''}`} />
                                </button>
                                {prefsOpen && (
                                    <div className={styles.prefsBody}>
                                        <div className={styles.prefGroup}>
                                            <span className={styles.prefLabel}>Class times</span>
                                            <div className={styles.timeRow}>
                                                <Field label="Not before" className={styles.timeField}>
                                                    <Select size="sm" value={prefs.noClassesBefore} onChange={e => setPrefs(p => ({ ...p, noClassesBefore: e.target.value }))}>
                                                        <option value="">Any time</option>
                                                        <option value="09:30 AM">9:30 AM</option>
                                                        <option value="11:00 AM">11:00 AM</option>
                                                        <option value="12:30 PM">12:30 PM</option>
                                                        <option value="02:00 PM">2:00 PM</option>
                                                    </Select>
                                                </Field>
                                                <Field label="Not after" className={styles.timeField}>
                                                    <Select size="sm" value={prefs.noClassesAfter} onChange={e => setPrefs(p => ({ ...p, noClassesAfter: e.target.value }))}>
                                                        <option value="">Any time</option>
                                                        <option value="02:00 PM">2:00 PM</option>
                                                        <option value="03:15 PM">3:30 PM</option>
                                                        <option value="05:00 PM">5:00 PM</option>
                                                        <option value="06:30 PM">6:30 PM</option>
                                                    </Select>
                                                </Field>
                                            </div>
                                            <label className={styles.switchRow}>
                                                <span>
                                                    <span className={styles.switchLabel}>Strict times</span>
                                                    <span className={styles.switchSub}>Don&rsquo;t suggest schedules that break them</span>
                                                </span>
                                                <Switch checked={prefs.strictTime} onChange={v => setPrefs(p => ({ ...p, strictTime: v }))} label="Strict time constraints" />
                                            </label>
                                        </div>

                                        <div className={styles.prefGroup}>
                                            <span className={styles.prefLabel}>Section language</span>
                                            <SegmentedControl
                                                full
                                                size="sm"
                                                label="Section language"
                                                value={prefs.languagePref}
                                                onChange={v => setPrefs(p => ({ ...p, languagePref: v }))}
                                                options={[segment('any', 'Any'), segment('english', 'English'), segment('arabic', 'Arabic')]}
                                            />
                                        </div>

                                        <div className={styles.prefGroup}>
                                            <span className={styles.prefLabel}>Gaps between classes</span>
                                            <SegmentedControl
                                                full
                                                size="sm"
                                                label="Gaps between classes"
                                                value={prefs.gapPref}
                                                onChange={v => setPrefs(p => ({ ...p, gapPref: v }))}
                                                options={[segment('none', 'Any'), segment('minimize', 'Fewer gaps'), segment('prefer', 'Some gaps')]}
                                            />
                                        </div>

                                        <div className={styles.prefGroup}>
                                            <span className={styles.prefLabel}>Days on campus</span>
                                            <SegmentedControl
                                                full
                                                size="sm"
                                                label="Days on campus"
                                                value={prefs.compactPref}
                                                onChange={v => setPrefs(p => ({ ...p, compactPref: v }))}
                                                options={[segment('none', 'Any'), segment('fewer', 'Fewer days'), segment('spread', 'Spread out')]}
                                            />
                                        </div>

                                        <label className={styles.switchRow}>
                                            <span>
                                                <span className={styles.switchLabel}>Hide mixed sections</span>
                                                <span className={styles.switchSub}>Skip sections taught on the main campus</span>
                                            </span>
                                            <Switch checked={prefs.hideMixedSections} onChange={v => setPrefs(p => ({ ...p, hideMixedSections: v }))} label="Hide mixed sections" />
                                        </label>

                                        {/* Per-course preferences */}
                                        {selectedCourses.map((c, ci) => {
                                            const isBasket = c.course_id.startsWith('BASKET_');
                                            const isDeptBasket = c.course_id.startsWith('BASKET_DEPT_');
                                            const isSupportBasket = c.course_id.startsWith('BASKET_SUPPORT_');

                                            // If it's a department basket, only show preferences for the FIRST one added
                                            if (isDeptBasket) {
                                                const firstDeptBasket = selectedCourses.find(sc => sc.course_id.startsWith('BASKET_DEPT_'));
                                                if (c.course_id !== firstDeptBasket.course_id) return null;
                                            }
                                            if (isSupportBasket) {
                                                const firstSupportBasket = selectedCourses.find(sc => sc.course_id.startsWith('BASKET_SUPPORT_'));
                                                if (c.course_id !== firstSupportBasket.course_id) return null;
                                            }

                                            if (isBasket) {
                                                const prefsKey = isDeptBasket ? 'BASKET_DEPT' : isSupportBasket ? 'BASKET_SUPPORT' : c.course_id;
                                                const displayName = isDeptBasket ? (majorInfo?.support_electives_count > 0 ? 'Major electives' : 'Department electives') : isSupportBasket ? 'Support electives' : c.name;

                                                const basketSections = allSections[c.course_id] || [];
                                                const subCourseIds = [...new Set(basketSections.map(s => s.course_id))].sort();
                                                if (subCourseIds.length === 0) return null;

                                                const preferred = prefs.preferredElectives?.[prefsKey] || [];
                                                const isHard = prefs.hardElectiveFilter?.[prefsKey] || false;

                                                const toggleElective = (subId) => {
                                                    setPrefs(p => {
                                                        const current = p.preferredElectives?.[prefsKey] || [];
                                                        const next = current.includes(subId)
                                                            ? current.filter(x => x !== subId)
                                                            : [...current, subId];
                                                        return { ...p, preferredElectives: { ...p.preferredElectives, [prefsKey]: next } };
                                                    });
                                                };

                                                return (
                                                    <div key={prefsKey} className={styles.prefCourse}>
                                                        <div className={styles.prefCourseHead}>
                                                            <span className={styles.compactDot} style={{ '--c': paletteFor(ci) }} />
                                                            <span className={styles.prefCourseName}>{displayName}</span>
                                                            <span className={styles.panelMeta}>{preferred.length ? `${preferred.length} preferred` : `${subCourseIds.length} options`}</span>
                                                        </div>
                                                        <div className={styles.electiveList}>
                                                            {subCourseIds.map(subId => (
                                                                <Checkbox
                                                                    key={subId}
                                                                    checked={preferred.includes(subId)}
                                                                    onChange={() => toggleElective(subId)}
                                                                    className={styles.electiveItem}
                                                                >
                                                                    <span className={styles.electiveId}>{subId}</span>
                                                                    {extraCourseNames[subId] && <span className={styles.electiveName}> {extraCourseNames[subId]}</span>}
                                                                </Checkbox>
                                                            ))}
                                                        </div>
                                                        {preferred.length > 0 && (
                                                            <label className={styles.switchRow}>
                                                                <span>
                                                                    <span className={styles.switchLabel}>Only these</span>
                                                                    <span className={styles.switchSub}>Show only schedules with a preferred course</span>
                                                                </span>
                                                                <Switch checked={isHard} onChange={v => setPrefs(p => ({ ...p, hardElectiveFilter: { ...p.hardElectiveFilter, [prefsKey]: v } }))} label="Only show schedules with selected courses" />
                                                            </label>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            // Regular (non-basket) course
                                            const instructors = getInstructors(c.course_id);
                                            const baseSections = getBaseSections(c.course_id);
                                            const pinnedBaseId = prefs.pinnedSections[c.course_id] || '';
                                            const labSections = getLabSections(c.course_id, pinnedBaseId);

                                            if (instructors.length <= 1 && baseSections.length <= 1 && labSections.length <= 1) return null;

                                            return (
                                                <div key={c.course_id} className={styles.prefCourse}>
                                                    <div className={styles.prefCourseHead}>
                                                        <span className={styles.compactDot} style={{ '--c': paletteFor(ci) }} />
                                                        <span className={styles.prefCourseName}>{c.name}</span>
                                                        <span className={styles.prefCourseId}>{c.course_id}</span>
                                                    </div>
                                                    {instructors.length > 1 && (
                                                        <Field label="Instructor">
                                                            <Select size="sm" value={prefs.preferredInstructors[c.course_id] || ''} onChange={e => setPrefs(p => ({ ...p, preferredInstructors: { ...p.preferredInstructors, [c.course_id]: e.target.value } }))}>
                                                                <option value="">Any instructor</option>
                                                                {instructors.map(ins => <option key={ins} value={ins}>{ins}</option>)}
                                                            </Select>
                                                        </Field>
                                                    )}
                                                    {baseSections.length > 1 && (
                                                        <Field label="Lecture section">
                                                            <Select size="sm" value={pinnedBaseId} onChange={e => {
                                                                const newVal = e.target.value;
                                                                setPrefs(p => {
                                                                    const next = { ...p, pinnedSections: { ...p.pinnedSections, [c.course_id]: newVal } };
                                                                    // Clear pinned lab if it no longer belongs to the newly pinned lecture
                                                                    if (newVal && p.pinnedLabs?.[c.course_id]) {
                                                                        const pl = p.pinnedLabs[c.course_id];
                                                                        if (getBaseSection(pl) !== newVal) {
                                                                            delete next.pinnedLabs[c.course_id];
                                                                        }
                                                                    }
                                                                    return next;
                                                                });
                                                            }}>
                                                                <option value="">Any lecture</option>
                                                                {baseSections.map(s => {
                                                                    const baseNum = getBaseSection(s.section_num);
                                                                    return (
                                                                        <option key={baseNum} value={baseNum}>
                                                                            Section {baseNum}{s.class_time ? ` · ${s.class_time}` : ''}{s.instructor ? ` · ${s.instructor}` : ''}{(() => { const q = seatStatus(s); return q ? ` · ${q.label}` : ''; })()}
                                                                        </option>
                                                                    );
                                                                })}
                                                            </Select>
                                                        </Field>
                                                    )}
                                                    {labSections.length > 1 && (
                                                        <Field label="Lab section">
                                                            <Select size="sm" value={prefs.pinnedLabs?.[c.course_id] || ''} onChange={e => setPrefs(p => ({ ...p, pinnedLabs: { ...(p.pinnedLabs || {}), [c.course_id]: e.target.value } }))}>
                                                                <option value="">Any lab</option>
                                                                {labSections.map(s => (
                                                                    <option key={s.section_num} value={s.section_num}>
                                                                        Lab {s.section_num}{s.class_time ? ` · ${s.class_time}` : ''}{s.instructor ? ` · ${s.instructor}` : ''}{(() => { const q = seatStatus(s); return q ? ` · ${q.label}` : ''; })()}
                                                                    </option>
                                                                ))}
                                                            </Select>
                                                        </Field>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        )}
                    </div>

                    {/* Generate */}
                    {selectedCourses.length > 0 && (
                        <div className={styles.generateBar}>
                            <Button
                                variant="primary"
                                size="lg"
                                block
                                onClick={handleGenerate}
                                loading={generating}
                                disabled={loadingAny}
                                icon={hasResults ? <RefreshIcon /> : <SparkleIcon />}
                            >
                                {loadingAny ? 'Loading course data…' : hasResults ? 'Regenerate schedules' : 'Generate schedules'}
                            </Button>
                        </div>
                    )}
                </aside>

                {/* ===== Canvas ===== */}
                <section className={styles.canvas} aria-label="Schedules">
                    {error && (
                        <Callout tone="danger" title="Something needs a look" action={<Button size="sm" variant="ghost" onClick={() => setError('')}>Dismiss</Button>}>
                            {error}
                        </Callout>
                    )}

                    {/* Saved schedules */}
                    {dbSavedSchedules.length > 0 && (
                        <div className={styles.group}>
                            <div className={styles.groupHead}>
                                <h2 className={styles.groupTitle}>
                                    <StarIcon />
                                    Saved
                                </h2>
                                <span className={styles.groupMeta}>{dbSavedSchedules.length} of 3</span>
                            </div>
                            {dbSavedSchedules.map((savedObj, i) => (
                                <ScheduleCard
                                    key={savedObj.dbId}
                                    result={savedObj}
                                    rank={savedObj.name || `Saved schedule ${i + 1}`}
                                    courseNameMap={courseNameMap}
                                    courseCreditsMap={courseCreditsMap}
                                    selectedCourses={savedObj.storedSelectedCourses}
                                    onSave={null}
                                    onUnsave={() => handleDeleteSavedSchedule(savedObj.dbId)}
                                    isSaved={true}
                                    initiallyCollapsed={true}
                                    isSavingSchedule={isSavingSchedule}
                                />
                            ))}
                        </div>
                    )}

                    {/* Results */}
                    {generating && !results && (
                        <div className={styles.generating} aria-live="polite">
                            <div className={styles.generatingGrid} aria-hidden="true">
                                {Array.from({ length: 15 }).map((_, i) => <span key={i} style={{ animationDelay: `${(i % 5) * 80 + Math.floor(i / 5) * 60}ms` }} />)}
                            </div>
                            <p>Fitting {selectedCourses.length} courses together…</p>
                        </div>
                    )}

                    {hasResults && (
                        <div className={styles.group}>
                            <div className={styles.groupHead}>
                                <h2 className={styles.groupTitle}>
                                    <SparkleIcon />
                                    {results.length === 100 ? '100+ schedules' : `${results.length} ${results.length === 1 ? 'schedule' : 'schedules'}`} fit
                                </h2>
                                <span className={styles.groupMeta}>Best fit first</span>
                            </div>
                            {results
                                .slice(0, showCount)
                                .map((result, idx) => {
                                    const sig = getScheduleSignature(result.schedule);
                                    const isSaved = savedSignatures.has(sig);
                                    const dbId = savedSignatures.get(sig);
                                    return (
                                        <ScheduleCard
                                            key={idx}
                                            result={result}
                                            rank={idx + 1}
                                            courseNameMap={courseNameMap}
                                            courseCreditsMap={courseCreditsMap}
                                            selectedCourses={selectedCourses}
                                            onSave={isSaved || profile.isGuest ? null : (name) => handleSaveSchedule(result, name)}
                                            guest={profile.isGuest}
                                            onUnsave={isSaved ? () => handleDeleteSavedSchedule(dbId) : null}
                                            isSaved={isSaved}
                                            initiallyCollapsed={idx > 0}
                                            isSavingSchedule={isSavingSchedule}
                                            savedCount={dbSavedSchedules.length}
                                        />
                                    );
                                })}

                            {(() => {
                                const remaining = results.length;
                                return showCount < remaining && (
                                    <button type="button" className={styles.showMoreBtn} onClick={() => (showCount >= 9 ? setShowCount(remaining + 100) : setShowCount(prev => prev + 3))}>
                                        {showCount >= 9 ? `Show all ${remaining - showCount} remaining` : `Show ${Math.min(3, remaining - showCount)} more`}
                                        <ChevronDownIcon />
                                    </button>
                                );
                            })()}
                        </div>
                    )}

                    {results && results.length === 0 && (
                        <div className={styles.noResults}>
                            <EmptyState
                                tone="neutral"
                                icon={<AlertIcon />}
                                title={`These ${selectedCourses.length} courses don’t fit together`}
                                actions={(
                                    <>
                                        <Button variant="primary" onClick={handleGenerateBestEffort} loading={generating} icon={<SparkleIcon />}>Find the best fit</Button>
                                        <Button variant="secondary" onClick={() => { setResults(null); setPrefsOpen(true); }}>Adjust preferences</Button>
                                    </>
                                )}
                            >
                                Every combination of sections has a clash. Best fit builds schedules with as many of your courses as possible and tells you which it left out.
                            </EmptyState>
                            {conflictPairs.length > 0 && (
                                <div className={styles.conflicts}>
                                    <span className={styles.conflictsLabel}>Always clash</span>
                                    <ul>
                                        {conflictPairs.map(([a, b]) => (
                                            <li key={`${a.course_id}-${b.course_id}`}>
                                                <span className={styles.conflictCourse}><span className={styles.compactDot} style={{ '--c': paletteFor(cartIndex(a.course_id)) }} />{a.name}</span>
                                                <span className={styles.conflictX} aria-label="clashes with"><CloseIcon /></span>
                                                <span className={styles.conflictCourse}><span className={styles.compactDot} style={{ '--c': paletteFor(cartIndex(b.course_id)) }} />{b.name}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <p>Every section of one meets at the same time as every section of the other. Drop one, or mark both OR to try each in turn.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {!results && !generating && (
                        <div className={styles.placeholder}>
                            <div className={styles.ghostGrid} aria-hidden="true">
                                <div className={styles.ghostHead}>
                                    <span />
                                    {ALL_DAYS.map(d => <span key={d}>{d}</span>)}
                                </div>
                                {[8, 9, 10, 11, 12, 13, 14, 15].map(h => (
                                    <div key={h} className={styles.ghostRow}>
                                        <span>{formatTimeShort(h * 60)}</span>
                                        {ALL_DAYS.map(d => <span key={d} />)}
                                    </div>
                                ))}
                                <span className={styles.ghostBlock} style={{ '--c': 'var(--course-1)', '--col': 2, '--row': 1, '--span': 2 }} />
                                <span className={styles.ghostBlock} style={{ '--c': 'var(--course-2)', '--col': 4, '--row': 1, '--span': 2 }} />
                                <span className={styles.ghostBlock} style={{ '--c': 'var(--course-3)', '--col': 3, '--row': 3, '--span': 2 }} />
                                <span className={styles.ghostBlock} style={{ '--c': 'var(--course-4)', '--col': 1, '--row': 5, '--span': 2 }} />
                                <span className={styles.ghostBlock} style={{ '--c': 'var(--course-5)', '--col': 5, '--row': 4, '--span': 2 }} />
                            </div>
                            <div className={styles.placeholderText}>
                                <p className={styles.placeholderTitle}>
                                    {selectedCourses.length === 0 ? 'Your timetable will appear here' : `${selectedCourses.length} ${selectedCourses.length === 1 ? 'course' : 'courses'} ready`}
                                </p>
                                <p className={styles.placeholderBody}>
                                    {selectedCourses.length === 0
                                        ? 'Add the courses you plan to take. CourseMate tries every combination of their sections and keeps the ones without a clash.'
                                        : 'Set any preferences you care about, then generate. Schedules come back ranked by how well they fit.'}
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </PageShell>
    );
}

// ===== SCHEDULE CARD COMPONENT =====

function ScheduleCard({ result, rank, courseNameMap, courseCreditsMap, selectedCourses, onSave, onUnsave, isSaved, initiallyCollapsed = false, isSavingSchedule = false, guest = false, savedCount = 0 }) {
    const { schedule, score, warnings } = result;
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [cardOpen, setCardOpen] = useState(!initiallyCollapsed);
    const [exporting, setExporting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [crnsCopied, setCrnsCopied] = useState(false);
    const [naming, setNaming] = useState(false);
    const [saveName, setSaveName] = useState('');
    const { selectedTerm, semesters } = useSemester();
    const confirm = useConfirm();
    const toast = useToast();
    // Carries the term's dates from Banner, which the calendar export needs.
    const termInfo = semesters?.find(s => s.term_code === selectedTerm);

    // Compute total credit hours for this schedule
    const totalCredits = schedule.reduce((sum, group) => {
        // Use group.courseId to get the actual course selected (bypassing the basket generic ID)
        return sum + (courseCreditsMap[group.courseId] || 0);
    }, 0);

    // Collect all time blocks for the timetable
    const blocks = [];
    schedule.forEach((group) => {
        const courseIdx = selectedCourses.findIndex(c => c.course_id === (group.originalCourseId || group.courseId));
        group.sections.forEach(sec => {
            const slots = parseClassTime(sec.class_time);
            slots.forEach(slot => {
                blocks.push({
                    ...slot,
                    courseId: group.courseId,
                    courseName: courseNameMap[group.courseId] || courseNameMap[group.originalCourseId] || null,
                    sectionNum: sec.section_num,
                    crn: sec.crn || null,
                    instructor: sec.instructor || null,
                    location: sec.location || null,
                    colorIdx: courseIdx % 8,
                });
            });
        });
    });

    // Find which days are used
    const usedDays = [...new Set(blocks.map(b => b.day))];
    const days = ALL_DAYS.filter(d => usedDays.includes(d));
    if (days.length === 0) return null;

    // Find time range
    const minTime = Math.min(...blocks.map(b => b.start));
    const maxTime = Math.max(...blocks.map(b => b.end));
    const startHour = Math.floor(minTime / 60);
    const endHour = Math.ceil(maxTime / 60);

    const PX_PER_MIN = 1;

    // The shape of the week, for comparing schedules at a glance.
    const gapMinutes = days.reduce((sum, d) => {
        const list = blocks.filter(b => b.day === d).sort((a, b) => a.start - b.start);
        let g = 0;
        for (let i = 1; i < list.length; i++) g += Math.max(0, list[i].start - list[i - 1].end);
        return sum + g;
    }, 0);
    const earliest = Math.min(...days.map(d => Math.min(...blocks.filter(b => b.day === d).map(b => b.start))));
    const latest = Math.max(...days.map(d => Math.max(...blocks.filter(b => b.day === d).map(b => b.end))));

    // Full sections do not stop a schedule being built -- it is a plan, and a
    // seat may free up -- but burying that in a badge inside a collapsed
    // details panel means nobody sees it until registration day.
    const fullSections = schedule
        .flatMap(group => group.sections)
        .filter(sec => {
            const seats = seatStatus(sec);
            return seats && seats.tone === 'full';
        });

    const scheduleTitle = Number.isInteger(rank) ? `Option ${rank}` : String(rank);
    // Everything the downloadable sheet shows. Sections come along too, so one
    // with no set time, which has no block on the grid, still gets a mention.
    const exportData = {
        termCode: selectedTerm,
        termName: termInfo?.name,
        blocks,
        entries: schedule.flatMap(group => group.sections.filter(sec => !sec.isMissing).map(sec => ({
            courseId: sec.course_id,
            courseName: courseNameMap[sec.course_id] || courseNameMap[group.courseId] || null,
            sectionNum: sec.section_num,
            classTime: sec.class_time,
        }))),
    };
    const pngFileName = `coursemate-${scheduleTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'schedule'}.png`;
    const allCrns = schedule.flatMap(g => g.sections.filter(s => !s.isMissing && s.crn).map(s => s.crn));

    const handleExportPng = async () => {
        setExporting(true);
        try {
            await downloadSchedulePng({ ...exportData, title: scheduleTitle, fileName: pngFileName });
        } catch (err) {
            console.error('PNG export failed:', err);
            toast.error('Could not create the image. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const handleExportIcs = () => {
        const ok = downloadScheduleIcs({
            blocks,
            term: {
                name: termInfo?.name,
                classesStart: termInfo?.classes_start,
                classesEnd: termInfo?.classes_end,
                noClassDates: termInfo?.no_class_dates,
            },
            fileName: pngFileName.replace(/\.png$/, '.ics'),
        });
        if (!ok) toast.error('This semester has no class dates yet, so a calendar file cannot be made.');
    };

    const handleCopyPng = async () => {
        setExporting(true);
        try {
            const res = await copySchedulePng(exportData);
            // Firefox and plain HTTP have no image clipboard; the image is
            // still worth having, so it downloads instead.
            if (res === 'copied') {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } else {
                await downloadSchedulePng({ ...exportData, title: scheduleTitle, fileName: pngFileName });
            }
        } catch (err) {
            console.error('PNG copy failed:', err);
            toast.error('Could not copy the image. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    // Registration day: every CRN, ready to paste into the portal.
    const handleCopyCrns = async () => {
        try {
            await navigator.clipboard.writeText(allCrns.join(', '));
            setCrnsCopied(true);
            setTimeout(() => setCrnsCopied(false), 2000);
        } catch {
            toast.error('Could not copy. Your browser blocked the clipboard.');
        }
    };

    const handleUnsave = async () => {
        const ok = await confirm({
            title: `Remove “${scheduleTitle}” from saved?`,
            body: 'You can save it again any time you generate it.',
            confirmLabel: 'Remove',
            tone: 'danger',
        });
        if (ok) onUnsave();
    };

    const fitTone = score >= 80 ? 'accent' : score >= 60 ? 'neutral' : 'warning';

    return (
        <article className={`${styles.scheduleCard} ${isSaved ? styles.scheduleCardSaved : ''}`}>
            <header className={styles.cardHeader}>
                <button
                    type="button"
                    className={styles.cardToggle}
                    onClick={() => setCardOpen(!cardOpen)}
                    aria-expanded={cardOpen}
                >
                    <ChevronRightIcon className={`${styles.cardChevron} ${cardOpen ? styles.cardChevronOpen : ''}`} />
                    <span className={styles.cardTitleWrap}>
                        <span className={styles.cardTitle}>{scheduleTitle}</span>
                        <span className={styles.cardSub}>
                            {isSaved && !Number.isInteger(rank) ? 'Saved' : `${schedule.length} ${schedule.length === 1 ? 'course' : 'courses'}`}
                            {totalCredits > 0 && ` · ${totalCredits} credits`}
                        </span>
                    </span>
                </button>
                <Badge tone={fitTone} className={styles.fitBadge} title="How well this schedule fits your preferences, out of 100">
                    Fit {Math.round(score)}
                </Badge>
                <div className={styles.cardActions}>
                    {termInfo?.classes_start && termInfo?.classes_end && (
                        <Tooltip label="Add to calendar">
                            <button type="button" className={styles.iconBtn} onClick={handleExportIcs} aria-label="Download this schedule as a calendar file">
                                <CalendarPlusIcon />
                            </button>
                        </Tooltip>
                    )}
                    <Tooltip label={copied ? 'Copied' : 'Copy image'}>
                        <button
                            type="button"
                            className={`${styles.iconBtn} ${copied ? styles.iconBtnDone : ''}`}
                            onClick={handleCopyPng}
                            disabled={exporting}
                            aria-label="Copy this schedule as an image"
                        >
                            {copied ? <CheckIcon strokeWidth={2.25} /> : <CopyIcon />}
                        </button>
                    </Tooltip>
                    <Tooltip label="Download PNG">
                        <button type="button" className={styles.iconBtn} onClick={handleExportPng} disabled={exporting} aria-label="Export this schedule as a PNG">
                            <DownloadIcon />
                        </button>
                    </Tooltip>
                    {onSave && !isSaved && (
                        <Button
                            size="sm"
                            variant="primary"
                            icon={<StarIcon />}
                            onClick={() => setNaming(true)}
                            disabled={isSavingSchedule || savedCount >= 3}
                            title={savedCount >= 3 ? 'You have 3 saved schedules. Remove one to save another.' : undefined}
                            className={styles.saveBtn}
                        >
                            Save
                        </Button>
                    )}
                    {isSaved && onUnsave && (
                        <Button size="sm" variant="soft" icon={<StarIcon className={styles.starFilled} />} onClick={handleUnsave} disabled={isSavingSchedule} className={styles.saveBtn} title="Saved. Click to remove.">
                            Saved
                        </Button>
                    )}
                    {guest && (
                        <Button size="sm" variant="secondary" icon={<LockIcon />} onClick={refuse} aria-disabled="true" className={styles.saveBtn} title="Create an account to save schedules">
                            Save
                        </Button>
                    )}
                </div>
            </header>

            {/* The week at a glance: always visible, even folded. */}
            <div className={styles.stats}>
                <span className={styles.stat}>
                    <span className={styles.statValue}>{days.length}</span>
                    <span className={styles.statLabel}>{days.length === 1 ? 'day' : 'days'} · {days.map(d => d[0] + d.slice(1, 2)).join(' ')}</span>
                </span>
                <span className={styles.stat}>
                    <span className={styles.statValue}>{formatTimeShort(earliest).replace(' ', '')}</span>
                    <span className={styles.statLabel}>earliest start</span>
                </span>
                <span className={styles.stat}>
                    <span className={styles.statValue}>{formatTimeShort(latest).replace(' ', '')}</span>
                    <span className={styles.statLabel}>latest finish</span>
                </span>
                <span className={styles.stat}>
                    <span className={styles.statValue}>{gapMinutes === 0 ? '0' : formatDuration(gapMinutes)}</span>
                    <span className={styles.statLabel}>between classes</span>
                </span>
                {!cardOpen && <MiniWeek blocks={blocks} days={days} startHour={startHour} endHour={endHour} />}
            </div>

            {cardOpen && (<>
                {(fullSections.length > 0 || result.xorSelected || warnings.length > 0) && (
                    <div className={styles.notes}>
                        {fullSections.length > 0 && (
                            <span className={`${styles.note} ${styles.noteWarn}`}>
                                <AlertIcon />
                                Full now: {fullSections.map(sec => `${courseNameMap[sec.course_id] || sec.course_id} ${sec.section_num}`).join(', ')}
                            </span>
                        )}
                        {result.xorSelected && (() => {
                            let displayName = result.xorSelected.name;
                            let displayId = result.xorSelected.id;
                            // For baskets, find the actual course from the schedule
                            if (result.xorSelected.id.startsWith('BASKET_')) {
                                const basketGroup = schedule.find(g => g.originalCourseId === result.xorSelected.id);
                                if (basketGroup) {
                                    displayId = basketGroup.courseId;
                                    displayName = courseNameMap[basketGroup.courseId] || displayId;
                                }
                            }
                            return (
                                <span className={`${styles.note} ${styles.noteAccent}`}>
                                    <CheckIcon />
                                    Includes {displayName} ({displayId})
                                </span>
                            );
                        })()}
                        {warnings.map((w, i) => (
                            <span key={i} className={styles.note}>{w.replace(/^⚠️\s*/, '')}</span>
                        ))}
                    </div>
                )}

                <div className={styles.timetable}>
                    <WeekGrid
                        days={days}
                        startHour={startHour}
                        endHour={endHour}
                        pxPerMin={PX_PER_MIN}
                        blocks={blocks.map(block => ({
                            day: block.day,
                            start: block.start,
                            end: block.end,
                            color: paletteFor(block.colorIdx),
                            code: block.courseId,
                            section: block.sectionNum,
                            name: block.courseName,
                            meta: block.location,
                            title: `${block.courseId}${block.courseName ? ` ${block.courseName}` : ''} · section ${block.sectionNum} · ${formatRange(block.start, block.end)}${block.location ? ` · ${block.location}` : ''}${block.instructor ? ` · ${block.instructor}` : ''}`,
                        }))}
                    />
                </div>

                {/* Section details */}
                <div className={styles.detailsBar}>
                    <button
                        type="button"
                        className={styles.detailsToggle}
                        onClick={() => setDetailsOpen(prev => !prev)}
                        aria-expanded={detailsOpen}
                    >
                        <ChevronDownIcon className={`${styles.detailsChevron} ${detailsOpen ? styles.detailsChevronOpen : ''}`} />
                        {detailsOpen ? 'Hide sections' : 'Sections, CRNs and rooms'}
                    </button>
                    {allCrns.length > 0 && (
                        <button type="button" className={`${styles.copyCrns} ${crnsCopied ? styles.copyCrnsDone : ''}`} onClick={handleCopyCrns}>
                            {crnsCopied ? <CheckIcon strokeWidth={2.25} /> : <CopyIcon />}
                            {crnsCopied ? 'CRNs copied' : `Copy ${allCrns.length} CRNs`}
                        </button>
                    )}
                </div>
                {detailsOpen && (
                    <ul className={styles.details}>
                        {schedule.map((group) => {
                            const courseIdx = selectedCourses.findIndex(c => c.course_id === (group.originalCourseId || group.courseId));
                            return group.sections.map((sec, secIdx) => {
                                const seats = seatStatus(sec);
                                return (
                                    <li key={sec.crn || `${sec.course_id}-${sec.section_num}-${secIdx}`} className={styles.detailRow} style={{ '--c': paletteFor(courseIdx) }}>
                                        <span className={styles.detailBar} aria-hidden="true" />
                                        <div className={styles.detailMain}>
                                            <span className={styles.detailCourse}>
                                                <span className={styles.detailCourseName}>{courseNameMap[sec.course_id] || sec.course_id}</span>
                                                <span className={styles.detailCourseId}>{sec.course_id}</span>
                                            </span>
                                            <span className={styles.detailMeta}>
                                                <span className={styles.detailTime}>{sec.class_time}</span>
                                                {sec.instructor && <span>{sec.instructor}</span>}
                                                {sec.location && <RoomLink room={sec.location} className={styles.detailRoom} />}
                                            </span>
                                        </div>
                                        <div className={styles.detailSide}>
                                            <Ticket size="sm" label="Sec" section={sec.section_num} tone={sec.isMissing ? 'muted' : 'neutral'} />
                                            {sec.crn && <span className={styles.detailCrn}>CRN {sec.crn}</span>}
                                            {seats && (
                                                <Badge size="sm" dot tone={seats.tone === 'open' ? 'success' : seats.tone === 'low' ? 'warning' : 'neutral'} title={seats.title}>
                                                    {seats.detail}
                                                </Badge>
                                            )}
                                            {isSaved && (
                                                <a className={styles.requestLink} href={`/post?type=request&course=${sec.course_id}&section=${sec.section_num}`}>
                                                    Request
                                                </a>
                                            )}
                                        </div>
                                    </li>
                                );
                            });
                        })}
                    </ul>
                )}
            </>)}

            {/* Three saved schedules all called "Saved schedule 2" help nobody,
                so saving asks what to call this one. */}
            <Dialog
                open={naming}
                onClose={() => !isSavingSchedule && setNaming(false)}
                dismissible={!isSavingSchedule}
                title="Name this schedule"
                description="Saved schedules stay on your account for this term. You can keep up to three."
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setNaming(false)} disabled={isSavingSchedule}>Cancel</Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="save-schedule-form"
                            loading={isSavingSchedule}
                            disabled={!saveName.trim()}
                        >
                            Save schedule
                        </Button>
                    </>
                )}
            >
                <form
                    id="save-schedule-form"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (!saveName.trim()) return;
                        await onSave(saveName);
                        setNaming(false);
                        toast.success(`Saved “${saveName.trim()}”`);
                    }}
                >
                    <Field label="Name" hint={`${saveName.length}/60`}>
                        <Input
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            placeholder={`e.g. ${scheduleTitle}, or “Mornings off”`}
                            maxLength={60}
                            data-autofocus
                            disabled={isSavingSchedule}
                        />
                    </Field>
                </form>
            </Dialog>
        </article>
    );
}

/** The week as a thumbnail: five columns and the blocks, no words. */
function MiniWeek({ blocks, days, startHour, endHour }) {
    const span = Math.max(60, (endHour - startHour) * 60);
    return (
        <span className={styles.miniWeek} aria-hidden="true">
            {ALL_DAYS.map(d => (
                <span key={d} className={`${styles.miniDay} ${days.includes(d) ? '' : styles.miniDayOff}`}>
                    {blocks.filter(b => b.day === d).map((b, i) => (
                        <span
                            key={i}
                            className={styles.miniBlock}
                            style={{
                                top: `${((b.start - startHour * 60) / span) * 100}%`,
                                height: `${((b.end - b.start) / span) * 100}%`,
                                '--c': paletteFor(b.colorIdx),
                            }}
                        />
                    ))}
                </span>
            ))}
        </span>
    );
}
