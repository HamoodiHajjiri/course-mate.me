'use client';

import SwapLoop from '@/components/SwapLoop/SwapLoop';
import { Button, CourseCode, CourseMark, CourseName, Section } from '@/components/ui';
import styles from './matches.module.css';

const HOLD = 24 * 60 * 60 * 1000;

// A match is held for 24 hours. The fuse is that time, burning down.
function fuse(expiresAt) {
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return { text: 'expired', pct: 0, level: 'out' };
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const pct = Math.min(100, (diff / HOLD) * 100);
    return { text: `${hours}h ${String(minutes).padStart(2, '0')}m`, pct, level: hours < 6 ? 'low' : 'ok' };
}

/**
 * One match, set as a route sheet: the course, the route (who hands which
 * section to whom), where everyone stands, and the one thing to do next.
 * The fuse under the heading is the 24-hour hold running down.
 */
export default function MatchCard({ match, user, courses, contactInfoMap, busy, onAccept, onDecline, onComplete, onCopy }) {
    const parts = [...(match.participants || [])].sort((a, b) => a.position - b.position);
    const me = parts.find(p => p.user_id === user?.id);
    if (!me) return null;

    const size = match.size || parts.length;
    const others = parts.filter(p => p.user_id !== user?.id);
    const confirmed = match.status === 'accepted';
    const waitingOn = parts.filter(p => !p.accepted).length;
    const course = me.post;
    const courseName = course?.course_name || courses[course?.course_code] || course?.course_code;
    const timer = !confirmed && match.expires_at ? fuse(match.expires_at) : null;
    const state = confirmed ? 'confirmed' : me.accepted ? 'waiting' : 'yours';
    const kind = size > 2 ? `${size}-way loop` : 'Direct swap';
    const otherNames = others.map(o => (o.profile?.name || 'A student').split(' ')[0]);
    const pendingNames = others.filter(o => !o.accepted).map(o => (o.profile?.name || 'A student').split(' ')[0]);

    return (
        <article className={`${styles.match} ${styles[`match_${state}`]}`}>
            <header className={styles.matchHead}>
                <div className={styles.matchCourse}>
                    <span className={styles.matchCode}>
                        <CourseMark courseId={course?.course_code} />
                        <CourseCode id={course?.course_code} />
                    </span>
                    <CourseName as="h3" size="lg" className={styles.matchName}>{courseName}</CourseName>
                </div>
                <div className={styles.matchKind}>
                    <span className={styles.kind}>{kind}</span>
                    {timer && (
                        <span className={`${styles.fuseText} ${styles[`fuse_${timer.level}`]}`} title="A match is held for 24 hours">
                            {timer.text} left
                        </span>
                    )}
                    {confirmed && <span className={styles.confirmed}>Confirmed</span>}
                </div>
            </header>

            {timer && (
                <div className={`${styles.fuse} ${styles[`fuse_${timer.level}`]}`} aria-hidden="true">
                    <span style={{ width: `${timer.pct}%` }} />
                </div>
            )}

            <div className={styles.routeWrap}>
                <SwapLoop me={user?.id} participants={parts.map(p => ({ ...p, name: p.profile?.name }))} />
            </div>

            <p className={styles.sentence}>
                You give <Section value={me.gives_section} /> and get <Section value={me.gets_section} tone="mine" />
                {size > 2 ? <> in a loop with {otherNames.join(' and ')}.</> : <> from {others[0]?.profile?.name || 'another student'}.</>}
                {' '}
                {state === 'yours' && (pendingNames.length < others.length
                    ? <>{others.filter(o => o.accepted).map(o => (o.profile?.name || 'Someone').split(' ')[0]).join(' and ')} {others.filter(o => o.accepted).length === 1 ? 'has' : 'have'} accepted; it&rsquo;s your turn.</>
                    : <>Nobody has answered yet.</>)}
                {state === 'waiting' && <>You accepted. Waiting on {pendingNames.join(' and ') || `${waitingOn} more`}.</>}
                {state === 'confirmed' && <>Everyone accepted. Make the swap in the university portal together, then mark it done.</>}
            </p>

            {confirmed && (
                <dl className={styles.contacts}>
                    {others.map(p => {
                        const ci = contactInfoMap[p.profile?.id];
                        return (
                            <div key={p.position} className={styles.contact}>
                                <dt className={styles.contactName}>{p.profile?.name}</dt>
                                <dd className={styles.contactId}>{p.profile?.student_id}</dd>
                                <dd className={styles.contactPhone}>
                                    {ci?.phone ? (
                                        <>
                                            <a href={`tel:${ci.phone}`}>{ci.phone}</a>
                                            <button type="button" className={styles.copy} onClick={() => onCopy(ci.phone)}>copy</button>
                                        </>
                                    ) : <span className={styles.muted}>unlocking…</span>}
                                </dd>
                            </div>
                        );
                    })}
                </dl>
            )}

            {(state === 'yours' || confirmed) && (
                <footer className={styles.matchActions}>
                    {state === 'yours' && match.status === 'pending' && (
                        <>
                            <Button variant="primary" onClick={() => onAccept(match)} loading={busy === `accept-${match.id}`}>Accept the swap</Button>
                            <Button variant="dangerGhost" onClick={() => onDecline(match)} loading={busy === `decline-${match.id}`}>Decline</Button>
                        </>
                    )}
                    {confirmed && (
                        <Button variant="primary" onClick={() => onComplete(match)} loading={busy === `complete-${match.id}`}>We&rsquo;ve swapped in the portal</Button>
                    )}
                </footer>
            )}
        </article>
    );
}
