'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './SectionAlerts.module.css';

export default function SectionAlerts({ term, courses, sections = [], majorCourses = null }) {
    const supabase = createClient();
    const [watches, setWatches] = useState([]);
    const [userId, setUserId] = useState(null);
    const [course, setCourse] = useState('');
    const [section, setSection] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const blurTimer = useRef(null);
    const wrapperRef = useRef(null);
    const [dropStyle, setDropStyle] = useState(null);

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
        if (!showSuggestions || suggestions.length === 0) return;
        const compute = () => {
            const el = wrapperRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const margin = 16;
            const spaceBelow = window.innerHeight - rect.bottom - margin;
            const spaceAbove = rect.top - margin;
            const clamp = (v) => Math.max(120, Math.min(300, v));
            if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
                setDropStyle({ top: 'calc(100% + 4px)', bottom: 'auto', maxHeight: clamp(spaceBelow) });
            } else {
                setDropStyle({ top: 'auto', bottom: 'calc(100% + 4px)', maxHeight: clamp(spaceAbove) });
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
        setShowSuggestions(false);
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
        const payload = { user_id: userId, term_code: term, course_code: code, want_section: section.trim() || null };
        const { data, error: insErr } = await supabase.from('section_watches').insert(payload).select().single();
        if (insErr) {
            setError(insErr.code === '23505' ? 'You already have that alert.' : 'Could not add alert.');
            return;
        }
        setWatches(prev => [data, ...prev]);
        setCourse('');
        setSection('');
        setShowSuggestions(false);
    };

    const remove = async (id) => {
        await supabase.from('section_watches').delete().eq('id', id);
        setWatches(prev => prev.filter(w => w.id !== id));
    };

    if (!term) return null;

    return (
        <div className={styles.card}>
            <p className={styles.title}>Section alerts</p>
            <p className={styles.hint}>Get notified when a swap or giveaway opens up for a section you want — for courses in your major.</p>

            <form onSubmit={add} className={styles.form}>
                <div className={styles.searchWrapper} ref={wrapperRef}>
                    <input
                        className={styles.input}
                        placeholder="Course ID"
                        value={course}
                        autoComplete="off"
                        onChange={(e) => { setCourse(e.target.value); setSection(''); setShowSuggestions(true); }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => { blurTimer.current = setTimeout(() => setShowSuggestions(false), 120); }}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                        <div
                            className={styles.dropdown}
                            style={dropStyle ? { top: dropStyle.top, bottom: dropStyle.bottom, maxHeight: dropStyle.maxHeight } : undefined}
                            onMouseDown={() => clearTimeout(blurTimer.current)}
                        >
                            {suggestions.map(([code, name]) => (
                                <button
                                    type="button"
                                    key={code}
                                    className={styles.dropdownItem}
                                    onClick={() => selectCourse(code)}
                                >
                                    <span className={styles.dropdownCode}>{code}</span>
                                    <span className={styles.dropdownName}>{name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {courseValid && (
                    <select
                        className={styles.select}
                        value={section}
                        onChange={(e) => setSection(e.target.value)}
                    >
                        <option value="">Any section</option>
                        {courseSections.map(s => (
                            <option key={s} value={s}>{`Section ${s}`}</option>
                        ))}
                    </select>
                )}
                <button type="submit" className={styles.addBtn}>Add alert</button>
            </form>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.list}>
                {loading ? (
                    <div className={styles.muted}>Loading…</div>
                ) : watches.length === 0 ? (
                    <div className={styles.muted}>No alerts yet.</div>
                ) : (
                    watches.map(w => (
                        <div key={w.id} className={styles.watch}>
                            <span className={styles.watchText}>
                                {w.course_code}{w.want_section ? ` · ${w.want_section}` : ' · any section'}
                            </span>
                            <button className={styles.removeBtn} onClick={() => remove(w.id)} title="Remove alert">×</button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
