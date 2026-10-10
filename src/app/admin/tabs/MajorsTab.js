'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useConfirm, useToast } from '@/components/ui';
import styles from '../admin.module.css';
import CoursePicker from './CoursePicker';
import MajorEditModal from './MajorEditModal';

const Ctx = createContext(null);

function MajorsProvider({ children }) {
    const [majors, setMajors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingCode, setEditingCode] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const confirm = useConfirm();
    const toast = useToast();

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/majors');
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setMajors(data.majors || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (code, name) => {
        const ok = await confirm({
            title: `Delete ${name}?`,
            body: `The major ${code} and its course list are removed. Students who chose it keep it on their profile, but it no longer exists.`,
            confirmLabel: 'Delete major',
            tone: 'danger',
        });
        if (!ok) return;
        const res = await fetch('/api/admin/majors', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        if (res.ok) {
            setMajors(prev => prev.filter(m => m.code !== code));
            toast.success(`${name} deleted`);
        } else {
            const body = await res.json().catch(() => ({}));
            toast.error(body.error || 'Couldn’t delete that major.');
        }
    };

    return (
        <Ctx.Provider value={{
            majors, loading, error, editingCode, setEditingCode,
            showCreate, setShowCreate, load, handleDelete,
        }}>
            {children}
        </Ctx.Provider>
    );
}

function MajorsSidebar() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { majors, showCreate, setShowCreate } = ctx;

    return (
        <div className={styles.sidebarCard}>
            <p className={styles.sectionTitle}>Majors</p>
            <p className={styles.previewMuted}>{majors.length} set up. Each has its own list of courses and elective counts.</p>
            <button
                type="button"
                className={`${styles.btn} ${showCreate ? '' : styles.btnPrimary} ${styles.btnFull}`}
                onClick={() => setShowCreate(v => !v)}
            >
                {showCreate ? 'Close the new major' : 'New major'}
            </button>
        </div>
    );
}

function MajorsMain() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { majors, loading, error, editingCode, setEditingCode, showCreate, setShowCreate, load, handleDelete } = ctx;

    return (
        <>
            {showCreate && (
                <CreateMajorForm
                    onCancel={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); load(); }}
                />
            )}

            {error && <div className={styles.error}>{error}</div>}
            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} />Reading majors…</div>
            ) : majors.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>No majors yet.</div>
                    <span>Start one with New major.</span>
                </div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Major</th>
                                <th>Code</th>
                                <th className={styles.num}>Department electives</th>
                                <th className={styles.num}>Support electives</th>
                                <th className={styles.cellActions}><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {majors.map(m => (
                                <tr key={m.code}>
                                    <td className={styles.cellStrong}>{m.name}</td>
                                    <td className={styles.mono}>{m.code}</td>
                                    <td className={`${styles.num} ${styles.mono}`}>{m.dept_electives_count || 0}</td>
                                    <td className={`${styles.num} ${styles.mono}`}>{m.support_electives_count || 0}</td>
                                    <td className={styles.cellActions}>
                                        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditingCode(m.code)}>Edit</button>
                                        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => handleDelete(m.code, m.name)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editingCode && (
                <MajorEditModal code={editingCode} onClose={() => setEditingCode(null)} onSaved={() => { load(); }} />
            )}
        </>
    );
}

function CreateMajorForm({ onCancel, onCreated }) {
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [deptCount, setDeptCount] = useState(0);
    const [supportCount, setSupportCount] = useState(0);
    const [existing, setExisting] = useState([]);
    const [newCourses, setNewCourses] = useState([]);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const toast = useToast();

    const addExisting = (c) => setExisting(prev => [...prev, c]);
    const removeExisting = (id) => setExisting(prev => prev.filter(c => c.course_id !== id));
    const addNewRow = () => setNewCourses(prev => [...prev, { course_id: '', course_name: '', credit_hours: '' }]);
    const updateNewRow = (i, field, value) => setNewCourses(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
    const removeNewRow = (i) => setNewCourses(prev => prev.filter((_, idx) => idx !== i));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr('');
        if (!code.trim() || !name.trim()) {
            setErr('A major needs a code and a name.');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/admin/majors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code.trim(),
                    name: name.trim(),
                    dept_electives_count: deptCount,
                    support_electives_count: supportCount,
                    existing_course_ids: existing.map(c => c.course_id),
                    new_courses: newCourses,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Couldn’t create the major.');
            }
            toast.success(`${name.trim()} created`);
            onCreated();
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className={styles.formCard}>
            <p className={styles.sectionTitle}>New major</p>
            <div className={styles.formSplit}>
                <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Code</span>
                    <input className={`${styles.input} ${styles.mono}`} placeholder="CS" value={code} onChange={(e) => setCode(e.target.value)} />
                </label>
                <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Name</span>
                    <input className={styles.input} placeholder="Computer Science" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
            </div>

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

            <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Courses already in the catalogue</span>
                <CoursePicker selected={existing} onAdd={addExisting} />
                {existing.length > 0 && (
                    <div className={styles.chips}>
                        {existing.map(c => (
                            <span key={c.course_id} className={styles.chip}>
                                {c.course_id}
                                <button type="button" className={styles.chipRemove} onClick={() => removeExisting(c.course_id)} aria-label={`Remove ${c.course_id}`}>×</button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className={styles.fieldGroup}>
                <div className={styles.labelRow}>
                    <span className={styles.fieldLabel}>New courses to create</span>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={addNewRow}>Add a row</button>
                </div>
                {newCourses.map((c, i) => (
                    <div key={i} className={styles.newRow}>
                        <input className={`${styles.input} ${styles.mono}`} placeholder="Course ID" value={c.course_id} onChange={(e) => updateNewRow(i, 'course_id', e.target.value)} />
                        <input className={styles.input} placeholder="Course name" value={c.course_name} onChange={(e) => updateNewRow(i, 'course_name', e.target.value)} />
                        <input className={styles.input} type="number" min="0" placeholder="Credits" value={c.credit_hours} onChange={(e) => updateNewRow(i, 'credit_hours', e.target.value)} />
                        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => removeNewRow(i)} aria-label="Remove this row">×</button>
                    </div>
                ))}
            </div>

            {err && <div className={styles.error}>{err}</div>}

            <div className={styles.formRow}>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
                    {saving ? 'Creating…' : 'Create the major'}
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}

const majorsTab = { Provider: MajorsProvider, Sidebar: MajorsSidebar, Main: MajorsMain };
export default majorsTab;
