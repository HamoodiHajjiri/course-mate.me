'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { seatStatus } from '@/lib/seats';
import { Section, Status, useConfirm } from '@/components/ui';
import styles from './PostCard.module.css';

export const POST_TYPE_CONFIG = {
    swap: { label: 'Swap', tone: 'swap', haveLabel: 'has', wantLabel: 'wants' },
    giveaway: { label: 'Giveaway', tone: 'giveaway', haveLabel: 'giving' },
    request: { label: 'Request', tone: 'request', haveLabel: 'wants' },
};

function formatAge(dateString) {
    const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);
    if (seconds < 60) return 'now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

function timeLeft(expiresAt) {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return { text: 'ending', urgent: true };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days >= 1) return { text: `${days}d left`, urgent: false };
    if (hours >= 1) return { text: `${hours}h left`, urgent: true };
    return { text: '<1h left', urgent: true };
}

// "Mon/Wed 08:00-09:15" → { days: 'Mon Wed', time: '08:00–09:15' }
function splitTime(classTime) {
    const str = (classTime || '').trim();
    const m = str.match(/^(.+?)\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?\s*-\s*\d{1,2}:\d{2}(?:\s*[AP]M)?)$/i);
    if (!m) return { days: '', time: str };
    return { days: m[1].trim().replace(/\//g, ' '), time: m[2].replace(/\s*-\s*/, '–') };
}

// The kind of post as a drawn glyph: two opposed arrows for a swap, an
// arrow leaving for a giveaway, an arrow arriving for a request.
function KindGlyph({ type }) {
    return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true" className={styles.glyph}>
            {type === 'swap' && <path d="M2 5h11M10 2l3 3-3 3M14 11H3M6 8l-3 3 3 3" />}
            {type === 'giveaway' && <path d="M3 3v10M6 8h8M11 5l3 3-3 3" />}
            {type === 'request' && <path d="M13 3v10M2 8h8M7 5l3 3-3 3" />}
        </svg>
    );
}

/**
 * One line of the board for a section: the section, when it meets, who
 * teaches it, whether it has seats. Swaps have two (what they have, what
 * they want); the columns line up across every post on the page.
 */
export function SectionTicket({ label, section, instructor, time, seats, emphasis = false }) {
    const { days, time: clock } = splitTime(time);
    const seat = seats ? seatStatus(seats) : null;
    return (
        <div className={styles.line}>
            <span className={styles.lineLabel}>{label}</span>
            <Section value={section} tone={emphasis ? 'mine' : 'plain'} />
            <span className={styles.when}>
                {days && <span className={styles.days}>{days}</span>}
                {clock && <span className={styles.clock}>{clock}</span>}
                {!days && !clock && <span className={styles.none}>time not listed</span>}
            </span>
            <span className={styles.instructor} title={instructor || undefined}>{instructor || <span className={styles.none}>staff</span>}</span>
            <span className={styles.seats}>
                {seat && <Status tone={seat.tone === 'full' ? 'danger' : seat.tone === 'low' ? 'warn' : 'go'} title={seat.title}>{seat.label}</Status>}
            </span>
        </div>
    );
}

export default function PostCard({
    post,
    courseName,
    haveInstructor,
    wantInstructor,
    haveSeats,
    wantSeats,
    showContact = false,
    showActions = false,
    onComplete,
    onDelete,
    isOwn = false,
    interestAlreadySent = false,
    standalone = false,
}) {
    const typeConfig = POST_TYPE_CONFIG[post.type] || POST_TYPE_CONFIG.swap;
    const [contactInfo, setContactInfo] = useState(null);
    const [contactLoaded, setContactLoaded] = useState(false);
    const [interestState, setInterestState] = useState(interestAlreadySent ? 'sent' : 'idle');
    const [interestError, setInterestError] = useState('');
    const [copied, setCopied] = useState(false);
    const supabase = createClient();
    const confirm = useConfirm();

    useEffect(() => {
        const fetchContactInfo = async () => {
            if (showContact && post.profile?.id) {
                const { data, error } = await supabase.rpc('get_contact_info', {
                    target_profile_id: post.profile.id
                });
                if (error) {
                    console.error('RPC error:', error);
                }
                if (data && data.length > 0) {
                    setContactInfo(data[0]);
                }
            }
            setContactLoaded(true);
        };
        fetchContactInfo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showContact, post.profile?.id]);

    const handleInterest = async () => {
        if (interestState === 'sending' || interestState === 'sent') return;
        const ok = await confirm({
            title: `Send your contact to ${post.profile?.name?.split(' ')[0] || 'the poster'}?`,
            body: 'They’ll get your name and phone number by email, so they can reach you about this section.',
            confirmLabel: 'Send my contact',
        });
        if (!ok) return;
        setInterestState('sending');
        setInterestError('');
        try {
            const res = await fetch('/api/notify-interest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId: post.id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setInterestError(data?.error || 'Couldn’t send. Try again.');
                setInterestState('idle');
                return;
            }
            setInterestState('sent');
        } catch {
            setInterestError('Couldn’t send. Try again.');
            setInterestState('idle');
        }
    };

    const copyPhone = async () => {
        try {
            await navigator.clipboard.writeText(contactInfo.phone);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard unavailable: the number is still on screen */ }
    };

    const showInterest = showContact && !isOwn && contactLoaded && !contactInfo?.phone;
    const remaining = post.expires_at && post.status === 'active' ? timeLeft(post.expires_at) : null;
    const isSwap = post.type === 'swap' && post.want_section;

    let action = null;
    if (isOwn) {
        action = showActions && post.status === 'active' && (onComplete || onDelete) ? (
            <span className={styles.ownActions}>
                {onComplete && <button type="button" className={styles.textBtn} onClick={() => onComplete(post.id)}>Mark done</button>}
                {onDelete && <button type="button" className={`${styles.textBtn} ${styles.textBtnDanger}`} onClick={() => onDelete(post.id)}>Cancel post</button>}
            </span>
        ) : post.status === 'pending' ? <Status tone="warn">In a match</Status> : null;
    } else if (post.status === 'pending') {
        action = <Status tone="warn" title="This post is part of a match being confirmed">In a match</Status>;
    } else if (showContact && contactInfo?.phone) {
        action = (
            <span className={styles.phone}>
                <a href={`tel:${contactInfo.phone}`}>{contactInfo.phone}</a>
                <button type="button" className={styles.textBtn} onClick={copyPhone}>{copied ? 'copied' : 'copy'}</button>
            </span>
        );
    } else if (showInterest) {
        action = interestState === 'sent'
            ? <Status tone="go" title="The poster has your contact">Contact sent</Status>
            : (
                <button type="button" className={styles.interest} onClick={handleInterest} disabled={interestState === 'sending'}>
                    {interestState === 'sending' ? 'Sending…' : 'I’m interested'}
                </button>
            );
    } else if (post.type === 'swap') {
        action = <span className={styles.auto} title="Swaps are matched automatically: post the opposite swap to be matched">matched automatically</span>;
    }

    return (
        <article className={`${styles.row} ${styles[`row_${post.type}`] || ''} ${isOwn ? styles.rowOwn : ''} ${standalone ? styles.standalone : ''}`}>
            <span className={`${styles.kind} ${styles[`kind_${post.type}`]}`}>
                <KindGlyph type={post.type} />
                {typeConfig.label}
            </span>

            <div className={styles.lines}>
                <SectionTicket
                    label={typeConfig.haveLabel}
                    section={post.have_section}
                    instructor={haveInstructor}
                    time={post.have_section_time}
                    seats={haveSeats}
                    emphasis={isOwn && post.type === 'request'}
                />
                {isSwap && (
                    <SectionTicket
                        label={typeConfig.wantLabel}
                        section={post.want_section}
                        instructor={wantInstructor}
                        time={post.want_section_time}
                        seats={wantSeats}
                        emphasis={isOwn}
                    />
                )}
            </div>

            <div className={styles.who}>
                <span className={styles.name}>{isOwn ? 'You' : (post.profile?.name || 'A student')}</span>
                <span className={styles.meta}>
                    {post.profile?.student_id && !isOwn && <span className={styles.id}>{post.profile.student_id}</span>}
                    <span>{formatAge(post.created_at)} ago</span>
                    {remaining && <span className={remaining.urgent ? styles.urgent : ''}>{remaining.text}</span>}
                </span>
                {courseName && standalone && <span className={styles.meta}>{courseName}</span>}
            </div>

            <div className={styles.action}>{action}</div>

            {interestError && <p className={styles.error} role="alert">{interestError}</p>}
        </article>
    );
}
