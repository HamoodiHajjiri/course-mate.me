'use client';

import { useMemo, useState } from 'react';
import { Dialog, useToast } from '@/components/ui';
import styles from '../admin.module.css';

const CATEGORIES = ['Core', 'Major Elective', 'Support Elective'];
const BASKETS = ['Basket 1', 'Basket 2'];

export default function CourseEditModal({ course, majors, onClose, onSaved }) {
    const isCreate = !course;
    const [courseId, setCourseId] = useState('');
    const [name, setName] = useState(course?.course_name || '');
    const [credits, setCredits] = useState(course?.credit_hours ?? 0);
    const [basket, setBasket] = useState(course?.university_elective_basket || '');
    const [restricted, setRestricted] = useState(course?.restricted_majors || []);
    // memberships: [{ code, name, category }] — hand-edited categories only.
    // "University Elective" rows are derived from the basket flag, so they're managed
    // by the basket + restrict controls below, not listed here.
    const [memberships, setMemberships] = useState(
        (course?.majors || [])
            .filter(m => m.category !== 'University Elective')
            .map(m => ({ code: m.code, name: m.name, category: m.category || 'Core' }))
    );
    const [addCode, setAddCode] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const toast = useToast();

    const usedCodes = useMemo(() => new Set(memberships.map(m => m.code)), [memberships]);
    const available = (majors || []).filter(m => !usedCodes.has(m.code));

    const addMajor = (code) => {
        const targetCode = code ?? addCode;
        if (!targetCode) return;
        const m = (majors || []).find(x => x.code === targetCode);
        if (!m) return;
        setMemberships(prev => [...prev, { code: m.code, name: m.name, category: 'Core' }]);
        setAddCode('');
    };

    const addAllMajors = () => {
        setMemberships(prev => [
            ...prev,
            ...available.map(m => ({ code: m.code, name: m.name, category: 'Core' })),
        ]);
    };

    const setCategory = (code, category) =>
        setMemberships(prev => prev.map(m => (m.code === code ? { ...m, category } : m)));

    const removeMajor = (code) =>
        setMemberships(prev => prev.filter(m => m.code !== code));

    const toggleRestricted = (code) =>
        setRestricted(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]));

    const handleSave = async () => {
        if (!name.trim()) { setErr('A course needs a name.'); return; }
        if (isCreate && !/^\d{7}$/.test(courseId.trim())) {
            setErr('A course ID is exactly 7 digits.');
            return;
        }
        setSaving(true);
        setErr('');
        try {
            const url = isCreate ? '/api/admin/courses' : `/api/admin/courses/${encodeURIComponent(course.course_id)}`;
            const payload = {
                course_name: name,
                credit_hours: credits,
                university_elective_basket: basket,
                // Restriction only applies to basket courses; clear it otherwise.
                restricted_majors: basket ? restricted : [],
                majors: memberships.map(m => ({ major_code: m.code, category: m.category })),
            };
            if (isCreate) payload.course_id = courseId.trim();
            const res = await fetch(url, {
                method: isCreate ? 'POST' : 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Couldn’t save the course.');
            }
            toast.success(isCreate ? `${courseId.trim()} created` : `${course.course_id} saved`);
            onSaved?.();
            onClose();
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open
            onClose={onClose}
            dismissible={!saving}
            size="md"
            title={isCreate ? 'New course' : (course.course_name || 'Edit course')}
            description={!isCreate ? <><span className={styles.mono}>{course.course_id}</span>{course.college_name ? ` · ${course.college_name}` : ''}</> : 'It appears in the catalogue straight away.'}
            footer={(
                <>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : isCreate ? 'Create course' : 'Save changes'}
                    </button>
                </>
            )}
        >
            <div className={styles.formStack}>
                {err && <div className={styles.error}>{err}</div>}

                {isCreate && (
                    <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Course ID · 7 digits</span>
                        <input
                            className={`${styles.input} ${styles.mono} ${courseId && !/^\d{7}$/.test(courseId) ? styles.inputInvalid : ''}`}
                            placeholder="1501101"
                            inputMode="numeric"
                            maxLength={7}
                            value={courseId}
                            onChange={(e) => setCourseId(e.target.value.replace(/\D/g, '').slice(0, 7))}
                        />
                    </label>
                )}
                <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Name</span>
                    <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Course name" />
                </label>

                <div className={styles.formSplit}>
                    <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Credit hours</span>
                        <input className={styles.input} type="number" min="0" value={credits} onChange={(e) => setCredits(+e.target.value || 0)} />
                    </label>
                    <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>University elective basket</span>
                        <select className={styles.input} value={basket} onChange={(e) => setBasket(e.target.value)}>
                            <option value="">None</option>
                            {[...new Set([...BASKETS, ...(basket ? [basket] : [])])].map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                        <span className={styles.previewMuted}>
                            {basket ? 'Shared with every major unless you restrict it below.' : 'Not a university elective.'}
                        </span>
                    </label>
                </div>

                {basket && (
                    <section className={styles.card}>
                        <p className={styles.sectionTitle}>
                            Only for these majors <span className={styles.navCount}>{restricted.length === 0 ? 'every major' : restricted.length}</span>
                        </p>
                        <div className={styles.chips}>
                            {(majors || []).map(m => (
                                <button
                                    type="button"
                                    key={m.code}
                                    onClick={() => toggleRestricted(m.code)}
                                    className={`${styles.toggleChip} ${restricted.includes(m.code) ? styles.toggleChipOn : ''}`}
                                    aria-pressed={restricted.includes(m.code)}
                                    title={m.name}
                                >
                                    {m.code}
                                </button>
                            ))}
                        </div>
                        <span className={styles.previewMuted}>Pick none to share it with every major.</span>
                    </section>
                )}

                <section className={styles.card}>
                    <p className={styles.sectionTitle}>Majors and role <span className={styles.navCount}>{memberships.length}</span></p>
                    {basket && (
                        <span className={styles.previewMuted}>
                            Being a university elective is set by the basket above. Add majors here only where it’s core, a major elective or a support elective.
                        </span>
                    )}
                    {memberships.length === 0 && <p className={styles.previewMuted}>In no major’s plan.</p>}
                    {memberships.map(m => (
                        <div key={m.code} className={styles.memberRow}>
                            <div className={styles.rowMain}>
                                <span className={styles.rowTitle}>{m.name}</span>
                                <span className={`${styles.rowMeta} ${styles.mono}`}>{m.code}</span>
                            </div>
                            <select className={styles.input} value={m.category} onChange={(e) => setCategory(m.code, e.target.value)} aria-label={`Role in ${m.name}`}>
                                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                            <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => removeMajor(m.code)}>Remove</button>
                        </div>
                    ))}

                    <div className={styles.memberAdd}>
                        {/* Picking a major adds it straight away, with no separate
                            Add to forget: that used to let a save go through with
                            nothing attached. */}
                        <select className={styles.input} value={addCode} onChange={(e) => addMajor(e.target.value)} aria-label="Add a major">
                            <option value="">Add a major…</option>
                            {available.map(m => <option key={m.code} value={m.code}>{m.name} ({m.code})</option>)}
                        </select>
                        <button type="button" className={styles.btn} onClick={addAllMajors} disabled={available.length === 0}>Add every major</button>
                    </div>
                </section>
            </div>
        </Dialog>
    );
}
