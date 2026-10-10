'use client';

/**
 * The last resort, when even the root layout failed: no stylesheet can be
 * trusted, so the few styles it needs are written in place, in the same
 * paper and ink as the rest of CourseMate.
 */
export default function GlobalError({ error, reset }) {
    return (
        <html lang="en">
            <body style={{ margin: 0, background: '#F3F1EA', color: '#131B17', fontFamily: 'Georgia, serif' }}>
                <main style={{ maxWidth: 560, margin: '0 auto', padding: '18vh 24px 48px' }}>
                    <p style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: '#66706A' }}>CourseMate</p>
                    <h1 style={{ margin: '16px 0 12px', fontSize: 34, fontWeight: 400, lineHeight: 1.1 }}>CourseMate couldn&rsquo;t start.</h1>
                    <p style={{ margin: 0, fontFamily: 'system-ui, sans-serif', fontSize: 15, lineHeight: 1.55, color: '#3B4640' }}>
                        Something failed before the page could load. Try again in a moment.
                    </p>
                    <button
                        type="button"
                        onClick={() => reset()}
                        style={{ marginTop: 24, height: 40, padding: '0 16px', border: 0, borderRadius: 4, background: '#0F4C35', color: '#F6F4EC', fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                    >
                        Try again
                    </button>
                    {error?.digest && (
                        <p style={{ marginTop: 20, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: '#66706A' }}>Reference {error.digest}</p>
                    )}
                </main>
            </body>
        </html>
    );
}
