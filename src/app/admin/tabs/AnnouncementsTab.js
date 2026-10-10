'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import RichTextEditor from '@/components/RichTextEditor';
import { useConfirm, useToast } from '@/components/ui';
import styles from '../admin.module.css';

const Ctx = createContext(null);

const GENDERS = [
    { value: 'male', label: "Men's campus" },
    { value: 'female', label: "Women's campus" },
];

const EMPTY_FORM = {
    id: null,
    title: '',
    body_html: '',
    active: true,
    expires_at: '',
    target_majors: [],
    target_genders: [],
    target_user_ids: [],
};

function toDatetimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value) {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
}

function AnnouncementsProvider({ children }) {
    const [announcements, setAnnouncements] = useState([]);
    const [majors, setMajors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [pickedUsers, setPickedUsers] = useState([]);
    const [formError, setFormError] = useState('');
    const confirm = useConfirm();
    const toast = useToast();

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [aRes, mRes] = await Promise.all([
                fetch('/api/admin/announcements'),
                fetch('/api/admin/majors'),
            ]);
            if (!aRes.ok) throw new Error(await aRes.text());
            const aData = await aRes.json();
            setAnnouncements(aData.announcements || []);
            if (mRes.ok) {
                const mData = await mRes.json();
                setMajors(mData.majors || []);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const startNew = () => { setForm(EMPTY_FORM); setPickedUsers([]); setFormError(''); };

    const startEdit = async (a) => {
        const next = {
            id: a.id,
            title: a.title || '',
            body_html: a.body_html || '',
            active: !!a.active,
            expires_at: toDatetimeLocal(a.expires_at),
            target_majors: a.target_majors || [],
            target_genders: a.target_genders || [],
            target_user_ids: a.target_user_ids || [],
        };
        setForm(next);
        setFormError('');

        if (next.target_user_ids.length > 0) {
            try {
                const res = await fetch('/api/admin/users');
                if (res.ok) {
                    const { users } = await res.json();
                    setPickedUsers(users.filter(u => next.target_user_ids.includes(u.id)));
                }
            } catch { /* non-fatal */ }
        } else {
            setPickedUsers([]);
        }
    };

    const save = async () => {
        if (!form.title.trim()) { setFormError('Give the notice a title.'); return; }
        setFormError('');
        setSaving(true);
        try {
            const payload = {
                title: form.title,
                body_html: form.body_html,
                active: form.active,
                expires_at: fromDatetimeLocal(form.expires_at),
                target_majors: form.target_majors,
                target_genders: form.target_genders,
                target_user_ids: form.target_user_ids,
            };
            const method = form.id ? 'PATCH' : 'POST';
            const body = form.id ? { id: form.id, ...payload } : payload;
            const res = await fetch('/api/admin/announcements', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await res.text());
            toast.success(form.id ? 'Notice saved' : 'Notice published');
            await load();
            startNew();
        } catch (e) {
            toast.error(`Couldn’t save: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (a) => {
        const res = await fetch('/api/admin/announcements', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: a.id, active: !a.active }),
        });
        if (res.ok) {
            setAnnouncements(prev => prev.map(x => x.id === a.id ? { ...x, active: !x.active } : x));
            toast.success(a.active ? 'Hidden from students' : 'Showing to students');
        } else {
            toast.error('Couldn’t change that notice.');
        }
    };

    const remove = async (a) => {
        const ok = await confirm({
            title: `Delete “${a.title}”?`,
            body: 'Students who haven’t seen it won’t, and the record of who dismissed it goes too.',
            confirmLabel: 'Delete notice',
            tone: 'danger',
        });
        if (!ok) return;
        const res = await fetch('/api/admin/announcements', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: a.id }),
        });
        if (res.ok) {
            setAnnouncements(prev => prev.filter(x => x.id !== a.id));
            if (form.id === a.id) startNew();
            toast.success('Notice deleted');
        } else {
            toast.error('Couldn’t delete that notice.');
        }
    };

    return (
        <Ctx.Provider value={{
            announcements, majors, loading, error,
            form, setForm, saving, save, startNew, startEdit,
            toggleActive, remove, formError,
            pickedUsers, setPickedUsers,
        }}>
            {children}
        </Ctx.Provider>
    );
}

function DismissedList({ announcementId, count }) {
    const [open, setOpen] = useState(false);
    const [users, setUsers] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next && users === null && count > 0) {
            setLoading(true);
            setError('');
            try {
                const res = await fetch(`/api/admin/announcements/dismissals?id=${encodeURIComponent(announcementId)}`);
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                setUsers(data.users || []);
            } catch (e) {
                setError(e.message || 'Couldn’t load them.');
            } finally {
                setLoading(false);
            }
        }
    };

    if (count === 0) return <span className={styles.rowMeta}>Nobody has dismissed it yet.</span>;

    return (
        <div>
            <button type="button" className={styles.textToggle} onClick={toggle} aria-expanded={open}>
                {count} {count === 1 ? 'student' : 'students'} dismissed it {open ? '−' : '+'}
            </button>
            {open && (
                <ul className={styles.plainList}>
                    {loading && <li className={styles.previewMuted}>Reading…</li>}
                    {error && <li className={styles.error}>{error}</li>}
                    {users && users.map(u => (
                        <li key={u.id} className={styles.rowMeta}>
                            <strong className={styles.cellStrong}>{u.name || 'no name'}</strong> · <span className={styles.mono}>{u.student_id || 'no ID'}</span> · {u.email || 'no email'}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function AnnouncementsSidebar() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { announcements, loading, form, startNew, startEdit, toggleActive, remove } = ctx;

    return (
        <>
            <div className={styles.sidebarCard}>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`} onClick={startNew}>
                    New notice
                </button>
            </div>

            <div className={styles.sidebarCard}>
                <p className={styles.sectionTitle}>Every notice <span className={styles.navCount}>{announcements.length}</span></p>
                {loading ? (
                    <div className={styles.loading}><div className={styles.spinner} /></div>
                ) : announcements.length === 0 ? (
                    <p className={styles.previewMuted}>None yet.</p>
                ) : (
                    <div className={styles.noticeList}>
                        {announcements.map(a => {
                            const expired = a.expires_at && new Date(a.expires_at) < new Date();
                            const isSelected = form.id === a.id;
                            return (
                                <div key={a.id} className={`${styles.notice} ${isSelected ? styles.noticeOn : ''}`}>
                                    <div className={styles.noticeHead}>
                                        <span className={styles.noticeTitle}>{a.title}</span>
                                        <span className={`${styles.badge} ${a.active && !expired ? styles.badgeActive : styles.badgeExpired}`}>
                                            {expired ? 'expired' : a.active ? 'showing' : 'hidden'}
                                        </span>
                                    </div>
                                    <DismissedList announcementId={a.id} count={a.dismissed_count ?? 0} />
                                    <div className={styles.rowActions}>
                                        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => startEdit(a)} disabled={isSelected}>
                                            {isSelected ? 'Editing' : 'Edit'}
                                        </button>
                                        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => toggleActive(a)}>
                                            {a.active ? 'Hide' : 'Show'}
                                        </button>
                                        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => remove(a)}>Delete</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}

function MajorMultiSelect({ majors, value, onChange }) {
    const toggle = (code) => {
        if (value.includes(code)) onChange(value.filter(v => v !== code));
        else onChange([...value, code]);
    };
    return (
        <div className={styles.chips}>
            {majors.length === 0 && <p className={styles.previewMuted}>No majors loaded.</p>}
            {majors.map(m => (
                <button
                    type="button"
                    key={m.code}
                    onClick={() => toggle(m.code)}
                    className={`${styles.toggleChip} ${value.includes(m.code) ? styles.toggleChipOn : ''}`}
                    aria-pressed={value.includes(m.code)}
                    title={m.name}
                >
                    {m.code}
                </button>
            ))}
        </div>
    );
}

function UserPicker({ value, onChange, picked, setPicked }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const tRef = useRef();

    useEffect(() => {
        clearTimeout(tRef.current);
        if (!query.trim()) { setResults([]); return; }
        tRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query.trim())}`);
                if (res.ok) {
                    const { users } = await res.json();
                    setResults(users || []);
                }
            } finally {
                setSearching(false);
            }
        }, 250);
        return () => clearTimeout(tRef.current);
    }, [query]);

    const add = (u) => {
        if (value.includes(u.id)) return;
        onChange([...value, u.id]);
        setPicked([...picked.filter(p => p.id !== u.id), u]);
        setQuery('');
        setResults([]);
    };

    const removeId = (id) => {
        onChange(value.filter(v => v !== id));
        setPicked(picked.filter(p => p.id !== id));
    };

    return (
        <div className={styles.picker}>
            <input
                type="search"
                placeholder="Name, email or university ID"
                aria-label="Find a student"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={styles.input}
            />
            {searching && <p className={styles.previewMuted}>Searching…</p>}
            {results.length > 0 && (
                <div className={styles.pickerList}>
                    {results.map(u => (
                        <button
                            key={u.id}
                            type="button"
                            className={styles.pickerItem}
                            onClick={() => add(u)}
                            disabled={value.includes(u.id)}
                        >
                            <span className={styles.mono}>{u.student_id || '—'}</span>
                            <span className={styles.pickerName}>{u.name || 'no name'}</span>
                            <span className={styles.pickerCr}>{u.email || ''}</span>
                            <span className={styles.pickerAdd} aria-hidden="true">{value.includes(u.id) ? 'added' : 'add'}</span>
                        </button>
                    ))}
                </div>
            )}
            {picked.length > 0 && (
                <div className={styles.chips}>
                    {picked.map(u => (
                        <span key={u.id} className={styles.chip}>
                            {u.name || u.student_id || u.id.slice(0, 8)}
                            <button type="button" className={styles.chipRemove} onClick={() => removeId(u.id)} aria-label={`Remove ${u.name || 'this student'}`}>×</button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

function AnnouncementsMain() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { error, majors, form, setForm, saving, save, startNew, pickedUsers, setPickedUsers, formError } = ctx;

    const update = (patch) => setForm(prev => ({ ...prev, ...patch }));

    // Who will see it, said in words: within a group any match counts, and
    // the groups all have to match.
    const audience = useMemo(() => {
        const parts = [];
        if (form.target_majors.length) parts.push(`${form.target_majors.join(', ')} ${form.target_majors.length === 1 ? 'students' : 'students'}`);
        if (form.target_genders.length === 1) parts.push(`on the ${form.target_genders[0] === 'male' ? 'men’s' : 'women’s'} campus`);
        if (form.target_user_ids.length) parts.push(`${form.target_user_ids.length} named ${form.target_user_ids.length === 1 ? 'student' : 'students'}`);
        return parts.length ? `Shown to ${parts.join(', and only ')}.` : 'Shown to every student.';
    }, [form]);

    return (
        <>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.formCard}>
                <div className={styles.labelRow}>
                    <p className={styles.sectionTitle}>{form.id ? 'Editing a notice' : 'A new notice'}</p>
                    <span className={styles.audience}>{audience}</span>
                </div>

                <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Title</span>
                    <input
                        type="text"
                        className={`${styles.input} ${formError ? styles.inputInvalid : ''}`}
                        value={form.title}
                        onChange={(e) => update({ title: e.target.value })}
                        placeholder="Add/drop closes on Thursday"
                    />
                    {formError && <span className={styles.fieldError}>{formError}</span>}
                </label>

                <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Text</span>
                    <RichTextEditor
                        value={form.body_html}
                        onChange={(html) => update({ body_html: html })}
                        placeholder="What students need to know. Links, lists and images work."
                    />
                </div>

                <div className={styles.formGrid}>
                    <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Stop showing it on <span className={styles.cellMuted}>optional</span></span>
                        <input
                            type="datetime-local"
                            className={styles.input}
                            value={form.expires_at}
                            onChange={(e) => update({ expires_at: e.target.value })}
                        />
                    </label>
                    <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Showing</span>
                        <label className={styles.checkRow}>
                            <input type="checkbox" checked={form.active} onChange={() => update({ active: !form.active })} />
                            {form.active ? 'Students can see it' : 'Hidden for now'}
                        </label>
                    </div>
                </div>

                <section className={styles.card}>
                    <p className={styles.sectionTitle}>Who sees it</p>
                    <p className={styles.previewMuted}>Leave a group empty to skip it. Inside a group any match counts; across groups, all of them must.</p>

                    <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Majors</span>
                        <MajorMultiSelect majors={majors} value={form.target_majors} onChange={(v) => update({ target_majors: v })} />
                    </div>

                    <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Campus</span>
                        <div className={styles.chips}>
                            {GENDERS.map(g => {
                                const on = form.target_genders.includes(g.value);
                                return (
                                    <button
                                        type="button"
                                        key={g.value}
                                        aria-pressed={on}
                                        onClick={() => update({ target_genders: on ? form.target_genders.filter(x => x !== g.value) : [...form.target_genders, g.value] })}
                                        className={`${styles.toggleChip} ${on ? styles.toggleChipOn : ''}`}
                                    >
                                        {g.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Named students</span>
                        <UserPicker
                            value={form.target_user_ids}
                            onChange={(v) => update({ target_user_ids: v })}
                            picked={pickedUsers}
                            setPicked={setPickedUsers}
                        />
                    </div>
                </section>

                <div className={styles.formRow}>
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : form.id ? 'Save changes' : 'Publish the notice'}
                    </button>
                    {form.id && (
                        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={startNew} disabled={saving}>
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}

const announcementsTab = {
    Provider: AnnouncementsProvider,
    Sidebar: AnnouncementsSidebar,
    Main: AnnouncementsMain,
};
export default announcementsTab;
