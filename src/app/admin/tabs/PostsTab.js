'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SearchIcon } from '@/components/Icons';
import { useConfirm, useToast } from '@/components/ui';
import styles from '../admin.module.css';

const Ctx = createContext(null);

const STATUSES = [
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'expired', label: 'Expired' },
    { value: 'all', label: 'All' },
];

// Surface what the server actually said. These used to alert('Failed'), which
// hid real, actionable errors — e.g. a post still referenced by a live match.
async function errorFrom(res, fallback) {
    try {
        const body = await res.json();
        if (body?.error) return body.error;
    } catch { /* non-JSON response */ }
    return fallback;
}

function PostsProvider({ children }) {
    const [posts, setPosts] = useState([]);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('active');
    const [term, setTerm] = useState('');
    const [semesters, setSemesters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const supabase = createClient();
    const confirm = useConfirm();
    const toast = useToast();

    const load = useCallback(async (overrides = {}) => {
        const q = overrides.search !== undefined ? overrides.search : search;
        const s = overrides.status !== undefined ? overrides.status : status;
        const t = overrides.term !== undefined ? overrides.term : term;
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (s) params.set('status', s);
            if (t) params.set('term', t);
            const res = await fetch(`/api/admin/posts?${params}`);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setPosts(data.posts || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [search, status, term]);

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('semesters')
                .select('term_code, name, is_active')
                .order('term_code', { ascending: false });
            setSemesters(data || []);
        })();
        load({ search: '', status: 'active', term: '' });
        // eslint-disable-next-line
    }, []);

    const setStatusAndLoad = (v) => { setStatus(v); load({ status: v }); };
    const setTermAndLoad = (v) => { setTerm(v); load({ term: v }); };
    const submitSearch = (e) => { e?.preventDefault(); load({ search }); };

    const handleExpire = async (id) => {
        const ok = await confirm({
            title: 'Expire this post now?',
            body: 'It comes off the board straight away, as if its week had run out.',
            confirmLabel: 'Expire it',
        });
        if (!ok) return;
        const res = await fetch('/api/admin/posts', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: 'expired' }),
        });
        if (res.ok) {
            setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'expired' } : p));
            toast.success('Post expired');
        } else {
            toast.error(await errorFrom(res, 'Could not expire this post.'));
        }
    };

    const handleDelete = async (id) => {
        const ok = await confirm({
            title: 'Delete this post for good?',
            body: 'It disappears from the board and from its owner’s history. This can’t be undone.',
            confirmLabel: 'Delete post',
            tone: 'danger',
        });
        if (!ok) return;
        const res = await fetch('/api/admin/posts', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        if (res.ok) {
            setPosts(prev => prev.filter(p => p.id !== id));
            toast.success('Post deleted');
        } else {
            toast.error(await errorFrom(res, 'Could not delete this post.'));
        }
    };

    return (
        <Ctx.Provider value={{
            posts, search, setSearch, status, term, semesters, loading, error,
            setStatusAndLoad, setTermAndLoad, submitSearch, handleExpire, handleDelete,
        }}>
            {children}
        </Ctx.Provider>
    );
}

function PostsSidebar() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { status, term, semesters, posts, setStatusAndLoad, setTermAndLoad } = ctx;

    return (
        <>
            <div className={styles.sidebarCard}>
                <p className={styles.sectionTitle}>Status</p>
                <div className={styles.navList}>
                    {STATUSES.map(s => (
                        <button
                            key={s.value}
                            className={`${styles.navBtn} ${status === s.value ? styles.navBtnActive : ''}`}
                            onClick={() => setStatusAndLoad(s.value)}
                        >
                            <span>{s.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.sidebarCard}>
                <p className={styles.sectionTitle}>Term</p>
                <div className={`${styles.navList} ${semesters.length > 5 ? styles.scrollList : ''}`}>
                    <button
                        className={`${styles.navBtn} ${term === '' ? styles.navBtnActive : ''}`}
                        onClick={() => setTermAndLoad('')}
                    >
                        <span>All semesters</span>
                    </button>
                    {semesters.map(s => (
                        <button
                            key={s.term_code}
                            className={`${styles.navBtn} ${term === s.term_code ? styles.navBtnActive : ''}`}
                            onClick={() => setTermAndLoad(s.term_code)}
                            title={s.name}
                        >
                            <span>{s.name}</span>
                            <span className={styles.navCount}>{s.term_code}</span>
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

function PostsMain() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { posts, search, setSearch, loading, error, submitSearch, handleExpire, handleDelete } = ctx;

    const badgeClass = (s) => {
        if (s === 'active') return styles.badgeActive;
        if (s === 'pending') return styles.badgePending;
        return styles.badgeExpired;
    };

    return (
        <>
            <form onSubmit={submitSearch} className={styles.toolbar}>
                <div className={`${styles.searchWrapper} ${styles.searchGrow}`}>
                    <span className={styles.searchIcon}><SearchIcon /></span>
                    <input
                        type="search"
                        className={styles.searchInput}
                        placeholder="Course code or name, then Enter"
                        aria-label="Search posts"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </form>

            {error && <div className={styles.error}>{error}</div>}
            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} />Reading posts…</div>
            ) : posts.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>No posts.</div>
                    <span>Nothing matches these filters.</span>
                </div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Course</th>
                                <th>Kind</th>
                                <th>Sections</th>
                                <th>Status</th>
                                <th>Term</th>
                                <th>Posted by</th>
                                <th className={styles.cellActions}><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {posts.map(p => (
                                <tr key={p.id}>
                                    <td>
                                        <span className={`${styles.mono} ${styles.cellStrong}`}>{p.course_code}</span>
                                        <div className={styles.rowMeta}>{p.course_name}</div>
                                    </td>
                                    <td>{p.type === 'swap' ? 'Swap' : p.type === 'giveaway' ? 'Giveaway' : p.type === 'request' ? 'Request' : p.type}</td>
                                    <td className={styles.mono}>§{p.have_section}{p.want_section ? ` → §${p.want_section}` : ''}</td>
                                    <td><span className={`${styles.badge} ${badgeClass(p.status)}`}>{p.status}</span></td>
                                    <td className={styles.mono}>{p.term_code}</td>
                                    <td>
                                        {p.profile?.name || <span className={styles.cellMuted}>unknown</span>}
                                        <div className={`${styles.rowMeta} ${styles.mono}`}>{p.profile?.student_id || 'no ID'}{p.profile?.email ? ` · ${p.profile.email}` : ''}</div>
                                    </td>
                                    <td className={styles.cellActions}>
                                        {p.status !== 'expired' && p.status !== 'completed' && (
                                            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => handleExpire(p.id)}>Expire</button>
                                        )}
                                        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => handleDelete(p.id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className={styles.tableFoot}>{posts.length} {posts.length === 1 ? 'post' : 'posts'}</p>
                </div>
            )}
        </>
    );
}

const postsTab = { Provider: PostsProvider, Sidebar: PostsSidebar, Main: PostsMain };
export default postsTab;
