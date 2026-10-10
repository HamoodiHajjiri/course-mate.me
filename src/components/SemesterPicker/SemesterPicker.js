'use client';

import { useEffect, useRef, useState } from 'react';
import { useSemester } from '@/lib/SemesterContext';
import { CheckIcon, ChevronDownIcon, ScheduleIcon } from '@/components/Icons';
import styles from './SemesterPicker.module.css';

/**
 * Term switcher: a chip that opens a short list.
 *
 * Works for any number of active semesters and renders nothing when there is
 * nothing to choose between.
 */
export default function SemesterPicker({ align = 'right' }) {
    const { semesters, selectedTerm, setSelectedTerm } = useSemester();
    const [open, setOpen] = useState(false);
    const triggerRef = useRef(null);
    const wrapRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const items = [...(listRef.current?.querySelectorAll('button') || [])];
                const idx = items.indexOf(document.activeElement);
                const next = items[(idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
                next?.focus();
            }
        };
        const onPointerDown = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('touchstart', onPointerDown);
        requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.focus());
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('touchstart', onPointerDown);
        };
    }, [open]);

    if (!semesters || semesters.length <= 1) return null;

    const current = semesters.find(s => s.term_code === selectedTerm);

    return (
        <div className={styles.wrap} ref={wrapRef}>
            <button
                type="button"
                ref={triggerRef}
                className={styles.chip}
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={`Semester: ${current?.name || 'select'}`}
            >
                <ScheduleIcon className={styles.calendar} />
                <span className={styles.chipLabel}>{current?.name || 'Select semester'}</span>
                <ChevronDownIcon className={styles.chevron} />
            </button>

            {open && (
                <ul ref={listRef} className={`${styles.menu} ${align === 'left' ? styles.menuLeft : ''}`} role="listbox" aria-label="Semester">
                    <li className={styles.menuLabel} role="presentation">Semester</li>
                    {semesters.map(sem => {
                        const isSelected = sem.term_code === selectedTerm;
                        return (
                            <li key={sem.term_code} role="none">
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    className={`${styles.option} ${isSelected ? styles.selected : ''}`}
                                    onClick={() => {
                                        setSelectedTerm(sem.term_code);
                                        setOpen(false);
                                        triggerRef.current?.focus();
                                    }}
                                >
                                    {sem.name}
                                    {isSelected && <CheckIcon className={styles.check} strokeWidth={2.25} />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
