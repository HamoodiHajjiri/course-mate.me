'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '@/components/Icons';
import Button from './Button';
import styles from './ui.module.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The only modal surface. Centred on desktop, a bottom sheet on phones.
 *
 * Escape and the scrim close it (unless `dismissible` is false, e.g. while
 * saving), focus moves in on open and back to the opener on close, Tab stays
 * inside, and the page behind stops scrolling.
 *
 *   size    sm (440) | md (560) | lg (760) | xl (960)
 *   footer  actions, laid out right-aligned
 */
export default function Dialog({
    open,
    onClose,
    title,
    description,
    size = 'sm',
    footer,
    dismissible = true,
    hideClose = false,
    initialFocus,
    className = '',
    bodyClassName = '',
    children,
}) {
    const [mounted, setMounted] = useState(false);
    const panelRef = useRef(null);
    const returnTo = useRef(null);
    const titleId = useId();
    const descId = useId();

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!open) return undefined;
        returnTo.current = document.activeElement;
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';

        const frame = requestAnimationFrame(() => {
            const panel = panelRef.current;
            if (!panel) return;
            const target = (initialFocus && panel.querySelector(initialFocus)) || panel.querySelector('[data-autofocus]') || panel.querySelector(FOCUSABLE);
            (target || panel).focus();
        });

        const onKey = (e) => {
            if (e.key === 'Escape' && dismissible) {
                e.stopPropagation();
                onClose?.();
                return;
            }
            if (e.key !== 'Tab') return;
            const panel = panelRef.current;
            if (!panel) return;
            const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKey, true);

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', onKey, true);
            document.body.style.overflow = overflow;
            if (returnTo.current && typeof returnTo.current.focus === 'function') returnTo.current.focus();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, dismissible]);

    if (!mounted || !open) return null;

    const sizeClass = size === 'md' ? styles.dialogMd : size === 'lg' ? styles.dialogLg : size === 'xl' ? styles.dialogXl : '';

    return createPortal(
        <div
            className={styles.scrim}
            onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose?.(); }}
        >
            <div
                ref={panelRef}
                className={cx(styles.dialog, sizeClass, className)}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                aria-describedby={description ? descId : undefined}
                tabIndex={-1}
            >
                <span className={styles.sheetHandle} aria-hidden="true" />
                {(title || !hideClose) && (
                    <div className={styles.dialogHeader}>
                        <div className={styles.dialogHeaderText}>
                            {title && <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>}
                            {description && <p id={descId} className={styles.dialogDescription}>{description}</p>}
                        </div>
                        {!hideClose && (
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={<CloseIcon />}
                                onClick={onClose}
                                disabled={!dismissible}
                                aria-label="Close"
                            />
                        )}
                    </div>
                )}
                <div className={cx(styles.dialogBody, bodyClassName)}>{children}</div>
                {footer && <div className={styles.dialogFooter}>{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}
