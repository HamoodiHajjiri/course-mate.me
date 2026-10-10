'use client';

import { forwardRef, useId, useRef } from 'react';
import { ChevronDownIcon, CloseIcon, SearchIcon } from '@/components/Icons';
import styles from './ui.module.css';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ===== Status and tags ===== */
/**
 * A state, said in words with a square of colour before it. Not a pill: the
 * square carries the colour, the words stay ink.
 *
 * tone: neutral | go (open, free, confirmed) | warn (pending, soon) |
 *       danger (declined, full, conflict) | brand | muted |
 *       swap | giveaway | request
 */
export function Status({ tone = 'neutral', live = false, className = '', children, ...props }) {
    return (
        <span className={cx(styles.status, styles[`status_${tone}`], live && styles.statusLive, className)} {...props}>
            {children}
        </span>
    );
}

/** Older name. `dot` and `icon` are accepted; the square replaces both. */
export function Badge({ tone = 'neutral', size = 'md', dot, icon, className = '', children, ...props }) {
    const map = { accent: 'go', success: 'go', warning: 'warn', info: 'neutral', solid: 'brand' };
    return (
        <Status tone={map[tone] || tone} className={cx(size === 'sm' && styles.statusSm, className)} {...props}>
            {children}
        </Status>
    );
}

/** A small number for navigation and the bell: a square, 9+ past nine. */
export function Count({ value, tone = 'alert', className = '', max = 9 }) {
    if (!value) return null;
    return (
        <span className={cx(styles.count, tone === 'quiet' && styles.countQuiet, tone === 'accent' && styles.countGo, className)}>
            {value > max ? `${max}+` : value}
        </span>
    );
}

/* ===== Choice line ===== */
/**
 * Choosing what to show: a line of words, the chosen one highlighted the way
 * a student marks a printout. Counts sit after each word in mono. Distinct
 * from Tabs, which say where you are; this says what you're looking at.
 *
 * options: [{ value, label, count?, alert?, disabled?, title? }]
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
            className={cx(styles.choices, full && styles.choicesFull, size === 'sm' && styles.choicesSm, className)}
            onKeyDown={onKeyDown}
        >
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
                        className={styles.choice}
                        onClick={() => onChange(opt.value)}
                    >
                        <span className={styles.choiceLabel}>{opt.icon}{opt.label}</span>
                        {opt.count != null && opt.count !== false && (
                            <span className={cx(styles.choiceCount, opt.alert && styles.choiceCountAlert)}>{opt.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/* ===== Fields ===== */
/**
 * Label, control, then hint or error. The error sits under the field it's
 * about and says what to do. Pass the control as children, or a function
 * that receives { id, invalid, describedBy }.
 */
export function Field({ label, optional = false, hint, error, htmlFor, className = '', children, aside }) {
    const autoId = useId();
    const id = htmlFor || autoId;
    return (
        <div className={cx(styles.field, className)}>
            {label && (
                <label htmlFor={id} className={styles.label}>
                    <span>{label}{optional && <span className={styles.labelOptional}>optional</span>}</span>
                    {aside}
                </label>
            )}
            {typeof children === 'function' ? children({ id, invalid: !!error, describedBy: error ? `${id}-error` : hint ? `${id}-hint` : undefined }) : children}
            {error ? (
                <span id={`${id}-error`} className={styles.error} role="alert">{error}</span>
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
    return <textarea ref={ref} className={cx(styles.input, styles.textarea, className)} aria-invalid={invalid || undefined} {...props} />;
});

export const Select = forwardRef(function Select({ size = 'md', invalid, className = '', wrapClassName = '', children, ...props }, ref) {
    return (
        <span className={cx(styles.selectWrap, wrapClassName)}>
            <select
                ref={ref}
                className={cx(styles.input, styles.select, size === 'sm' && styles.inputSm, size === 'lg' && styles.inputLg, className)}
                aria-invalid={invalid || undefined}
                {...props}
            >
                {children}
            </select>
            <ChevronDownIcon className={styles.selectChevron} />
        </span>
    );
});

/** A search box: the glass in front, a clear button once there's text. */
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
            <SearchIcon className={styles.inputLeading} />
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

/** role="switch": a square knob in a square track. `busy` while saving. */
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

/* ===== Structure ===== */
/** A sheet of paper on the page. Use sparingly: most content sits on the page itself. */
export function Card({ as: Tag = 'section', padded = true, interactive = false, className = '', children, ...props }) {
    return (
        <Tag className={cx(styles.card, padded && styles.cardPad, interactive && styles.cardInteractive, className)} {...props}>
            {children}
        </Tag>
    );
}

/**
 * The rubric: how a section of a page begins. A solid ink rule across the
 * column, the section's name under it, and whatever belongs at the right
 * (a count, an action). It replaces the box around a section.
 */
export function Rubric({ title, meta, description, actions, as: Tag = 'h2', id, className = '', quiet = false }) {
    return (
        <div className={cx(styles.rubric, quiet && styles.rubricQuiet, className)}>
            <div className={styles.rubricMain}>
                <Tag id={id} className={styles.rubricTitle}>{title}</Tag>
                {meta != null && meta !== false && <span className={styles.rubricMeta}>{meta}</span>}
                {actions && <div className={styles.rubricActions}>{actions}</div>}
            </div>
            {description && <p className={styles.rubricDescription}>{description}</p>}
        </div>
    );
}

/** Older name for a rubric. */
export function SectionHeader({ title, description, actions, as = 'h2', className = '', id }) {
    return <Rubric title={title} description={description} actions={actions} as={as} id={id} className={className} />;
}

/**
 * A figure that matters: the number in the serif, its unit and label in
 * condensed capitals beneath. For the few numbers a screen is about.
 */
export function Figure({ value, of, label, tone = 'ink', size = 'md', className = '' }) {
    return (
        <span className={cx(styles.figure, styles[`figure_${size}`], styles[`figure_${tone}`], className)}>
            <span className={styles.figureValue}>
                {value}
                {of != null && <span className={styles.figureOf}>/{of}</span>}
            </span>
            {label && <span className={styles.figureLabel}>{label}</span>}
        </span>
    );
}

/* ===== States ===== */
/**
 * Nothing to show. A sentence in the serif saying what's true, a line of
 * what to do about it, and the action as a link. No illustration, no icon in
 * a circle: an empty page should look calm, not decorated.
 */
export function EmptyState({ title, children, actions, compact = false, align = 'start', className = '' }) {
    return (
        <div className={cx(styles.empty, compact && styles.emptyCompact, align === 'center' && styles.emptyCenter, className)}>
            {title && <p className={styles.emptyTitle}>{title}</p>}
            {children && <div className={styles.emptyBody}>{children}</div>}
            {actions && <div className={styles.emptyActions}>{actions}</div>}
        </div>
    );
}

export function Skeleton({ width = '100%', height = 12, className = '', style }) {
    return (
        <span
            className={cx(styles.skeleton, className)}
            style={{ width, height, ...style }}
            aria-hidden="true"
        />
    );
}

export function Spinner({ size = 'md', center = false, label = 'Loading' }) {
    const el = <span className={cx(styles.spinner, size === 'lg' && styles.spinnerLg)} role="status" aria-label={label} />;
    return center ? <div className={styles.spinnerCenter}>{el}</div> : el;
}

/**
 * A note in the margin: a rule in the note's colour down its left edge, the
 * words beside it. For warnings and explanations that belong to a place on
 * the page, not to the whole app.
 *
 * tone: neutral | info | accent | success | warning | danger
 */
export function Callout({ tone = 'neutral', title, action, className = '', children, role }) {
    return (
        <div className={cx(styles.callout, styles[`callout_${tone}`], className)} role={role || (tone === 'danger' ? 'alert' : undefined)}>
            <div className={styles.calloutBody}>
                {title && <strong className={styles.calloutTitle}>{title}</strong>}
                {children}
            </div>
            {action && <div className={styles.calloutAction}>{action}</div>}
        </div>
    );
}

/** Whole-number allowance as cells ("3 of 5 posts"): the shape of a timetable row. */
export function Meter({ value = 0, max = 5, warnAt, label, className = '' }) {
    const segments = Array.from({ length: max }, (_, i) => i < value);
    const warn = warnAt != null && value >= warnAt;
    return (
        <span
            className={cx(styles.meter, warn && styles.meterWarn, className)}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-label={label}
        >
            {segments.map((on, i) => (
                <span key={i} className={cx(styles.meterCell, on && styles.meterCellOn)} />
            ))}
        </span>
    );
}

export function ProgressBar({ value = 0, label, className = '' }) {
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div className={cx(styles.progress, className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
    );
}

export function initialsOf(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/**
 * A person: always a circle (courses are squares). An outline by default;
 * `solid` for the viewer themself.
 */
export function Avatar({ name, size = 32, tone = 'outline', className = '' }) {
    return (
        <span
            className={cx(styles.avatar, tone === 'solid' && styles.avatarSolid, tone === 'neutral' && styles.avatarNeutral, className)}
            style={{ '--avatar': `${size}px` }}
            aria-hidden="true"
        >
            {initialsOf(name)}
        </span>
    );
}
