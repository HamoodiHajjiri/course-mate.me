'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import campus from '@/app/map/campus.json';
import { buildingInfo } from '@/app/map/buildings';
import { PLACE_KINDS, openStatus } from '@/app/map/places';
import PlaceIcon from '@/app/map/PlaceIcon';
import { useConfirm, useToast } from '@/components/ui';
import PlaceEditModal from './PlaceEditModal';
import styles from '../admin.module.css';
import own from './MapTab.module.css';

// Every building the map draws, with what the legend calls it.
const BUILDINGS = campus.buildings
    .filter(b => b.kind !== 'walkway')
    .map(b => ({ ...buildingInfo(b.id), id: b.id }));

// Sidebar entries that aren't one building.
const ALL = '__all';
const PINS_ONLY = '__pins';

function buildingLabel(id) {
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) return id;
    return [b.code || 'Hospital', b.name].filter(Boolean).join(' · ');
}

const Ctx = createContext(null);

function MapProvider({ children }) {
    const [places, setPlaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(ALL);
    // The kind of place the list is narrowed to, or null for every kind.
    const [kind, setKind] = useState(null);
    const [query, setQuery] = useState('');
    // The place in the editor: a row, a fresh draft ({}), or null when closed.
    const [editing, setEditing] = useState(null);
    const confirm = useConfirm();
    const toast = useToast();

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/map-places');
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setPlaces(data.places || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const counts = useMemo(() => {
        const c = {};
        for (const p of places) if (p.building_id) c[p.building_id] = (c[p.building_id] || 0) + 1;
        return c;
    }, [places]);

    const send = async (method, body) => {
        const res = await fetch('/api/admin/map-places', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `The server refused the change (${res.status}).`);
        return data;
    };

    const save = async (draft) => {
        const { place } = await send(draft.id ? 'PATCH' : 'POST', draft);
        setPlaces(prev => (draft.id ? prev.map(p => (p.id === place.id ? place : p)) : [...prev, place]));
        return place;
    };

    const toggleVisible = async (place) => {
        try {
            await save({ ...place, is_visible: !place.is_visible });
            toast.success(place.is_visible ? `${place.name} hidden from the map` : `${place.name} is on the map`);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const remove = async (place) => {
        const ok = await confirm({
            title: `Delete ${place.name}?`,
            body: 'It comes off the campus map for everyone. To take it off for a while, hide it instead.',
            confirmLabel: 'Delete place',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await send('DELETE', { id: place.id });
            setPlaces(prev => prev.filter(p => p.id !== place.id));
            toast.success(`${place.name} deleted`);
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <Ctx.Provider value={{
            places, loading, error, counts,
            selected, setSelected, kind, setKind, query, setQuery,
            editing, setEditing, save, toggleVisible, remove,
        }}>
            {children}
        </Ctx.Provider>
    );
}

function MapSidebar() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { places, counts, selected, setSelected, query, setQuery } = ctx;

    const q = query.trim().toLowerCase();
    const matching = BUILDINGS.filter(b => !q
        || b.id.toLowerCase().startsWith(q)
        || (b.name || '').toLowerCase().includes(q));
    // Buildings that already have places come first.
    const withPlaces = matching.filter(b => counts[b.id]);
    const without = matching.filter(b => !counts[b.id]);
    const pinsOnly = places.filter(p => !p.building_id).length;

    const entry = (id, label, count, code) => (
        <button
            key={id}
            type="button"
            className={`${styles.navBtn} ${own.navWide} ${selected === id ? styles.navBtnActive : ''}`}
            onClick={() => setSelected(id)}
        >
            <span className={own.navEntry}>
                {code && <span className={own.navCode}>{code}</span>}
                <span className={own.navName}>{label}</span>
            </span>
            {count > 0 && <span className={styles.navCount}>{count}</span>}
        </button>
    );

    return (
        <div className={styles.sidebarCard}>
            <p className={styles.sectionTitle}>Places on the map</p>
            <div className={styles.navList}>
                {entry(ALL, 'Every place', places.length)}
                {entry(PINS_ONLY, 'Pins outside buildings', pinsOnly)}
            </div>

            <p className={`${styles.sectionTitle} ${own.sidebarGap}`}>Buildings</p>
            <input
                className={styles.input}
                placeholder="Find a building"
                aria-label="Find a building"
                value={query}
                onChange={e => setQuery(e.target.value)}
            />
            <div className={`${styles.navList} ${own.buildingList}`}>
                {withPlaces.map(b => entry(b.id, b.name || `Building ${b.code}`, counts[b.id], b.code || 'H'))}
                {withPlaces.length > 0 && without.length > 0 && <div className={own.navSplit} />}
                {without.map(b => entry(b.id, b.name || `Building ${b.code}`, 0, b.code || 'H'))}
            </div>
        </div>
    );
}

function PlaceRow({ place }) {
    const { setEditing, toggleVisible, remove } = useContext(Ctx);
    const status = openStatus(place.hours);
    return (
        <div className={styles.row}>
            {place.logo_url
                ? <img src={place.logo_url} alt="" className={own.rowLogo} />
                : <PlaceIcon kind={place.kind} size={36} />}
            <div className={styles.rowMain}>
                <div className={styles.rowTitle}>
                    {place.name}
                    <span className={styles.rowMeta}>{PLACE_KINDS[place.kind]?.label}</span>
                    {!place.is_visible && <span className={`${styles.badge} ${styles.badgeExpired}`}>hidden</span>}
                    {place.pin_x != null && <span className={`${styles.badge} ${styles.badgeExpired}`}>own pin</span>}
                    {place.show_sign && <span className={`${styles.badge} ${styles.badgeAccent}`}>sign on map</span>}
                </div>
                <div className={styles.rowMeta}>
                    {[
                        place.building_id ? buildingLabel(place.building_id) : 'No building',
                        place.room && `Room ${place.room}`,
                        place.location_note,
                        status ? status.text : 'no hours yet',
                    ].filter(Boolean).join(' · ')}
                </div>
            </div>
            <div className={styles.rowActions}>
                <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditing(place)}>Edit</button>
                <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => toggleVisible(place)}>
                    {place.is_visible ? 'Hide' : 'Show'}
                </button>
                <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => remove(place)}>Delete</button>
            </div>
        </div>
    );
}

function MapMain() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { places, loading, error, selected, kind, setKind, editing, setEditing, save } = ctx;

    const isBuilding = selected !== ALL && selected !== PINS_ONLY;
    // What the sidebar picked; the type chips narrow it further.
    const inScope = places.filter(p => (
        selected === ALL ? true : selected === PINS_ONLY ? !p.building_id : p.building_id === selected
    ));
    const shown = kind ? inScope.filter(p => p.kind === kind) : inScope;
    // A chip for every kind in this scope, plus the picked one even when the
    // scope has none of it, so it can still be turned off.
    const kinds = Object.keys(PLACE_KINDS).filter(k => k === kind || inScope.some(p => p.kind === k));
    const info = isBuilding ? BUILDINGS.find(b => b.id === selected) : null;
    const title = selected === ALL ? 'Every place' : selected === PINS_ONLY ? 'Pins outside buildings' : buildingLabel(selected);
    // A new place starts in the building and type being looked at.
    const addPlace = () => setEditing({ building_id: isBuilding ? selected : null, ...(kind && { kind }) });

    const chip = (k, label, count) => {
        const on = kind === k;
        return (
            <button
                key={k || 'all'}
                type="button"
                className={`${own.kindChip} ${on ? own.kindChipOn : ''}`}
                style={k ? { '--kind': PLACE_KINDS[k].color } : undefined}
                aria-pressed={on}
                onClick={() => setKind(k)}
            >
                {k && <PlaceIcon kind={k} size={20} solid />}
                {label}
                <span className={own.kindCount}>{count}</span>
            </button>
        );
    };

    return (
        <div className={styles.feedCard}>
            <div className={own.mainHead}>
                <div>
                    <h2 className={own.mainTitle}>{title}</h2>
                    <div className={styles.rowMeta}>
                        {isBuilding
                            ? [info?.zoneName, 'Departments, food, shops and services inside it'].filter(Boolean).join(' · ')
                            : 'Departments, food, shops and services shown on the campus map'}
                    </div>
                </div>
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary} ${own.addBtn}`}
                    onClick={addPlace}
                >
                    Add place
                </button>
            </div>

            {!loading && kinds.length > 0 && (
                <div className={own.kindChips} role="group" aria-label="Filter by type">
                    {chip(null, 'Every kind', inScope.length)}
                    {kinds.map(k => chip(k, PLACE_KINDS[k].plural, inScope.filter(p => p.kind === k).length))}
                </div>
            )}

            {error && <div className={styles.error}>{error}</div>}
            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} />Reading places…</div>
            ) : shown.length === 0 && kind && inScope.length > 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>No {PLACE_KINDS[kind].plural.toLowerCase()} here.</div>
                    <button type="button" className={own.linkBtn} onClick={() => setKind(null)}>Show every kind</button>
                </div>
            ) : shown.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>Nothing here yet.</div>
                    <span>
                        {isBuilding
                            ? 'Add the departments, restaurants or shops inside this building.'
                            : 'Add a place, or pick a building on the left.'}
                    </span>
                </div>
            ) : (
                <div className={`${styles.feedList} ${own.placeList}`}>
                    {shown.map(p => <PlaceRow key={p.id} place={p} />)}
                </div>
            )}

            {/* The same button, floating, for screens where the header is far
                down the page. CSS shows one or the other. */}
            {createPortal(
                <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${own.addFab}`} onClick={addPlace}>
                    Add place
                </button>,
                document.body,
            )}

            {editing && (
                <PlaceEditModal
                    place={editing}
                    buildings={BUILDINGS}
                    onClose={() => setEditing(null)}
                    onSave={async (draft) => { await save(draft); setEditing(null); }}
                />
            )}
        </div>
    );
}

const mapTab = { Provider: MapProvider, Sidebar: MapSidebar, Main: MapMain };
export default mapTab;
