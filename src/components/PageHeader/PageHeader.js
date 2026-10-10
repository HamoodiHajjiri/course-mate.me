import styles from '@/components/ui/ui.module.css';

/**
 * A page's title block: an optional eyebrow, the title in the display face, a
 * line of context, and actions on the right. Open on the canvas rather than
 * boxed in a card — the title is the page's top, not another panel.
 *
 * The app bar carries the menu and the bell on every screen size, so the
 * header no longer duplicates them. `menu` and `bell` are accepted and ignored
 * for callers that still pass them.
 */
// eslint-disable-next-line no-unused-vars
export default function PageHeader({ title, subtitle, eyebrow, children, menu, bell, left = null, className = '' }) {
    return (
        <header className={`${styles.pageHeader} ${className}`.trim()}>
            <div className={styles.pageHeaderText}>
                {left}
                {eyebrow && <span className={styles.pageEyebrow}>{eyebrow}</span>}
                <h1 className={styles.pageTitle}>{title}</h1>
                {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
            </div>
            {children && <div className={styles.pageActions}>{children}</div>}
        </header>
    );
}
