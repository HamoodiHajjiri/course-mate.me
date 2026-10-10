'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import styles from '../admin.module.css';

const Ctx = createContext(null);

function OverviewProvider({ children }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatedAt, setUpdatedAt] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/stats');
            if (!res.ok) throw new Error(await res.text());
            setStats(await res.json());
            setUpdatedAt(new Date());
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <Ctx.Provider value={{ stats, loading, error, updatedAt, reload: load }}>
            {children}
        </Ctx.Provider>
    );
}

function OverviewSidebar() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { updatedAt, reload, loading } = ctx;
    return (
        <div className={styles.sidebarCard}>
            <p className={styles.sectionTitle}>Snapshot</p>
            <p className={styles.previewMuted}>Counts are read live from the database when you open this or refresh.</p>
            <button type="button" className={`${styles.btn} ${styles.btnFull}`} onClick={reload} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            {updatedAt && <span className={styles.updated}>as of {updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}</span>}
        </div>
    );
}

function Figure({ label, value, sub }) {
    return (
        <div className={styles.figure}>
            <span className={styles.figureValue}>{value}</span>
            <span className={styles.figureLabel}>{label}</span>
            {sub && <span className={styles.figureSub}>{sub}</span>}
        </div>
    );
}

const LABELS = {
    male: "Men's campus", female: "Women's campus", unknown: 'Not set',
    swap: 'Swap', giveaway: 'Giveaway', request: 'Request',
    active: 'Active', pending: 'Pending', completed: 'Completed', expired: 'Expired', declined: 'Declined', accepted: 'Accepted',
};
const labelOf = (k) => LABELS[k] || k;

function BarList({ items, empty = 'Nothing yet.' }) {
    if (!items || items.length === 0) return <p className={styles.previewMuted}>{empty}</p>;
    const max = Math.max(...items.map(i => i.count), 1);
    return (
        <div className={styles.bars}>
            {items.map((i, n) => (
                <div key={`${i.key}-${n}`} className={styles.bar}>
                    <span className={styles.barLabel} title={i.label || labelOf(i.key)}>{i.label || labelOf(i.key)}</span>
                    <span className={styles.barTrack}><span className={styles.barFill} style={{ width: `${(i.count / max) * 100}%`, display: 'block' }} /></span>
                    <span className={styles.barCount}>{i.count}</span>
                </div>
            ))}
        </div>
    );
}

function Panel({ title, children }) {
    return (
        <section className={styles.card}>
            <p className={styles.sectionTitle}>{title}</p>
            {children}
        </section>
    );
}

function OverviewMain() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { stats, loading, error } = ctx;

    if (error) return <div className={styles.error}>{error}</div>;
    if (loading && !stats) return <div className={styles.loading}><div className={styles.spinner} />Reading the numbers…</div>;
    if (!stats) return null;

    const { users, posts, matches, savedSchedules, interests, activeAnnouncements, topCourses } = stats;

    return (
        <>
            <div className={styles.figures}>
                <Figure label="Students" value={users.total} sub={`+${users.newLast7} this week`} />
                <Figure label="Live posts" value={posts.live} sub={`${posts.total} ever`} />
                <Figure label="Pending matches" value={matches.pending} sub={`${matches.total} ever`} />
                <Figure label="Saved schedules" value={savedSchedules} />
                <Figure label="Interests sent" value={interests} />
                <Figure label="Live notices" value={activeAnnouncements} />
            </div>

            <div className={styles.panels}>
                <Panel title="New students">
                    <BarList items={[
                        { key: '7d', label: 'Last 7 days', count: users.newLast7 },
                        { key: '30d', label: 'Last 30 days', count: users.newLast30 },
                        { key: 'all', label: 'All time', count: users.total },
                    ]} />
                </Panel>
                <Panel title="New posts">
                    <BarList items={[
                        { key: '7d', label: 'Last 7 days', count: posts.newLast7 },
                        { key: '30d', label: 'Last 30 days', count: posts.newLast30 },
                        { key: 'all', label: 'All time', count: posts.total },
                    ]} />
                </Panel>
                <Panel title="Posts by kind"><BarList items={posts.byType} /></Panel>
                <Panel title="Posts by status"><BarList items={posts.byStatus} /></Panel>
                <Panel title="Matches by status"><BarList items={matches.byStatus} empty="No matches yet." /></Panel>
                <Panel title="Students by campus"><BarList items={users.byGender} /></Panel>
            </div>

            <div className={styles.panels}>
                <Panel title="Students by major"><BarList items={users.byMajor} /></Panel>
                <Panel title="Courses with the most posts">
                    <BarList
                        items={topCourses.map(c => ({ key: c.course_id, label: `${c.course_id}${c.name ? ' · ' + c.name : ''}`, count: c.count }))}
                        empty="No posts yet."
                    />
                </Panel>
            </div>
        </>
    );
}

const overviewTab = { Provider: OverviewProvider, Sidebar: OverviewSidebar, Main: OverviewMain };
export default overviewTab;
