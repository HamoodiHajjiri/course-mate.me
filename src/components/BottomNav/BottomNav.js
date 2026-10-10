'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useUnreadCount from '@/lib/useUnreadCount';
import { useIsGuest, refuse } from '@/lib/guest';
import { NAV_ITEMS, isActiveRoute } from '@/components/TopBar/TopBar';
import { PlusIcon, LockIcon } from '../Icons';
import styles from './BottomNav.module.css';

/**
 * The phone and tablet tab bar (hidden from 1024px, where the app bar carries
 * the destinations). A ruled band on the bottom edge, like the app bar on the
 * top: the current tab gets an ink rule along the bar's top line. New post
 * sits in the middle as the bar's one filled square.
 */
export default function BottomNav() {
    const pathname = usePathname();
    const unread = useUnreadCount('activity');
    const postActive = isActiveRoute(pathname, '/post');
    const isGuest = useIsGuest();

    const renderItem = (item) => {
        const Icon = item.icon;
        const isActive = isActiveRoute(pathname, item.href);
        const badge = item.href === '/matches' ? unread : 0;

        if (isGuest && item.account) {
            return (
                <button
                    key={item.href}
                    type="button"
                    className={`${styles.item} ${styles.locked}`}
                    onClick={refuse}
                    aria-disabled="true"
                    aria-label={`${item.label}, needs an account`}
                >
                    <span className={styles.icon}>
                        <Icon />
                        <LockIcon className={styles.lock} />
                    </span>
                    <span className={styles.label}>{item.label}</span>
                </button>
            );
        }

        return (
            <Link
                key={item.href}
                href={item.href}
                className={`${styles.item} ${isActive ? styles.active : ''}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={badge > 0 ? `${item.label}, ${badge} new` : undefined}
            >
                <span className={styles.icon}>
                    <Icon />
                    {badge > 0 && <span className={styles.badge}>{badge > 9 ? '9+' : badge}</span>}
                </span>
                <span className={styles.label}>{item.label}</span>
            </Link>
        );
    };

    const [home, browse, schedule, activity] = NAV_ITEMS;

    return (
        <nav className={styles.bar} aria-label="Main">
            <div className={styles.inner}>
                {renderItem(home)}
                {renderItem(browse)}

                <div className={styles.postSlot}>
                    {isGuest ? (
                        <button
                            type="button"
                            className={`${styles.post} ${styles.postLocked}`}
                            onClick={refuse}
                            aria-disabled="true"
                            aria-label="New post, needs an account"
                        >
                            <LockIcon />
                        </button>
                    ) : (
                        <Link
                            href="/post"
                            className={`${styles.post} ${postActive ? styles.postActive : ''}`}
                            aria-label="New post"
                            aria-current={postActive ? 'page' : undefined}
                        >
                            <PlusIcon strokeWidth={1.75} />
                        </Link>
                    )}
                </div>

                {renderItem(schedule)}
                {renderItem(activity)}
            </div>
        </nav>
    );
}
