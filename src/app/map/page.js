'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getGuest, guestProfile } from '@/lib/guest';
import { decodeHtmlEntities } from '@/lib/text';
import { useSemester } from '@/lib/SemesterContext';
import PageShell from '@/components/PageShell';
import { CourseCode, CourseName, SearchInput, SegmentedControl } from '@/components/ui';
import { BUILDING_IDS, focusOnBuilding, focusOnPin, focusOnPoints, focusOnZone, overview, sizedInfo, findBuilding } from './view';
import { buildingOfRoom, floorOfRoom, fromOldCode } from './buildings';
import { PLACE_KINDS, openStatus } from './places';
import PlaceCard from './PlaceCard';
import PlaceIcon from './PlaceIcon';
import styles from './map.module.css';

// WebGL only exists in the browser.
const CampusScene = dynamic(() => import('./CampusScene'), {
    ssr: false,
    loading: () => <div className={styles.loading}>Loading the campus…</div>,
});

const ZONE_BUTTONS = [
    { zone: 'all', label: 'Campus' },
    { zone: 'A', label: "Men's" },
    { zone: 'B', label: 'Central' },
    { zone: 'C', label: "Women's" },
    { zone: 'E', label: 'Medical' },
];

// The directory sits beside the map (or under it on a phone), never over it,
// so the camera never has to make room for a panel.
const focusFor = (id) => focusOnBuilding(id);

/** Where to fly for a place: its own pin if it has one, else its building. */
function focusForPlace(place) {
    if (place.pin_x != null) return focusOnPin(place.pin_x, place.pin_y);
    return focusFor(place.building_id);
}

const INFOS = Object.fromEntries(BUILDING_IDS.map(id => [id, sizedInfo(findBuilding(id))]));

// The building index, by area, in code order (A2 before A10).
const ZONES = (() => {
    const byZone = new Map();
    BUILDING_IDS.forEach(id => {
        const info = INFOS[id];
        const key = info.zone || '?';
        if (!byZone.has(key)) byZone.set(key, { zone: key, name: info.zoneName || 'Elsewhere', ids: [] });
        byZone.get(key).ids.push(id);
    });
    const order = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    return [...byZone.values()]
        .map(z => ({ ...z, ids: z.ids.sort((a, b) => (INFOS[a].code || a).localeCompare(INFOS[b].code || b, undefined, { numeric: true })) }))
        .sort((a, b) => order.indexOf(a.zone) - order.indexOf(b.zone));
})();

/** The 2019/2020 code a query uses ("M10", or the "M10" of "M10-102"), if any. */
function oldCodeIn(query) {
    const m = /^([MW]\d{1,2}[A-H]?)(?:-|$)/i.exec(query.trim());
    return m && fromOldCode(m[1]) ? m[1].toUpperCase() : null;
}

const placeWords = (place) => [place.name, place.description, place.room, place.location_note, PLACE_KINDS[place.kind]?.label]
    .filter(Boolean).join(' ').toLowerCase();

/**
 * What a search finds. Buildings match a code ("A3"), a room ("A3-007"),
 * words ("engineering") or an old code ("M10", "W13", which counts as a
 * search for today's). Places match their name or what they are ("grocery",
 * "registration", "coffee").
 */
function searchMap(query, places) {
    const q = query.trim().toLowerCase();
    if (!q) return { buildings: [], places: [] };
    const old = fromOldCode(q);
    if (old) return { buildings: old.filter(id => INFOS[id]), places: [] };
    // A room ("A3-007") finds its building, and any place in that very room.
    const room = buildingOfRoom(q);
    if (room && INFOS[room]) return { buildings: [room], places: places.filter(p => p.room?.toLowerCase() === q) };
    const buildings = BUILDING_IDS.filter(id => {
        const info = INFOS[id];
        if (id.toLowerCase() === q || (q.length >= 2 && id.toLowerCase().startsWith(q))) return true;
        const words = [info.name, info.note, info.zoneName, ...info.colleges].filter(Boolean).join(' ').toLowerCase();
        return q.length >= 3 && words.includes(q);
    }).slice(0, 8);
    const found = q.length >= 3 ? places.filter(p => placeWords(p).includes(q)).slice(0, 6) : [];
    return { buildings, places: found };
}

function titleOf(info) {
    return info.name || (info.code ? `Building ${info.code}` : 'Building');
}

/** "A5 · Students Center" for a place's building, or where it is without one. */
function whereIs(place) {
    if (!place.building_id) return place.location_note || 'On the campus map';
    const info = INFOS[place.building_id];
    return [place.room ? `Room ${place.room}` : info?.code || 'Hospital', info?.name].filter(Boolean).join(' · ');
}

/** A place's spot on the flat map: its pin, else the middle of its building. */
function pointOf(place) {
    if (place.pin_x != null) return [place.pin_x, place.pin_y];
    return findBuilding(place.building_id)?.center || null;
}

/** A building's code as a sign plate, in its area's colour from the campus legend. */
function Plate({ info, size = 'md' }) {
    return (
        <span className={`${styles.plate} ${styles[`plate_${size}`]} ${styles[`zone${info.zone}`] || ''}`}>
            {info.code || 'H'}
        </span>
    );
}

/** Everything in the categories switched on: what each is, where, and whether it's open. */
function ResultsSheet({ places, kinds, onPick, onClear }) {
    const title = kinds.map(k => PLACE_KINDS[k].plural).join(', ');
    return (
        <section className={styles.sheet} aria-label={title}>
            <header className={styles.sheetHead}>
                <div className={styles.sheetTitle}>
                    <h2>{title}</h2>
                    <p>{places.length} on the map</p>
                </div>
                <button type="button" className={styles.close} onClick={onClear}>Clear</button>
            </header>
            <ul className={styles.resultList}>
                {places.map(place => {
                    const status = openStatus(place.hours);
                    return (
                        <li key={place.id}>
                            <button type="button" onClick={() => onPick(place)}>
                                {place.logo_url
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={place.logo_url} alt="" className={styles.resultLogo} />
                                    : <PlaceIcon kind={place.kind} size={28} />}
                                <span className={styles.resultText}>
                                    <strong>{place.name}</strong>
                                    <small>{whereIs(place)}</small>
                                    {status && <small className={`${styles.resultStatus} ${status.open ? styles.isOpen : ''}`}>{status.text}</small>}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function BuildingSheet({ id, term, places, openPlace, room, onClose }) {
    const info = INFOS[id];
    const [classes, setClasses] = useState(null);

    useEffect(() => {
        if (!info.teaching || !term) return;
        let cancelled = false;
        setClasses(null);
        (async () => {
            const supabase = createClient();
            const { data: sections } = await supabase
                .from('sections')
                .select('course_id, location')
                .eq('term_code', term)
                .eq('is_active', true)
                .ilike('location', `${info.code}-%`);
            const ids = [...new Set((sections || []).map(s => s.course_id))];
            const { data: courses } = ids.length
                ? await supabase.from('courses').select('course_id, course_name').in('course_id', ids)
                : { data: [] };
            if (cancelled) return;
            // Banner titles arrive HTML-encoded ("Hadith and It&rsquo;s Sciences").
            const names = Object.fromEntries((courses || []).map(c => [c.course_id, decodeHtmlEntities(c.course_name)]));
            setClasses({
                sections: sections?.length || 0,
                rooms: new Set((sections || []).map(s => s.location)).size,
                courses: ids.map(cid => ({ id: cid, name: names[cid] || '' })).sort((a, b) => a.name.localeCompare(b.name)),
            });
        })();
        return () => { cancelled = true; };
    }, [info, term]);

    return (
        <section className={styles.sheet} aria-label={titleOf(info)}>
            <button type="button" className={styles.back} onClick={onClose}>← Campus directory</button>
            <header className={styles.buildingHead}>
                <Plate info={info} size="lg" />
                <div className={styles.sheetTitle}>
                    <h2>{titleOf(info)}</h2>
                    <p>{[info.zoneName, info.note].filter(Boolean).join(' · ')}</p>
                </div>
            </header>

            {/* Arrived from a room somewhere else in the app: say which. */}
            {room && (
                <p className={styles.roomBanner}>
                    Room <strong>{room}</strong> is {floorOfRoom(room) ? `on the ${floorOfRoom(room).name} of` : 'in'} this building.
                </p>
            )}

            {info.colleges.length > 0 && (
                <ul className={styles.colleges}>
                    {info.colleges.map(c => <li key={c}>{c}</li>)}
                </ul>
            )}

            {places.length > 0 && (
                <section className={styles.block}>
                    <h3 className={styles.blockTitle}>Inside</h3>
                    <ul className={styles.places}>
                        {places.map(p => <PlaceCard key={p.id} place={p} startOpen={p.id === openPlace} />)}
                    </ul>
                </section>
            )}

            {!info.name && (
                <p className={styles.muted}>The campus map&apos;s legend doesn&apos;t say what this building is.</p>
            )}

            {info.teaching && (
                <section className={styles.block}>
                    <h3 className={styles.blockTitle}>Taught here this term</h3>
                    {!classes ? (
                        <p className={styles.muted}>Looking up classes…</p>
                    ) : classes.sections === 0 ? (
                        <p className={styles.muted}>No classes meet here this term.</p>
                    ) : (
                        <>
                            <p className={styles.classesSummary}>
                                {classes.sections} section{classes.sections === 1 ? '' : 's'} of {classes.courses.length} course{classes.courses.length === 1 ? '' : 's'}, in {classes.rooms} room{classes.rooms === 1 ? '' : 's'}.
                            </p>
                            <ul className={styles.courseList}>
                                {classes.courses.map(c => (
                                    <li key={c.id}>
                                        <CourseCode id={c.id} size="sm" />
                                        <CourseName size="sm">{c.name}</CourseName>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>
            )}
        </section>
    );
}

/** A place that isn't inside a building, like a corridor coffee shop. */
function PlaceSheet({ place, onClose }) {
    return (
        <section className={styles.sheet} aria-label={place.name}>
            <button type="button" className={styles.back} onClick={onClose}>← Campus directory</button>
            <header className={styles.buildingHead}>
                {place.logo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={place.logo_url} alt="" className={styles.placeLogo} />
                    : <PlaceIcon kind={place.kind} size={40} />}
                <div className={styles.sheetTitle}>
                    <h2>{place.name}</h2>
                    <p>{[PLACE_KINDS[place.kind]?.label, place.room && `Room ${place.room}`, place.location_note].filter(Boolean).join(' · ')}</p>
                </div>
            </header>
            <ul className={styles.places}>
                <PlaceCard place={place} startOpen bare />
            </ul>
        </section>
    );
}

/**
 * The campus map is the page: a directory down one side — search, areas,
 * the kinds of place, every building as a sign plate — and the campus
 * itself filling the rest. Picking anything turns the directory to its
 * sheet and flies the camera there.
 */
function CampusMap() {
    const router = useRouter();
    const params = useSearchParams();
    const { selectedTerm } = useSemester();

    const [ready, setReady] = useState(false);
    const [selected, setSelected] = useState(null);
    const [focus, setFocus] = useState(null);
    const [query, setQuery] = useState('');
    const [zone, setZone] = useState(null);
    // A turn request for the scene: `by` radians, or null to face north. A
    // fresh object each press, so pressing the same button twice turns twice.
    const [turn, setTurn] = useState(null);
    const needle = useRef(null);
    // Every visible row of map_places, which the admin Map tab edits.
    const [places, setPlaces] = useState([]);
    // The place a search or a pin opened: unfolded in its building's sheet,
    // or on a sheet of its own when it has no building.
    const [openPlace, setOpenPlace] = useState(null);
    // The categories switched on. Their places get pins; with none on, the
    // map shows no pins at all.
    const [activeKinds, setActiveKinds] = useState(() => new Set());
    // The room a link elsewhere in the app came for (?room=A3-007), shown on
    // its building's sheet until another building is picked.
    const [linkedRoom, setLinkedRoom] = useState(null);

    const results = useMemo(() => searchMap(query, places), [query, places]);
    const renamedFrom = oldCodeIn(query);
    const matched = [...results.buildings, ...results.places.map(p => p.building_id).filter(Boolean)];
    const highlight = matched.length > 0 ? new Set(matched) : null;
    const resultCount = results.buildings.length + results.places.length;

    const placesIn = (id) => places.filter(p => p.building_id === id);
    // Only the categories something is filed under are listed.
    const kindsPresent = Object.keys(PLACE_KINDS).filter(k => places.some(p => p.kind === k));
    const filtered = places
        .filter(p => activeKinds.has(p.kind))
        .sort((a, b) => Object.keys(PLACE_KINDS).indexOf(a.kind) - Object.keys(PLACE_KINDS).indexOf(b.kind) || a.name.localeCompare(b.name));

    // Switching a category on frames all of its places, the way a maps app
    // zooms out to show every result.
    const toggleKind = (kind) => {
        const next = new Set(activeKinds);
        if (next.has(kind)) next.delete(kind);
        else {
            next.add(kind);
            const points = places.filter(p => next.has(p.kind)).map(pointOf).filter(Boolean);
            const view = focusOnPoints(points);
            if (view) setFocus(view);
            setZone(null);
        }
        setActiveKinds(next);
        setSelected(null);
        setOpenPlace(null);
    };
    const soloPlace = !selected && openPlace ? places.find(p => p.id === openPlace) : null;

    // Flying to one building leaves no area lit.
    const select = (id) => {
        setSelected(id);
        setOpenPlace(null);
        setLinkedRoom(null);
        if (!id) return;
        setZone(null);
        setFocus(focusFor(id));
    };

    const selectPlace = (place) => {
        setSelected(place.building_id || null);
        setOpenPlace(place.id);
        setZone(null);
        setFocus(focusForPlace(place));
    };

    const showZone = (z) => {
        setZone(z);
        setFocus(z === 'all' ? overview() : focusOnZone(z));
    };

    useEffect(() => {
        const supabase = createClient();
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            const guest = user ? null : getGuest();
            if (!user && !guest) { router.push('/auth'); return; }
            const { data: profile } = guest
                ? { data: guestProfile(guest) }
                : await supabase.from('profiles').select('gender').eq('id', user.id).single();
            if (cancelled) return;
            setReady(true);

            // A link can name a building (?b=A3) or a room (?room=A3-007).
            // Otherwise the map glides in to the student's own side of campus.
            const b = params.get('b') || '';
            const room = (params.get('room') || '').trim().toUpperCase();
            const linked = fromOldCode(b)?.[0] || b.toUpperCase() || buildingOfRoom(room);
            if (linked && INFOS[linked]) {
                setSelected(linked);
                setFocus(focusFor(linked));
                if (!b && room) setLinkedRoom(room);
            } else if (profile?.gender) {
                const own = profile.gender === 'male' ? 'A' : 'C';
                setZone(own);
                setFocus(focusOnZone(own));
            }

            const { data: rows } = await supabase
                .from('map_places')
                .select('*')
                .order('sort_order')
                .order('name');
            if (!cancelled) setPlaces(rows || []);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pick = (id) => {
        setQuery('');
        select(id);
    };

    const pickPlace = (place) => {
        setQuery('');
        selectPlace(place);
    };

    const pickFirst = () => {
        if (results.buildings[0]) pick(results.buildings[0]);
        else if (results.places[0]) pickPlace(results.places[0]);
    };

    let sheet;
    if (query.trim()) {
        sheet = (
            <section className={styles.sheet} aria-label="Search results">
                <ul className={styles.resultList}>
                    {resultCount === 0 && <li className={styles.noResult}>Nothing on the map matches &ldquo;{query.trim()}&rdquo;.</li>}
                    {results.buildings.map(id => (
                        <li key={id}>
                            <button type="button" onClick={() => pick(id)}>
                                <Plate info={INFOS[id]} />
                                <span className={styles.resultText}>
                                    <strong>{titleOf(INFOS[id])}</strong>
                                    {/* Says why an old code found this, so a student
                                        learns the building's name today. */}
                                    <small>{renamedFrom ? `Was ${renamedFrom} · ${INFOS[id].zoneName}` : INFOS[id].zoneName}</small>
                                </span>
                            </button>
                        </li>
                    ))}
                    {results.places.map(place => (
                        <li key={place.id}>
                            <button type="button" onClick={() => pickPlace(place)}>
                                <PlaceIcon kind={place.kind} size={28} />
                                <span className={styles.resultText}>
                                    <strong>{place.name}</strong>
                                    <small>{whereIs(place)}</small>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </section>
        );
    } else if (selected) {
        sheet = (
            <BuildingSheet
                key={`${selected}:${openPlace || ''}`}
                id={selected}
                term={selectedTerm}
                places={placesIn(selected)}
                openPlace={openPlace}
                room={linkedRoom}
                onClose={() => select(null)}
            />
        );
    } else if (soloPlace) {
        sheet = <PlaceSheet key={soloPlace.id} place={soloPlace} onClose={() => setOpenPlace(null)} />;
    } else if (filtered.length > 0) {
        sheet = (
            <ResultsSheet
                places={filtered}
                kinds={kindsPresent.filter(k => activeKinds.has(k))}
                onPick={selectPlace}
                onClear={() => setActiveKinds(new Set())}
            />
        );
    } else {
        sheet = (
            <section className={styles.sheet} aria-label="Campus directory">
                {kindsPresent.length > 0 && (
                    <div className={styles.block}>
                        <h3 className={styles.blockTitle}>Places</h3>
                        <ul className={styles.kinds}>
                            {kindsPresent.map(kind => (
                                <li key={kind}>
                                    <button type="button" className={styles.kind} onClick={() => toggleKind(kind)} aria-pressed={activeKinds.has(kind)}>
                                        <PlaceIcon kind={kind} size={22} solid />
                                        <span className={styles.kindName}>{PLACE_KINDS[kind].plural}</span>
                                        <span className={styles.kindCount}>{places.filter(p => p.kind === kind).length}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {ZONES.map(z => (
                    <div key={z.zone} className={styles.block}>
                        <h3 className={styles.blockTitle}>{z.name}</h3>
                        <div className={styles.plates}>
                            {z.ids.map(id => (
                                <button key={id} type="button" className={styles.plateBtn} onClick={() => pick(id)} title={titleOf(INFOS[id])} aria-label={titleOf(INFOS[id])}>
                                    <Plate info={INFOS[id]} />
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </section>
        );
    }

    return (
        <PageShell width="full">
            <div className={styles.atlas}>
                <aside className={styles.directory} aria-label="Campus directory">
                    <div className={styles.directoryHead}>
                        <h1 className={styles.title}>Campus</h1>
                        <SearchInput
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') pickFirst(); }}
                            placeholder="A3, C12-002, library, coffee"
                            aria-label="Find a building, room or place"
                        />
                        <SegmentedControl
                            size="sm"
                            label="Jump to an area"
                            value={zone}
                            onChange={showZone}
                            options={ZONE_BUTTONS.map(b => ({ value: b.zone, label: b.label }))}
                        />
                        {activeKinds.size > 0 && !query.trim() && (selected || soloPlace) && (
                            <button type="button" className={styles.close} onClick={() => setActiveKinds(new Set())}>Hide place pins</button>
                        )}
                    </div>
                    <div className={styles.directoryBody}>{sheet}</div>
                </aside>

                <div className={styles.stage}>
                    {ready && (
                        <CampusScene
                            selected={selected}
                            onSelect={select}
                            focus={focus}
                            turn={turn}
                            highlight={highlight}
                            needle={needle}
                            places={places}
                            openPlace={openPlace}
                            activeKinds={activeKinds}
                            onSelectPlace={(id) => {
                                const place = places.find(p => p.id === id);
                                if (place) selectPlace(place);
                            }}
                        />
                    )}

                    <div className={styles.turnControls} role="group" aria-label="Turn the map">
                        <button type="button" className={styles.compass} onClick={() => setTurn({ by: null })} aria-label="Face north" title="Face north">
                            <span ref={needle} className={styles.needle}>
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M12 3 15.5 12h-7z" className={styles.needleNorth} />
                                    <path d="M12 21 8.5 12h7z" className={styles.needleSouth} />
                                </svg>
                            </span>
                        </button>
                        <button type="button" onClick={() => setTurn({ by: -Math.PI / 4 })} aria-label="Turn left" title="Turn left (or Shift + drag the map)">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                        </button>
                        <button type="button" onClick={() => setTurn({ by: Math.PI / 4 })} aria-label="Turn right" title="Turn right (or Shift + drag the map)">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
                        </button>
                    </div>
                </div>
            </div>
        </PageShell>
    );
}

export default function MapPage() {
    // useSearchParams needs a boundary to render statically.
    return (
        <Suspense fallback={null}>
            <CampusMap />
        </Suspense>
    );
}
