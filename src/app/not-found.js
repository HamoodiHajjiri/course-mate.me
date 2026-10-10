import Link from 'next/link';
import PageShell from '@/components/PageShell';
import styles from './status.module.css';

/** A wrong address, told the way the campus would: there's no such room. */
export default function NotFound() {
    return (
        <PageShell width="reading">
            <section className={styles.status}>
                <span className={styles.plate} aria-hidden="true">404</span>
                <h1 className={styles.title}>There&rsquo;s no room by that number.</h1>
                <p className={styles.text}>
                    The page you followed doesn&rsquo;t exist, or it has moved. These do:
                </p>
                <ul className={styles.links}>
                    <li><Link href="/">Home<span>Today, and what needs you</span></Link></li>
                    <li><Link href="/schedule">Schedule<span>Build a week that fits</span></Link></li>
                    <li><Link href="/map">Campus map<span>Every building and room</span></Link></li>
                </ul>
            </section>
        </PageShell>
    );
}
