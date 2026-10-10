'use client';

import styles from './SwapLoop.module.css';

/**
 * A multi-person swap drawn as what it is: a loop. Each person is a node;
 * each arrow carries the section they hand to the next person, who is the
 * one whose `gets_section` it is. You are the filled node.
 *
 *   participants  [{ position, user_id, gives_section, gets_section, accepted, name }]
 *   me            the viewer's user_id
 */
export default function SwapLoop({ participants, me }) {
    const n = participants.length;
    const size = 260;
    const cx = size / 2;
    const cy = size / 2 + 4;
    const r = n === 3 ? 82 : 92;
    const nodeR = 26;

    // Lay people round the ring in the order sections travel: each person's
    // section goes to whoever gets that section, so following that chain
    // gives the loop, and every arrow then runs clockwise to the next node.
    const order = participants.length ? [participants[0]] : [];
    while (order.length < n) {
        const last = order[order.length - 1];
        const next = participants.find(q => !order.includes(q) && q.gets_section === last.gives_section)
            || participants.find(q => !order.includes(q));
        order.push(next);
    }

    const nodes = order.map((p, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return { ...p, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), angle };
    });

    const edges = nodes.map((p, i) => ({ from: p, to: nodes[(i + 1) % n], section: p.gives_section }));

    const label = (p) => (p.user_id === me ? 'You' : (p.name || 'Student').split(' ')[0]);

    return (
        <figure className={styles.loop}>
            <svg viewBox={`0 0 ${size} ${size}`} className={styles.svg} role="img" aria-label={edges.map(e => `${label(e.from)} gives section ${e.section} to ${label(e.to)}`).join('; ')}>
                <defs>
                    <marker id="loop-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M0 0 10 5 0 10z" className={styles.arrowHead} />
                    </marker>
                </defs>
                <circle cx={cx} cy={cy} r={r} className={styles.track} />
                {edges.map((e, i) => {
                    // Curve along the ring between the two nodes, trimmed so the
                    // arrow starts and ends at the node edges.
                    const a1 = e.from.angle + (nodeR + 6) / r;
                    const a2 = e.to.angle - (nodeR + 6) / r + (e.to.angle < e.from.angle ? 2 * Math.PI : 0);
                    const x1 = cx + r * Math.cos(a1);
                    const y1 = cy + r * Math.sin(a1);
                    const x2 = cx + r * Math.cos(a2);
                    const y2 = cy + r * Math.sin(a2);
                    const mid = (a1 + a2) / 2;
                    const lx = cx + (r + 28) * Math.cos(mid);
                    const ly = cy + (r + 28) * Math.sin(mid);
                    const fromMe = e.from.user_id === me;
                    const toMe = e.to.user_id === me;
                    return (
                        <g key={i} className={`${styles.edge} ${fromMe || toMe ? styles.edgeMine : ''}`}>
                            <path d={`M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`} markerEnd="url(#loop-arrow)" />
                            <g transform={`translate(${lx} ${ly})`}>
                                <rect x="-19" y="-10" width="38" height="20" rx="6" className={styles.pill} />
                                <text className={styles.pillText} textAnchor="middle" dominantBaseline="central">{e.section}</text>
                            </g>
                        </g>
                    );
                })}
                {nodes.map(p => {
                    const mine = p.user_id === me;
                    return (
                        <g key={p.position} transform={`translate(${p.x} ${p.y})`} className={`${styles.node} ${mine ? styles.nodeMe : ''} ${p.accepted ? styles.nodeAccepted : ''}`}>
                            <circle r={nodeR} />
                            <text className={styles.nodeText} textAnchor="middle" dominantBaseline="central">{label(p)}</text>
                            {p.accepted && (
                                <g transform={`translate(${nodeR * 0.72} ${-nodeR * 0.72})`} className={styles.tick}>
                                    <circle r="8" />
                                    <path d="M-3.5 0 -1 2.5 3.5 -2.5" />
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
            <figcaption className={styles.caption}>
                A {n}-way loop: each arrow is a section moving to the next person.
            </figcaption>
        </figure>
    );
}
