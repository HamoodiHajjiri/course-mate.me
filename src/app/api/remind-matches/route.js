'use server';

import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

let resend = null;
const getResend = () => {
    if (!resend && process.env.RESEND_API_KEY) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
};

function authorized(request) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header = request.headers.get('authorization') || '';
    return header === `Bearer ${secret}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function hoursLeft(expiresAt) {
    return Math.max(1, Math.round((new Date(expiresAt) - new Date()) / (1000 * 60 * 60)));
}

function emailHtml({ recipientName, courseLine, hours, appUrl }) {
    const safeName = escapeHtml(recipientName || 'Student');
    const safeCourseLine = escapeHtml(courseLine || '');
    const safeAppUrl = escapeHtml(appUrl);

    return `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; color: #333333;">
            <div style="background-color: #0a2540; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Your Match Is Waiting</h1>
            </div>
            <div style="padding: 32px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                    Hello <strong>${safeName}</strong>,
                </p>
                <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                    You have a pending swap match for <strong>${safeCourseLine}</strong> that you haven't
                    responded to. It expires in about <strong>${hours} hour${hours === 1 ? '' : 's'}</strong> —
                    after that the match dissolves for everyone in it.
                </p>
                <div style="text-align: center;">
                    <a href="${safeAppUrl}/matches"
                       style="background-color: #c9a227; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 16px; display: inline-block;">
                        Accept or Decline Now
                    </a>
                </div>
                <p style="margin-top: 40px; font-size: 12px; color: #888888; text-align: center; border-top: 1px solid #eaeaea; padding-top: 20px;">
                    CourseMate - University Section Exchange Platform
                </p>
            </div>
        </div>
    `;
}

export async function GET(request) {
    if (!authorized(request)) {
        return new NextResponse('Not found', { status: 404 });
    }
    try {
        const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const now = new Date();
        // Don't nag brand-new matches; give people a couple of hours to respond first.
        const minAge = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

        const { data: pending, error: fetchError } = await supabaseAdmin
            .from('matches')
            .select(`
                id, expires_at,
                participants:match_participants(
                    user_id, accepted,
                    post:posts!match_participants_post_id_fkey(course_code, course_name),
                    profile:profiles!match_participants_user_id_fkey(id, name, email, email_match_alerts)
                )
            `)
            .eq('status', 'pending')
            .eq('reminder_sent', false)
            .gt('expires_at', now.toISOString())
            .lt('created_at', minAge);

        if (fetchError) {
            console.error('Error fetching pending matches:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!pending || pending.length === 0) {
            return NextResponse.json({ message: 'No matches need reminders', reminded: 0 });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const mailer = getResend();
        let remindedMatches = 0;
        let emailsSent = 0;

        for (const match of pending) {
            const holdouts = (match.participants || []).filter(p => !p.accepted);
            if (holdouts.length === 0) continue;

            const first = match.participants?.[0];
            const courseCode = first?.post?.course_code || '';
            const courseName = first?.post?.course_name || '';
            const courseLine = courseName ? `${courseCode} - ${courseName}` : courseCode;
            const hours = hoursLeft(match.expires_at);

            await supabaseAdmin.from('notifications').insert(
                holdouts.map(p => ({
                    user_id: p.user_id,
                    type: 'reminder',
                    title: 'Match awaiting your response',
                    message: `Your swap match for ${courseCode} expires in ~${hours}h and you haven't accepted yet.`,
                    data: { match_id: match.id },
                }))
            );

            if (mailer) {
                for (const p of holdouts) {
                    const profile = p.profile;
                    if (!profile?.email || profile.email_match_alerts === false) continue;
                    try {
                        await mailer.emails.send({
                            from: 'CourseMate <noreply@course-mate.me>',
                            to: profile.email,
                            subject: `Reminder: your ${courseCode} match expires soon`,
                            html: emailHtml({ recipientName: profile.name, courseLine, hours, appUrl }),
                        });
                        emailsSent++;
                    } catch (err) {
                        console.error('Reminder email failed:', err.message);
                    }
                }
            }

            await supabaseAdmin.from('matches').update({ reminder_sent: true }).eq('id', match.id);
            remindedMatches++;
        }

        return NextResponse.json({ message: `Reminded ${remindedMatches} matches`, reminded: remindedMatches, emailsSent });
    } catch (error) {
        console.error('Error processing match reminders:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
