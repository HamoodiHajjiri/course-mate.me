'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';

import { HomeIcon, SwapIcon, ProfileIcon, ScheduleIcon, PlusIcon } from '../Icons';

export default function BottomNav() {
    const pathname = usePathname();

    const navItems = [
        { href: '/', icon: <HomeIcon />, label: 'Home' },
        { href: '/schedule', icon: <ScheduleIcon />, label: 'Schedule' },
        { href: '/post', icon: <PlusIcon />, label: 'Post' },
        { href: '/matches', icon: <SwapIcon />, label: 'Activity' },
        { href: '/profile', icon: <ProfileIcon />, label: 'Profile' },
    ];

    return (
        <nav className={styles.bottomNav}>
            {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <Link key={item.href} href={item.href} className={`${styles.navItem} ${isActive ? styles.active : ''}`}>
                        <span className={styles.navIcon}>
                            {item.icon}
                        </span>
                        <span className={styles.navLabel}>{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
