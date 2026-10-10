'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SearchIcon } from '@/components/Icons';
import { useConfirm, useToast } from '@/components/ui';
import styles from '../admin.module.css';
import UserSchedulesModal from './UserSchedulesModal';

const Ctx = createContext(null);

function UsersProvider({ children }) {
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState('');
    const [major, setMajor] = useState('');
    const [gender, setGender] = useState('');
    const [majors, setMajors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [viewingUser, setViewingUser] = useState(null);
    const supabase = createClient();
    const confirm = useConfirm();
    const toast = useToast();

    const load = useCallback(async (overrides = {}) => {
        const q = overrides.search !== undefined ? overrides.search : search;
        const m = overrides.major !== undefined ? overrides.major : major;
        const g = overrides.gender !== undefined ? overrides.gender : gender;
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (m) params.set('major', m);
            if (g) params.set('gender', g);
            const res = await fetch(`/api/admin/users?${params}`);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setUsers(data.users || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [search, major, gender]);

    useEffect(() => {
        (async () => {
            const { data } = await supabase.from('majors').select('code, name').order('name');
            setMajors(data || []);
        })();
        load({ search: '', major: '', gender: '' });
        // eslint-disable-next-line
    }, []);

    const setMajorAndLoad = (v) => { setMajor(v); load({ major: v }); };
    const setGenderAndLoad = (v) => { setGender(v); load({ gender: v }); };
    const submitSearch = (e) => { e?.preventDefault(); load({ search }); };
    const reset = () => { setSearch(''); setMajor(''); setGender(''); load({ search: '', major: '', gender: '' }); };

    const handleDelete = async (id, name) => {
        const ok = await confirm({
            title: `Delete ${name || 'this user'}?`,
            body: 'Their account is removed, and with it their profile, posts and matches. This can’t be undone.',
            confirmLabel: 'Delete user',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Delete failed');
            }
            setUsers(prev => prev.filter(u => u.id !== id));
            toast.success(`${name || 'User'} deleted`);
        } catch (e) {
            toast.error(e.message);
        }
    };

    return (
        <Ctx.Provider value={{
            users, search, setSearch, major, gender, majors, loading, error,
            viewingUser, setViewingUser,
            setMajorAndLoad, setGenderAndLoad, submitSearch, reset, handleDelete,
        }}>
            {children}
        </Ctx.Provider>
    );
}

function UsersSidebar() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { major, gender, majors, users, setMajorAndLoad, setGenderAndLoad, reset } = ctx;

    return (
        <>
            <div className={styles.sidebarCard}>
                <p className={styles.sectionTitle}>Campus</p>
                <div className={styles.navList}>
                    {[
                        { value: '', label: 'All' },
                        { value: 'male', label: "Men's" },
                        { value: 'female', label: "Women's" },
                    ].map(g => (
                        <button
                            key={g.value || 'all'}
                            className={`${styles.navBtn} ${gender === g.value ? styles.navBtnActive : ''}`}
                            onClick={() => setGenderAndLoad(g.value)}
                        >
                            <span>{g.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.sidebarCard}>
                <p className={styles.sectionTitle}>Major</p>
                <div className={`${styles.navList} ${styles.scrollList}`}>
                    <button
                        className={`${styles.navBtn} ${major === '' ? styles.navBtnActive : ''}`}
                        onClick={() => setMajorAndLoad('')}
                    >
                        <span>All majors</span>
                    </button>
                    {majors.map(m => (
                        <button
                            key={m.code}
                            className={`${styles.navBtn} ${major === m.code ? styles.navBtnActive : ''}`}
                            onClick={() => setMajorAndLoad(m.code)}
                            title={m.name}
                        >
                            <span>{m.name}</span>
                            <span className={styles.navCount}>{m.code}</span>
                        </button>
                    ))}
                </div>
                <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnFull}`} onClick={reset}>
                    Clear the filters
                </button>
            </div>
        </>
    );
}

function UsersMain() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { users, search, setSearch, loading, error, viewingUser, setViewingUser, submitSearch, handleDelete } = ctx;

    return (
        <>
            <form onSubmit={submitSearch} className={styles.toolbar}>
                <div className={`${styles.searchWrapper} ${styles.searchGrow}`}>
                    <span className={styles.searchIcon}><SearchIcon /></span>
                    <input
                        type="search"
                        className={styles.searchInput}
                        placeholder="Name, email or university ID, then Enter"
                        aria-label="Search users"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </form>

            {error && <div className={styles.error}>{error}</div>}
            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} />Reading users…</div>
            ) : users.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>Nobody matches.</div>
                    <span>Loosen the filters or the search.</span>
                </div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>University ID</th>
                                <th>Major</th>
                                <th>Campus</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th className={styles.cellActions}><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td className={styles.cellStrong}>{u.name || <span className={styles.cellMuted}>no name</span>}</td>
                                    <td className={styles.mono}>{u.student_id || '—'}</td>
                                    <td className={styles.mono}>{u.major || '—'}</td>
                                    <td>{u.gender === 'male' ? "Men's" : u.gender === 'female' ? "Women's" : '—'}</td>
                                    <td>{u.email || '—'}</td>
                                    <td className={styles.mono}>{u.phone || '—'}</td>
                                    <td className={styles.cellActions}>
                                        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setViewingUser(u)}>Schedules</button>
                                        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => handleDelete(u.id, u.name)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className={styles.tableFoot}>{users.length} {users.length === 1 ? 'student' : 'students'}</p>
                </div>
            )}

            {viewingUser && (
                <UserSchedulesModal user={viewingUser} onClose={() => setViewingUser(null)} />
            )}
        </>
    );
}

const usersTab = { Provider: UsersProvider, Sidebar: UsersSidebar, Main: UsersMain };
export default usersTab;
