import React from 'react';

// Common props for all icons
const defaultProps = {
    width: 24,
    height: 24,
    strokeWidth: 2,
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "lucide-icon"
};

// Helper to merge props with defaults and apply theme colors
// Uses CSS variable --icon-color which we can set in globals.css
// Or falls back to 'currentColor' to inherit from parent
const IconWrapper = ({ children, color, ...props }) => {
    const mergedProps = { ...defaultProps, ...props };
    // If color is provided directly, use it. Otherwise use CSS variable or currentColor
    const strokeColor = color || "var(--icon-color, currentColor)";

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            stroke={strokeColor}
            {...mergedProps}
        >
            {children}
        </svg>
    );
};

export const HomeIcon = (props) => (
    <IconWrapper {...props}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
    </IconWrapper>
);

export const SwapIcon = (props) => (
    <IconWrapper {...props}>
        <path d="M16 3l4 4-4 4" />
        <path d="M20 7H4" />
        <path d="M8 21l-4-4 4-4" />
        <path d="M4 17h16" />
    </IconWrapper>
);

export const ProfileIcon = (props) => (
    <IconWrapper {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </IconWrapper>
);

export const NotificationIcon = (props) => (
    <IconWrapper {...props}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </IconWrapper>
);

export const SearchIcon = (props) => (
    <IconWrapper {...props}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </IconWrapper>
);

export const ScheduleIcon = (props) => (
    <IconWrapper {...props}>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </IconWrapper>
);

export const LogoutIcon = (props) => (
    <IconWrapper {...props}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </IconWrapper>
);

export const PlusIcon = (props) => (
    <IconWrapper {...props}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </IconWrapper>
);
