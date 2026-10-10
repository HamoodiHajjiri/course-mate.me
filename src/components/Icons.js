import React from 'react';

/**
 * CourseMate's icons: drawn like the rest of the product, with square ends
 * and mitred corners at a 1.5 stroke, so they sit with the ruled lines and
 * square course marks rather than looking borrowed from a library. They take
 * their colour from the text around them. Icons are used sparingly: where a
 * word does the job, the word wins.
 *
 * Size with `size` (default 18).
 */
const IconWrapper = ({ children, size, width, height, strokeWidth = 1.5, className, ...props }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={width ?? size ?? 18}
        height={height ?? size ?? 18}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden="true"
        focusable="false"
        className={className}
        {...props}
    >
        {children}
    </svg>
);

const icon = (paths) => function Icon(props) {
    return <IconWrapper {...props}>{paths}</IconWrapper>;
};

/* ----- Navigation ----- */
export const HomeIcon = icon(<>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6v5.5H5.5A1.5 1.5 0 0 1 4 19z" />
</>);

export const SearchIcon = icon(<>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
</>);

export const ScheduleIcon = icon(<>
    <rect x="3.5" y="5" width="17" height="15.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
</>);

export const ActivityIcon = icon(<>
    <path d="M17 3.5 20.5 7 17 10.5" />
    <path d="M20.5 7H9" />
    <path d="M7 20.5 3.5 17 7 13.5" />
    <path d="M3.5 17H15" />
</>);

export const BellIcon = icon(<>
    <path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9" />
    <path d="M10.3 20.5a2 2 0 0 0 3.4 0" />
</>);

export const NotificationIcon = BellIcon;

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);

export const MenuIcon = icon(<path d="M4 7h16M4 12h16M4 17h16" />);

/* ----- People & account ----- */
export const ProfileIcon = icon(<>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
</>);

export const UserCheckIcon = icon(<>
    <circle cx="9.5" cy="8" r="3.75" />
    <path d="M2.5 20c1-3.3 3.6-5 7-5 1.6 0 3 .4 4.1 1.1" />
    <path d="m15.5 17.5 2 2 4-4" />
</>);

export const UsersIcon = icon(<>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.9-3.2 3.3-5 6.5-5s5.6 1.8 6.5 5" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 15.3c1.5.7 2.5 2.3 3 4.7" />
</>);

export const LogoutIcon = icon(<>
    <path d="M9.5 20.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5h3.5" />
    <path d="m15.5 16.5 4.5-4.5-4.5-4.5M20 12H9" />
</>);

export const LoginIcon = icon(<>
    <path d="M14.5 3.5H18A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5h-3.5" />
    <path d="m9.5 16.5 4.5-4.5-4.5-4.5M14 12H3.5" />
</>);

export const LockIcon = icon(<>
    <rect x="4.5" y="10.5" width="15" height="10" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
</>);

export const ShieldIcon = icon(<>
    <path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.8-7 9-4.1-1.2-7-4.6-7-9V6z" />
    <path d="m9 12 2 2 4-4" />
</>);

export const PhoneIcon = icon(<>
    <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4" />
</>);

export const MailIcon = icon(<>
    <rect x="3" y="5" width="18" height="14" />
    <path d="m3.5 7 8.5 6 8.5-6" />
</>);

export const IdIcon = icon(<>
    <rect x="3" y="5" width="18" height="14" />
    <circle cx="9" cy="11" r="2" />
    <path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14.5 10h3.5M14.5 13.5H17" />
</>);

/* ----- Posts ----- */
export const SwapIcon = ActivityIcon;

export const GiftIcon = icon(<>
    <rect x="3.5" y="8" width="17" height="4" />
    <path d="M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12M12 8v13" />
    <path d="M12 8S10.5 3.5 8 3.5a2.25 2.25 0 0 0 0 4.5zM12 8s1.5-4.5 4-4.5a2.25 2.25 0 0 1 0 4.5z" />
</>);

export const HandIcon = icon(<>
    <path d="M7.5 12V6a1.5 1.5 0 0 1 3 0v5M10.5 11V4.5a1.5 1.5 0 0 1 3 0V11M13.5 11V6a1.5 1.5 0 0 1 3 0v6" />
    <path d="M16.5 10a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-.6a7 7 0 0 1-5.4-2.6L3.6 15a1.6 1.6 0 0 1 2.4-2.1L7.5 14.5V12" />
</>);

export const PostIcon = icon(<>
    <path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9z" />
    <path d="M14 3.5V9h5.5M8.5 13h7M8.5 16.5H13" />
</>);

/* ----- Academic ----- */
export const BookIcon = icon(<>
    <path d="M4.5 18.5V5.5A2 2 0 0 1 6.5 3.5h13v14H6.5a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13" />
    <path d="M8.5 7.5h7" />
</>);

export const GraduationIcon = icon(<>
    <path d="m2.5 9 9.5-4.5L21.5 9 12 13.5z" />
    <path d="M6.5 11v5c1.5 1.3 3.3 2 5.5 2s4-.7 5.5-2v-5M21.5 9v5.5" />
</>);

export const CalendarPlusIcon = icon(<>
    <path d="M20.5 12.5V7.5A2.5 2.5 0 0 0 18 5H6a2.5 2.5 0 0 0-2.5 2.5V18A2.5 2.5 0 0 0 6 20.5h6.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4M18 15.5v6M15 18.5h6" />
</>);

export const ClockIcon = icon(<>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
</>);

export const HistoryIcon = icon(<>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
    <path d="M3.5 3.5v5h5M12 7.5V12l3 2" />
</>);

export const LayersIcon = icon(<>
    <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
</>);

/* ----- Places ----- */
export const MapIcon = icon(<>
    <path d="m9 4.5-5.5 2v13l5.5-2 6 2 5.5-2v-13l-5.5 2z" />
    <path d="M9 4.5v13M15 6.5v13" />
</>);

export const PinIcon = icon(<>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
</>);

export const BuildingIcon = icon(<>
    <rect x="4.5" y="3.5" width="15" height="17" />
    <path d="M9.5 20.5V17h5v3.5M8.5 7.5h1M14.5 7.5h1M8.5 11h1M14.5 11h1M8.5 14.5h1M14.5 14.5h1" />
</>);

export const CompassIcon = icon(<>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
</>);

/* ----- Actions ----- */
export const CopyIcon = icon(<>
    <rect x="8.5" y="8.5" width="12" height="12" />
    <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
</>);

export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);

export const CheckCircleIcon = icon(<>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
</>);

export const DownloadIcon = icon(<>
    <path d="M12 3.5v12M7 10.5l5 5 5-5" />
    <path d="M4 16.5v2A2 2 0 0 0 6 20.5h12a2 2 0 0 0 2-2v-2" />
</>);

export const TrashIcon = icon(<>
    <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <path d="M10 11v6M14 11v6" />
</>);

export const EditIcon = icon(<>
    <path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4z" />
    <path d="m14.5 6.5 3 3" />
</>);

export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);

export const RefreshIcon = icon(<>
    <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5" />
    <path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9l2.4 2.4" />
    <path d="M20.5 3.5v5h-5M3.5 20.5v-5h5" />
</>);

export const ExternalIcon = icon(<>
    <path d="M14 3.5h6.5V10M20.5 3.5 11 13" />
    <path d="M18 14v4.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H10" />
</>);

export const FilterIcon = icon(<path d="M4 6h16M7 12h10M10 18h4" />);

export const SlidersIcon = icon(<>
    <path d="M4 6.5h9M17 6.5h3M4 17.5h3M11 17.5h9" />
    <circle cx="15" cy="6.5" r="2" />
    <circle cx="9" cy="17.5" r="2" />
</>);

export const MoreIcon = icon(<>
    <circle cx="5.5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1" fill="currentColor" />
</>);

export const SendIcon = icon(<>
    <path d="m21 3-9.5 9.5" />
    <path d="M21 3 14.5 21l-3-8.5L3 9.5z" />
</>);

export const EyeIcon = icon(<>
    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7" />
    <circle cx="12" cy="12" r="3" />
</>);

export const EyeOffIcon = icon(<>
    <path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.3 3.2M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
</>);

/* ----- Direction ----- */
export const ArrowRightIcon = icon(<path d="M4.5 12h15M13.5 6l6 6-6 6" />);

export const ArrowLeftIcon = icon(<path d="M19.5 12h-15M10.5 6l-6 6 6 6" />);

export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />);

export const ChevronRightIcon = icon(<path d="m9 6 6 6-6 6" />);

export const ChevronLeftIcon = icon(<path d="m15 6-6 6 6 6" />);

/* ----- Status ----- */
export const InfoIcon = icon(<>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
</>);

export const AlertIcon = icon(<>
    <path d="M10.3 4.4 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0" />
    <path d="M12 9.5v4M12 17h.01" />
</>);

export const StarIcon = icon(<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" />);

export const SparkleIcon = icon(<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9z" />);

export const InboxIcon = icon(<>
    <path d="M3.5 13.5 6 5.5A1.5 1.5 0 0 1 7.4 4.5h9.2A1.5 1.5 0 0 1 18 5.5l2.5 8" />
    <path d="M3.5 13.5V18A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5v-4.5H15.5a3.5 3.5 0 0 1-7 0z" />
</>);

export const MegaphoneIcon = icon(<>
    <path d="M3.5 10v4a1.5 1.5 0 0 0 1.5 1.5h2L13.5 19V5L7 8.5H5A1.5 1.5 0 0 0 3.5 10" />
    <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11M7.5 15.5l1 5" />
</>);

export const ChartIcon = icon(<>
    <path d="M4 20.5h16" />
    <rect x="5.5" y="11" width="3" height="6.5" />
    <rect x="10.5" y="6.5" width="3" height="11" />
    <rect x="15.5" y="13.5" width="3" height="4" />
</>);

export const SunIcon = icon(<>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
</>);

export const MoonIcon = icon(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5" />);

export const PaletteIcon = icon(<>
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.1 0 1.6-.9 1.3-1.8-.4-1.2.2-2.2 1.5-2.2h1.7a4 4 0 0 0 4-4C20.5 7.6 16.7 3.5 12 3.5" />
    <circle cx="7.5" cy="11" r="1" fill="currentColor" />
    <circle cx="10.5" cy="7.5" r="1" fill="currentColor" />
    <circle cx="15" cy="7.5" r="1" fill="currentColor" />
</>);

export const GitHubIcon = icon(<>
    <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
</>);
