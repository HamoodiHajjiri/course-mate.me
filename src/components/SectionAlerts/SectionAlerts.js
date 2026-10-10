'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, CourseCode, CourseMark, Section, Select, Skeleton, useToast } from '@/components/ui';
import styles from './SectionAlerts.module.css';

const PHONE_QUERY = '(max-width: 1023px)';

/**
 * Watch a section: tell me when a swap or giveaway for it is posted.
 *
 * A ledger of what you're watching, then one line to add to it. The course
 * box suggests from the student's own major; a section can be pinned or left
 * as "any". Folded on phones, where it sits under the board.
 */
export default function SectionAlerts({ term, courses, sections = [], majorCourses = null }) {
    const supabase = createClient();
    const toast = useToast();
    const [watches, setWatches] = useState([]);
    const [userId, setUserId] = useState(null);
    const [course, setCourse] = useState('');
    const [section, setSection] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const [open, setOpen] = useState(true);
    const blurTimer = useRef(null);
    const wrapperRef = useRef(null);
    const [dropStyle, setDropStyle] = useState(null);
    const listId = useId();
    const inputId = useId();

    // Folded by default on phones, where it sits above the feed.
    useEffect(() => {
        if (window.matchMedia(PHONE_QUERY).matches) setOpen(false);
    }, []);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUserId(user?.id || null);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!userId || !term) return;
        (async () => {
            setLoading(true);
            const { data } = await supabase
                .from('section_watches')
                .select('*')
                .eq('term_code', term)
                .order('created_at', { ascending: false });
            setWatches(data || []);
            setLoading(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, term]);

    // Alerts are scoped to the student's major: only courses in their plan are offered.
    const majorSet = useMemo(() => new Set(majorCourses || []), [majorCourses]);
    const inMajor = (code) => majorSet.size === 0 || majorSet.has(code);

    // Only suggest after a couple of characters, like the other course searches.
    const suggestions = useMemo(() => {
        const q = course.trim().toLowerCase();
        if (q.length < 2) return [];
        return Object.entries(courses || {})
            .filter(([code, name]) => inMajor(code) && (code.toLowerCase().includes(q) || (name || '').toLowerCase().includes(q)))
            .slice(0, 50);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [course, courses, majorSet]);

    useEffect(() => { setActiveIdx(-1); }, [course]);

    const trimmedCourse = course.trim();
    const courseValid = !!(trimmedCourse && courses && courses[trimmedCourse] && inMajor(trimmedCourse));

    // Sections offered for the chosen course (tutorials excluded — they can't be posted alone).
    const courseSections = useMemo(() => {
        if (!courseValid) return [];
        const nums = (sections || [])
            .filter(s => s.course_id === trimmedCourse && !String(s.section_num || '').toUpperCase().endsWith('T'))
            .map(s => s.section_num);
        return [...new Set(nums)].sort();
    }, [courseValid, trimmedCourse, sections]);

    // Keep the suggestion list inside the viewport: shrink to fit below, or flip above
    // when there isn't enough room (e.g. shorter laptop screens).
    useEffect(() => {
        if (!showSuggestions || suggestions.length === 0) return undefined;
        const compute = () => {
            const el = wrapperRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const margin = 16;
            const spaceBelow = window.innerHeight - rect.bottom - margin;
            const spaceAbove = rect.top - margin;
            const clamp = (v) => Math.max(120, Math.min(300, v));
            if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
                setDropStyle({ top: 'calc(100% + 6px)', bottom: 'auto', maxHeight: clamp(spaceBelow) });
            } else {
                setDropStyle({ top: 'auto', bottom: 'calc(100% + 6px)', maxHeight: clamp(spaceAbove) });
            }
        };
        compute();
        window.addEventListener('resize', compute);
        window.addEventListener('scroll', compute, true);
        return () => {
            window.removeEventListener('resize', compute);
            window.removeEventListener('scroll', compute, true);
        };
    }, [showSuggestions, suggestions.length]);

    const selectCourse = (code) => {
        setCourse(code);
        setSection('');
        setError('');
        setShowSuggestions(false);
    };

    const onCourseKeyDown = (e) => {
        if (!showSuggestions || suggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx(i => Math.min(suggestions.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx(i => Math.max(0, i - 1));
        } else if (e.key === 'Enter' && activeIdx >= 0) {
            e.preventDefault();
            selectCourse(suggestions[activeIdx][0]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const add = async (e) => {
        e?.preventDefault();
        setError('');
        const code = course.trim();
        if (!code) { setError('Enter a course ID.'); return; }
        if (courses && Object.keys(courses).length > 0 && !courses[code]) {
            setError('Unknown course ID.');
            return;
        }
        if (!inMajor(code)) {
            setError('That course isn\'t in your major.');
            return;
        }
        setAdding(true);
        const payload = { user_id: userId, term_code: term, course_code: code, want_section: section.trim() || null };
        const { data, error: insErr } = await supabase.from('section_watches').insert(payload).select().single();
        setAdding(false);
        if (insErr) {
            setError(insErr.code === '23505' ? 'You already have that alert.' : 'Could not add alert.');
            return;
        }
        setWatches(prev => [data, ...prev]);
        setCourse('');
        setSection('');
        setShowSuggestions(false);
        toast.success(`Watching ${code}${data.want_section ? ` §${data.want_section}` : ''}`);
    };

    const remove = async (id) => {
        setRemoving(id);
        await supabase.from('section_watches').delete().eq('id', id);
        setWatches(prev => prev.filter(w => w.id !== id));
        setRemoving(null);
    };

    if (!term) return null;

    return (
        <section className={styles.panel} aria-labelledby={`${inputId}-title`}>
            <button
                type="button"
                className={styles.header}
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
            >
                <span id={`${inputId}-title`} className={styles.title}>Alerts</span>
                <span className={styles.count}>{loading ? '' : watches.length}</span>
                <span className={styles.toggle}>{open ? 'Hide' : 'Show'}</span>
            </button>

            {open && (
                <div className={styles.body}>
                    <p className={styles.lead}>We&rsquo;ll tell you, here and by email, when someone posts a section you&rsquo;re watching.</p>

                    {loading ? (
                        <div className={styles.loading}><Skeleton height={12} width="70%" /><Skeleton height={12} width="55%" /></div>
                    ) : watches.length > 0 && (
                        <ul className={styles.watches}>
                            {watches.map(w => (
                                <li key={w.id} className={`${styles.watch} ${removing === w.id ? styles.watchLeaving : ''}`}>
                                    <CourseMark courseId={w.course_code} size="sm" />
                                    <CourseCode id={w.course_code} size="sm" />
                                    {w.want_section ? <Section value={w.want_section} size="sm" /> : <span className={styles.any}>any section</span>}
                                    <button
                                        type="button"
                                        className={styles.removeBtn}
                                        onClick={() => remove(w.id)}
                                        disabled={removing === w.id}
                                        aria-label={`Stop watching ${w.course_code}${w.want_section ? ` section ${w.want_section}` : ''}`}
                                    >
                                        stop
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <form onSubmit={add} className={styles.form} noValidate>
                        <div className={styles.combo} ref={wrapperRef}>
                            <label htmlFor={inputId} className={styles.formLabel}>Watch a course</label>
                            <input
                                id={inputId}
                                className={`${styles.input} ${error ? styles.inputInvalid : ''}`}
                                placeholder="Code or name"
                                value={course}
                                autoComplete="off"
                                role="combobox"
                                aria-expanded={showSuggestions && suggestions.length > 0}
                                aria-controls={listId}
                                aria-autocomplete="list"
                                aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
                                aria-invalid={!!error || undefined}
                                onChange={(e) => { setCourse(e.target.value); setSection(''); setError(''); setShowSuggestions(true); }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => { blurTimer.current = setTimeout(() => setShowSuggestions(false), 120); }}
                                onKeyDown={onCourseKeyDown}
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div
                                    id={listId}
                                    role="listbox"
                                    className={styles.dropdown}
                                    style={dropStyle ? { top: dropStyle.top, bottom: dropStyle.bottom, maxHeight: dropStyle.maxHeight } : undefined}
                                    onMouseDown={() => clearTimeout(blurTimer.current)}
                                >
                                    {suggestions.map(([code, name], i) => (
                                        <button
                                            type="button"
                                            key={code}
                                            id={`${listId}-${i}`}
                                            role="option"
                                            aria-selected={i === activeIdx}
                                            className={`${styles.option} ${i === activeIdx ? styles.optionActive : ''}`}
                                            onClick={() => selectCourse(code)}
                                        >
                                            <CourseCode id={code} size="sm" />
                                            <span className={styles.optionName}>{name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {courseValid && (
                            <div className={styles.picked}>
                                <span className={styles.pickedName} title={courses[trimmedCourse]}>{courses[trimmedCourse]}</span>
                                <Select size="sm" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section">
                                    <option value="">Any section</option>
                                    {courseSections.map(s => (
                                        <option key={s} value={s}>{`§${s}`}</option>
                                    ))}
                                </Select>
                            </div>
                        )}

                        {error && <p className={styles.error} role="alert">{error}</p>}

                        <Button type="submit" variant="secondary" size="sm" loading={adding} className={styles.submit}>
                            Watch
                        </Button>
                    </form>
                </div>
            )}
        </section>
    );
}
