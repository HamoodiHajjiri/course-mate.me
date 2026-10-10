'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, MapControls, Text, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import campus from './campus.json';
import { HOUSING_HEIGHT, UNNAMED_HEIGHT } from './buildings';
import { OVERVIEW_DISTANCE, sizedInfo } from './view';
import { PLACE_KINDS } from './places';
import PlaceIcon from './PlaceIcon';
import styles from './map.module.css';

const NO_KINDS = new Set();

const WALKWAY_HEIGHT = 0.9;
const WALKWAY_THICKNESS = 0.12;
const ACCENT = new THREE.Color('#00C389');
const WHITE = new THREE.Color('#ffffff');
const PAPER = new THREE.Color('#ece8df');

const svgLoader = new SVGLoader();

/** SVG path strings to three.js shapes, honouring each path's fill rule. */
function toShapes(paths) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${paths
        .map(p => `<path d="${p.d}" fill="#000" fill-rule="${p.evenOdd ? 'evenodd' : 'nonzero'}"/>`)
        .join('')}</svg>`;
    return svgLoader.parse(svg).paths.flatMap(path => path.toShapes());
}

function extrude(paths, depth) {
    // Caps are geometry group 0 and walls group 1, so a roof can be lit
    // differently from the walls with a two-material array.
    return new THREE.ExtrudeGeometry(toShapes(paths), { depth, bevelEnabled: false, curveSegments: 6 });
}

// Lying the extruded shapes down: their XY plane becomes the ground and the
// extrusion points up.
const LAY_FLAT = [-Math.PI / 2, 0, 0];

/**
 * The site's theme, kept live: the surround follows it so a dark page gets
 * the map lying on a dark table, not on a slab of bright paper.
 */
function useSurround() {
    const read = () => {
        const root = document.documentElement;
        return {
            color: getComputedStyle(root).getPropertyValue('--map-ground').trim() || '#ece9e0',
            dark: root.getAttribute('data-theme') !== 'light',
        };
    };
    const [surround, setSurround] = useState(read);
    useEffect(() => {
        const observer = new MutationObserver(() => setSurround(read()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);
    return surround;
}

function Ground() {
    const surround = useSurround();
    const textures = useTexture(campus.ground.map(t => t.src));
    const maxAnisotropy = useThree(state => state.gl.capabilities.getMaxAnisotropy());

    useEffect(() => {
        for (const tex of textures) {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = Math.min(8, maxAnisotropy);
            tex.needsUpdate = true;
        }
    }, [textures, maxAnisotropy]);

    return (
        <group>
            {/* What the map lies on, so its edges don't drop into the void. */}
            <mesh rotation={LAY_FLAT} position={[0, -0.05, 0]} receiveShadow>
                <planeGeometry args={[900, 1400]} />
                <meshStandardMaterial color={surround.color} roughness={1} />
            </mesh>
            {campus.ground.map((tile, i) => (
                <mesh
                    key={tile.src}
                    rotation={LAY_FLAT}
                    position={[0, 0, -(tile.top + tile.bottom) / 2]}
                    receiveShadow
                >
                    <planeGeometry args={[campus.width, tile.top - tile.bottom]} />
                    {/* Toned down a little on a dark page, so it doesn't glare. */}
                    <meshStandardMaterial map={textures[i]} color={surround.dark ? '#c4c4c4' : '#ffffff'} roughness={1} />
                </mesh>
            ))}
        </group>
    );
}

/**
 * Keeps a roof label reading upright for the viewer as the map turns. The
 * label lies flat, so turning it in its own plane spins it about the vertical.
 */
function useUpright(label) {
    const controls = useThree(state => state.controls);
    const camera = useThree(state => state.camera);
    useFrame(() => {
        if (!label.current || !controls) return;
        label.current.rotation.z = Math.atan2(
            camera.position.x - controls.target.x,
            camera.position.z - controls.target.z,
        );
    });
}

/**
 * A mosque sign for the roof: a domed hall with a door and a minaret, drawn
 * on a 24 unit grid (y down, as in an icon) and scaled to a 1 x 1 square
 * around the origin. Built once and shared; a mesh scales it to size.
 */
const MOSQUE_ICON = (() => {
    const p = (x, y) => [(x - 12) / 24, (12 - y) / 24];

    const hall = new THREE.Shape();
    hall.moveTo(...p(3, 21));
    hall.lineTo(...p(3, 13));
    hall.lineTo(...p(4, 13));
    hall.bezierCurveTo(...p(3.5, 7.5), ...p(10, 9), ...p(10, 4.5));
    hall.bezierCurveTo(...p(10, 9), ...p(16.5, 7.5), ...p(16, 13));
    hall.lineTo(...p(17, 13));
    hall.lineTo(...p(17, 21));
    hall.closePath();

    // An arched door, stopping short of the ground so it stays a hole.
    const door = new THREE.Path();
    door.moveTo(...p(8.5, 20));
    door.lineTo(...p(8.5, 17.5));
    door.quadraticCurveTo(...p(10, 14.5), ...p(11.5, 17.5));
    door.lineTo(...p(11.5, 20));
    door.closePath();
    hall.holes.push(door);

    const minaret = new THREE.Shape();
    minaret.moveTo(...p(18.5, 21));
    minaret.lineTo(...p(18.5, 8));
    minaret.lineTo(...p(19.75, 3.5));
    minaret.lineTo(...p(21, 8));
    minaret.lineTo(...p(21, 21));
    minaret.closePath();

    return new THREE.ShapeGeometry([hall, minaret], 8);
})();

// A shop's sign: a board on a pole standing on the roof, turned to face the
// viewer like the roof labels, so it reads from any side.
// The board fits the logo inside this box, keeping its shape: a wide
// wordmark uses the width, a square or tall logo the height.
const SIGN_MAX_WIDTH = 7;
const SIGN_MAX_HEIGHT = 3.4;
const SIGN_LIFT = 2.6;
// How far behind the roof's label (as the viewer sees it) the pole stands,
// so it never covers the building's code.
const SIGN_SETBACK = 1.4;
const UP = new THREE.Vector3(0, 1, 0);

function ShopSign({ src, base, dimmed, onPick }) {
    const texture = useTexture(src);
    const maxAnisotropy = useThree(state => state.gl.capabilities.getMaxAnisotropy());
    const controls = useThree(state => state.controls);
    const camera = useThree(state => state.camera);
    const facing = useRef(null);
    const board = useRef(null);

    useEffect(() => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, maxAnisotropy);
        texture.needsUpdate = true;
    }, [texture, maxAnisotropy]);

    useFrame(() => {
        if (!facing.current || !board.current || !controls) return;
        // The pole stays upright and swings round to stand behind the label.
        const heading = Math.atan2(
            camera.position.x - controls.target.x,
            camera.position.z - controls.target.z,
        );
        facing.current.rotation.y = heading;
        // The board faces the camera square on, tilting back as the view
        // looks down, so it reads from straight above as well as from the
        // side. Its parent is already turned by the heading, so undo that.
        board.current.quaternion.setFromAxisAngle(UP, -heading).multiply(camera.quaternion);
    });

    // Logos come in any shape: the board takes the image's.
    const aspect = texture.image?.width && texture.image?.height ? texture.image.width / texture.image.height : 2;
    const width = Math.min(SIGN_MAX_WIDTH, SIGN_MAX_HEIGHT * aspect);
    const height = width / aspect;
    return (
        <group
            ref={facing}
            position={base}
            onClick={onPick && ((e) => {
                e.stopPropagation();
                if (e.delta > 6) return;
                onPick();
            })}
        >
            <mesh position={[0, SIGN_LIFT / 2, -SIGN_SETBACK]} castShadow>
                <boxGeometry args={[0.18, SIGN_LIFT, 0.18]} />
                <meshStandardMaterial color="#9aa3ad" roughness={0.6} transparent opacity={dimmed ? 0.45 : 1} />
            </mesh>
            {/* Hinged at the top of the pole, so tilting keeps it on the pole. */}
            <group ref={board} position={[0, SIGN_LIFT, -SIGN_SETBACK]}>
                <mesh position={[0, height / 2, 0]} castShadow>
                    <planeGeometry args={[width, height]} />
                    {/* Unlit, so the logo keeps its own colours whatever the sun does. */}
                    <meshBasicMaterial
                        map={texture}
                        transparent
                        opacity={dimmed ? 0.45 : 1}
                        side={THREE.DoubleSide}
                        toneMapped={false}
                    />
                </mesh>
            </group>
        </group>
    );
}

function Building({ building, info, sign, selected, hovered, dimmed, onSelect, onHover }) {
    const roofLabel = useRef(null);
    useUpright(roofLabel);

    const geometry = useMemo(() => extrude(building.shapes, info.height), [building, info.height]);
    useEffect(() => () => geometry.dispose(), [geometry]);

    const base = useMemo(() => new THREE.Color(building.color), [building.color]);
    const [roof, walls] = useMemo(() => [
        new THREE.MeshStandardMaterial({ roughness: 0.75 }),
        new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    ], []);
    useEffect(() => () => { roof.dispose(); walls.dispose(); }, [roof, walls]);

    useEffect(() => {
        // A building that doesn't match a search fades into the paper rather
        // than turning see-through, which would show the flat map's own
        // label under the roof one.
        const tint = dimmed ? base.clone().lerp(PAPER, 0.72) : base;
        roof.color.copy(tint).lerp(WHITE, 0.1);
        walls.color.copy(tint);
        const glow = selected ? 0.55 : hovered ? 0.25 : 0;
        for (const m of [roof, walls]) {
            m.emissive.copy(selected ? ACCENT : WHITE);
            m.emissiveIntensity = glow;
        }
    }, [roof, walls, base, selected, hovered, dimmed]);

    const [cx, cy] = building.center;
    const label = info.code || 'Hospital';
    const mosque = info.kind === 'mosque';
    // A mosque's roof holds its code and the sign under it, so the code
    // gives up some of its size to fit both.
    const fontSize = Math.min(mosque ? 2.2 : 3.2, Math.max(0.9, Math.min(...building.size) * 0.42));

    return (
        <group>
            <mesh
                geometry={geometry}
                material={[roof, walls]}
                rotation={LAY_FLAT}
                castShadow
                receiveShadow
                onClick={(e) => {
                    e.stopPropagation();
                    // A drag that ends on a building is a pan, not a tap.
                    if (e.delta > 6) return;
                    onSelect(building.id);
                }}
                onPointerOver={(e) => { e.stopPropagation(); onHover(building.id); }}
                onPointerOut={() => onHover(null)}
            />
            {/* The roof's writing turns as one, so the sign stays under the code. */}
            <group ref={roofLabel} position={[cx, info.height + 0.03, -cy]} rotation={LAY_FLAT}>
                {/* Its own boundary, so the blocks stand up before the font arrives. */}
                <Suspense fallback={null}>
                    <Text
                        position={[0, mosque ? fontSize * 0.55 : 0, 0]}
                        fontSize={fontSize}
                        color="#ffffff"
                        fillOpacity={dimmed ? 0.45 : 1}
                        outlineWidth={fontSize * 0.06}
                        outlineColor="#0f1729"
                        outlineOpacity={0.35}
                        anchorX="center"
                        anchorY="middle"
                        fontWeight={700}
                    >
                        {label}
                    </Text>
                </Suspense>
                {mosque && (
                    <mesh
                        geometry={MOSQUE_ICON}
                        position={[0, -fontSize * 0.75, 0.01]}
                        scale={fontSize * 1.3}
                    >
                        <meshBasicMaterial color="#ffffff" transparent opacity={dimmed ? 0.45 : 1} />
                    </mesh>
                )}
            </group>
            {sign && (
                <Suspense fallback={null}>
                    <ShopSign
                        src={sign.logo_url}
                        base={[cx, info.height, -cy]}
                        dimmed={dimmed}
                        onPick={() => onSelect(building.id)}
                    />
                </Suspense>
            )}
        </group>
    );
}

/**
 * Where a place sits on the map, in world units: its own pin if it has one
 * (on the roof when it is inside a building, so the building doesn't hide
 * it), else the top of its building.
 */
function anchorOf(place, infos) {
    if (place.pin_x != null) {
        const height = place.building_id ? infos[place.building_id]?.height || 0 : 0;
        return { key: `pin:${place.pin_x}:${place.pin_y}`, at: [place.pin_x, height, -place.pin_y] };
    }
    const building = campus.buildings.find(b => b.id === place.building_id);
    if (!building) return null;
    return { key: `b:${building.id}`, at: [building.center[0], infos[building.id].height, -building.center[1]], building: building.id };
}

/**
 * A place's logo stood as a sign on its own pin, like a corridor coffee
 * shop's. Shown always: the admin asked for it, as for a building's sign.
 */
function PinnedSigns({ places, infos, onSelectPlace }) {
    return places
        .filter(p => p.pin_x != null && p.show_sign && p.logo_url)
        .map(p => (
            <Suspense key={p.id} fallback={null}>
                <ShopSign src={p.logo_url} base={anchorOf(p, infos).at} onPick={() => onSelectPlace(p.id)} />
            </Suspense>
        ));
}

/**
 * Pins for the categories switched on in the map's filter, like a maps app
 * showing every coffee shop nearby, plus the place a search or a tap opened.
 * Nothing else, so the map isn't crowded. Places that share a spot (three
 * departments in B2) share a pin with a count. A place already standing a
 * sign has no pin: the sign marks it.
 */
function PlaceMarkers({ places, infos, activeKinds, openPlace, onSelect, onSelectPlace }) {
    const groups = useMemo(() => {
        const bySpot = new Map();
        for (const place of places) {
            const opened = place.id === openPlace;
            if (!opened && !activeKinds.has(place.kind)) continue;
            if (!opened && place.show_sign && place.logo_url) continue;
            const anchor = anchorOf(place, infos);
            if (!anchor) continue;
            if (!bySpot.has(anchor.key)) bySpot.set(anchor.key, { ...anchor, places: [] });
            bySpot.get(anchor.key).places.push(place);
        }
        return [...bySpot.values()];
    }, [places, infos, activeKinds, openPlace]);

    return groups.map(group => {
        const [first] = group.places;
        const many = group.places.length > 1;
        const pick = () => {
            // Several places in one building: its panel lists them all.
            if (many && group.building) onSelect(group.building);
            else onSelectPlace(first.id);
        };
        return (
            // Under the page's own overlays (search, panels), which sit at 10.
            <Html key={group.key} position={group.at} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
                <button
                    type="button"
                    data-map-marker=""
                    className={`${styles.marker} ${group.places.some(p => p.id === openPlace) ? styles.markerOpen : ''}`}
                    style={{ '--marker': (PLACE_KINDS[first.kind] || PLACE_KINDS.other).color }}
                    onClick={pick}
                    title={group.places.map(p => p.name).join(', ')}
                    aria-label={many ? `${group.places.length} places: ${group.places.map(p => p.name).join(', ')}` : first.name}
                >
                    <PlaceIcon kind={first.kind} size={30} solid />
                    {many && <span className={styles.markerCount}>{group.places.length}</span>}
                </button>
            </Html>
        );
    });
}

/** The grey housing blocks and unnamed buildings, one mesh per colour. */
function Blocks() {
    const meshes = useMemo(() => {
        const byColor = new Map();
        for (const block of campus.blocks) {
            const key = `${block.kind}|${block.color}`;
            if (!byColor.has(key)) byColor.set(key, []);
            byColor.get(key).push(block);
        }
        return [...byColor].map(([key, blocks]) => {
            const [kind, color] = key.split('|');
            return {
                key,
                color,
                geometry: extrude(blocks, kind === 'housing' ? HOUSING_HEIGHT : UNNAMED_HEIGHT),
            };
        });
    }, []);
    useEffect(() => () => meshes.forEach(m => m.geometry.dispose()), [meshes]);

    return meshes.map(m => (
        <mesh key={m.key} geometry={m.geometry} rotation={LAY_FLAT} castShadow receiveShadow>
            <meshStandardMaterial color={m.color} roughness={0.9} />
        </mesh>
    ));
}

/** The covered walkways: a thin roof on stilts nobody draws. */
function Walkways({ building }) {
    const geometry = useMemo(() => extrude(building.shapes, WALKWAY_THICKNESS), [building]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    return (
        <mesh geometry={geometry} rotation={LAY_FLAT} position={[0, WALKWAY_HEIGHT, 0]} castShadow>
            <meshStandardMaterial color="#e9ebee" roughness={0.6} />
        </mesh>
    );
}

/**
 * Keeps the sun over whatever the camera is looking at, so the shadow map
 * only has to cover the view and stays sharp.
 */
function Sun() {
    const light = useRef();
    const controls = useThree(state => state.controls);
    useFrame(() => {
        if (!light.current || !controls) return;
        const t = controls.target;
        light.current.position.set(t.x - 40, 90, t.z + 55);
        light.current.target.position.copy(t);
        light.current.target.updateMatrixWorld();
    });
    return (
        <directionalLight
            ref={light}
            intensity={2.1}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.04}
            shadow-camera-left={-90}
            shadow-camera-right={90}
            shadow-camera-top={90}
            shadow-camera-bottom={-90}
            shadow-camera-near={1}
            shadow-camera-far={260}
        />
    );
}

// How steeply the camera looks down when it flies somewhere: about 38
// degrees off straight down, so a building isn't lost behind its neighbours.
const FLY_TILT = Math.atan2(0.62, 0.78);

/** The shortest signed turn from angle a to angle b. */
function turnBetween(a, b) {
    return THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
}

/**
 * Glides the camera when `focus` (a building or an area) or `turn` (a button
 * press) changes, and gives up the moment the person grabs the map.
 *
 * It moves in orbit terms (distance, tilt, compass heading around the point
 * looked at) rather than in a straight line, so a quarter turn swings round
 * the building instead of cutting across and dipping in towards it.
 */
function CameraRig({ focus, turn }) {
    const controls = useThree(state => state.controls);
    const camera = useThree(state => state.camera);
    const goal = useRef(null);

    const current = () => new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));

    useEffect(() => {
        if (!controls) return;
        const stop = () => { goal.current = null; };
        controls.addEventListener('start', stop);
        return () => controls.removeEventListener('start', stop);
    }, [controls]);

    useEffect(() => {
        if (!focus || !controls) return;
        goal.current = {
            target: focus.target.clone(),
            radius: focus.distance,
            phi: FLY_TILT,
            // Keep facing the way the person was facing.
            theta: goal.current?.theta ?? current().theta,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focus, controls]);

    useEffect(() => {
        if (!turn || !controls) return;
        const now = current();
        const base = goal.current ?? { target: controls.target.clone(), radius: now.radius, phi: now.phi, theta: now.theta };
        // A press during a turn adds to where that turn is heading.
        goal.current = { ...base, theta: turn.by == null ? 0 : base.theta + turn.by };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turn, controls]);

    useFrame((_, dt) => {
        const g = goal.current;
        if (!g || !controls) return;
        const k = 1 - Math.exp(-Math.min(dt, 0.1) * 5);
        const s = current();
        const dTheta = turnBetween(s.theta, g.theta);

        controls.target.lerp(g.target, k);
        s.radius += (g.radius - s.radius) * k;
        s.phi += (g.phi - s.phi) * k;
        s.theta += dTheta * k;
        camera.position.setFromSpherical(s).add(controls.target);
        controls.update();

        const settled = controls.target.distanceTo(g.target) < 0.02
            && Math.abs(g.radius - s.radius) < 0.05
            && Math.abs(g.phi - s.phi) < 0.001
            && Math.abs(dTheta) < 0.001;
        if (settled) goal.current = null;
    });

    return null;
}

/**
 * Keeps the map controls from jamming.
 *
 * The controls act on a press until its release arrives. If the release never
 * does (the scroll-wheel button starting the browser's autoscroll, Edge's
 * right-button mouse gestures, the window losing focus mid-drag), they stay
 * mid-drag: the map follows the mouse with no button held, or ignores the
 * next press. So this keeps its own record of what is pressed, and cancels
 * whatever the record says is still down when it can't be. The controls take
 * a pointercancel exactly like a release.
 */
function PointerGuard() {
    const controls = useThree(state => state.controls);

    useEffect(() => {
        const el = controls?.domElement;
        if (!el) return;
        const down = new Map();

        const cancel = (pointerId) => {
            const pointerType = down.get(pointerId);
            down.delete(pointerId);
            el.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType, bubbles: true }));
        };
        const cancelAll = () => [...down.keys()].forEach(cancel);

        // Capture phase on the canvas, so this runs before the controls see
        // the press. A primary pointer going down means nothing else of its
        // kind is, so anything still on record is left over.
        const onDown = (e) => {
            if (e.isPrimary && down.size > 0) cancelAll();
            down.set(e.pointerId, e.pointerType);
        };
        const onUp = (e) => { down.delete(e.pointerId); };
        // A mouse moving with no button held can't be mid-drag.
        const onMove = (e) => {
            if (e.pointerType === 'mouse' && e.buttons === 0 && down.has(e.pointerId)) cancel(e.pointerId);
        };
        // The scroll-wheel button drags to zoom here, so it must not also
        // start the browser's autoscroll, which swallows the release.
        const noAutoscroll = (e) => {
            if (e.button === 1) e.preventDefault();
        };

        el.addEventListener('pointerdown', onDown, true);
        el.addEventListener('mousedown', noAutoscroll);
        el.addEventListener('auxclick', noAutoscroll);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onUp, true);
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('blur', cancelAll);
        return () => {
            el.removeEventListener('pointerdown', onDown, true);
            el.removeEventListener('mousedown', noAutoscroll);
            el.removeEventListener('auxclick', noAutoscroll);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onUp, true);
            window.removeEventListener('pointermove', onMove, true);
            window.removeEventListener('blur', cancelAll);
        };
    }, [controls]);

    return null;
}

/**
 * Turns the page's compass needle to wherever north is on screen. Written
 * straight to the element each frame, not through React state.
 */
function Heading({ needle }) {
    const controls = useThree(state => state.controls);
    const camera = useThree(state => state.camera);
    const last = useRef(null);
    useFrame(() => {
        if (!needle?.current || !controls) return;
        const offset = camera.position.clone().sub(controls.target);
        const heading = Math.atan2(offset.x, offset.z);
        if (last.current !== null && Math.abs(heading - last.current) < 0.002) return;
        last.current = heading;
        needle.current.style.transform = `rotate(${heading}rad)`;
    });
    return null;
}

/**
 * Keeps panning on the campus, so it cannot be dragged off into nothing.
 *
 * Takes the controls' change event and lives out here on purpose: drei
 * reconnects the controls whenever its onChange prop changes, and doing that
 * mid-drag (an inline arrow, re-made each time hovering a building
 * re-renders the scene) left them stuck until a reload.
 */
function clampTarget(event) {
    const controls = event?.target;
    const t = controls?.target;
    if (!t) return;
    const halfW = campus.width / 2 + 10;
    const halfH = campus.height / 2 + 10;
    const x = THREE.MathUtils.clamp(t.x, -halfW, halfW);
    const z = THREE.MathUtils.clamp(t.z, -halfH, halfH);
    if (x !== t.x || z !== t.z) {
        controls.object.position.x += x - t.x;
        controls.object.position.z += z - t.z;
        t.x = x;
        t.z = z;
    }
}

export default function CampusScene({
    selected, onSelect, focus, turn, highlight, needle, places = [], openPlace, onSelectPlace, activeKinds = NO_KINDS,
}) {
    const [hovered, setHovered] = useState(null);
    const downAt = useRef(null);

    const infos = useMemo(() => Object.fromEntries(campus.buildings.map(b => [b.id, sizedInfo(b)])), []);
    const walkways = campus.buildings.find(b => b.kind === 'walkway');
    const buildings = campus.buildings.filter(b => b.kind !== 'walkway');

    // A building shows the sign of its first place that asks for one.
    const signs = useMemo(() => {
        const out = {};
        for (const p of places) {
            if (p.building_id && p.show_sign && p.logo_url && !out[p.building_id] && p.pin_x == null) out[p.building_id] = p;
        }
        return out;
    }, [places]);

    useEffect(() => {
        document.body.style.cursor = hovered ? 'pointer' : '';
        return () => { document.body.style.cursor = ''; };
    }, [hovered]);

    return (
        <Canvas
            // Plain PCF: the soft variant is gone from this three.js.
            shadows="percentage"
            dpr={[1, 2]}
            // No filmic tone mapping: it greys out the zone colours, and the
            // point is that they match the paper map.
            gl={{ toneMapping: THREE.NoToneMapping }}
            // Opens on the whole campus; the page then glides in to a zone.
            camera={{ fov: 40, near: 0.5, far: 2000, position: [0, OVERVIEW_DISTANCE * 0.78, OVERVIEW_DISTANCE * 0.62] }}
            onPointerDown={(e) => { downAt.current = [e.clientX, e.clientY]; }}
            onPointerMissed={(e) => {
                // A tap on a pin reaches the scene too, as a tap on nothing:
                // the pin handles it, so it mustn't also clear what it opened.
                if (e.target?.closest?.('[data-map-marker]')) return;
                // Tapping empty ground clears the selection; panning across it does not.
                const d = downAt.current;
                if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 6) onSelect(null);
            }}
        >
            {/* Sky plus sun add up to about pi on flat ground, which shows the
                map's texture at its own colours. */}
            <hemisphereLight args={['#ffffff', '#d9d3c6', 1.55]} />
            <Sun />

            <Suspense fallback={null}>
                <Ground />
            </Suspense>

            <Blocks />
            {walkways && <Walkways building={walkways} />}

            {buildings.map(b => (
                <Building
                    key={b.id}
                    building={b}
                    info={infos[b.id]}
                    sign={signs[b.id]}
                    selected={selected === b.id}
                    hovered={hovered === b.id}
                    dimmed={!!highlight && !highlight.has(b.id)}
                    onSelect={onSelect}
                    onHover={setHovered}
                />
            ))}

            <PinnedSigns places={places} infos={infos} onSelectPlace={onSelectPlace} />
            <PlaceMarkers
                places={places}
                infos={infos}
                activeKinds={activeKinds}
                openPlace={openPlace}
                onSelect={onSelect}
                onSelectPlace={onSelectPlace}
            />

            <MapControls
                makeDefault
                enableDamping
                dampingFactor={0.12}
                // Closer than this and a building fills the screen.
                minDistance={35}
                maxDistance={OVERVIEW_DISTANCE + 20}
                maxPolarAngle={1.2}
                screenSpacePanning={false}
                onChange={clampTarget}
            />
            <CameraRig focus={focus} turn={turn} />
            <PointerGuard />
            <Heading needle={needle} />
        </Canvas>
    );
}
