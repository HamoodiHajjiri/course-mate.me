'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import styles from './status.module.css';

/**
 * Something on a page threw. Say so plainly, offer the retry, and keep the
 * way home. The app bar isn't drawn here: it may be what broke.
 */
export default function Error({ error, reset }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <main className={styles.bare}>
            <section className={styles.status}>
                <span className={`${styles.plate} ${styles.plateDanger}`} aria-hidden="true">!</span>
                <h1 className={styles.title}>This page stopped working.</h1>
                <p className={styles.text}>
                    Something went wrong on our side while it was loading. Trying again usually fixes it; if it doesn&rsquo;t, the rest of CourseMate still works.
                </p>
                <div className={styles.actions}>
                    <Button variant="primary" onClick={() => reset()}>Try again</Button>
                    <Button variant="link" href="/">Go home</Button>
                </div>
                {error?.digest && <p className={styles.digest}>Reference {error.digest}</p>}
                <Link href="/" className={styles.wordmark}>CourseMate</Link>
            </section>
        </main>
    );
}
