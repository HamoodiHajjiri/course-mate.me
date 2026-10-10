import styles from './CardSkeleton.module.css';

/** Two stat columns: a big number, a label, a meter — the shape of the cards it stands in for. */
export default function CardSkeleton() {
    return (
        <div className={styles.skeleton} aria-hidden="true">
            {[0, 1].map(i => (
                <div key={i} className={styles.col}>
                    <span className={`${styles.bar} ${styles.value}`} />
                    <span className={`${styles.bar} ${styles.label}`} />
                    <span className={`${styles.bar} ${styles.meter}`} />
                </div>
            ))}
        </div>
    );
}
