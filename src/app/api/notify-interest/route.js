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

function emailHtml({ recipientName, interestedName, interestedPhone, interestedStudentId, kind, courseCode, courseName, section, appUrl }) {
    const safeName = escapeHtml(recipientName || 'Student');
    const safeInterested = escapeHtml(interestedName || 'A student');
    const safePhone = escapeHtml(interestedPhone || '');
    const safeStudentId = escapeHtml(interestedStudentId || '');
    const safeCourseCode = escapeHtml(courseCode || '');
    const safeCourseName = escapeHtml(courseName || '');
    const safeSection = escapeHtml(section || '');
    const safeAppUrl = escapeHtml(appUrl);
    const courseLine = safeCourseName ? `${safeCourseCode} - ${safeCourseName}` : safeCourseCode;
    // What the poster's post is about, phrased from the poster's side.
    const postLine = kind === 'request'
        ? `your request for Section ${safeSection}`
        : `the Section ${safeSection} you're giving away`;

    return `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; color: #333333;">
            <div style="background-color: #0a2540; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Someone's Interested</h1>
            </div>
            <div style="padding: 32px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                    Hello <strong>${safeName}</strong>,
                </p>
                <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                    <strong>${safeInterested}</strong> is interested in ${postLine} for <strong>${courseLine}</strong>. Reach out to them to arrange it:
                </p>
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 24px; border: 1px solid #eaeaea;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: #666;">Name:</span>
                        <span style="font-weight: 600; color: #333;">${safeInterested}</span>
                    </div>
                    ${safePhone ? `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: #666;">Phone:</span>
                        <span style="font-weight: 600; color: #333;">${safePhone}</span>
                    </div>` : ''}
                    ${safeStudentId ? `<div style="display: flex; justify-content: space-between;">
                        <span style="color: #666;">Student ID:</span>
                        <span style="font-weight: 600; color: #333;">${safeStudentId}</span>
                    </div>` : ''}
                </div>
                <div style="text-align: center;">
                    <a href="${safeAppUrl}/browse"
                       style="background-color: #c9a227; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 16px; display: inline-block;">
                        Open CourseMate
                    </a>
                </div>
                <p style="margin-top: 40px; font-size: 12px; color: #888888; text-align: center; border-top: 1px solid #eaeaea; padding-top: 20px;">
                    CourseMate - University Section Exchange Platform
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

        // Load the post and validate it's an open giveaway/request.
        const { data: post, error: postErr } = await admin
            .from('posts')
            .select('id, user_id, type, status, course_code, course_name, have_section')
            .eq('id', postId)
            .single();
        if (postErr || !post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }
        if (post.type !== 'giveaway' && post.type !== 'request') {
            return NextResponse.json({ error: 'Interest only applies to giveaway/request posts' }, { status: 400 });
        }
        if (post.status !== 'active' && post.status !== 'pending') {
            return NextResponse.json({ error: 'This post is no longer open' }, { status: 400 });
        }
        if (post.user_id === user.id) {
            return NextResponse.json({ error: 'You cannot express interest in your own post' }, { status: 400 });
        }

        // The interested student's contact, shared with the poster.
        const { data: me, error: meErr } = await admin
            .from('profiles')
            .select('name, phone, student_id')
            .eq('id', user.id)
            .single();
        if (meErr || !me) {
            return NextResponse.json({ error: 'Your profile could not be loaded' }, { status: 500 });
        }
        if (!me.phone) {
            return NextResponse.json({ error: 'Add a phone number to your profile so the poster can contact you.' }, { status: 400 });
        }

        // Record interest (one per user/post). If it already exists, don't re-email.
        const { error: insertErr } = await admin
            .from('post_interests')
            .insert({ post_id: post.id, interested_user_id: user.id });
        if (insertErr) {
            if (insertErr.code === '23505') {
                return NextResponse.json({ success: true, alreadySent: true });
            }
            return NextResponse.json({ error: 'Could not record interest' }, { status: 500 });
        }

        // In-app notification for the poster.
        await admin.from('notifications').insert({
            user_id: post.user_id,
            type: 'interest_received',
            title: 'Someone is interested',
            message: `${me.name || 'A student'} is interested in your ${post.type} for ${post.course_code} (Section ${post.have_section}).`,
            data: { post_id: post.id, interested_user_id: user.id },
        });

        // Notify the poster.
        const { data: poster } = await admin
            .from('profiles')
            .select('name, email, email_interest_alerts')
            .eq('id', post.user_id)
            .single();

        // Push to the poster's devices (best-effort), respecting the same
        // "Interest alerts" preference as email.
        if (poster?.email_interest_alerts !== false) {
            await sendPushToUsers(admin, [post.user_id], {
                title: 'Someone is interested',
                body: `${me.name || 'A student'} is interested in your ${post.type} for ${post.course_code} (Section ${post.have_section}).`,
                url: '/browse',
                tag: `interest-${post.id}`,
            });
        }

        const mailer = getResend();
        if (mailer && poster?.email && poster?.email_interest_alerts !== false) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            try {
                await mailer.emails.send({
                    from: 'CourseMate <noreply@course-mate.me>',
                    to: poster.email,
                    subject: `Someone's interested: ${post.course_code || 'your post'}`,
                    html: emailHtml({
                        recipientName: poster.name,
                        interestedName: me.name,
                        interestedPhone: me.phone,
                        interestedStudentId: me.student_id,
                        kind: post.type,
                        courseCode: post.course_code,
                        courseName: post.course_name,
                        section: post.have_section,
                        appUrl,
                    }),
                });
            } catch (err) {
                // Interest is recorded; email delivery is best-effort.
                return NextResponse.json({ success: true, emailSent: false });
            }
        }

        return NextResponse.json({ success: true, emailSent: !!(mailer && poster?.email) });
    } catch (error) {
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
