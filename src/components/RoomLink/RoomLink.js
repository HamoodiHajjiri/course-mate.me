'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { buildingOfRoom, floorOfRoom } from '@/app/map/buildings';
import styles from './RoomLink.module.css';

/**
 * A room, or a few ("A3-007, A12-004"), written like a sign: the room code in
 * mono with an arrow after it, opening the campus map on its building. Old
 * codes work too: Find My Prof's "M5-123" office is in A9. Anything that
 * names no building ("TBA", an online class) stays plain text.
 *
 * `className` styles the whole thing, so it can stand in for the plain room
 * span a page already had.
 */
export default function RoomLink({ room, className = '' }) {
    if (!room) return null;
    const rooms = room.split(/\s*,\s*/).filter(Boolean);

    return (
        <span className={className}>
            {rooms.map((part, i) => {
                const building = buildingOfRoom(part);
                const floor = floorOfRoom(part);
                return (
                    <Fragment key={`${part}-${i}`}>
                        {i > 0 && ', '}
                        {building ? (
                            <Link
                                href={`/map?room=${encodeURIComponent(part)}`}
                                className={styles.link}
                                title={`Show ${building} on the campus map${floor ? `, ${floor.name}` : ''}`}
                                aria-label={`${part}: show on the campus map`}
                                // Rooms sit inside clickable rows (picking a section);
                                // opening the map shouldn't also pick the row.
                                onClick={e => e.stopPropagation()}
                            >
                                {part}
                                {/* The arrow says this goes somewhere: a room code on
                                    its own didn't read as something to tap. */}
                                <span className={styles.arrow} aria-hidden="true">↗</span>
                            </Link>
                        ) : part}
                    </Fragment>
                );
            })}
        </span>
    );
}
