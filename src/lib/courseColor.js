/**
 * Every course has one colour across CourseMate — on posts, electives,
 * activity, history and admin — picked from the eight-hue course palette in
 * globals.css by hashing its ID. The palette is themed, so the same course is
 * the same hue in every theme, tuned for that ground.
 *
 * The schedule builder is the one exception: a timetable needs every course
 * on it distinct, so it colours by position in the cart instead (paletteFor).
 */

const PALETTE_SIZE = 8;

/** 1–8 for a course ID, stable forever. */
export function courseHue(courseId) {
    const s = String(courseId || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (Math.abs(h) % PALETTE_SIZE) + 1;
}

/** CSS custom property for a course's colour. */
export function courseColor(courseId) {
    return `var(--course-${courseHue(courseId)})`;
}

/** For a list that needs distinct colours: index 0 → palette 1. */
export function paletteFor(index) {
    return `var(--course-${(((index || 0) % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE + 1})`;
}

/** The part of a UOS course ID students say aloud: 0401211 → "211". */
export function courseNumber(courseId) {
    const s = String(courseId || '');
    return /^\d{7}$/.test(s) ? s.slice(4) : s.slice(-3);
}
