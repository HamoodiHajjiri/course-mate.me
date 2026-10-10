'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from '@/components/ThemeToggle';
import overviewTab from './tabs/OverviewTab';
import usersTab from './tabs/UsersTab';
import postsTab from './tabs/PostsTab';
import semestersTab from './tabs/SemestersTab';
import majorsTab from './tabs/MajorsTab';
import coursesTab from './tabs/CoursesTab';
import roomsTab from './tabs/RoomsTab';
import announcementsTab from './tabs/AnnouncementsTab';
import mapTab from './tabs/MapTab';
import styles from './admin.module.css';

// Grouped by the job each section is for, not alphabetically.
const GROUPS = [
    {
        label: 'People and activity',
        tabs: [
            { id: 'overview', label: 'Overview', note: 'How the platform is being used', module: overviewTab },
            { id: 'users', label: 'Users', note: 'Students, their details and saved schedules', module: usersTab },
            { id: 'posts', label: 'Posts', note: 'Everything on the board, any status', module: postsTab },
            { id: 'announcements', label: 'Announcements', note: 'Notices shown to students on Home', module: announcementsTab },
        ],
    },
    {
        label: 'Catalogue',
        tabs: [
            { id: 'semesters', label: 'Semesters', note: 'Terms, which are live, registration windows', module: semestersTab },
            { id: 'majors', label: 'Majors', note: 'Majors and the courses in each plan', module: majorsTab },
            { id: 'courses', label: 'Courses', note: 'The course list and its details', module: coursesTab },
        ],
    },
    {
        label: 'Campus',
        tabs: [
            { id: 'rooms', label: 'Rooms', note: 'Every room’s week, and which are free', module: roomsTab },
            { id: 'map', label: 'Map', note: 'Places on the campus map', module: mapTab },
        ],
    },
];

const TABS = GROUPS.flatMap(g => g.tabs);

/**
 * The admin: operations, not a page of the student app. A dark rail of
 * sections grouped by job, then each section's tools beside its data.
 */
export default function AdminClient() {
    const [active, setActive] = useState('overview');
    const activeTab = TABS.find(t => t.id === active);
    const { Provider, Sidebar, Main } = activeTab.module;

    return (
        <div className={styles.page}>
            <aside className={styles.rail}>
                <div className={styles.railBrand}>
                    <Image src="/logo.png" alt="" width={48} height={48} className={styles.railLogo} />
                    <span className={styles.railName}>CourseMate</span>
                    <span className={styles.railRole}>Admin</span>
                </div>

                <nav className={styles.railNav} aria-label="Admin sections">
                    {GROUPS.map(g => (
                        <div key={g.label} className={styles.railGroup}>
                            <span className={styles.railGroupLabel}>{g.label}</span>
                            {g.tabs.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={styles.railItem}
                                    aria-current={active === t.id ? 'page' : undefined}
                                    onClick={() => setActive(t.id)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className={styles.railFoot}>
                    <ThemeToggle compact />
                    <Link href="/" className={styles.exit}>Exit to CourseMate →</Link>
                </div>
            </aside>

            <div className={styles.content}>
                <header className={styles.contentHead}>
                    <h1 className={styles.contentTitle}>{activeTab.label}</h1>
                    <p className={styles.contentNote}>{activeTab.note}</p>
                </header>

                <Provider>
                    <div className={styles.workspace}>
                        <aside className={styles.sidebar}>
                            <Sidebar />
                        </aside>
                        <main className={styles.mainContent}>
                            <Main />
                        </main>
                    </div>
                </Provider>
            </div>
        </div>
    );
}
