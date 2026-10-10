/**
 * A schedule as a PNG: the week's timetable on a sheet as tall as the day's
 * hours need, with a one-line footer.
 *
 * Drawn straight onto a canvas from the schedule's data rather than
 * screenshotting the card, so the image comes out the same on every device and
 * theme. The blocks follow the design Karam supplied (course-schedule/), in
 * the app's own colors and fonts, without its lecture/lab tags, and with the
 * section number moved off the course-number line. That design's header and
 * course registry were dropped at his request.
 */
import { decodeHtmlEntities } from '@/lib/text';

// The timetable's course inks (Paper theme, globals.css), in the same order.
// Text uses a darker shade of each, as the timetable mixes its inks with black.
const COLORS = ['#2C5EA8', '#C1502A', '#1C7A68', '#8350AE', '#A87A16', '#BB3F69', '#4C7A26', '#22809F'];
const TEXT_COLORS = ['#1D3E6F', '#80351C', '#135145', '#573573', '#6F510F', '#7C2A46', '#325119', '#175569'];

// Light theme values from globals.css. An image gets shared and printed, so it
// does not follow the viewer's dark mode.
const INK = '#131B17';
const INK_SECONDARY = '#3B4640';
const INK_MUTED = '#66706A';
const INK_FAINT = '#848C87';
const LINE = 'rgba(19, 27, 23, 0.16)';
const LINE_SOFT = 'rgba(19, 27, 23, 0.07)';
const PAGE = '#FBFAF6';

const SANS = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const COND = '"IBM Plex Sans Condensed", "IBM Plex Sans", "Arial Narrow", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
const SERIF = 'Newsreader, Georgia, serif';

// A little narrower than A4 (794 at 96 dpi), which Karam found too wide. The
// height follows the day's hours, so a class block is the same size on every
// sheet.
const PAGE_W = 720;
const SCALE = 2.5;
const PAD_X = 38;
const PAD_TOP = 30;
const PAD_BOTTOM = 26;
const GUTTER = 52;
const DAY_HEADER = 28;
const BODY_PAD = 8;
// Every hour is the same height, whatever the day's span. At 90px a 75-minute
// class with a two-line name still has room for all of its lines.
const PX_PER_HOUR = 90;

// Monday to Thursday are always drawn, even with no classes; any other day
// appears only when a class meets on it.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu'];
const ALL_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const SEASONS = { 10: 'Fall', 20: 'Spring', 30: 'Summer' };

function paletteIndex(idx) {
    return (((idx || 0) % COLORS.length) + COLORS.length) % COLORS.length;
}

function withAlpha(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// The sheet keeps the timetable's 24-hour clock: 08:00–09:15.
function clock24(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function hourLabel(h) {
    return String(h).padStart(2, '0');
}

// UOS term codes start with the academic year: 202610 is Fall of 2026/2027.
function academicYear(termCode) {
    const year = Number(String(termCode || '').slice(0, 4));
    return year ? `${year}/${year + 1}` : null;
}

function seasonOf(termCode, termName) {
    return SEASONS[String(termCode || '').slice(4)] || String(termName || '').split(' ')[0] || 'Semester';
}

function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

// Letter spacing where the browser supports it on canvas (not Safari); the
// text reads fine without it.
function spaced(ctx, px) {
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

// Shortens text with an ellipsis until it fits in maxWidth.
function fit(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let s = text.replace(/…$/, '');
    while (s && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
}

// Word-wraps text to maxWidth; past maxLines the last line ends in an ellipsis.
function wrap(ctx, text, maxWidth, maxLines = Infinity) {
    if (maxLines < 1) return [];
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
        lines.length = maxLines;
        lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
    }
    return lines.map(l => fit(ctx, l, maxWidth));
}

// Small line icons from the design, drawn rather than taken from a font.
function drawClockIcon(ctx, x, y, size, color) {
    const r = size / 2;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + r, y + r, r - 0.5, 0, Math.PI * 2);
    ctx.moveTo(x + r, y + r * 0.45);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x + r * 1.45, y + r * 1.35);
    ctx.stroke();
    ctx.restore();
}

function drawPersonIcon(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size * 0.3, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + size / 2, y + size * 0.95, size * 0.42, size * 0.36, 0, Math.PI, 0);
    ctx.fill();
    ctx.restore();
}

// A pill of text with a faint fill and border, as the design uses for rooms.
function measureBadge(ctx, text) {
    return ctx.measureText(text).width + 8;
}

function drawBadge(ctx, x, y, text, color, height) {
    const w = measureBadge(ctx, text);
    roundedRect(ctx, x, y, w, height, 0);
    ctx.strokeStyle = withAlpha(color.length === 7 ? color : '#131B17', 0.25);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 4, y + height / 2 + 0.5);
    ctx.textBaseline = 'top';
    return w;
}

const F = {
    dayHeader: `600 9.5px ${COND}`,
    hour: `400 9px ${MONO}`,
    code: `500 9.5px ${MONO}`,
    name: `500 12px ${SERIF}`,
    detail: `500 9.5px ${COND}`,
    blockBadge: `500 8.5px ${MONO}`,
    note: `400 9.5px ${SANS}`,
    footer: `400 8.5px ${SANS}`,
};

/**
 * What one class block shows, fitted to its height.
 *
 * The top holds the course code, the name and the instructor; the bottom holds
 * the time and a row of badges (section, room). When the block is short, parts
 * go in this order: the divider, the instructor, the second name line, the
 * badges. The code, the first name line and the time always stay.
 */
function planBlock(ctx, block, innerW, innerH) {
    ctx.font = F.name;
    const nameLines = block.courseName ? wrap(ctx, block.courseName, innerW, 2) : [];
    const parts = {
        code: 12,
        name0: nameLines[0] ? 14 : 0,
        name1: nameLines[1] ? 13 : 0,
        divider: 7,
        instructor: block.instructor ? 13 : 0,
        time: 13,
        badges: (block.sectionNum || block.location) ? 16 : 0,
    };
    const dropOrder = ['divider', 'instructor', 'name1', 'badges'];
    const total = () => Object.values(parts).reduce((a, b) => a + b, 0);
    for (const key of dropOrder) {
        if (total() <= innerH) break;
        parts[key] = 0;
    }
    // Without the instructor there is nothing for the divider to separate.
    if (!parts.instructor) parts.divider = 0;
    return { parts, nameLines };
}

function drawBlock(ctx, block, x, y, w, h) {
    const idx = paletteIndex(block.colorIdx);
    const color = COLORS[idx];
    const text = TEXT_COLORS[idx];

    // The timetable's block: square, the course's tint, its colour as a tab
    // along the top edge.
    ctx.save();
    roundedRect(ctx, x, y, w, h, 0);
    ctx.fillStyle = PAGE;
    ctx.fill();
    ctx.fillStyle = withAlpha(color, 0.13);
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 2);

    const tx = x + 7;
    const tw = w - 14;
    const top = y + 5;
    const { parts, nameLines } = planBlock(ctx, block, tw, h - 10);

    let cy = top;
    ctx.fillStyle = withAlpha(text, 0.75);
    ctx.font = F.code;
    spaced(ctx, 0.5);
    ctx.fillText(fit(ctx, block.courseId, tw), tx, cy);
    spaced(ctx, 0);
    cy += parts.code;

    ctx.fillStyle = INK;
    ctx.font = F.name;
    if (parts.name0) {
        const first = parts.name1 || !nameLines[1] ? nameLines[0] : fit(ctx, `${nameLines[0]}…`, tw);
        ctx.fillText(first, tx, cy);
        cy += parts.name0;
    }
    if (parts.name1) {
        ctx.fillText(nameLines[1], tx, cy);
        cy += parts.name1;
    }
    if (parts.divider) {
        ctx.fillStyle = withAlpha(text, 0.15);
        ctx.fillRect(tx, cy + 2, tw, 1);
        cy += parts.divider;
    }
    if (parts.instructor) {
        ctx.font = F.detail;
        drawPersonIcon(ctx, tx, cy + 1, 8, withAlpha(text, 0.7));
        ctx.fillStyle = withAlpha(text, 0.85);
        ctx.fillText(fit(ctx, decodeHtmlEntities(block.instructor), tw - 12), tx + 12, cy);
    }

    // The time and badges sit at the bottom of the block.
    let by = y + h - 5;
    if (parts.badges) {
        by -= 14;
        ctx.font = F.blockBadge;
        let bx = tx;
        const items = [block.sectionNum && `§${block.sectionNum}`, block.location].filter(Boolean);
        for (const item of items) {
            const label = fit(ctx, item, tw - (bx - tx) - 8);
            if (bx + measureBadge(ctx, label) > tx + tw + 0.5) break;
            bx += drawBadge(ctx, bx, by, label, text, 14) + 4;
        }
        by -= 2;
    }
    by -= 12;
    ctx.font = F.detail;
    drawClockIcon(ctx, tx, by + 1.5, 8, withAlpha(text, 0.7));
    ctx.fillStyle = withAlpha(text, 0.75);
    ctx.fillText(fit(ctx, `${clock24(block.start)}–${clock24(block.end)}`, tw - 12), tx + 12, by);
    ctx.restore();
}

function drawSheet(sheet) {
    const { blocks, entries } = sheet;
    const measure = document.createElement('canvas').getContext('2d');
    const contentW = PAGE_W - PAD_X * 2;

    // ── Days and hours ──
    const used = new Set(blocks.map(b => b.day));
    const days = ALL_DAYS.filter(d => WEEKDAYS.includes(d) || used.has(d));
    // From the hour the first class starts in to the hour after the last one
    // ends (9:30 to 3:15 draws 9 AM to 4 PM), as the schedule cards do.
    const startHour = Math.floor(Math.min(...blocks.map(b => b.start)) / 60);
    const endHour = Math.ceil(Math.max(...blocks.map(b => b.end)) / 60);
    const hours = endHour - startHour;

    // A section with no set time has no block, so it gets a line under the
    // grid rather than vanishing from the sheet.
    measure.font = F.note;
    const unscheduled = entries.filter(e => !/\d{1,2}:\d{2}/.test(e.classTime || ''));
    const noteLines = unscheduled.length
        ? wrap(measure, `No set time: ${unscheduled.map(e => [e.courseId, e.courseName, e.sectionNum && `§${e.sectionNum}`].filter(Boolean).join(' ')).join(' · ')}`, contentW)
        : [];

    // ── Vertical budget: a fixed height per hour, the page as tall as that makes it ──
    const footerH = 24;
    const noteH = noteLines.length ? 10 + noteLines.length * 14 : 0;
    const pxPerHour = PX_PER_HOUR;
    const gridBodyH = hours * pxPerHour + BODY_PAD * 2;
    const pageH = Math.ceil(PAD_TOP + DAY_HEADER + gridBodyH + noteH + footerH + PAD_BOTTOM);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(PAGE_W * SCALE);
    canvas.height = Math.round(pageH * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = 'top';
    ctx.fillStyle = PAGE;
    ctx.fillRect(0, 0, PAGE_W, pageH);

    // ── Timetable ──
    const gridX = PAD_X + GUTTER;
    const gridW = contentW - GUTTER;
    const colW = gridW / days.length;
    const gridTop = PAD_TOP;
    const bodyTop = gridTop + DAY_HEADER;
    const hourY = (h) => bodyTop + BODY_PAD + (h - startHour) * pxPerHour;

    ctx.save();
    roundedRect(ctx, gridX, gridTop, gridW, DAY_HEADER + gridBodyH, 0);
    ctx.fillStyle = PAGE;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = LINE_SOFT;
    ctx.fillRect(gridX, gridTop, gridW, DAY_HEADER);
    ctx.fillStyle = LINE;
    ctx.fillRect(gridX, bodyTop - 1.5, gridW, 1.5);

    for (let h = startHour; h <= endHour; h++) {
        ctx.fillStyle = LINE;
        ctx.fillRect(gridX, hourY(h), gridW, 1);
        if (h < endHour) {
            ctx.fillStyle = LINE_SOFT;
            ctx.fillRect(gridX, hourY(h) + pxPerHour / 2, gridW, 1);
        }
    }

    days.forEach((day, i) => {
        const colX = gridX + i * colW;
        if (i > 0) {
            ctx.fillStyle = LINE;
            ctx.fillRect(colX, gridTop, 1, DAY_HEADER + gridBodyH);
        }
        // An empty day is labelled like any other; its empty column says enough.
        ctx.font = F.dayHeader;
        spaced(ctx, 1);
        ctx.fillStyle = INK_SECONDARY;
        ctx.textAlign = 'center';
        ctx.fillText(day.toUpperCase(), colX + colW / 2, gridTop + 10);
        ctx.textAlign = 'left';
        spaced(ctx, 0);
    });

    blocks.forEach(block => {
        const col = days.indexOf(block.day);
        if (col === -1) return;
        const bx = gridX + col * colW + 3;
        const top = hourY(startHour) + (block.start - startHour * 60) / 60 * pxPerHour + 1;
        const height = (block.end - block.start) / 60 * pxPerHour - 2;
        drawBlock(ctx, block, bx, top, colW - 6, height);
    });
    ctx.restore();

    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    roundedRect(ctx, gridX + 0.5, gridTop + 0.5, gridW - 1, DAY_HEADER + gridBodyH - 1, 0);
    ctx.stroke();

    // Hour labels in the gutter, centred on their lines.
    ctx.font = F.hour;
    ctx.fillStyle = INK_MUTED;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let h = startHour; h <= endHour; h++) ctx.fillText(hourLabel(h), gridX - 7, hourY(h));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let y = bodyTop + gridBodyH + 10;
    if (noteLines.length) {
        ctx.font = F.note;
        ctx.fillStyle = INK_SECONDARY;
        noteLines.forEach(line => { ctx.fillText(line, PAD_X, y); y += 14; });
    }

    // ── Footer ──
    const season = seasonOf(sheet.termCode, sheet.termName);
    const ay = academicYear(sheet.termCode);
    y = pageH - PAD_BOTTOM - footerH + 6;
    ctx.fillStyle = LINE;
    ctx.fillRect(PAD_X, y, contentW, 1);
    y += 10;
    ctx.font = F.footer;
    ctx.fillStyle = INK_MUTED;
    ctx.fillText(`Made with CourseMate · ${season}${ay ? ` ${ay}` : ''}`, PAD_X, y);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK_FAINT;
    ctx.fillText('◆', PAGE_W / 2, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = INK_MUTED;
    ctx.fillText('Seats and times can change; check Banner before you register', PAGE_W - PAD_X, y);
    ctx.textAlign = 'left';

    return canvas;
}

async function deliver(blob, fileName, title) {
    const file = new File([blob], fileName, { type: 'image/png' });
    // On a phone the share sheet is how an image reaches the photo library;
    // a plain download there ends up in Files.
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title });
            return;
        } catch (err) {
            if (err?.name === 'AbortError') return;
            // Anything else (the browser refusing to share) falls back to a download.
        }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function renderBlob(sheet) {
    // The page already uses these fonts; waiting makes sure the canvas does too.
    if (document.fonts?.load) {
        await Promise.all(Object.values(F).map(f => document.fonts.load(f).catch(() => null)));
    }
    const canvas = drawSheet(sheet);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The browser could not create the image.');
    return blob;
}

/**
 * Draws the schedule sheet and saves it as a PNG.
 *
 * sheet: {
 *   termCode, termName (for the footer),
 *   blocks:  [{ day, start, end, courseId, courseName, sectionNum, instructor, location, colorIdx }]
 *            one per meeting, with start and end in minutes after midnight,
 *   entries: [{ courseId, courseName, sectionNum, classTime }]
 *            one per section; those with no set time are listed under the grid,
 * }
 * title names the image in the share sheet.
 */
export async function downloadSchedulePng({ title, fileName, ...sheet }) {
    if (!sheet.blocks?.length) return;
    await deliver(await renderBlob(sheet), fileName, title);
}

/**
 * Copies the schedule sheet to the clipboard, ready to paste into a chat.
 *
 * Returns 'copied', or 'unsupported' when the browser has no image clipboard
 * (Firefox, and any page not served over HTTPS), so the caller can offer the
 * download instead.
 */
export async function copySchedulePng(sheet) {
    if (!sheet.blocks?.length) return 'unsupported';
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return 'unsupported';
    // Safari only allows a write during the click that asked for it, so the
    // item takes the promise rather than a blob awaited first.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderBlob(sheet) })]);
    return 'copied';
}
