import './globals.css';
import { SemesterProviderWrapper } from '@/lib/SemesterContext';
import { FeedbackProvider } from '@/components/ui/Feedback';

export const metadata = {
    title: 'CourseMate',
    description: 'Swap sections, build your schedule and find your way around campus.',
    icons: {
        icon: '/logo.png',
        shortcut: '/logo.png',
        apple: '/logo.png',
    },
};

// Pinch-zoom stays available: inputs are 16px on phones, so iOS has no reason
// to zoom on focus and nothing needs locking.
export const viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

// Browser chrome colour per theme, matching --canvas in globals.css.
const THEME_COLORS = { light: '#F5F4EF', dark: '#070D16', black: '#000000' };

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                {/* Loaded by family name rather than next/font: the schedule
                    PNG export draws on a canvas with these exact names. */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap"
                    rel="stylesheet"
                />
                <meta name="theme-color" content={THEME_COLORS.light} />
                <script dangerouslySetInnerHTML={{
                    __html: `
                        (function () {
                            try {
                                // Runs before paint so the saved theme is applied without a flash.
                                // 'system' (and anything unrecognised) resolves here rather than
                                // reaching the CSS, which only defines light, dark and black.
                                var saved = localStorage.getItem('theme');
                                var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                                var theme = (saved === 'light' || saved === 'dark' || saved === 'black')
                                    ? saved
                                    : (prefersDark ? 'dark' : 'light');
                                document.documentElement.setAttribute('data-theme', theme);
                                var colors = ${JSON.stringify(THEME_COLORS)};
                                var meta = document.querySelector('meta[name="theme-color"]');
                                if (meta) meta.setAttribute('content', colors[theme]);
                            } catch (e) { }
                        })();
                    `,
                }} />
            </head>
            <body suppressHydrationWarning>
                <SemesterProviderWrapper>
                    <FeedbackProvider>
                        {children}
                    </FeedbackProvider>
                </SemesterProviderWrapper>
            </body>
        </html>
    );
}
