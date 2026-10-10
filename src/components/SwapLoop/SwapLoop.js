'use client';

import styles from './SwapLoop.module.css';

/**
 * A swap drawn as a route. Each person is a station on a line; each segment
 * carries the section one person hands to the next; a return line over the
 * top carries the last section back to the start and closes the loop. A
 * direct swap and a 3-way loop are the same drawing with a different number
 * of stops — which is exactly what they are.
 *
 * Stations are circles (people); a filled station has accepted. Segments
 * that touch you are drawn in ink, the rest in grey.
 *
 *   participants  [{ position, user_id, gives_section, gets_section, accepted, name }]
 *   me            the viewer's user_id; their station is drawn first
 */
export default function SwapLoop({ participants, me }) {
    const n = participants.length;
    if (n < 2) return null;

    // Follow the sections: start with the viewer, then whoever receives what
    // the previous person gives.
    const first = participants.find(p => p.user_id === me) || participants[0];
    const order = [first];
    while (order.length < n) {
        const last = order[order.length - 1];
        const next = participants.find(q => !order.includes(q) && q.gets_section === last.gives_section)
            || participants.find(q => !order.includes(q));
        order.push(next);
    }

    const gap = n === 2 ? 240 : n === 3 ? 196 : 160;
    const pad = 58;
    const width = pad * 2 + (n - 1) * gap;
    const yLine = 66;
    const yTop = 22;
    const r = 9;
    const height = yLine + 58;
    const x = (i) => pad + i * gap;

    const label = (p) => (p.user_id === me ? 'You' : (p.name || 'Student').split(' ')[0]);
    const touchesMe = (a, b) => a.user_id === me || b.user_id === me;

    const forward = order.slice(0, -1).map((p, i) => ({ from: p, to: order[i + 1], x1: x(i) + r + 5, x2: x(i + 1) - r - 7, section: p.gives_section }));
    const lastP = order[n - 1];
    const rise = yLine - r - 4 - yTop;
    const back = {
        from: lastP,
        to: order[0],
        d: `M ${x(n - 1) - 4} ${yLine - r - 4} L ${x(n - 1) - 4 - rise} ${yTop} L ${x(0) + 4 + rise} ${yTop} L ${x(0) + 4} ${yLine - r - 6}`,
        section: lastP.gives_section,
    };

    const sectionTag = (cx, cy, section, mine) => {
        const w = 14 + String(section).length * 7.4;
        return (
            <g transform={`translate(${cx} ${cy})`} className={`${styles.tag} ${mine ? styles.tagMine : ''}`}>
                <rect x={-w / 2} y={-9} width={w} height={18} />
                <text textAnchor="middle" dominantBaseline="central">
                    <tspan className={styles.tagSign}>§</tspan>{section}
                </text>
            </g>
        );
    };

    const description = order.map((p, i) => `${label(p)} gives section ${p.gives_section} to ${label(order[(i + 1) % n])}`).join('; ');

    return (
        <figure className={styles.route}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className={styles.svg}
                style={{ maxWidth: width }}
                role="img"
                aria-label={description}
            >
                <defs>
                    <marker id="route-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                        <path d="M1 1 9 5 1 9" className={styles.head} />
                    </marker>
                </defs>

                {forward.map((e, i) => (
                    <g key={`f-${i}`} className={`${styles.edge} ${touchesMe(e.from, e.to) ? styles.edgeMine : ''}`}>
                        <line x1={e.x1} y1={yLine} x2={e.x2} y2={yLine} markerEnd="url(#route-head)" />
                        {sectionTag((e.x1 + e.x2) / 2, yLine, e.section, touchesMe(e.from, e.to))}
                    </g>
                ))}

                <g className={`${styles.edge} ${styles.edgeBack} ${touchesMe(back.from, back.to) ? styles.edgeMine : ''}`}>
                    <path d={back.d} markerEnd="url(#route-head)" />
                    {sectionTag((x(0) + x(n - 1)) / 2, yTop, back.section, touchesMe(back.from, back.to))}
                </g>

                {order.map((p, i) => {
                    const mine = p.user_id === me;
                    return (
                        <g key={p.position} transform={`translate(${x(i)} ${yLine})`} className={`${styles.station} ${mine ? styles.stationMe : ''} ${p.accepted ? styles.stationAccepted : ''}`}>
                            <circle r={r} />
                            <text y={r + 19} textAnchor="middle" className={styles.who}>{label(p)}</text>
                            <text y={r + 34} textAnchor="middle" className={styles.state}>{p.accepted ? 'accepted' : 'waiting'}</text>
                        </g>
                    );
                })}
            </svg>
        </figure>
    );
}
