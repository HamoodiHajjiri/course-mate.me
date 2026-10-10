/**
 * Reading Banner's class_time strings, shared by the pages that draw time.
 *
 *   "Mon/Wed 08:00-09:15"                    one meeting pattern
 *   "Tue 14:00-14:50, Thu 15:30-18:00"       several, comma separated
 *   "M W 08:00 AM-09:15 AM"                  the legacy format
 */

const DAY_MAP = {
    Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Sun: 'Sun', Sat: 'Sat', Fri: 'Fri',
    M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', Su: 'Sun', S: 'Sat',
};

// JS getDay() order.
export const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseDays(dayStr) {
    return (dayStr || '').trim().split(/[\s/]+/).map(p => DAY_MAP[p]).filter(Boolean);
}

export function parseTimeToMinutes(timeStr) {
    const str = (timeStr || '').trim();
    const m12 = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m12) {
        let h = parseInt(m12[1], 10);
        const period = m12[3].toUpperCase();
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return h * 60 + parseInt(m12[2], 10);
    }
    const m24 = str.match(/(\d{1,2}):(\d{2})/);
    return m24 ? parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10) : 0;
}

/** Every meeting in a class_time string: [{ day, start, end }] in minutes. */
export function parseClassTime(classTime) {
    if (!classTime) return [];
    return classTime.split(',').flatMap(part => {
        const m = part.trim().match(/^(.+?)\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*-\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)$/i);
        if (!m) return [];
        const start = parseTimeToMinutes(m[2]);
        const end = parseTimeToMinutes(m[3]);
        return parseDays(m[1]).map(day => ({ day, start, end }));
    });
}

/** 510 → "8:30 AM" */
export function formatTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${dh}:${String(m).padStart(2, '0')} ${period}`;
}

/** 510 → "8:30" (no period), for ranges where the period is said once. */
export function formatClock(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${dh}:${String(m).padStart(2, '0')}`;
}

/** 540 → "9 AM" */
export function formatHour(minutes) {
    const h = Math.floor(minutes / 60);
    const period = h >= 12 ? 'PM' : 'AM';
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${dh} ${period}`;
}

/** "8:00–9:15 AM", or "11:30 AM–12:45 PM" across noon. */
export function formatRange(start, end) {
    const samePeriod = (start < 720) === (end < 720);
    return samePeriod
        ? `${formatClock(start)}–${formatTime(end)}`
        : `${formatTime(start)}–${formatTime(end)}`;
}

/** "1h 15m", "45m" */
export function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}
