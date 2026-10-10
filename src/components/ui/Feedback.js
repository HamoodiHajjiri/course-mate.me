'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, CloseIcon, InfoIcon } from '@/components/Icons';
import Dialog from './Dialog';
import Button from './Button';
import styles from './ui.module.css';

const FeedbackContext = createContext(null);

/**
 * App-wide confirmation dialogs and toasts, replacing the browser's own
 * confirm() and alert() boxes, which looked like a different product and
 * couldn't say which action was the dangerous one.
 *
 *   const confirm = useConfirm();
 *   if (!await confirm({ title, body, confirmLabel, tone: 'danger' })) return;
 *
 *   const toast = useToast();
 *   toast.success('Post cancelled');  toast.error('Could not save');
 */
export function FeedbackProvider({ children }) {
    const [request, setRequest] = useState(null);
    const resolver = useRef(null);
    const [toasts, setToasts] = useState([]);
    const [mounted, setMounted] = useState(false);
    const seq = useRef(0);

    useEffect(() => { setMounted(true); }, []);

    const confirm = useCallback((options) => new Promise(resolve => {
        resolver.current = resolve;
        setRequest(options || {});
    }), []);

    const settle = (answer) => {
        resolver.current?.(answer);
        resolver.current = null;
        setRequest(null);
    };

    const dismiss = useCallback((id) => {
        setToasts(list => list.map(t => (t.id === id ? { ...t, leaving: true } : t)));
        setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 200);
    }, []);

    const push = useCallback((tone, message, { duration = 3200 } = {}) => {
        const id = ++seq.current;
        setToasts(list => [...list.slice(-2), { id, tone, message }]);
        setTimeout(() => dismiss(id), duration);
        return id;
    }, [dismiss]);

    const value = useMemo(() => ({
        confirm,
        toast: {
            success: (m, o) => push('success', m, o),
            error: (m, o) => push('error', m, { duration: 5200, ...o }),
            info: (m, o) => push('info', m, o),
        },
    }), [confirm, push]);

    return (
        <FeedbackContext.Provider value={value}>
            {children}

            <Dialog
                open={!!request}
                onClose={() => settle(false)}
                title={request?.title}
                description={request?.body}
                hideClose
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => settle(false)}>
                            {request?.cancelLabel || 'Cancel'}
                        </Button>
                        <Button
                            variant={request?.tone === 'danger' ? 'danger' : 'primary'}
                            onClick={() => settle(true)}
                            data-autofocus
                        >
                            {request?.confirmLabel || 'Confirm'}
                        </Button>
                    </>
                )}
            >
                {request?.details || null}
            </Dialog>

            {mounted && createPortal(
                <div className={styles.toastRegion} role="status" aria-live="polite">
                    {toasts.map(t => (
                        <div key={t.id} className={`${styles.toast} ${styles[`toast_${t.tone}`] || ''} ${t.leaving ? styles.toastLeaving : ''}`}>
                            <span className={styles.toastIcon} aria-hidden="true">
                                {t.tone === 'success' ? <CheckIcon strokeWidth={2.5} /> : t.tone === 'error' ? <CloseIcon strokeWidth={2.5} /> : <InfoIcon strokeWidth={2.25} />}
                            </span>
                            <span>{t.message}</span>
                        </div>
                    ))}
                </div>,
                document.body,
            )}
        </FeedbackContext.Provider>
    );
}

const fallback = {
    confirm: async (o) => (typeof window !== 'undefined' ? window.confirm(o?.title || 'Are you sure?') : false),
    toast: { success: () => {}, error: (m) => { if (typeof window !== 'undefined') window.alert(m); }, info: () => {} },
};

export function useConfirm() {
    return (useContext(FeedbackContext) || fallback).confirm;
}

export function useToast() {
    return (useContext(FeedbackContext) || fallback).toast;
}
