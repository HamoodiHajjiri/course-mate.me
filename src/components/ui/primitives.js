'use client';

import { forwardRef, useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { AlertIcon, ChevronDownIcon, CloseIcon, InfoIcon, CheckCircleIcon, SearchIcon } from '@/components/Icons';
import styles from './ui.module.css';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ===== Badge ===== */
/**
 * tone: neutral | accent | success | warning | danger | info | swap |
 *       giveaway | request | solid
 */
export function Badge({ tone = 'neutral', size = 'md', dot = false, icon, className = '', children, ...props }) {
    return (
        <span
            className={cx(styles.badge, tone !== 'neutral' && styles[`tone_${tone}`], size === 'sm' && styles.badgeSm, dot && styles.badgeDot, className)}
            {...props}
        >
            {icon}
            {children}
        </span>
    );
}

/** A small number for navigation, tabs and bells. 9+ past nine. */
export function Count({ value, tone = 'alert', className = '', max = 9 }) {
    if (!value) return null;
    return (
        <span className={cx(styles.count, tone === 'quiet' && styles.countQuiet, tone === 'accent' && styles.countAccent, className)}>
            {value > max ? `${max}+` : value}
        </span>
    );
}

/* ===== Segmented control ===== */
/**
 * options: [{ value, label, icon?, count?, alert?, disabled?, title? }]
 * The selected background slides to the chosen option. Renders as a
 * radiogroup by default, or as a tablist with `as="tabs"`.
 */
export function SegmentedControl({
    options,
    value,
    onChange,
    label,
    size = 'md',
    full = false,
    as = 'radio',
    className = '',
}) {
    const wrapRef = useRef(null);
    const [indicator, setIndicator] = useState(null);

    const measure = useCallback(() => {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const active = wrap.querySelector('[data-active="true"]');
        if (!active) { setIndicator(null); return; }
        setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    }, []);

    useLayoutEffect(() => {
        measure();
        const wrap = wrapRef.current;
        if (!wrap || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(measure);
        ro.observe(wrap);
        return () => ro.disconnect();
    }, [measure, value, options.length]);

    const role = as === 'tabs' ? 'tablist' : 'radiogroup';
    const itemRole = as === 'tabs' ? 'tab' : 'radio';

    const onKeyDown = (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const enabled = options.filter(o => !o.disabled);
        const idx = enabled.findIndex(o => o.value === value);
        const next = enabled[(idx + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
        if (next) {
            e.preventDefault();
            onChange(next.value);
            requestAnimationFrame(() => wrapRef.current?.querySelector('[data-active="true"]')?.focus());
        }
    };

    return (
        <div
            ref={wrapRef}
            role={role}
            aria-label={label}
            className={cx(styles.segmented, full && styles.segmentedFull, size === 'sm' && styles.segmentedSm, className)}
            onKeyDown={onKeyDown}
        >
            {indicator && (
                <span
                    className={styles.segmentIndicator}
                    style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
                    aria-hidden="true"
                />
            )}
            {options.map(opt => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role={itemRole}
                        aria-checked={as === 'tabs' ? undefined : active}
                        aria-selected={as === 'tabs' ? active : undefined}
                        tabIndex={active ? 0 : -1}
                        data-active={active}
                        disabled={opt.disabled}
                        title={opt.title}
                        className={styles.segment}
                        onClick={() => onChange(opt.value)}
                    >
                        {opt.icon}
                        {opt.label}
                        {opt.count != null && opt.count !== false && (
                            <span className={cx(styles.segmentCount, opt.alert && styles.segmentCountAlert)}>{opt.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/* ===== Fields ===== */
/**
 * Label, control, then hint or error — errors sit directly under the field
 * they belong to. Pass the control as children; Field wires the ids.
 */
export function Field({ label, optional = false, hint, error, htmlFor, className = '', children, aside }) {
    const autoId = useId();
    const id = htmlFor || autoId;
    return (
        <div className={cx(styles.field, className)}>
            {label && (
                <label htmlFor={id} className={styles.label}>
                    <span>{label}{optional && <span className={styles.labelOptional}> · optional</span>}</span>
                    {aside}
                </label>
            )}
            {typeof children === 'function' ? children({ id, invalid: !!error, describedBy: error ? `${id}-error` : hint ? `${id}-hint` : undefined }) : children}
            {error ? (
                <span id={`${id}-error`} className={styles.error} role="alert">
                    <AlertIcon />
                    {error}
                </span>
            ) : hint ? (
                <span id={`${id}-hint`} className={styles.hint}>{hint}</span>
            ) : null}
        </div>
    );
}

export const Input = forwardRef(function Input({ size = 'md', mono = false, invalid, className = '', ...props }, ref) {
    return (
        <input
            ref={ref}
            className={cx(styles.input, size === 'sm' && styles.inputSm, size === 'lg' && styles.inputLg, mono && styles.mono, className)}
            aria-invalid={invalid || undefined}
            {...props}
        />
    );
});

export const Textarea = forwardRef(function Textarea({ invalid, className = '', ...props }, ref) {
    return <textarea ref={ref} className={cx(styles.input, className)} aria-invalid={invalid || undefined} {...props} />;
});

export const Select = forwardRef(function Select({ size = 'md', invalid, className = '', wrapClassName = '', children, ...props }, ref) {
    return (
        <span className={cx(styles.selectWrap, wrapClassName)}>
            <select
                ref={ref}
                className={cx(styles.input, size === 'sm' && styles.inputSm, size === 'lg' && styles.inputLg, className)}
                aria-invalid={invalid || undefined}
                {...props}
            >
                {children}
            </select>
            <ChevronDownIcon className={styles.selectChevron} />
        </span>
    );
});

/** A search box with its icon, and a clear button once there is text. */
export const SearchInput = forwardRef(function SearchInput({
    value,
    onChange,
    onClear,
    size = 'md',
    className = '',
    wrapClassName = '',
    trailing,
    ...props
}, ref) {
    const innerRef = useRef(null);
    const setRefs = (el) => {
        innerRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
    };
    const clear = () => {
        if (onClear) onClear();
        else onChange?.({ target: { value: '' } });
        innerRef.current?.focus();
    };
    const hasText = !!(value && String(value).length);
    return (
        <span className={cx(styles.inputWrap, wrapClassName)}>
            <input
                ref={setRefs}
                type="search"
                value={value}
                onChange={onChange}
                className={cx(
                    styles.input,
                    size === 'lg' && styles.inputLg,
                    size === 'sm' && styles.inputSm,
                    styles.withLeading,
                    (hasText || trailing) && styles.withTrailing,
                    className,
                )}
                {...props}
            />
            <SearchIcon className={cx(styles.inputLeading, size === 'lg' && styles.inputLeadingLg)} />
            {(hasText || trailing) && (
                <span className={styles.inputTrailing}>
                    {hasText ? (
                        <button type="button" className={styles.clearBtn} onClick={clear} aria-label="Clear search">
                            <CloseIcon />
                        </button>
                    ) : trailing}
                </span>
            )}
        </span>
    );
});

export function Checkbox({ label, className = '', children, ...props }) {
    return (
        <label className={cx(styles.checkboxRow, className)}>
            <input type="checkbox" className={styles.checkbox} {...props} />
            <span>{label ?? children}</span>
        </label>
    );
}

/** role="switch". `busy` shows a spinning knob while a save is in flight. */
export function Switch({ checked, onChange, disabled = false, busy = false, label, className = '', ...props }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={!!checked}
            aria-label={label}
            aria-busy={busy || undefined}
            disabled={disabled}
            className={cx(styles.switch, busy && styles.switchBusy, className)}
            onClick={() => !busy && onChange?.(!checked)}
            {...props}
        />
    );
}

export function Kbd({ children }) {
    return <kbd className={styles.kbd}>{children}</kbd>;
}

/* ===== Surfaces ===== */
export function Card({ as: Tag = 'section', padded = true, interactive = false, className = '', children, ...props }) {
    return (
        <Tag className={cx(styles.card, padded && styles.cardPad, interactive && styles.cardInteractive, className)} {...props}>
            {children}
        </Tag>
    );
}

export function SectionHeader({ title, description, icon, overline = false, actions, as: Tag = 'h2', className = '', id }) {
    return (
        <div className={cx(styles.sectionHeader, className)}>
            <div className={styles.sectionHeaderText}>
                <Tag id={id} className={overline ? styles.overline : styles.sectionTitle}>
                    {icon}
                    {title}
                </Tag>
                {description && <p className={styles.sectionDescription}>{description}</p>}
            </div>
            {actions && <div className={styles.sectionActions}>{actions}</div>}
        </div>
    );
}

/* ===== States ===== */
/**
 * What happened, whether it's normal, and what to do next — in that order.
 * `tone="neutral"` for states that aren't an invitation (nothing matches).
 */
export function EmptyState({ icon, title, children, actions, compact = false, align = 'center', tone = 'accent', className = '' }) {
    return (
        <div className={cx(styles.empty, compact && styles.emptyCompact, align === 'start' && styles.emptyStart, className)}>
            {icon && <span className={cx(styles.emptyIcon, tone === 'neutral' && styles.emptyIconNeutral)} aria-hidden="true">{icon}</span>}
            {title && <p className={styles.emptyTitle}>{title}</p>}
            {children && <div className={styles.emptyBody}>{children}</div>}
            {actions && <div className={styles.emptyActions}>{actions}</div>}
        </div>
    );
}

export function Skeleton({ width = '100%', height = 14, radius, className = '', style }) {
    return (
        <span
            className={cx(styles.skeleton, className)}
            style={{ width, height, borderRadius: radius, ...style }}
            aria-hidden="true"
        />
    );
}

export function Spinner({ size = 'md', center = false, label = 'Loading' }) {
    const el = <span className={cx(styles.spinner, size === 'lg' && styles.spinnerLg)} role="status" aria-label={label} />;
    return center ? <div className={styles.spinnerCenter}>{el}</div> : el;
}

const CALLOUT_ICONS = {
    info: InfoIcon,
    accent: InfoIcon,
    neutral: InfoIcon,
    success: CheckCircleIcon,
    warning: AlertIcon,
    danger: AlertIcon,
};

export function Callout({ tone = 'neutral', title, icon, action, className = '', children, role }) {
    const Icon = CALLOUT_ICONS[tone] || InfoIcon;
    return (
        <div className={cx(styles.callout, tone !== 'neutral' && styles[`callout_${tone}`], className)} role={role || (tone === 'danger' ? 'alert' : undefined)}>
            {icon === false ? null : (icon || <Icon />)}
            <div className={styles.calloutBody}>
                {title && <strong className={styles.calloutTitle}>{title}</strong>}
                {children}
            </div>
            {action && <div className={styles.calloutAction}>{action}</div>}
        </div>
    );
}

/** Segmented meter for small whole numbers ("2 of 5 posts"). */
export function Meter({ value = 0, max = 5, warnAt, label, className = '' }) {
    const segments = Array.from({ length: max }, (_, i) => i < value);
    const warn = warnAt != null && value >= warnAt;
    return (
        <div
            className={cx(styles.meter, warn && styles.meterWarn, className)}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-label={label}
        >
            {segments.map((on, i) => (
                <span key={i} className={cx(styles.meterSegment, on && styles.meterSegmentOn)} />
            ))}
        </div>
    );
}

export function ProgressBar({ value = 0, label, className = '' }) {
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div className={cx(styles.meterTrack, className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
            <div className={styles.meterFill} style={{ width: `${pct}%` }} />
        </div>
    );
}

export function initialsOf(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, size = 32, tone = 'accent', className = '' }) {
    return (
        <span
            className={cx(styles.avatar, tone === 'neutral' && styles.avatarNeutral, tone === 'solid' && styles.avatarSolid, className)}
            style={{ '--avatar': `${size}px` }}
            aria-hidden="true"
        >
            {initialsOf(name)}
        </span>
    );
}
