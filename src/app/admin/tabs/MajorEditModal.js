'use client';

import { useEffect, useState } from 'react';
import { Dialog, useToast } from '@/components/ui';
import styles from '../admin.module.css';
import CoursePicker from './CoursePicker';

const NEW_COURSE_CATEGORIES = ['Core', 'Major Elective', 'Support Elective', 'Basket 1', 'Basket 2'];

export default function MajorEditModal({ code, onClose, onSaved }) {
    const [major, setMajor] = useState(null);
    const [courses, setCourses] = useState([]); // currently attached
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const toast = useToast();

    const [deptCount, setDeptCount] = useState(0);
    const [supportCount, setSupportCount] = useState(0);
    const [name, setName] = useState('');
    const [toAttach, setToAttach] = useState([]); // [{course_id, course_name, credit_hours}]
    const [toDetach, setToDetach] = useState(new Set()); // course_ids
    const [newCourses, setNewCourses] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/admin/majors/${encodeURIComponent(code)}`);
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                setMajor(data.major);
                setCourses(data.courses || []);
                setName(data.major?.name || '');
                setDeptCount(data.major?.dept_electives_count || 0);
                setSupportCount(data.major?.support_electives_count || 0);
            } catch (e) {
                setErr(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [code]);

    const toggleDetach = (id) => setToDetach(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const addAttach = (c) => setToAttach(prev => [...prev, c]);
    const removeAttach = (id) => setToAttach(prev => prev.filter(c => c.course_id !== id));

    const addNewRow = () => setNewCourses(prev => [...prev, { course_id: '', course_name: '', credit_hours: '', category: 'Core' }]);
    const updateNewRow = (i, field, value) => setNewCourses(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
    const removeNewRow = (i) => setNewCourses(prev => prev.filter((_, idx) => idx !== i));

    const handleSave = async () => {
        // New course IDs must be exactly 7 digits (CCCC + NNN).
        const filledNew = newCourses.filter(c => (c.course_id || '').trim() || (c.course_name || '').trim());
        const invalid = filledNew.find(c => !/^\d{7}$/.test((c.course_id || '').trim()));
        if (invalid) {
            setErr(`“${(invalid.course_id || '').trim() || 'an empty ID'}” isn’t a course ID: they’re exactly 7 digits.`);
            return;
        }
        setSaving(true);
        setErr('');
        try {
            const res = await fetch(`/api/admin/majors/${encodeURIComponent(code)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    dept_electives_count: deptCount,
                    support_electives_count: supportCount,
                    attach_course_ids: toAttach.map(c => c.course_id),
                    detach_course_ids: Array.from(toDetach),
                    new_courses: newCourses,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Couldn’t save the major.');
            }
            toast.success(`${name || code} saved`);
            onSaved?.();
            onClose();
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    const excludeIds = [...courses.map(c => c.course_id), ...toAttach.map(c => c.course_id)];

    return (
        <Dialog
            open
            onClose={onClose}
            dismissible={!saving}
            size="lg"
            title={major?.name || 'Edit major'}
            description={<span className={styles.mono}>{code}</span>}
            footer={!loading && major && (
                <>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : 'Save changes'}
                    </button>
                </>
            )}
        >
            {loading && <div className={styles.loading}><div className={styles.spinner} />Reading the major…</div>}
            {err && <div className={styles.error}>{err}</div>}

            {!loading && major && (
                <div className={styles.formStack}>
                    <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Name</span>
                        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
                    </label>

                    <div className={styles.formGrid}>
                        <label className={styles.numField}>
                            <span className={styles.numFieldLabel}>Department electives</span>
                            <input className={styles.input} type="number" min="0" value={deptCount} onChange={(e) => setDeptCount(+e.target.value || 0)} />
                        </label>
                        <label className={styles.numField}>
                            <span className={styles.numFieldLabel}>Support electives</span>
                            <input className={styles.input} type="number" min="0" value={supportCount} onChange={(e) => setSupportCount(+e.target.value || 0)} />
                        </label>
                    </div>

                    <section className={styles.card}>
                        <p className={styles.sectionTitle}>In this major <span className={styles.navCount}>{courses.length}</span></p>
                        <div className={styles.attachedList}>
                            {courses.length === 0 && <p className={styles.previewMuted}>No courses yet.</p>}
                            {courses.map(c => {
                                const marked = toDetach.has(c.course_id);
                                return (
                                    <div key={c.course_id} className={`${styles.row} ${marked ? styles.rowMarked : ''}`}>
                                        <div className={styles.rowMain}>
                                            <div className={styles.rowTitle}><span className={styles.mono}>{c.course_id}</span> {c.course_name}</div>
                                            {c.credit_hours != null && <div className={styles.rowMeta}>{c.credit_hours} credits</div>}
                                        </div>
                                        <div className={styles.rowActions}>
                                            <button type="button" className={`${styles.btn} ${marked ? styles.btnGhost : styles.btnDanger}`} onClick={() => toggleDetach(c.course_id)}>
                                                {marked ? 'Keep' : 'Remove'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className={styles.card}>
                        <p className={styles.sectionTitle}>Add courses from the catalogue</p>
                        <CoursePicker selected={toAttach} onAdd={addAttach} excludeIds={excludeIds} />
                        {toAttach.length > 0 && (
                            <div className={styles.chips}>
                                {toAttach.map(c => (
                                    <span key={c.course_id} className={styles.chip}>
                                        {c.course_id}
                                        <button type="button" className={styles.chipRemove} onClick={() => removeAttach(c.course_id)} aria-label={`Remove ${c.course_id}`}>×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className={styles.card}>
                        <div className={styles.labelRow}>
                            <p className={styles.sectionTitle}>Create new courses for it</p>
                            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={addNewRow}>Add a row</button>
                        </div>
                        {newCourses.map((c, i) => (
                            <div key={i} className={`${styles.newRow} ${styles.newRowWide}`}>
                                <input
                                    className={`${styles.input} ${styles.mono} ${c.course_id && !/^\d{7}$/.test(c.course_id) ? styles.inputInvalid : ''}`}
                                    placeholder="7-digit ID"
                                    inputMode="numeric"
                                    maxLength={7}
                                    value={c.course_id}
                                    onChange={(e) => updateNewRow(i, 'course_id', e.target.value.replace(/\D/g, '').slice(0, 7))}
                                />
                                <input className={styles.input} placeholder="Course name" value={c.course_name} onChange={(e) => updateNewRow(i, 'course_name', e.target.value)} />
                                <input className={styles.input} type="number" min="0" placeholder="Credits" value={c.credit_hours} onChange={(e) => updateNewRow(i, 'credit_hours', e.target.value)} />
                                <select className={styles.input} value={c.category || 'Core'} onChange={(e) => updateNewRow(i, 'category', e.target.value)} title="Core, Major and Support apply to this major; Basket 1 and 2 make it a university elective for every major.">
                                    {NEW_COURSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                                <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => removeNewRow(i)} aria-label="Remove this row">×</button>
                            </div>
                        ))}
                    </section>
                </div>
            )}
        </Dialog>
    );
}
