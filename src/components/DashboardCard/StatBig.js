import styles from './StatBig.module.css';

/**
 * A headline number with its label. `max` shows it as "2 / 5"; `children`
 * renders under the label (a meter, a note).
 *   tone  accent | muted | warning | default
 */
export default function StatBig({ value, max, label, sub, tone = 'default', children }) {
    return (
        <div className={styles.stat}>
            <span className={styles.label}>{label}</span>
            <div className={styles.valueRow}>
                <span className={`${styles.value} ${styles[`tone_${tone}`] || ''}`}>{value}</span>
                {max !== undefined && max !== null && <span className={styles.max}>/ {max}</span>}
            </div>
            {children}
            {sub && <span className={styles.sub}>{sub}</span>}
        </div>
    );
}
