'use server';

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const now = new Date().toISOString();

        const { data: expiredMatches, error: fetchError } = await supabaseAdmin
            .from('matches')
            .select('*, post_a:posts!matches_post_a_id_fkey(*), post_b:posts!matches_post_b_id_fkey(*)')
            .eq('status', 'pending')
            .lt('expires_at', now);

        if (fetchError) {
            console.error('Error fetching expired matches:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!expiredMatches || expiredMatches.length === 0) return NextResponse.json({ message: 'No expired matches found', expired: 0 });

        let expiredCount = 0;

        for (const match of expiredMatches) {
            await supabaseAdmin.from('matches').update({ status: 'expired' }).eq('id', match.id);
            await supabaseAdmin.from('posts').update({ status: 'active' }).in('id', [match.post_a_id, match.post_b_id]);
            expiredCount++;
        }

        return NextResponse.json({ message: `Expired ${expiredCount} matches`, expired: expiredCount });
    } catch (error) {
        console.error('Error processing expired matches:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
