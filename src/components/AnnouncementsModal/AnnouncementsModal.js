'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Dialog } from '@/components/ui';
import styles from './AnnouncementsModal.module.css';

function dated(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Notices from the team, set like a noticeboard memo: dated in the margin,
 * a title, the text. Each can be put away on its own; closing puts them all
 * away.
 */
export default function AnnouncementsModal({ ready }) {
    const [items, setItems] = useState(null);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (!ready) return;
        let cancelled = false;
        (async () => {
            const supabase = createClient();
            const { data, error } = await supabase.rpc('get_my_active_announcements');
            if (cancelled) return;
            if (error) {
                console.error('Announcements fetch error:', error);
                setItems([]);
                return;
            }
            setItems(data || []);
        })();
        return () => { cancelled = true; };
    }, [ready]);

    const dismissOne = async (id) => {
        setItems(prev => prev.filter(a => a.id !== id));
        try {
            await fetch('/api/announcements/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ announcement_id: id }),
            });
        } catch (e) {
            console.error('Dismiss failed:', e);
        }
    };

    const dismissAll = async () => {
        setClosing(true);
        try {
            await fetch('/api/announcements/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true }),
            });
        } catch (e) {
            console.error('Dismiss all failed:', e);
        }
        setItems([]);
        setClosing(false);
    };

    const open = !!items && items.length > 0;

    return (
        <Dialog
            open={open}
            onClose={dismissAll}
            size="md"
            title={items?.length > 1 ? `${items.length} notices` : 'A notice'}
            description="From the people who run CourseMate."
            footer={(
                <Button variant="primary" onClick={dismissAll} loading={closing}>
                    {items?.length > 1 ? 'Put them all away' : 'Got it'}
                </Button>
            )}
        >
            <div className={styles.list}>
                {(items || []).map((a) => (
                    <article key={a.id} className={styles.notice}>
                        <time className={styles.date} dateTime={a.created_at}>{dated(a.created_at)}</time>
                        <div className={styles.main}>
                            <h3 className={styles.title}>{a.title}</h3>
                            {a.body_html && (
                                <div className={styles.body} dangerouslySetInnerHTML={{ __html: a.body_html }} />
                            )}
                            {items.length > 1 && (
                                <button type="button" className={styles.dismiss} onClick={() => dismissOne(a.id)}>Put away</button>
                            )}
                        </div>
                    </article>
                ))}
            </div>
        </Dialog>
    );
}
