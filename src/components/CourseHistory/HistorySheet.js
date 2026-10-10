'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSemester } from '@/lib/SemesterContext';
import { historyTerms, fetchCourseHistory } from '@/lib/courseHistory';
import { courseColor } from '@/lib/courseColor';
import { Button, CourseCode, Dialog, Skeleton } from '@/components/ui';
import styles from './CourseHistory.module.css';

/**
 * Quick look at a course's past terms, opened from its clock button in the
 * build tab. A sheet over the page so the schedule being built stays put;
 * "See every section" hands over to the History tab.
 */
export default function HistorySheet({ course, onClose, onSeeAll }) {
    const supabase = createClient();
    const { selectedTerm } = useSemester();
    const [history, setHistory] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchCourseHistory(supabase, course.course_id, historyTerms(selectedTerm))
            .then(result => { if (!cancelled) setHistory(result); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [course.course_id, selectedTerm]);

    const newestOffered = history?.terms.find(t => t.offered);
    const maxSections = history ? Math.max(1, ...history.terms.map(t => t.sections.length)) : 1;

    return (
        <Dialog
            open
            onClose={onClose}
            size="md"
            title={(
                <span className={styles.sheetTitle}>
                    <CourseCode id={course.course_id} />
                    <span>{course.name || course.course_id}</span>
                </span>
            )}
            footer={newestOffered ? (
                <Button variant="primary" onClick={() => onSeeAll(newestOffered.code)}>
                    See every section →
                </Button>
            ) : null}
        >
            {!history && !failed && (
                <div className={styles.sheetLoading}>
                    <Skeleton height={96} />
                    <Skeleton height={12} width="40%" />
                    <Skeleton height={36} />
                    <Skeleton height={36} />
                </div>
            )}
            {failed && <p className={styles.sheetEmpty}>Couldn&rsquo;t load this course&rsquo;s history. Try again in a moment.</p>}

            {history && (
                <div className={styles.sheetBody} style={{ '--c': courseColor(course.course_id) }}>
                    {/* Oldest on the left, so the bars read like a timeline. */}
                    <div className={styles.bars} style={{ gridTemplateColumns: `repeat(${history.terms.length}, minmax(0, 1fr))` }}>
                        {history.terms.slice().reverse().map(t => (
                            <div key={t.code} className={`${styles.barCol} ${t.offered ? '' : styles.barOff}`}>
                                <span className={styles.barCount}>{t.offered ? t.sections.length : '–'}</span>
                                <span className={styles.barTrack}>
                                    <span className={styles.bar} style={{ height: `${t.offered ? Math.max(8, (t.sections.length / maxSections) * 100) : 0}%` }} />
                                </span>
                                <span className={styles.barTerm}>{t.label}</span>
                            </div>
                        ))}
                    </div>
                    <p className={styles.barCaption}>Sections each term{history.offeredCount === 0 ? ' — not offered in any of these terms' : ''}</p>

                    {history.instructors.length > 0 && (
                        <section className={styles.sheetBlock}>
                            <span className={styles.timelineLabel}>Who taught it</span>
                            <ul className={styles.instructors}>
                                {history.instructors.slice(0, 5).map(i => (
                                    <li key={i.name}>
                                        <span className={styles.instructorName}>{i.name}</span>
                                        <span className={styles.instructorMeta}>
                                            {i.terms.join(', ')} · {i.sections} {i.sections === 1 ? 'section' : 'sections'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {history.usualTimes.length > 0 && (
                        <section className={styles.sheetBlock}>
                            <span className={styles.timelineLabel}>Usual start times</span>
                            <div className={styles.chips}>
                                {history.usualTimes.map(t => <span key={t} className={styles.chipLarge}>{t}</span>)}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </Dialog>
    );
}
