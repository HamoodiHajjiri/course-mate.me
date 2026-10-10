'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import styles from './ui.module.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * The one button.
 *
 *   variant  primary | secondary | ghost | soft | danger | dangerGhost
 *   size     sm | md | lg
 *   href     renders a Next link with the same look
 *   icon     leading icon; with no children the button is icon-only and
 *            must have an aria-label
 *   loading  keeps the width, swaps the label for a spinner, sets aria-busy
 */
const Button = forwardRef(function Button({
    variant = 'secondary',
    size = 'md',
    href,
    icon,
    trailingIcon,
    loading = false,
    block = false,
    className = '',
    children,
    type = 'button',
    disabled,
    ...props
}, ref) {
    const iconOnly = !children && !!icon;
    const classes = cx(
        styles.btn,
        styles[variant],
        size !== 'md' && styles[size],
        iconOnly && styles.iconOnly,
        block && styles.block,
        className,
    );

    // While loading the label stays in the layout (so the button keeps its
    // width) but is hidden under a centred spinner.
    const content = loading ? (
        <>
            <span className={styles.btnLabelHidden} style={{ display: 'inline-flex', alignItems: 'center', gap: 'inherit' }}>
                {icon}
                {children}
                {trailingIcon}
            </span>
            <span className={styles.btnSpinnerOverlay} aria-hidden="true">
                <span className={styles.btnSpinner} />
            </span>
        </>
    ) : (
        <>
            {icon}
            {children}
            {trailingIcon}
        </>
    );

    if (href && !disabled) {
        return (
            <Link ref={ref} href={href} className={classes} aria-busy={loading || undefined} {...props}>
                {content}
            </Link>
        );
    }

    return (
        <button
            ref={ref}
            type={type}
            className={classes}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...props}
        >
            {content}
        </button>
    );
});

export default Button;
