'use server';

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const now = new Date().toISOString();

        const { data: expiredPosts, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('id')
            .eq('status', 'active')
            .lt('expires_at', now);

        if (fetchError) {
            console.error('Error fetching expired posts:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!expiredPosts || expiredPosts.length === 0) return NextResponse.json({ message: 'No expired posts found', expired: 0 });

        const postIds = expiredPosts.map(p => p.id);
        const { error: updateError } = await supabaseAdmin.from('posts').update({ status: 'expired' }).in('id', postIds);

        if (updateError) {
            console.error('Error updating expired posts:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ message: `Expired ${postIds.length} posts`, expired: postIds.length });
    } catch (error) {
        console.error('Error processing expired posts:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
