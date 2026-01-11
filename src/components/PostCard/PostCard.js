'use client';

import styles from './PostCard.module.css';

const POST_TYPE_CONFIG = {
    swap: {
        badge: 'Swap',
        className: 'swap',
        icon: '🔄',
    },
    giveaway: {
        badge: 'Giveaway',
        className: 'giveaway',
        icon: '🎁',
    },
    request: {
        badge: 'Request',
        className: 'request',
        icon: '🙋',
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

export default function PostCard({
    post,
    courseName,
    showContact = false,
    showActions = false,
    onComplete,
    onDelete,
    isOwn = false,
}) {
    const typeConfig = POST_TYPE_CONFIG[post.type];
    const statusConfig = STATUS_CONFIG[post.status];

    return (
        <article className={`${styles.card} ${styles[`card${typeConfig.className}`]}`}>
            {/* Header */}
            <div className={styles.header}>
                <span className={`${styles.badge} ${styles[`badge${typeConfig.className}`]}`}>
                    {typeConfig.icon} {typeConfig.badge}
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
                    {post.have_section_time && (
                        <span className={styles.sectionTime}>🕐 {post.have_section_time}</span>
                    )}
                </div>

                {post.type === 'swap' && post.want_section && (
                    <>
                        <span className={styles.arrow}>→</span>
                        <div className={styles.sectionGroup}>
                            <span className={styles.sectionLabel}>Want</span>
                            <span className={styles.sectionValue}>Section {post.want_section}</span>
                            {post.want_section_time && (
                                <span className={styles.sectionTime}>🕐 {post.want_section_time}</span>
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
            {showContact && post.profile?.phone && (
                <div className={styles.contactInfo}>
                    <span className={styles.contactLabel}>📞 Contact:</span>
                    <a href={`tel:${post.profile.phone}`} className={styles.contactValue}>
                        {post.profile.phone}
                    </a>
                </div>
            )}

            {/* Footer */}
            <div className={styles.footer}>
                <span className={styles.timestamp}>{formatTimeAgo(post.created_at)}</span>

                {showActions && isOwn && post.status === 'active' && (
                    <div className={styles.actions}>
                        <button
                            onClick={() => onComplete?.(post.id)}
                            className={`${styles.actionBtn} ${styles.completeBtn}`}
                            title="Mark this swap as completed"
                        >
                            ✓ Mark as Swapped
                        </button>
                        <button
                            onClick={() => onDelete?.(post.id)}
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                            title="Cancel and remove this post"
                        >
                            ✕ Cancel Post
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
}
