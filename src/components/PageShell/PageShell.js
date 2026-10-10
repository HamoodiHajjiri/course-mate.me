import BottomNav from '@/components/BottomNav';
import TopBar from '@/components/TopBar';
import styles from './PageShell.module.css';

/**
 * The frame every page sits in: the app bar, a centred column, the tab bar.
 *
 *   width   reading (760) — inboxes and single-task pages
 *           standard (1040) — default; pages with a side rail
 *           wide (1200) — dashboards, the feed, the map, the schedule builder
 *
 * Pass nav={false} for states that render before navigation means anything
 * (the profile-setup gate), and innerClassName when a page needs to change the
 * column's own layout.
 */
export default function PageShell({
    children,
    width = 'standard',
    nav = true,
    className = '',
    innerClassName = '',
}) {
    return (
        <div className={`${styles.page} ${nav ? styles.withNav : ''} ${className}`.trim()}>
            {nav && <TopBar />}
            <main className={styles.main} id="main">
                <div className={`${styles.inner} ${styles[width] || ''} ${innerClassName}`.trim()}>
                    {children}
                </div>
            </main>
            {nav && <BottomNav />}
        </div>
    );
}
