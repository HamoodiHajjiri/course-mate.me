'use client';

import { useEffect, useState } from 'react';
import styles from '../admin.module.css';

/** Search the catalogue and add courses one at a time, as rows of code and name. */
export default function CoursePicker({ selected, onAdd, excludeIds = [] }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const handle = setTimeout(async () => {
            if (query.trim().length < 2) {
                setResults([]);
                return;
            }
            setLoading(true);
            try {
                const res = await fetch(`/api/admin/courses?q=${encodeURIComponent(query.trim())}`);
                const data = await res.json();
                setResults(data.courses || []);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 200);
        return () => clearTimeout(handle);
    }, [query]);

    const exclude = new Set([...excludeIds, ...selected.map(c => c.course_id)]);
    const visible = results.filter(c => !exclude.has(c.course_id));

    return (
        <div className={styles.picker}>
            <input
                type="search"
                className={styles.input}
                placeholder="Course code or name"
                aria-label="Find a course to add"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim().length >= 2 && (
                <div className={styles.pickerList}>
                    {loading && <div className={styles.previewMuted}>Searching…</div>}
                    {!loading && visible.length === 0 && <div className={styles.previewMuted}>No course matches.</div>}
                    {visible.map(c => (
                        <button
                            type="button"
                            key={c.course_id}
                            className={styles.pickerItem}
                            onClick={() => { onAdd(c); setQuery(''); setResults([]); }}
                        >
                            <span className={styles.mono}>{c.course_id}</span>
                            <span className={styles.pickerName}>{c.course_name}</span>
                            {c.credit_hours != null && <span className={styles.pickerCr}>{c.credit_hours} cr</span>}
                            <span className={styles.pickerAdd} aria-hidden="true">add</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
