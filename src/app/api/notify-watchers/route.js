import { Resend } from 'resend';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendPushToUsers } from '@/lib/push/server';

let resend = null;
const getResend = () => {
    if (!resend && process.env.RESEND_API_KEY) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function emailHtml({ recipientName, kindLabel, courseLine, section, appUrl }) {
    const safeName = escapeHtml(recipientName || 'Student');
    const safeKind = escapeHtml(kindLabel);
    const safeCourse = escapeHtml(courseLine);
    const safeSection = escapeHtml(section || '');
    const safeAppUrl = escapeHtml(appUrl);
    return `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; color: #333333;">
            <div style="background-color: #0a2540; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">A Watched Section Is Available</h1>
            </div>
            <div style="padding: 32px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">Hello <strong>${safeName}</strong>,</p>
                <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                    A new <strong>${safeKind}</strong> just appeared for <strong>${safeCourse}</strong> — Section <strong>${safeSection}</strong>, which you're watching.
                </p>
                <div style="text-align: center;">
                    <a href="${safeAppUrl}/browse"
                       style="background-color: #c9a227; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 16px; display: inline-block;">
                        View on CourseMate
                    </a>
                </div>
                <p style="margin-top: 40px; font-size: 12px; color: #888888; text-align: center; border-top: 1px solid #eaeaea; padding-top: 20px;">
                    CourseMate — University Section Exchange Platform
                </p>
            </div>
        </div>
    `;
}

export async function POST(request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json().catch(() => ({}));
        const postId = body?.postId;
        if (!postId || typeof postId !== 'string') {
            return NextResponse.json({ error: 'postId required' }, { status: 400 });
        }

        const admin = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: post, error: postErr } = await admin
            .from('posts')
            .select('id, user_id, type, status, term_code, course_code, course_name, have_section')
            .eq('id', postId)
            .single();
        if (postErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        // Only the poster can fan out alerts for their own post.
        if (post.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        // Watch alerts fire when a section becomes *available* (swap or giveaway).
        if (post.type !== 'swap' && post.type !== 'giveaway') {
            return NextResponse.json({ success: true, matched: 0 });
        }

        // Find watchers for this course+term whose section matches (or who watch any).
        const { data: watches } = await admin
            .from('section_watches')
            .select('user_id, want_section')
            .eq('term_code', post.term_code)
            .eq('course_code', post.course_code)
            .neq('user_id', post.user_id);

        const watcherIds = [...new Set(
            (watches || [])
                .filter(w => !w.want_section || w.want_section === post.have_section)
                .map(w => w.user_id)
        )];
        if (watcherIds.length === 0) return NextResponse.json({ success: true, matched: 0 });

        const kindLabel = post.type === 'giveaway' ? 'giveaway' : 'swap';
        const courseLine = post.course_name ? `${post.course_code} - ${post.course_name}` : post.course_code;
        const title = `Section ${post.have_section} is available`;
        const message = `A new ${kindLabel} for ${courseLine} (Section ${post.have_section}) — a section you're watching.`;

        // In-app notifications (one per watcher).
        const rows = watcherIds.map(uid => ({
            user_id: uid,
            type: 'watch_alert',
            title,
            message,
            data: { post_id: post.id, course_code: post.course_code, section: post.have_section, post_type: post.type },
        }));
        await admin.from('notifications').insert(rows);

        // Load recipients once (used for both push and email) and respect the
        // per-category "Section alerts" preference for both channels.
        const { data: recipients } = await admin
            .from('profiles')
            .select('id, name, email, email_watch_alerts')
            .in('id', watcherIds);
        const optedIn = (recipients || []).filter(r => r.email_watch_alerts !== false);

        // Push to opted-in watchers' devices (best-effort).
        await sendPushToUsers(admin, optedIn.map(r => r.id), {
            title,
            body: message,
            url: '/browse',
            tag: `watch-${post.id}`,
        });

        // Best-effort emails.
        const mailer = getResend();
        if (mailer) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            await Promise.all(optedIn.filter(r => r.email).map(r =>
                mailer.emails.send({
                    from: 'CourseMate <noreply@course-mate.me>',
                    to: r.email,
                    subject: `A section you're watching is available: ${post.course_code}`,
                    html: emailHtml({ recipientName: r.name, kindLabel, courseLine, section: post.have_section, appUrl }),
                }).catch(() => null)
            ));
        }

        return NextResponse.json({ success: true, matched: watcherIds.length });
    } catch (error) {
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
