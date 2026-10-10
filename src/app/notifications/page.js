'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PageShell from '@/components/PageShell';
import { Button, CourseCode, EmptyState, SegmentedControl, Section, Skeleton, Status, useConfirm, useToast } from '@/components/ui';
import styles from './notifications.module.css';

function linkFor(n) {
    if (!n?.type) return null;
    if (n.type.startsWith('match') || n.type === 'reminder') return '/matches';
    if (n.type === 'interest_received' || n.type === 'watch_alert' || n.type === 'giveaway_posted') return '/browse';
    if (n.type === 'new_section') return '/schedule';
    return null;
}

// What each kind of notification is called in the margin, and its tone.
const KINDS = {
    match_found: { label: 'Match', tone: 'warn', group: 'swaps' },
    match_accepted: { label: 'Confirmed', tone: 'go', group: 'swaps' },
    match_declined: { label: 'Declined', tone: 'danger', group: 'swaps' },
    match_expired: { label: 'Expired', tone: 'muted', group: 'swaps' },
    reminder: { label: 'Reminder', tone: 'warn', group: 'swaps' },
    interest_received: { label: 'Interest', tone: 'brand', group: 'posts' },
    watch_alert: { label: 'Alert', tone: 'go', group: 'alerts' },
    giveaway_posted: { label: 'Giveaway', tone: 'giveaway', group: 'alerts' },
    new_section: { label: 'New section', tone: 'request', group: 'alerts' },
};

const DAY = 86400000;

function dayGroup(date, now) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const t = date.getTime();
    if (t >= start) return 'Today';
    if (t >= start - DAY) return 'Yesterday';
    if (t >= start - 6 * DAY) return 'Earlier this week';
    return 'Older';
}

const pad = (n) => String(n).padStart(2, '0');

// The margin: a clock for today and yesterday, a date before that.
function stamp(date, group) {
    if (group === 'Today' || group === 'Yesterday') return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
}

// Course codes and sections inside a message are set the way they are
// everywhere else: 0401211 as a code, "Section 02" as §02.
function richText(text) {
    if (!text) return null;
    const parts = [];
    const re = /(\b\d{7}\b)|(?:\bSection\s+([0-9]{1,3}[A-Z]{0,2})\b)/g;
    let last = 0;
    let m;
    let k = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) parts.push(text.slice(last, m.index));
        parts.push(m[1] ? <CourseCode key={k++} id={m[1]} size="sm" /> : <Section key={k++} value={m[2]} size="sm" />);
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

/**
 * Notifications: a log. Grouped by day, the time in the margin, each entry
 * named by kind. What was unread when you opened the page stays marked for
 * this visit, though it's marked read straight away so the bell clears.
 */
export default function NotificationsPage() {
    const router = useRouter();
    const supabase = createClient();
    const confirm = useConfirm();
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    // Snapshot of which were unread at load, so styling persists after we mark them read.
    const [unreadSnapshot, setUnreadSnapshot] = useState(new Set());
    const channelRef = useRef(null);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/auth'); return; }

            const { data } = await supabase
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            const list = data || [];
            setItems(list);
            setUnreadSnapshot(new Set(list.filter(n => !n.read).map(n => n.id)));
            setLoading(false);

            // Mark everything read so the badge clears, but keep the load-time styling.
            const unreadIds = list.filter(n => !n.read).map(n => n.id);
            if (unreadIds.length > 0) {
                await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
            }

            // Live updates: a notification that arrives while this page is open
            // (e.g. a match found mid-session) appears at the top immediately.
            if (typeof supabase.channel !== 'function') return;
            channelRef.current = supabase
                .channel(`notifications-live-${user.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
                    setItems(prev => [payload.new, ...prev]);
                    setUnreadSnapshot(prev => new Set(prev).add(payload.new.id));
                    supabase.from('notifications').update({ read: true }).eq('id', payload.new.id);
                })
                .subscribe();
        })();

        return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clearAll = async () => {
        if (items.length === 0) return;
        const ok = await confirm({
            title: 'Clear every notification?',
            body: `All ${items.length} are deleted for good. Matches and posts themselves aren’t affected.`,
            confirmLabel: 'Clear all',
            tone: 'danger',
        });
        if (!ok) return;
        const ids = items.map(n => n.id);
        const { error } = await supabase.from('notifications').delete().in('id', ids);
        if (error) {
            toast.error('Couldn’t clear them. Try again.');
            return;
        }
        setItems([]);
        toast.success('Cleared');
    };

    const counts = {
        all: items.length,
        swaps: items.filter(n => KINDS[n.type]?.group === 'swaps').length,
        posts: items.filter(n => KINDS[n.type]?.group === 'posts').length,
        alerts: items.filter(n => KINDS[n.type]?.group === 'alerts').length,
    };
    const shown = filter === 'all' ? items : items.filter(n => KINDS[n.type]?.group === filter);
    const now = new Date();
    const groups = [];
    shown.forEach(n => {
        const date = new Date(n.created_at);
        const g = dayGroup(date, now);
        if (!groups.length || groups[groups.length - 1].label !== g) groups.push({ label: g, items: [] });
        groups[groups.length - 1].items.push({ n, date, group: g });
    });
    const newCount = items.filter(n => unreadSnapshot.has(n.id)).length;

    return (
        <PageShell width="reading">
            <header className={styles.head}>
                <h1 className={styles.title}>Notifications</h1>
                <p className={styles.sentence}>
                    {loading ? 'Reading…' : items.length === 0 ? 'Nothing yet.' : newCount > 0 ? `${newCount} new since you last looked.` : 'You’re up to date.'}
                </p>
            </header>

            {!loading && items.length > 0 && (
                <div className={styles.toolbar}>
                    <SegmentedControl
                        label="Show"
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { value: 'all', label: 'All', count: counts.all },
                            { value: 'swaps', label: 'Swaps', count: counts.swaps, disabled: !counts.swaps },
                            { value: 'posts', label: 'Your posts', count: counts.posts, disabled: !counts.posts },
                            { value: 'alerts', label: 'Alerts', count: counts.alerts, disabled: !counts.alerts },
                        ]}
                    />
                    <Button variant="link" onClick={clearAll} className={styles.clear}>Clear all</Button>
                </div>
            )}

            {loading ? (
                <div className={styles.skeleton} aria-busy="true">
                    {[0, 1, 2, 3].map(i => <Skeleton key={i} height={46} />)}
                </div>
            ) : items.length === 0 ? (
                <EmptyState title="Nothing has happened yet.">
                    Matches, interest in your posts and the sections you watch are logged here as they happen.
                </EmptyState>
            ) : (
                <div className={styles.log}>
                    {groups.map(g => (
                        <section key={g.label} className={styles.group} aria-label={g.label}>
                            <h2 className={styles.groupTitle}>{g.label}</h2>
                            <ol className={styles.entries}>
                                {g.items.map(({ n, date, group }) => {
                                    const kind = KINDS[n.type] || { label: 'Note', tone: 'neutral' };
                                    const href = linkFor(n);
                                    const isNew = unreadSnapshot.has(n.id);
                                    const body = (
                                        <>
                                            <time className={styles.time} dateTime={n.created_at}>{stamp(date, group)}</time>
                                            <span className={styles.kind}><Status tone={kind.tone}>{kind.label}</Status></span>
                                            <span className={styles.text}>
                                                <span className={`${styles.entryTitle} ${isNew ? styles.entryNew : ''}`}>{n.title}</span>
                                                {n.message && <span className={styles.message}>{richText(n.message)}</span>}
                                            </span>
                                            {href && <span className={styles.go} aria-hidden="true">→</span>}
                                        </>
                                    );
                                    return (
                                        <li key={n.id}>
                                            {href ? <Link href={href} className={styles.entry}>{body}</Link> : <div className={styles.entry}>{body}</div>}
                                        </li>
                                    );
                                })}
                            </ol>
                        </section>
                    ))}
                    {shown.length === 0 && <EmptyState compact title="None of this kind." />}
                </div>
            )}
        </PageShell>
    );
}
