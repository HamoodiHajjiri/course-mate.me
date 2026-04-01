'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './PostCard.module.css';

const POST_TYPE_CONFIG = {
    swap: {
        label: 'Swap',
        class: styles.badgeSwap,
    },
    giveaway: {
        label: 'Giveaway',
        class: styles.badgeGiveaway,
    },
    request: {
        label: 'Request',
        class: styles.badgeRequest,
    },
};

const STATUS_CONFIG = {
    active: { dot: 'active', label: 'Active' },
    pending: { dot: 'pending', label: 'Pending Match' },
    completed: { dot: 'completed', label: 'Completed' },
    expired: { dot: 'completed', label: 'Expired' },
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

export default function PostCard({
    post,
    courseName,
    haveInstructor,
    wantInstructor,
    showContact = false,
    showActions = false,
    onComplete,
    onDelete,
    isOwn = false,
}) {
    const typeConfig = POST_TYPE_CONFIG[post.type];
    const statusConfig = STATUS_CONFIG[post.status];
    const [contactInfo, setContactInfo] = useState(null);
    const supabase = createClient();

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
        };
        fetchContactInfo();
    }, [showContact, post.profile?.id]);

    return (
        <article className={`${styles.card} ${styles[`card${post.type}`]}`}>
            {/* Header */}
            <div className={styles.header}>
                <span className={`${styles.badge} ${typeConfig.class}`}>
                    {typeConfig.label}
                </span>
                <div className={styles.status}>
                    <span className={`${styles.statusDot} ${styles[`statusDot${statusConfig.dot}`]}`} />
                    <span className={styles.statusLabel}>{statusConfig.label}</span>
                </div>
            </div>

            {/* Course Info */}
            <div className={styles.courseInfo}>
                <span className={styles.courseId}>{courseName || post.course_name || 'Unknown Course'}</span>
                <span className={styles.courseName}>{post.course_code}</span>
            </div>

            {/* Section Info */}
            <div className={styles.sectionWrapper}>
                <div className={styles.sectionGroup}>
                    <span className={styles.sectionLabel}>
                        {post.type === 'giveaway' ? 'Giving Away' :
                            post.type === 'request' ? 'Looking For' : 'Have'}
                    </span>
                    <span className={styles.sectionValue}>Section {post.have_section}</span>
                    {haveInstructor && (
                        <span className={styles.instructor}>{haveInstructor}</span>
                    )}
                    {post.have_section_time && (
                        <span className={styles.sectionTime}>{post.have_section_time}</span>
                    )}
                </div>

                {post.type === 'swap' && post.want_section && (
                    <>
                        <span className={styles.arrow}>→</span>
                        <div className={styles.sectionGroup}>
                            <span className={styles.sectionLabel}>Want</span>
                            <span className={styles.sectionValue}>Section {post.want_section}</span>
                            {wantInstructor && (
                                <span className={styles.instructor}>{wantInstructor}</span>
                            )}
                            {post.want_section_time && (
                                <span className={styles.sectionTime}>{post.want_section_time}</span>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Poster Info */}
            {post.profile && (
                <div className={styles.posterInfo}>
                    <span className={styles.posterName}>{post.profile.name || 'Anonymous'}</span>
                    {post.profile.student_id && <span className={styles.posterMeta}>• {post.profile.student_id}</span>}
                </div>
            )}

            {/* Contact Info (visible for giveaways/requests or matched swaps) */}
            {showContact && contactInfo?.phone && (
                <div className={styles.contactInfo}>
                    <span className={styles.contactLabel}>Contact:</span>
                    <span className={styles.contactValue}>
                        {contactInfo.phone}
                    </span>
                </div>
            )}

            {/* Footer */}
            <div className={styles.footer}>
                <div className={styles.footerLeft}>
                    <span className={styles.timestamp}>{formatTimeAgo(post.created_at)}</span>
                    {post.expires_at && post.status === 'active' && (() => {
                        const remaining = getTimeRemaining(post.expires_at);
                        return remaining ? (
                            <span className={`${styles.expiryTimer} ${remaining.urgent ? styles.expiryTimerUrgent : ''}`}>
                                {remaining.text}
                            </span>
                        ) : null;
                    })()}
                </div>

                {showActions && isOwn && post.status === 'active' && (
                    <div className={styles.actions}>
                        <button onClick={() => onComplete?.(post.id)} className={`${styles.actionBtn} ${styles.completeBtn}`} title="Mark this swap as completed">
                            Mark as Swapped
                        </button>
                        <button onClick={() => onDelete?.(post.id)} className={`${styles.actionBtn} ${styles.deleteBtn}`} title="Cancel and remove this post">
                            Cancel Post
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
}
