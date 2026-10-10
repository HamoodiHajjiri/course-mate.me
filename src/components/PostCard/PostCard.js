'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { seatStatus } from '@/lib/seats';
import { Avatar, Badge, Button, CourseSwatch, useConfirm } from '@/components/ui';
import {
    ActivityIcon,
    ArrowRightIcon,
    CheckIcon,
    CopyIcon,
    GiftIcon,
    HandIcon,
    PhoneIcon,
    SendIcon,
} from '@/components/Icons';
import styles from './PostCard.module.css';

export const POST_TYPE_CONFIG = {
    swap: { label: 'Swap', icon: ActivityIcon, tone: 'swap', haveLabel: 'Has', wantLabel: 'Wants' },
    giveaway: { label: 'Giveaway', icon: GiftIcon, tone: 'giveaway', haveLabel: 'Giving away' },
    request: { label: 'Request', icon: HandIcon, tone: 'request', haveLabel: 'Looking for' },
};

const STATUS_CONFIG = {
    active: { tone: 'success', label: 'Active' },
    pending: { tone: 'warning', label: 'Pending match' },
    completed: { tone: 'neutral', label: 'Completed' },
    expired: { tone: 'neutral', label: 'Expired' },
};

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function getTimeRemaining(expiresAt) {
    if (!expiresAt) return null;
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires - now;

    if (diff <= 0) return { text: 'Expired', urgent: true };

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 1) return { text: `${days}d left`, urgent: false };
    if (days === 1) return { text: '1d left', urgent: false };
    if (hours > 0) return { text: `${hours}h left`, urgent: true };
    return { text: '<1h left', urgent: true };
}

// "Mon/Wed 08:00-09:15" → days and clock range, shown apart.
function splitTime(classTime) {
    const str = (classTime || '').trim();
    const m = str.match(/^(.+?)\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?\s*-\s*\d{1,2}:\d{2}(?:\s*[AP]M)?)$/i);
    if (!m) return { days: '', time: str };
    return { days: m[1].trim(), time: m[2].replace(/\s*-\s*/, '–') };
}

/**
 * One side of a post, as a ticket: the section in large mono, when it meets,
 * who teaches it, and whether it has seats. The notches face the exchange
 * arrow, so a swap reads as two tickets changing hands.
 */
export function SectionTicket({ label, section, instructor, time, seats, emphasis = false, tone }) {
    const { days, time: clock } = splitTime(time);
    const seat = seats ? seatStatus(seats) : null;
    return (
        <div className={`${styles.ticket} ${emphasis ? styles.ticketEmphasis : ''} ${tone ? styles[`ticket_${tone}`] : ''}`}>
            <span className={styles.ticketLabel}>{label}</span>
            <span className={styles.ticketSection}>{section}</span>
            {(days || clock) && (
                <span className={styles.ticketTime}>
                    {days && <span className={styles.ticketDays}>{days}</span>}
                    {clock && <span>{clock}</span>}
                </span>
            )}
            {instructor && <span className={styles.ticketInstructor} title={instructor}>{instructor}</span>}
            {seat && (
                <span className={`${styles.ticketSeats} ${styles[`seats_${seat.tone}`]}`} title={seat.title}>
                    {seat.label}
                </span>
            )}
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
}) {
    const typeConfig = POST_TYPE_CONFIG[post.type] || POST_TYPE_CONFIG.swap;
    const statusConfig = STATUS_CONFIG[post.status] || STATUS_CONFIG.active;
    const TypeIcon = typeConfig.icon;
    const [contactInfo, setContactInfo] = useState(null);
    const [contactLoaded, setContactLoaded] = useState(false);
    const [interestState, setInterestState] = useState(interestAlreadySent ? 'sent' : 'idle');
    const [interestError, setInterestError] = useState('');
    const [copied, setCopied] = useState(false);
    const supabase = createClient();
    const confirm = useConfirm();

    // Fetch contact info via RPC when showContact is true
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
            title: `Share your contact with ${post.profile?.name?.split(' ')[0] || 'the poster'}?`,
            body: 'Your name and phone number will be sent to them by email, so they can reach you about this section.',
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
                setInterestError(data?.error || 'Could not send. Try again.');
                setInterestState('idle');
                return;
            }
            setInterestState('sent');
        } catch {
            setInterestError('Could not send. Try again.');
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

    // For giveaway/request posts with no public phone, offer the interest flow.
    const showInterest = showContact && !isOwn && contactLoaded && !contactInfo?.phone;
    const remaining = post.expires_at && post.status === 'active' ? getTimeRemaining(post.expires_at) : null;
    const displayName = courseName || post.course_name || 'Unknown course';
    const isSwap = post.type === 'swap' && post.want_section;

    return (
        <article className={`${styles.card} ${styles[`card_${post.type}`] || ''}`}>
            <header className={styles.head}>
                <CourseSwatch courseId={post.course_code} />
                <div className={styles.course}>
                    <h3 className={styles.courseName} title={displayName}>{displayName}</h3>
                    <span className={styles.courseMeta}>
                        <span className={styles.courseCode}>{post.course_code}</span>
                        <span className={styles.metaDot} aria-hidden="true" />
                        <span className={styles.status}>
                            <span className={`${styles.statusDot} ${styles[`dot_${statusConfig.tone}`]}`} aria-hidden="true" />
                            {statusConfig.label}
                        </span>
                        {remaining && (
                            <>
                                <span className={styles.metaDot} aria-hidden="true" />
                                <span className={`${styles.expiry} ${remaining.urgent ? styles.expiryUrgent : ''}`}>{remaining.text}</span>
                            </>
                        )}
                    </span>
                </div>
                <Badge tone={typeConfig.tone} icon={<TypeIcon />} className={styles.typeBadge}>{typeConfig.label}</Badge>
            </header>

            {isSwap ? (
                <div className={styles.exchange}>
                    <SectionTicket
                        label={typeConfig.haveLabel}
                        section={post.have_section}
                        instructor={haveInstructor}
                        time={post.have_section_time}
                        seats={haveSeats}
                    />
                    <span className={styles.exchangeArrow} aria-label="in exchange for">
                        <ArrowRightIcon strokeWidth={2} />
                    </span>
                    <SectionTicket
                        label={typeConfig.wantLabel}
                        section={post.want_section}
                        instructor={wantInstructor}
                        time={post.want_section_time}
                        seats={wantSeats}
                        emphasis
                    />
                </div>
            ) : (
                <div className={styles.single}>
                    <SectionTicket
                        label={typeConfig.haveLabel}
                        section={post.have_section}
                        instructor={haveInstructor}
                        time={post.have_section_time}
                        seats={haveSeats}
                        tone={post.type}
                    />
                </div>
            )}

            {/* Contact (giveaways/requests whose poster chose to publish it) */}
            {showContact && !isOwn && contactInfo?.phone && (
                <div className={styles.contact}>
                    <PhoneIcon className={styles.contactIcon} />
                    <a href={`tel:${contactInfo.phone}`} className={styles.contactValue}>{contactInfo.phone}</a>
                    <button
                        type="button"
                        className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`}
                        onClick={copyPhone}
                        aria-label={copied ? 'Copied' : 'Copy phone number'}
                        title={copied ? 'Copied' : 'Copy'}
                    >
                        {copied ? <CheckIcon strokeWidth={2.25} /> : <CopyIcon />}
                    </button>
                </div>
            )}

            <footer className={styles.foot}>
                {post.profile ? (
                    <span className={styles.poster}>
                        <Avatar name={post.profile.name || 'Anonymous'} size={26} tone={isOwn ? 'accent' : 'neutral'} />
                        <span className={styles.posterText}>
                            <span className={styles.posterName}>{isOwn ? 'You' : (post.profile.name || 'Anonymous')}</span>
                            <span className={styles.posterMeta}>
                                {post.profile.student_id && !isOwn ? `${post.profile.student_id} · ` : ''}
                                {formatTimeAgo(post.created_at)}
                            </span>
                        </span>
                    </span>
                ) : (
                    <span className={styles.posterMeta}>{formatTimeAgo(post.created_at)}</span>
                )}

                {/* No public phone: let the poster reach out instead */}
                {showInterest && (
                    <div className={styles.interest}>
                        {interestState === 'sent' ? (
                            <Badge tone="success" icon={<CheckIcon strokeWidth={2.25} />} title="The poster has been notified and will contact you">
                                Contact sent
                            </Badge>
                        ) : (
                            <Button
                                size="sm"
                                variant="secondary"
                                icon={<SendIcon />}
                                onClick={handleInterest}
                                loading={interestState === 'sending'}
                            >
                                I&rsquo;m interested
                            </Button>
                        )}
                    </div>
                )}

                {showActions && isOwn && post.status === 'active' && (onComplete || onDelete) && (
                    <div className={styles.actions}>
                        {onComplete && (
                            <Button size="sm" variant="soft" onClick={() => onComplete(post.id)} title="Mark this swap as completed">
                                Mark as swapped
                            </Button>
                        )}
                        {onDelete && (
                            <Button size="sm" variant="dangerGhost" onClick={() => onDelete(post.id)} title="Cancel and remove this post">
                                Cancel post
                            </Button>
                        )}
                    </div>
                )}
            </footer>
            {interestError && <p className={styles.interestError} role="alert">{interestError}</p>}
        </article>
    );
}
