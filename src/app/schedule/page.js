'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import ThemeToggle from '@/components/ThemeToggle';
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


function getBaseSection(sectionNum) {
    // Strip trailing letters (X, Y, Z, T, L) to get base section number
    return sectionNum.replace(/[A-Za-z]+$/, '');
}

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

function buildSectionGroups(sections, courseId) {
    // Group sections by base section number
    const baseGroups = {};
    for (const sec of sections) {
        if (sec.course_id !== courseId) continue;
        const base = getBaseSection(sec.section_num);
        if (!baseGroups[base]) baseGroups[base] = { base: null, subs: [] };
        if (sec.section_num === base) {
            baseGroups[base].base = sec;
        } else {
            baseGroups[base].subs.push(sec);
        }
    }

    // For each base group, generate one "option" per sub-section choice
    // e.g. base 01 with subs [01X, 01Y] => two groups: [01+01X], [01+01Y]
    // Tutorials (suffix 'T') are mandatory and included in all options.
    const result = [];
    for (const [baseNum, group] of Object.entries(baseGroups)) {
        const baseSec = group.base;
        const subs = group.subs;

        // Separate tutorials (T) from optional labs (X, Y, Z, etc.)
        const tutorials = [];
        const options = [];
        for (const sub of subs) {
            const suffix = sub.section_num.slice(baseNum.length);
            if (suffix === 'T') {
                tutorials.push(sub);
            } else {
                options.push(sub);
            }
        }

        if (!baseSec) {
            // Sub-sections without a base (unusual) — treat each as standalone
            for (const sub of subs) {
                const allSlots = parseClassTime(sub.class_time);
                result.push({ sections: [sub], slots: allSlots, courseId });
            }
        } else if (options.length === 0) {
            // Base + tutorials only (no alternative labs to pick from)
            const secs = [baseSec, ...tutorials];
            const allSlots = secs.flatMap(s => parseClassTime(s.class_time));
            if (secs.length > 0) {
                result.push({ sections: secs, slots: allSlots, courseId });
            }
        } else {
            // Base + tutorials + ONE lab option each
            for (const opt of options) {
                const secs = [baseSec, ...tutorials, opt];
                const allSlots = secs.flatMap(s => parseClassTime(s.class_time));
                result.push({ sections: secs, slots: allSlots, courseId });
            }
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
                const prefsKey = isDept ? 'BASKET_DEPT' : basketId;

                if (!prefs.hardElectiveFilter?.[prefsKey]) {
                    const preferred = prefs.preferredElectives?.[prefsKey] || [];
                    if (preferred.length > 0 && preferred.includes(group.courseId)) {
                        if (isDept) {
                            const deptCount = schedule.filter(g => g.originalCourseId?.startsWith('BASKET_DEPT_')).length;
                            score += (20 / deptCount);
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
    const period = h >= 12 ? 'p' : 'a';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}${period}`;
}

// ===== MAIN COMPONENT =====

export default function SchedulePage() {
    const [profile, setProfile] = useState(null);
    const [majorInfo, setMajorInfo] = useState(null);
    const [courses, setCourses] = useState([]);
    const [selectedCourses, setSelectedCourses] = useState([]);
    const [courseSearch, setCourseSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [allSections, setAllSections] = useState({});
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
    });
    const [generating, setGenerating] = useState(false);
    const [results, setResults] = useState(null);
    const [extraCourseNames, setExtraCourseNames] = useState({});
    const [loadingCourseIds, setLoadingCourseIds] = useState(new Set());
    const [showCount, setShowCount] = useState(3);
    const [error, setError] = useState('');
    const [savedScheduleIdx, setSavedScheduleIdx] = useState(null);
    const [showAlternatives, setShowAlternatives] = useState(false);
    const [restoringFromSave, setRestoringFromSave] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => { checkAuth(); }, []);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/auth'); return; }
        const { data: profileData } = await supabase
            .from('profiles').select('*').eq('id', user.id).single();
        const isComplete = profileData?.name && profileData?.student_id && profileData?.phone;
        if (!isComplete || !profileData?.major) { router.push('/profile?selectMajor=true'); return; }

        // Fetch major info
        const { data: majorData } = await supabase
            .from('majors').select('dept_electives_count').eq('code', profileData.major).single();

        setMajorInfo(majorData || { dept_electives_count: 0 });
        setProfile(profileData);
        fetchCourses(profileData.major);
        restoreSavedSchedule(profileData);
    };

    const restoreSavedSchedule = async (prof) => {
        try {
            const saved = localStorage.getItem('schedule_saved');
            if (!saved) return;
            const { courseIds, savedIdx } = JSON.parse(saved);
            if (!courseIds?.length) return;

            // Fetch course info
            const { data: courseData } = await supabase
                .from('courses').select('course_id, course_name').in('course_id', courseIds);
            if (!courseData?.length) return;

            const restoredCourses = courseData.map(c => ({ course_id: c.course_id, name: c.course_name }));
            setSelectedCourses(restoredCourses);
            setRestoringFromSave(true);

            // Fetch sections for all courses
            const allowedCampuses = prof?.gender === 'male' ? ['main', 'men'] : ['main', 'women'];
            const sectionMap = {};
            for (const cid of courseIds) {
                const { data } = await supabase
                    .from('sections').select('*').eq('course_id', cid)
                    .in('campus', allowedCampuses).order('section_num');
                sectionMap[cid] = data || [];
            }
            setAllSections(sectionMap);

            // Auto-generate
            const courseGroups = {};
            const courseNames = {};
            for (const c of restoredCourses) {
                courseNames[c.course_id] = c.name;
                courseGroups[c.course_id] = buildSectionGroups(sectionMap[c.course_id] || [], c.course_id);
            }

            const scored = generateSchedules(courseGroups, prefs, courseNames);
            setResults(scored);
            if (typeof savedIdx === 'number' && savedIdx < scored.length) {
                setSavedScheduleIdx(savedIdx);
            }
            setRestoringFromSave(false);
        } catch (e) {
            console.error('Error restoring saved schedule:', e);
            setRestoringFromSave(false);
        }
    };

    const fetchCourses = async (userMajor) => {
        if (!userMajor) return;
        const { data: majorCourses } = await supabase
            .from('major_courses').select('course_id').eq('major_code', userMajor);
        if (!majorCourses?.length) return;
        const courseIds = majorCourses.map(mc => mc.course_id);
        const { data } = await supabase
            .from('courses').select('course_id, course_name').in('course_id', courseIds).order('course_id');
        setCourses((data || []).map(c => ({ course_id: c.course_id, name: c.course_name })));
    };

    const fetchSectionsForCourse = async (courseId) => {
        setLoadingCourseIds(prev => new Set([...prev, courseId]));
        const allowedCampuses = profile?.gender === 'male' ? ['main', 'men'] : ['main', 'women'];

        try {
            // Handle Department Electives
            if (courseId.startsWith('BASKET_DEPT')) {
                if (!profile?.major) {
                    setAllSections(prev => ({ ...prev, [courseId]: [] })); // Use passed courseId (e.g. BASKET_DEPT_1)
                    return;
                }

                // 1. Get courses in this major marked as 'Major Elective'
                const { data: majorElectives } = await supabase
                    .from('major_courses')
                    .select('course_id')
                    .eq('major_code', profile.major)
                    .eq('category', 'Major Elective');

                if (!majorElectives?.length) {
                    setAllSections(prev => ({ ...prev, [courseId]: [] }));
                    return;
                }

                const electiveIds = majorElectives.map(mc => mc.course_id);

                // Need course names for the dropdown/display
                const { data: courseData } = await supabase
                    .from('courses')
                    .select('course_id, course_name')
                    .in('course_id', electiveIds);

                const newExtraNames = {};
                if (courseData) {
                    courseData.forEach(c => newExtraNames[c.course_id] = c.course_name);
                    setExtraCourseNames(prev => ({ ...prev, ...newExtraNames }));
                }

                // 2. Get sections for these courses
                const { data } = await supabase
                    .from('sections')
                    .select('*')
                    .in('course_id', electiveIds)
                    .in('campus', allowedCampuses)
                    .order('section_num');

                setAllSections(prev => ({ ...prev, [courseId]: data || [] })); // Assign to specific slot
                return;
            }

            // Handle Basket Wildcards
            if (courseId.startsWith('BASKET_')) {
                const basketName = courseId === 'BASKET_1' ? 'Basket 1' : 'Basket 2';
                // 1. Get courses in this basket
                const { data: basketCourses } = await supabase
                    .from('courses')
                    .select('course_id, course_name')
                    .eq('university_elective_basket', basketName);

                if (!basketCourses?.length) {
                    setAllSections(prev => ({ ...prev, [courseId]: [] }));
                    return;
                }

                const newExtraNames = {};
                basketCourses.forEach(c => newExtraNames[c.course_id] = c.course_name);
                setExtraCourseNames(prev => ({ ...prev, ...newExtraNames }));

                const courseIds = basketCourses.map(c => c.course_id);

                // 2. Get sections for these courses
                const { data } = await supabase
                    .from('sections')
                    .select('*')
                    .in('course_id', courseIds)
                    .in('campus', allowedCampuses)
                    .order('section_num');

                setAllSections(prev => ({ ...prev, [courseId]: data || [] }));
                return;
            }

            const { data } = await supabase
                .from('sections').select('*').eq('course_id', courseId)
                .in('campus', allowedCampuses).order('section_num');
            setAllSections(prev => ({ ...prev, [courseId]: data || [] }));
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

        if (maxElectives === 0) {
            setError('Your major does not have department electives configured.');
            return;
        }

        // Find next available department elective ID
        let nextIndex = 1;
        while (selectedCourses.find(c => c.course_id === `BASKET_DEPT_${nextIndex}`)) {
            nextIndex++;
        }

        // Max based on major
        if (nextIndex > maxElectives) {
            setError(`Maximum of ${maxElectives} department electives allowed for your major.`);
            return;
        }

        addCourse({
            course_id: `BASKET_DEPT_${nextIndex}`,
            name: `Department Elective ${nextIndex}`,
            is_basket: true,
            basket_name: 'Department Elective'
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

    // Get lab sections (filter out T suffixes, and filter by pinned base if set)
    const getLabSections = (courseId, pinnedBase) => {
        const secs = allSections[courseId] || [];
        return secs.filter(s => {
            const base = getBaseSection(s.section_num);
            const suffix = s.section_num.slice(base.length);
            // Hide base lectures and tutorials
            if (suffix === '' || suffix === 'T') return false;
            // If a base lecture is pinned, only show its labs
            if (pinnedBase && base !== pinnedBase) return false;
            return true;
        }).sort((a, b) => a.section_num.localeCompare(b.section_num));
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
                // Build section groups for each course
                const courseGroups = {};
                const courseNames = {};
                for (const c of selectedCourses) {
                    courseNames[c.course_id] = c.name;
                    const sections = allSections[c.course_id] || [];

                    if (c.course_id.startsWith('BASKET_')) {
                        const sectionsByCourse = {};
                        for (const sec of sections) {
                            if (!sectionsByCourse[sec.course_id]) sectionsByCourse[sec.course_id] = [];
                            sectionsByCourse[sec.course_id].push(sec);
                        }

                        let basketOptions = [];
                        for (const [subCourseId, subSections] of Object.entries(sectionsByCourse)) {
                            // Treating each sub-course as a valid option for this slot
                            const subGroups = buildSectionGroups(subSections, subCourseId);
                            // Attach original basket ID for consistent coloring
                            subGroups.forEach(g => g.originalCourseId = c.course_id);
                            basketOptions = basketOptions.concat(subGroups);
                        }
                        courseGroups[c.course_id] = basketOptions;
                    } else {
                        courseGroups[c.course_id] = buildSectionGroups(sections, c.course_id);
                    }
                }

                // Check if any course has no available groups
                for (const c of selectedCourses) {
                    if (courseGroups[c.course_id].length === 0) {
                        setError(`No available sections found for ${c.name} (${c.course_id})`);
                        setGenerating(false);
                        return;
                    }
                }

                const scored = generateSchedules(courseGroups, prefs, courseNames);
                setResults(scored);
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

    const courseNameMap = useMemo(() => {
        const m = { ...extraCourseNames };
        selectedCourses.forEach(c => { m[c.course_id] = c.name; });
        return m;
    }, [selectedCourses, extraCourseNames]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = () => setShowDropdown(false);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    if (!profile) {
        return (
            <div className={styles.page}>
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '40vh' }}>
                    <span className={styles.spinner}></span>
                </div>
                <BottomNav />
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h1>Schedule Builder</h1>
                <ThemeToggle />
            </header>

            <main className={styles.main}>
                {error && <div className={styles.error}>{error}</div>}

                {/* Step 1: Course Selection — compact when results exist */}
                {results && results.length > 0 ? (
                    <div className={styles.compactBar}>
                        <div className={styles.compactCourses}>
                            {selectedCourses.map(c => (
                                <span key={c.course_id} className={styles.compactChip}>{c.course_id}</span>
                            ))}
                        </div>
                        <button
                            className={styles.editCoursesBtn}
                            onClick={() => setResults(null)}
                        >Edit Courses</button>
                    </div>
                ) : (
                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>Select Courses</div>
                        <div className={styles.searchWrapper} onClick={e => e.stopPropagation()}>
                            <input
                                type="text"
                                value={courseSearch}
                                onChange={(e) => { setCourseSearch(e.target.value); setShowDropdown(true); }}
                                onFocus={() => setShowDropdown(true)}
                                className={styles.input}
                                placeholder="Search by course name or ID..."
                                autoComplete="off"
                            />
                            {showDropdown && filteredCourses.length > 0 && (
                                <div className={styles.dropdown}>
                                    {filteredCourses.map(course => (
                                        <button
                                            key={course.course_id}
                                            type="button"
                                            className={styles.dropdownItem}
                                            onClick={() => addCourse(course)}
                                        >
                                            <span className={styles.dropdownId}>{course.course_id}</span>
                                            <span className={styles.dropdownName}>{course.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>



                        {selectedCourses.length > 0 ? (
                            <div className={styles.selectedCourses}>
                                {selectedCourses.map(c => (
                                    <div key={c.course_id} className={styles.courseChip}>
                                        <div className={styles.courseChipInfo}>
                                            <span className={styles.courseChipId}>{c.course_id}</span>
                                            <span className={styles.courseChipName}>{c.name}</span>
                                            {loadingCourseIds.has(c.course_id) && <span className={styles.spinner} style={{ width: 12, height: 12, borderWidth: 2, marginLeft: 8 }}></span>}
                                        </div>
                                        <button className={styles.removeBtn} onClick={() => removeCourse(c.course_id)}>×</button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={styles.emptyCourses}>
                                Add courses to build your schedule
                            </div>
                        )}

                        <div className={styles.basketButtons}>
                            <button
                                className={styles.basketBtn}
                                onClick={() => addCourse({ course_id: 'BASKET_1', name: 'University Elective (Basket 1)', is_basket: true, basket_name: 'Basket 1' })}
                            >
                                + Group 1 Elective
                            </button>
                            <button
                                className={styles.basketBtn}
                                onClick={() => addCourse({ course_id: 'BASKET_2', name: 'University Elective (Basket 2)', is_basket: true, basket_name: 'Basket 2' })}
                            >
                                + Group 2 Elective
                            </button>
                            <button
                                className={`${styles.basketBtn} ${styles.basketBtnFull}`}
                                onClick={addDeptElective}
                            >
                                + Department Elective
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Preferences — hidden when results showing */}
                {selectedCourses.length > 0 && !results && (
                    <div className={styles.section}>
                        <div className={styles.prefsCard}>
                            <div className={styles.prefsHeader} onClick={() => setPrefsOpen(!prefsOpen)}>
                                <span className={styles.prefsHeaderTitle}>Preferences</span>
                                <span className={`${styles.prefsChevron} ${prefsOpen ? styles.prefsChevronOpen : ''}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </span>
                            </div>
                            {prefsOpen && (
                                <div className={styles.prefsBody}>
                                    {/* Time Constraints */}
                                    <div className={styles.prefGroup}>
                                        <span className={styles.prefLabel}>Time Constraints</span>
                                        <div className={styles.timeRow}>
                                            <span className={styles.timeSep}>No classes before</span>
                                            <select
                                                className={styles.timeInput}
                                                value={prefs.noClassesBefore}
                                                onChange={e => setPrefs(p => ({ ...p, noClassesBefore: e.target.value }))}
                                            >
                                                <option value="">Any</option>
                                                <option value="09:30 AM">9:30 AM</option>
                                                <option value="11:00 AM">11:00 AM</option>
                                                <option value="12:30 PM">12:30 PM</option>
                                                <option value="02:00 PM">2:00 PM</option>
                                            </select>
                                        </div>
                                        <div className={styles.timeRow}>
                                            <span className={styles.timeSep}>No classes after</span>
                                            <select
                                                className={styles.timeInput}
                                                value={prefs.noClassesAfter}
                                                onChange={e => setPrefs(p => ({ ...p, noClassesAfter: e.target.value }))}
                                            >
                                                <option value="">Any</option>
                                                <option value="02:00 PM">2:00 PM</option>
                                                <option value="03:15 PM">3:30 PM</option>
                                                <option value="05:00 PM">5:00 PM</option>
                                                <option value="06:30 PM">6:30 PM</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className={styles.prefGroup}>
                                        <span className={styles.prefLabel}>Section Language</span>
                                        <div className={styles.toggleRow}>
                                            <button
                                                className={`${styles.toggleBtn} ${prefs.languagePref === 'any' ? styles.toggleBtnActive : ''}`}
                                                onClick={() => setPrefs(p => ({ ...p, languagePref: 'any' }))}
                                            >Any</button>
                                            <button
                                                className={`${styles.toggleBtn} ${prefs.languagePref === 'english' ? styles.toggleBtnActive : ''}`}
                                                onClick={() => setPrefs(p => ({ ...p, languagePref: 'english' }))}
                                            >English</button>
                                            <button
                                                className={`${styles.toggleBtn} ${prefs.languagePref === 'arabic' ? styles.toggleBtnActive : ''}`}
                                                onClick={() => setPrefs(p => ({ ...p, languagePref: 'arabic' }))}
                                            >Arabic</button>
                                        </div>
                                    </div>

                                    <div className={styles.prefGroup}>
                                        <label className={styles.checkboxLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            <input
                                                type="checkbox"
                                                checked={prefs.strictTime}
                                                onChange={e => setPrefs(p => ({ ...p, strictTime: e.target.checked }))}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                            Strict time constraints (don't show alternatives)
                                        </label>
                                    </div>

                                    {/* Gap Preference */}
                                    <div className={styles.prefGroup}>
                                        <span className={styles.prefLabel}>Gap Preference</span>
                                        <div className={styles.toggleRow}>
                                            <button
                                                className={`${styles.toggleBtn} ${prefs.gapPref === 'none' ? styles.toggleBtnActive : ''}`}
                                                onClick={() => setPrefs(p => ({ ...p, gapPref: 'none' }))}
                                            >No preference</button>
                                            <button
                                                className={`${styles.toggleBtn} ${prefs.gapPref === 'minimize' ? styles.toggleBtnActive : ''}`}
                                                onClick={() => setPrefs(p => ({ ...p, gapPref: 'minimize' }))}
                                            >No gaps</button>
                                            <button
                                                className={`${styles.toggleBtn} ${prefs.gapPref === 'prefer' ? styles.toggleBtnActive : ''}`}
                                                onClick={() => setPrefs(p => ({ ...p, gapPref: 'prefer' }))}
                                            >Prefer gaps</button>
                                        </div>
                                    </div>

                                    {/* Compactness */}
                                    <div className={styles.prefGroup}>
                                        <span className={styles.prefLabel}>Day Spread</span>
                                        <div className={styles.toggleRow}>
                                            <button
                                                className={`${styles.toggleBtn} ${prefs.compactPref === 'none' ? styles.toggleBtnActive : ''}`}
                                                onClick={() => setPrefs(p => ({ ...p, compactPref: 'none' }))}
                                            >No preference</button>
                                            <button
                                                className={`${styles.toggleBtn} ${prefs.compactPref === 'fewer' ? styles.toggleBtnActive : ''}`}
                                                onClick={() => setPrefs(p => ({ ...p, compactPref: 'fewer' }))}
                                            >Fewer days</button>
                                            <button
                                                className={`${styles.toggleBtn} ${prefs.compactPref === 'spread' ? styles.toggleBtnActive : ''}`}
                                                onClick={() => setPrefs(p => ({ ...p, compactPref: 'spread' }))}
                                            >Spread out</button>
                                        </div>
                                    </div>

                                    {/* Per-course preferences */}
                                    {selectedCourses.map(c => {
                                        const isBasket = c.course_id.startsWith('BASKET_');
                                        const isDeptBasket = c.course_id.startsWith('BASKET_DEPT_');

                                        // If it's a department basket, only show preferences for the FIRST one added
                                        if (isDeptBasket) {
                                            const firstDeptBasket = selectedCourses.find(sc => sc.course_id.startsWith('BASKET_DEPT_'));
                                            if (c.course_id !== firstDeptBasket.course_id) return null;
                                        }

                                        if (isBasket) {
                                            const prefsKey = isDeptBasket ? 'BASKET_DEPT' : c.course_id;
                                            const displayName = isDeptBasket ? 'Department Electives' : c.name;

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
                                                <div key={prefsKey} className={styles.prefCourseItem}>
                                                    <div className={styles.prefCourseName}>{displayName}</div>
                                                    <div className={styles.prefGroup}>
                                                        <span className={styles.prefLabel}>Preferred Courses</span>
                                                        <div className={styles.electiveList}>
                                                            {subCourseIds.map(subId => (
                                                                <label key={subId} className={styles.electiveItem}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={preferred.includes(subId)}
                                                                        onChange={() => toggleElective(subId)}
                                                                    />
                                                                    <span className={styles.electiveId}>{subId}</span>
                                                                    {extraCourseNames[subId] && (
                                                                        <span className={styles.electiveName}>{extraCourseNames[subId]}</span>
                                                                    )}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {preferred.length > 0 && (
                                                        <label className={styles.electiveHardFilter}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isHard}
                                                                onChange={e => setPrefs(p => ({
                                                                    ...p,
                                                                    hardElectiveFilter: { ...p.hardElectiveFilter, [prefsKey]: e.target.checked }
                                                                }))}
                                                            />
                                                            <span>Only show schedules with selected courses</span>
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

                                        if (instructors.length === 0 && baseSections.length === 0 && labSections.length === 0) return null;

                                        return (
                                            <div key={c.course_id} className={styles.prefCourseItem}>
                                                <div className={styles.prefCourseName}>{c.course_id} — {c.name}</div>
                                                {instructors.length > 1 && (
                                                    <div className={styles.prefGroup}>
                                                        <span className={styles.prefLabel}>Preferred Instructor</span>
                                                        <select
                                                            className={styles.select}
                                                            value={prefs.preferredInstructors[c.course_id] || ''}
                                                            onChange={e => setPrefs(p => ({
                                                                ...p,
                                                                preferredInstructors: { ...p.preferredInstructors, [c.course_id]: e.target.value }
                                                            }))}
                                                        >
                                                            <option value="">Any instructor</option>
                                                            {instructors.map(i => <option key={i} value={i}>{i}</option>)}
                                                        </select>
                                                    </div>
                                                )}
                                                {baseSections.length > 1 && (
                                                    <div className={styles.prefGroup}>
                                                        <span className={styles.prefLabel}>Pin Lecture Section</span>
                                                        <select
                                                            className={styles.select}
                                                            value={pinnedBaseId}
                                                            onChange={e => {
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
                                                            }}
                                                        >
                                                            <option value="">Any lecture</option>
                                                            {baseSections.map(s => {
                                                                const baseNum = getBaseSection(s.section_num);
                                                                return (
                                                                    <option key={baseNum} value={baseNum}>
                                                                        Section {baseNum}{s.class_time ? ` — ${s.class_time}` : ''}{s.instructor ? ` — ${s.instructor}` : ''}
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                    </div>
                                                )}
                                                {labSections.length > 1 && (
                                                    <div className={styles.prefGroup}>
                                                        <span className={styles.prefLabel}>Pin Lab Section</span>
                                                        <select
                                                            className={styles.select}
                                                            value={prefs.pinnedLabs?.[c.course_id] || ''}
                                                            onChange={e => setPrefs(p => ({
                                                                ...p,
                                                                pinnedLabs: { ...(p.pinnedLabs || {}), [c.course_id]: e.target.value }
                                                            }))}
                                                        >
                                                            <option value="">Any lab</option>
                                                            {labSections.map(s => (
                                                                <option key={s.section_num} value={s.section_num}>
                                                                    Lab {s.section_num}{s.class_time ? ` — ${s.class_time}` : ''}{s.instructor ? ` — ${s.instructor}` : ''}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Generate Button — hidden when results showing */}
                {selectedCourses.length > 0 && !results && (
                    <button
                        className={styles.generateBtn}
                        onClick={handleGenerate}
                        disabled={generating || loadingCourseIds.size > 0}
                        style={loadingCourseIds.size > 0 ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                    >
                        {generating ? <span className={styles.spinner}></span> : (loadingCourseIds.size > 0 ? 'Loading course data...' : 'Generate Schedules')}
                    </button>
                )}

                {/* Results */}
                {results && results.length > 0 && (
                    <>
                        {/* Saved schedule display */}
                        {savedScheduleIdx !== null && results[savedScheduleIdx] && (
                            <div className={styles.section}>
                                <ScheduleCard
                                    result={results[savedScheduleIdx]}
                                    rank={savedScheduleIdx + 1}
                                    courseNameMap={courseNameMap}
                                    selectedCourses={selectedCourses}
                                    isSaved={true}
                                    onUnsave={() => {
                                        setSavedScheduleIdx(null);
                                        setShowAlternatives(true);
                                        localStorage.removeItem('schedule_saved');
                                    }}
                                />
                                {!showAlternatives && results.length > 1 && (
                                    <button
                                        className={styles.showMoreBtn}
                                        onClick={() => setShowAlternatives(true)}
                                    >
                                        Browse {results.length - 1} other schedule{results.length - 1 > 1 ? 's' : ''}
                                    </button>
                                )}
                                {showAlternatives && (
                                    <button
                                        className={styles.showMoreBtn}
                                        onClick={() => setShowAlternatives(false)}
                                    >
                                        Hide other schedules
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Alternative schedules */}
                        {(savedScheduleIdx === null || showAlternatives) && (
                            <>
                                <div className={styles.resultsHeader}>
                                    <span className={styles.resultsTitle}>
                                        {savedScheduleIdx !== null ? 'Other Schedules' : 'Generated Schedules'}
                                    </span>
                                    <span className={styles.resultsCount}>
                                        {savedScheduleIdx !== null ? results.length - 1 : results.length} found
                                    </span>
                                </div>

                                {results
                                    .map((result, idx) => ({ result, idx }))
                                    .filter(({ idx }) => idx !== savedScheduleIdx)
                                    .slice(0, showCount)
                                    .map(({ result, idx }) => (
                                        <ScheduleCard
                                            key={idx}
                                            result={result}
                                            rank={idx + 1}
                                            courseNameMap={courseNameMap}
                                            selectedCourses={selectedCourses}
                                            onSave={() => {
                                                setSavedScheduleIdx(idx);
                                                setShowAlternatives(false);
                                                localStorage.setItem('schedule_saved', JSON.stringify({
                                                    courseIds: selectedCourses.map(c => c.course_id),
                                                    savedIdx: idx,
                                                }));
                                            }}
                                        />
                                    ))}

                                {(() => {
                                    const remaining = results.filter((_, i) => i !== savedScheduleIdx).length;
                                    return showCount < remaining && (
                                        <button
                                            className={styles.showMoreBtn}
                                            onClick={() => {
                                                if (showCount >= 9) {
                                                    setShowCount(remaining + 100); // Show all
                                                } else {
                                                    setShowCount(prev => prev + 3);
                                                }
                                            }}
                                        >
                                            {showCount >= 9
                                                ? `Show All Remaining (${remaining - showCount} schedules)`
                                                : `Show More (${Math.min(3, remaining - showCount)} of ${remaining - showCount})`
                                            }
                                        </button>
                                    );
                                })()}
                            </>
                        )}
                    </>
                )}

                {results && results.length === 0 && (
                    <div className={styles.noResults}>
                        <div className={styles.noResultsIcon}></div>
                        <div className={styles.noResultsTitle}>No valid schedules found</div>
                        <div className={styles.noResultsText}>
                            Try relaxing your time constraints or removing a course
                        </div>
                        <button
                            className={styles.generateBtn}
                            onClick={() => setResults(null)}
                            style={{ width: 'auto', padding: '10px 20px', marginTop: '16px' }}
                        >
                            Modify Preferences
                        </button>
                    </div>
                )}
            </main>

            <BottomNav />
        </div>
    );
}

// ===== SCHEDULE CARD COMPONENT =====

function ScheduleCard({ result, rank, courseNameMap, selectedCourses, onSave, onUnsave, isSaved }) {
    const { schedule, score, warnings } = result;
    const [detailsOpen, setDetailsOpen] = useState(false);

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
    const totalMinutes = (endHour - startHour) * 60;

    // Hour labels
    const hours = [];
    for (let h = startHour; h <= endHour; h++) hours.push(h);

    const HEADER_HEIGHT = 28;
    const PX_PER_MIN = 0.8; // scale factor
    const gridHeight = totalMinutes * PX_PER_MIN;

    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
    const bgColors = [
        'rgba(59,130,246,0.15)', 'rgba(16,185,129,0.15)', 'rgba(245,158,11,0.15)', 'rgba(239,68,68,0.15)',
        'rgba(139,92,246,0.15)', 'rgba(236,72,153,0.15)', 'rgba(20,184,166,0.15)', 'rgba(249,115,22,0.15)',
    ];

    return (
        <div className={styles.scheduleCard}>
            <div className={styles.scheduleCardHeader}>
                <span className={styles.scheduleRank}>Schedule #{rank}</span>
                <span className={styles.scheduleScore}>Score: {Math.round(score)}</span>
            </div>

            {warnings.length > 0 && (
                <div className={styles.prefWarnings}>
                    {warnings.map((w, i) => <span key={i} className={styles.prefWarning}>{w}</span>)}
                </div>
            )}

            <div className={styles.timetable}>
                <div className={styles.ttContainer} style={{ height: gridHeight + HEADER_HEIGHT }}>
                    {/* Time axis labels */}
                    <div className={styles.ttTimeAxis} style={{ height: gridHeight, top: HEADER_HEIGHT }}>
                        {hours.map(h => (
                            <div
                                key={h}
                                className={styles.ttTimeLabel}
                                style={{ top: (h - startHour) * 60 * PX_PER_MIN }}
                            >
                                {formatTimeShort(h * 60)}
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    <div className={styles.ttColumns}>
                        {days.map(day => (
                            <div key={day} className={styles.ttColumn}>
                                <div className={styles.ttDayHeader}>{day}</div>
                                <div className={styles.ttDayBody} style={{ height: gridHeight }}>
                                    {/* Hour grid lines */}
                                    {hours.slice(0, -1).map(h => (
                                        <div
                                            key={h}
                                            className={styles.ttGridLine}
                                            style={{ top: (h - startHour) * 60 * PX_PER_MIN }}
                                        />
                                    ))}

                                    {/* Class blocks */}
                                    {blocks
                                        .filter(b => b.day === day)
                                        .map((block, bi) => {
                                            const top = (block.start - startHour * 60) * PX_PER_MIN;
                                            const height = (block.end - block.start) * PX_PER_MIN;
                                            return (
                                                <div
                                                    key={bi}
                                                    className={styles.ttBlock}
                                                    style={{
                                                        top,
                                                        height,
                                                        background: bgColors[block.colorIdx],
                                                        borderLeftColor: colors[block.colorIdx],
                                                        color: colors[block.colorIdx],
                                                    }}
                                                >
                                                    <span className={styles.ttBlockCourse}>{block.courseId}</span>
                                                    {block.courseName && <span className={styles.ttBlockName}>{block.courseName}</span>}
                                                    <span className={styles.ttBlockSection}>{block.sectionNum}</span>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Section details (collapsible) */}
            <div
                className={styles.detailsToggle}
                onClick={() => setDetailsOpen(prev => !prev)}
            >
                {detailsOpen ? 'Hide details' : 'Show details'}
            </div>
            {detailsOpen && (
                <div className={styles.scheduleDetails}>
                    {schedule.map((group) => {
                        const courseIdx = selectedCourses.findIndex(c => c.course_id === (group.originalCourseId || group.courseId));
                        return group.sections.map((sec, secIdx) => (
                            <div key={sec.crn || `${sec.course_id}-${sec.section_num}-${secIdx}`} className={styles.detailRow}>
                                <div className={styles.detailColorBar} style={{ background: colors[courseIdx % 8] }}></div>
                                <div className={styles.detailContent}>
                                    <div className={styles.detailHeader}>
                                        <span className={styles.detailCourseName}>{courseNameMap[sec.course_id] || sec.course_id}</span>
                                        {isSaved && (
                                            <a
                                                className={styles.requestLink}
                                                href={`/post?type=request&course=${sec.course_id}&section=${sec.section_num}`}
                                            >
                                                Request
                                            </a>
                                        )}
                                    </div>
                                    <div className={styles.detailMeta}>
                                        <span className={styles.detailSection}>{sec.section_num}</span>
                                        <span className={styles.detailSep}>•</span>
                                        <span className={styles.detailTime}>{sec.class_time}</span>
                                        {sec.instructor && (
                                            <>
                                                <span className={styles.detailSep}>•</span>
                                                <span className={styles.detailProf}>{sec.instructor}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ));
                    })}
                </div>
            )}

            {onSave && !isSaved && (
                <div className={styles.saveFooter}>
                    <button className={styles.saveBtn} onClick={onSave}>
                        Save
                    </button>
                </div>
            )}

            {isSaved && onUnsave && (
                <div className={styles.saveFooter}>
                    <button className={styles.unsaveBtn} onClick={onUnsave}>
                        Unsave
                    </button>
                </div>
            )}
        </div>
    );
}
