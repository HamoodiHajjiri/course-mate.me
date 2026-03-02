import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    const next = searchParams.get('next') || '/';

    const supabase = await createClient();

    // Handle PKCE flow (code-based)
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(new URL(next, request.url));
        }
    }

    // Handle magic link / recovery flow (token_hash-based)
    if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type,
        });
        if (!error) {
            return NextResponse.redirect(new URL(next, request.url));
        }
    }

    // If both methods fail, redirect to auth page
    return NextResponse.redirect(new URL('/auth', request.url));
}
