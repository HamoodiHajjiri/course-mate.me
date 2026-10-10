'use client';

import Link from 'next/link';
import { LockIcon, ArrowRightIcon } from '../Icons';
import { SIGN_UP_HREF } from '@/lib/guest';
import CardSkeleton from './CardSkeleton';
import styles from './DashboardCard.module.css';

/**
 * A dashboard panel: a quiet header (icon, title, one link out) over a body.
 *
 *   loading  skeleton shaped like the content (pass `skeleton` to override)
 *   empty    a short sentence in place of the body
 *   locked   guest mode — the content stays, dimmed under a lock and a reason,
 *            with the way to sign up
 */
export default function DashboardCard({
    title,
    icon,
    actionLabel,
    actionHref,
    onAction,
    loading = false,
    skeleton,
    empty,
    className = '',
    bodyClassName = '',
    style,
    headerExtra,
    locked,
    children,
}) {
    const actionEl = !locked && actionLabel && (actionHref ? (
        <Link href={actionHref} className={styles.action}>
            {actionLabel}
            <ArrowRightIcon />
        </Link>
    ) : onAction ? (
        <button type="button" className={styles.action} onClick={onAction}>
            {actionLabel}
            <ArrowRightIcon />
        </button>
    ) : null);

    return (
        <section className={`${styles.card} ${className}`} style={style}>
            {(title || icon || actionEl || headerExtra) && (
                <header className={styles.header}>
                    <div className={styles.titleRow}>
                        {icon && <span className={styles.icon}>{icon}</span>}
                        {title && <h2 className={styles.title}>{title}</h2>}
                    </div>
                    {headerExtra}
                    {actionEl}
                </header>
            )}
            <div className={`${styles.body} ${bodyClassName}`}>
                {locked ? (
                    <div className={styles.locked}>
                        <div className={styles.lockedContent} aria-hidden="true">{children}</div>
                        <div className={styles.lockOverlay}>
                            <span className={styles.lockBadge}><LockIcon /></span>
                            <span className={styles.lockText}>{locked}</span>
                            <Link href={SIGN_UP_HREF} className={styles.lockLink}>
                                Create a free account
                            </Link>
                        </div>
                    </div>
                ) : loading ? (skeleton || <CardSkeleton />) : empty ? <div className={styles.empty}>{empty}</div> : children}
            </div>
        </section>
    );
}
