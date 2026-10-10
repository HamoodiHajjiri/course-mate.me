'use client';

import { useEffect, useRef, useState } from 'react';
import campus from '@/app/map/campus.json';
import { buildingOfRoom } from '@/app/map/buildings';
import { DAYS, PLACE_KINDS, normalizeHours, openStatus } from '@/app/map/places';
import { Dialog } from '@/components/ui';
import styles from '../admin.module.css';
import own from './MapTab.module.css';

const BLANK = {
    name: '',
    kind: 'department',
    building_id: null,
    room: '',
    description: '',
    location_note: '',
    email: '',
    phone: '',
    link_url: '',
    link_label: '',
    hours: null,
    hours_note: '',
    logo_url: '',
    show_sign: false,
    pin_x: null,
    pin_y: null,
    sort_order: 0,
    is_visible: true,
};

const emptyWeek = () => Object.fromEntries(DAYS.map(([key]) => [key, []]));

/**
 * Opening hours, one row per day. A day with no ranges is closed; a day can
 * hold a few ranges for a place that shuts over lunch.
 */
function HoursEditor({ hours, onChange }) {
    const setDay = (key, ranges) => onChange({ ...hours, [key]: ranges });
    const copyMonday = (keys) => onChange({
        ...hours,
        ...Object.fromEntries(keys.map(k => [k, hours.mon.map(r => [...r])])),
    });

    return (
        <div className={own.hours}>
            {DAYS.map(([key, label]) => (
                <div key={key} className={own.hoursRow}>
                    <span className={own.hoursDay}>{label}</span>
                    <div className={own.hoursRanges}>
                        {hours[key].length === 0 && <span className={own.hoursClosed}>Closed</span>}
                        {hours[key].map(([open, close], i) => (
                            <span key={i} className={own.hoursRange}>
                                <input
                                    type="time"
                                    className={own.timeInput}
                                    value={open}
                                    onChange={e => setDay(key, hours[key].map((r, j) => (j === i ? [e.target.value, r[1]] : r)))}
                                />
                                <span className={own.hoursTo}>to</span>
                                <input
                                    type="time"
                                    className={own.timeInput}
                                    value={close}
                                    onChange={e => setDay(key, hours[key].map((r, j) => (j === i ? [r[0], e.target.value] : r)))}
                                />
                                <button
                                    type="button"
                                    className={own.iconBtn}
                                    aria-label={`Remove these ${label} hours`}
                                    onClick={() => setDay(key, hours[key].filter((_, j) => j !== i))}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                    {hours[key].length < 4 && (
                        <button
                            type="button"
                            className={own.linkBtn}
                            onClick={() => setDay(key, [...hours[key], hours[key].length ? ['16:00', '20:00'] : ['08:00', '15:00']])}
                        >
                            {hours[key].length ? 'Add hours' : 'Set hours'}
                        </button>
                    )}
                </div>
            ))}
            <div className={own.hoursActions}>
                <button type="button" className={own.linkBtn} onClick={() => copyMonday(['tue', 'wed', 'thu'])}>
                    Copy Monday to Tue to Thu
                </button>
                <button type="button" className={own.linkBtn} onClick={() => copyMonday(['tue', 'wed', 'thu', 'fri', 'sat', 'sun'])}>
                    Copy Monday to every day
                </button>
            </div>
        </div>
    );
}

// The ground tiles the map is drawn on, stacked, as a flat picture to click.
const TILES = campus.ground;

/**
 * Click the map to drop a pin. Shows the place's building outlined, so a
 * corridor between two buildings is easy to find, and scrolls to it.
 */
function PinPicker({ pin, buildingId, onChange }) {
    const scroller = useRef(null);
    const [zoomed, setZoomed] = useState(false);
    const building = campus.buildings.find(b => b.id === buildingId);
    const width = zoomed ? 760 : 380;
    const height = width * (campus.height / campus.width);

    // Map units to pixels on the picture, and back.
    const toPx = ([x, y]) => [(x / campus.width + 0.5) * width, (0.5 - y / campus.height) * height];
    const fromPx = (px, py) => [(px / width - 0.5) * campus.width, (0.5 - py / height) * campus.height];

    const focusPoint = pin || building?.center || null;
    useEffect(() => {
        const el = scroller.current;
        if (!el || !focusPoint) return;
        const [px, py] = toPx(focusPoint);
        el.scrollTo({ left: px - el.clientWidth / 2, top: py - el.clientHeight / 2 });
        // Only when the place, the building or the zoom changes, not on every pin move.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buildingId, zoomed]);

    const place = (e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const [x, y] = fromPx(e.clientX - box.left, e.clientY - box.top);
        onChange([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
    };

    const outline = building && (() => {
        const [cx, cy] = toPx(building.center);
        const w = (building.size[0] / campus.width) * width;
        const h = (building.size[1] / campus.height) * height;
        return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
    })();
    const pinPx = pin && toPx(pin);

    return (
        <div className={own.picker}>
            <div className={own.pickerBar}>
                <span className={styles.rowMeta}>
                    {pin ? 'Click again to move the pin.' : 'Click the map where the place is.'}
                </span>
                <span className={own.pickerActions}>
                    <button type="button" className={own.linkBtn} onClick={() => setZoomed(z => !z)}>
                        {zoomed ? 'Zoom out' : 'Zoom in'}
                    </button>
                    {pin && (
                        <button type="button" className={own.linkBtn} onClick={() => onChange(null)}>Remove pin</button>
                    )}
                </span>
            </div>
            <div className={own.pickerScroll} ref={scroller}>
                <div className={own.pickerMap} style={{ width, height }} onClick={place}>
                    {TILES.map(tile => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            key={tile.src}
                            src={tile.src}
                            alt=""
                            draggable={false}
                            style={{ width, height: ((tile.top - tile.bottom) / campus.height) * height }}
                        />
                    ))}
                    {outline && <span className={own.pickerBuilding} style={outline} />}
                    {pinPx && <span className={own.pickerPin} style={{ left: pinPx[0], top: pinPx[1] }} />}
                </div>
            </div>
        </div>
    );
}

export default function PlaceEditModal({ place, buildings, onClose, onSave }) {
    const isCreate = !place.id;
    const [draft, setDraft] = useState(() => {
        const start = { ...BLANK, ...place };
        for (const key of Object.keys(BLANK)) if (start[key] == null && typeof BLANK[key] === 'string') start[key] = '';
        return start;
    });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [err, setErr] = useState('');

    const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
    // Typing a room fills in its building when none is chosen yet.
    const setRoom = (value) => setDraft(d => {
        const fromRoom = buildingOfRoom(value);
        const known = fromRoom && buildings.some(b => b.id === fromRoom);
        return { ...d, room: value, building_id: d.building_id || (known ? fromRoom : null) };
    });
    const pin = draft.pin_x != null ? [draft.pin_x, draft.pin_y] : null;

    // Escape closes, like the other admin dialogs would if they could.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const upload = async (file) => {
        if (!file) return;
        setUploading(true);
        setErr('');
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/admin/map-places/upload-image', { method: 'POST', body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            set('logo_url', data.url);
        } catch (e) {
            setErr(e.message);
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        setErr('');
        // Same checks the server runs, so most mistakes show before saving.
        if (!draft.name.trim()) { setErr('Give the place a name.'); return; }
        if (!draft.building_id && !pin) { setErr('Choose a building, drop a pin on the map, or both.'); return; }
        try {
            normalizeHours(draft.hours);
        } catch (e) {
            setErr(e.message);
            return;
        }
        setSaving(true);
        try {
            await onSave(draft);
        } catch (e) {
            setErr(e.message);
            setSaving(false);
        }
    };

    const status = (() => {
        try { return openStatus(normalizeHours(draft.hours)); } catch { return null; }
    })();

    return (
        <Dialog
            open
            onClose={onClose}
            dismissible={!saving}
            size="lg"
            title={isCreate ? 'A new place on the map' : place.name}
            description={isCreate ? 'It shows on the campus map once it’s saved and visible.' : 'Changes show on the campus map as soon as they’re saved.'}
            footer={(
                <>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose}>Cancel</button>
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving || uploading} onClick={handleSave}>
                        {saving ? 'Saving…' : isCreate ? 'Add to the map' : 'Save'}
                    </button>
                </>
            )}
        >
            <div className={own.dialogBody}>

                <section className={own.section}>
                    <div className={own.grid2}>
                        <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Name</span>
                            <input className={styles.input} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Registration Department" />
                        </label>
                        <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Kind</span>
                            <select className={styles.input} value={draft.kind} onChange={e => set('kind', e.target.value)}>
                                {Object.entries(PLACE_KINDS).map(([key, k]) => <option key={key} value={key}>{k.label}</option>)}
                            </select>
                        </label>
                    </div>
                    <div className={own.grid2Wide}>
                        <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Building</span>
                            <select
                                className={styles.input}
                                value={draft.building_id || ''}
                                onChange={e => set('building_id', e.target.value || null)}
                            >
                                <option value="">No building, just a pin (a corridor, a kiosk)</option>
                                {buildings.map(b => (
                                    <option key={b.id} value={b.id}>
                                        {[b.code || 'Hospital', b.name].filter(Boolean).join(' · ')}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Room <span className={own.optional}>(optional)</span></span>
                            <input className={styles.input} value={draft.room} onChange={e => setRoom(e.target.value)} placeholder="A3-007" />
                        </label>
                    </div>
                    <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Description</span>
                        <textarea className={`${styles.input} ${own.textarea}`} rows={2} value={draft.description} onChange={e => set('description', e.target.value)} placeholder="Course registration, transcripts and student records" />
                    </label>
                    <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Where inside</span>
                        <input className={styles.input} value={draft.location_note} onChange={e => set('location_note', e.target.value)} placeholder="Ground floor, left of the main entrance" />
                    </label>
                </section>

                <section className={own.section}>
                    <div className={own.sectionTitle}>Contact</div>
                    <div className={own.grid2}>
                        <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Email</span>
                            <input className={styles.input} type="email" value={draft.email} onChange={e => set('email', e.target.value)} placeholder="registration@sharjah.ac.ae" />
                        </label>
                        <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Phone</span>
                            <input className={styles.input} value={draft.phone} onChange={e => set('phone', e.target.value)} placeholder="+971 6 505 0751" />
                        </label>
                        <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Link</span>
                            <input className={styles.input} value={draft.link_url} onChange={e => set('link_url', e.target.value)} placeholder="https://..." />
                        </label>
                        <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Link text</span>
                            <input className={styles.input} value={draft.link_label} onChange={e => set('link_label', e.target.value)} placeholder="Today's opening hours" />
                        </label>
                    </div>
                </section>

                <section className={own.section}>
                    <div className={own.sectionHead}>
                        <div className={own.sectionTitle}>Opening hours</div>
                        <label className={own.check}>
                            <input
                                type="checkbox"
                                checked={!!draft.hours}
                                onChange={e => set('hours', e.target.checked ? emptyWeek() : null)}
                            />
                            Has set hours
                        </label>
                    </div>
                    {draft.hours ? (
                        <>
                            <HoursEditor hours={draft.hours} onChange={h => set('hours', h)} />
                            {status && <div className={styles.rowMeta}>Right now on campus: {status.text}</div>}
                        </>
                    ) : (
                        <div className={styles.rowMeta}>
                            No hours shown. For hours that change, like the library&apos;s, put the page that has them in Link above.
                        </div>
                    )}
                    <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Hours note</span>
                        <input className={styles.input} value={draft.hours_note} onChange={e => set('hours_note', e.target.value)} placeholder="Shorter hours in Ramadan and the summer" />
                    </label>
                </section>

                <section className={own.section}>
                    <div className={own.sectionTitle}>Logo</div>
                    <div className={own.logoRow}>
                        {draft.logo_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={draft.logo_url} alt="" className={own.logoPreview} />
                            : <span className={own.logoEmpty}>No logo</span>}
                        <label className={`${styles.btn} ${styles.btnGhost}`}>
                            {uploading ? 'Uploading…' : draft.logo_url ? 'Replace' : 'Upload'}
                            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={uploading} onChange={e => upload(e.target.files?.[0])} />
                        </label>
                        {draft.logo_url && (
                            <button type="button" className={own.linkBtn} onClick={() => { set('logo_url', ''); set('show_sign', false); }}>Remove</button>
                        )}
                    </div>
                    <label className={own.check}>
                        <input
                            type="checkbox"
                            checked={draft.show_sign}
                            disabled={!draft.logo_url}
                            onChange={e => set('show_sign', e.target.checked)}
                        />
                        Stand the logo as a sign over the {draft.building_id ? 'building' : 'pin'} on the map
                    </label>
                </section>

                <section className={own.section}>
                    <div className={own.sectionTitle}>Pin on the map {draft.building_id && <span className={own.optional}>(optional)</span>}</div>
                    <PinPicker
                        pin={pin}
                        buildingId={draft.building_id}
                        onChange={p => setDraft(d => ({ ...d, pin_x: p ? p[0] : null, pin_y: p ? p[1] : null }))}
                    />
                </section>

                <section className={own.section}>
                    <div className={own.grid2}>
                        <label className={own.check}>
                            <input type="checkbox" checked={draft.is_visible} onChange={e => set('is_visible', e.target.checked)} />
                            Show on the map
                        </label>
                        <label className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Order (lower comes first)</span>
                            <input className={styles.input} type="number" value={draft.sort_order} onChange={e => set('sort_order', e.target.value)} />
                        </label>
                    </div>
                </section>

                {err && <div className={styles.error}>{err}</div>}
            </div>
        </Dialog>
    );
}

