'use client';

import SwapLoop from '@/components/SwapLoop/SwapLoop';
import { Avatar, Badge, Button, CourseSwatch, Ticket } from '@/components/ui';
import { ActivityIcon, ArrowRightIcon, CheckIcon, CopyIcon, PhoneIcon } from '@/components/Icons';
import styles from './matches.module.css';

const DAY = 24 * 60 * 60 * 1000;

function getTimeRemaining(expiresAt) {
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return { text: 'Expired', pct: 0, urgent: true };
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return { text: `${hours}h ${minutes}m left`, pct: Math.min(100, (diff / DAY) * 100), urgent: hours < 6 };
}

/**
 * One match: who swaps what, where everyone stands, and what to do next.
 * A direct swap is two tickets changing hands; three or more is drawn as the
 * loop it is.
 */
export default function MatchCard({ match, user, courses, contactInfoMap, busy, onAccept, onDecline, onComplete, onCopy }) {
        const handleAccept = onAccept;
        const handleDecline = onDecline;
        const handleCompleteMatch = onComplete;
        const copy = onCopy;
        const parts = [...(match.participants || [])].sort((a, b) => a.position - b.position);

        const me = parts.find(p => p.user_id === user?.id);
        if (!me) return null;

        const size = match.size || parts.length;
        const isCycle = size > 2;
        const others = parts.filter(p => p.user_id !== user?.id);
        const allAccepted = match.status === 'accepted';
        const acceptedCount = parts.filter(p => p.accepted).length;
        const myAccepted = me.accepted;
        const waitingOn = size - acceptedCount;
        const course = me.post;
        const courseName = course?.course_name || courses[course?.course_code] || course?.course_code;
        const timer = !allAccepted && match.expires_at ? getTimeRemaining(match.expires_at) : null;
        const state = allAccepted ? 'matched' : myAccepted ? 'waiting' : 'yours';

        return (
            <article key={match.id} className={`${styles.match} ${styles[`match_${state}`]}`}>
                <header className={styles.matchHead}>
                    <Badge tone={state === 'matched' ? 'success' : state === 'yours' ? 'warning' : 'neutral'} dot>
                        {state === 'matched' ? 'Matched · contacts unlocked' : state === 'yours' ? 'Needs your answer' : `Waiting on ${waitingOn} ${waitingOn === 1 ? 'other' : 'others'}`}
                    </Badge>
                    {isCycle && <Badge tone="accent">{size}-way loop</Badge>}
                    {timer && (
                        <span className={`${styles.timer} ${timer.urgent ? styles.timerUrgent : ''}`} title="Matches are held for 24 hours">
                            <span className={styles.timerRing} style={{ '--pct': timer.pct }} aria-hidden="true" />
                            {timer.text}
                        </span>
                    )}
                </header>

                <div className={styles.matchCourse}>
                    <CourseSwatch courseId={course?.course_code} />
                    <span className={styles.matchCourseText}>
                        <span className={styles.matchCourseName}>{courseName}</span>
                        <span className={styles.mono}>{course?.course_code}</span>
                    </span>
                </div>

                {isCycle ? (
                    <div className={styles.loopWrap}>
                        <SwapLoop
                            me={user?.id}
                            participants={parts.map(p => ({ ...p, name: p.profile?.name }))}
                        />
                        <ol className={styles.steps}>
                            {parts.map(p => {
                                const isMe = p.user_id === user?.id;
                                return (
                                    <li key={p.position} className={`${styles.step} ${isMe ? styles.stepMe : ''}`}>
                                        <Avatar name={isMe ? 'You' : p.profile?.name} size={28} tone={isMe ? 'solid' : 'neutral'} />
                                        <span className={styles.stepText}>
                                            <span className={styles.stepName}>{isMe ? 'You' : p.profile?.name}</span>
                                            <span className={styles.stepFlow}>
                                                gives <b>{p.gives_section}</b> <ArrowRightIcon /> gets <b>{p.gets_section}</b>
                                            </span>
                                        </span>
                                        {p.accepted ? <Badge size="sm" tone="success" icon={<CheckIcon strokeWidth={2.5} />}>Accepted</Badge> : <Badge size="sm">Waiting</Badge>}
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                ) : (
                    <div className={styles.direct}>
                        <div className={styles.side}>
                            <span className={styles.sideWho}>
                                <Avatar name="You" size={24} tone="solid" />
                                You give
                            </span>
                            <Ticket size="lg" label="Sec" section={me.gives_section} />
                            {me.accepted && <span className={styles.sideAccepted}><CheckIcon strokeWidth={2.5} /> Accepted</span>}
                        </div>
                        <span className={styles.directSwap} aria-label="swap with">
                            <ActivityIcon />
                        </span>
                        <div className={`${styles.side} ${styles.sideEnd}`}>
                            <span className={styles.sideWho}>
                                <Avatar name={others[0]?.profile?.name} size={24} tone="neutral" />
                                You get
                            </span>
                            <Ticket size="lg" label="Sec" section={me.gets_section} tone="accent" />
                            <span className={styles.sideFrom}>
                                from <strong>{others[0]?.profile?.name || 'another student'}</strong>
                                {others[0]?.profile?.student_id && <span className={styles.mono}> · {others[0].profile.student_id}</span>}
                                {others[0]?.accepted && <span className={styles.sideAcceptedInline}> · accepted</span>}
                            </span>
                        </div>
                    </div>
                )}

                {allAccepted && (
                    <div className={styles.contacts}>
                        <span className={styles.contactsLabel}>Coordinate the swap</span>
                        {others.map((p) => {
                            const ci = contactInfoMap[p.profile?.id];
                            return (
                                <div key={p.position} className={styles.contact}>
                                    <Avatar name={p.profile?.name} size={30} tone="neutral" />
                                    <span className={styles.contactName}>{p.profile?.name}</span>
                                    {ci?.phone ? (
                                        <>
                                            <a href={`tel:${ci.phone}`} className={styles.contactPhone}><PhoneIcon />{ci.phone}</a>
                                            <button type="button" className={styles.copyBtn} onClick={() => copy(ci.phone)} aria-label={`Copy ${p.profile?.name}'s number`}>
                                                <CopyIcon />
                                            </button>
                                        </>
                                    ) : (
                                        <span className={styles.contactPending}>Contact unlocked</span>
                                    )}
                                </div>
                            );
                        })}
                        <p className={styles.contactsHint}>Drop and add the sections in the university portal at the same moment, then mark the swap done.</p>
                    </div>
                )}

                {state === 'waiting' && (
                    <p className={styles.waitNote}>
                        You accepted. We&rsquo;ll notify you the moment {waitingOn === 1 ? 'the other student accepts' : `the other ${waitingOn} accept`}.
                    </p>
                )}

                <footer className={styles.matchActions}>
                    {!myAccepted && match.status === 'pending' && (
                        <>
                            <Button variant="dangerGhost" onClick={() => handleDecline(match)} loading={busy === `decline-${match.id}`}>Decline</Button>
                            <Button variant="primary" icon={<CheckIcon strokeWidth={2.25} />} onClick={() => handleAccept(match)} loading={busy === `accept-${match.id}`}>
                                Accept swap
                            </Button>
                        </>
                    )}
                    {allAccepted && (
                        <Button variant="primary" icon={<CheckIcon strokeWidth={2.25} />} onClick={() => handleCompleteMatch(match)} loading={busy === `complete-${match.id}`}>
                            Mark as completed
                        </Button>
                    )}
                </footer>
            </article>
        );
    }
