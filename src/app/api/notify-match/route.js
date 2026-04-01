import { Resend } from 'resend';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Lazy initialize Resend to avoid build-time errors
let resend = null;
const getResend = () => {
    if (!resend && process.env.RESEND_API_KEY) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
};

// Create Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request) {
    try {
        const { userAId, userBId, courseCode, courseName, userASection, userBSection, userAName, userBName } = await request.json();

        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, name, email')
            .in('id', [userAId, userBId].filter(Boolean));

        if (profileError) {
            console.error('Error fetching profiles:', profileError);
        }

        const userAProfile = profiles?.find(p => p.id === userAId);
        const userBProfile = profiles?.find(p => p.id === userBId);

        const userAEmail = userAProfile?.email;
        const userBEmail = userBProfile?.email;

        const createEmailHtml = (recipientName, theirSection, otherUserName, otherSection) => `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; color: #333333;">
                <div style="background-color: #0a2540; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Match Available</h1>
                </div>
                
                <div style="padding: 32px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                    <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                        Hello <strong>${recipientName || 'Student'}</strong>,
                    </p>
                    <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                        A potential CourseMate match has been found for you.
                    </p>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 24px; border: 1px solid #eaeaea;">
                        <h3 style="margin: 0 0 16px 0; color: #0a2540; font-size: 18px;">${courseCode} ${courseName ? '- ' + courseName : ''}</h3>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #666;">Your Section:</span>
                            <span style="font-weight: 600; color: #333;">${theirSection}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #666;">Their Section:</span>
                            <span style="font-weight: 600; color: #333;">${otherSection}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #666;">Matched With:</span>
                            <span style="font-weight: 600; color: #333;">${otherUserName || 'Student'}</span>
                        </div>
                    </div>
                    
                    <p style="font-size: 16px; line-height: 1.5; margin: 0 0 32px 0;">
                        Please log in to review and respond to this match request.
                    </p>
                    
                    <div style="text-align: center;">
                        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/matches" 
                           style="background-color: #c9a227; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 16px; display: inline-block;">
                            View Match Details
                        </a>
                    </div>
                    
                    <p style="margin-top: 40px; font-size: 12px; color: #888888; text-align: center; border-top: 1px solid #eaeaea; padding-top: 20px;">
                        CourseMate - University Section Exchange Platform
                    </p>
                </div>
            </div>
        `;

        const emailsSent = [];
        const errors = [];

        if (userAEmail && getResend()) {
            try {
                await getResend().emails.send({
                    from: 'CourseMate <noreply@course-mate.me>',
                    to: userAEmail,
                    subject: `Match Found: ${courseCode}`,
                    html: createEmailHtml(userAName || userAProfile?.name, userASection, userBName || userBProfile?.name, userBSection),
                });
                emailsSent.push(userAEmail);
            } catch (err) {
                console.error('Failed to send to user A:', err.message);
                errors.push({ user: 'A', error: err.message });
            }
        }

        if (userBEmail && getResend()) {
            try {
                await getResend().emails.send({
                    from: 'CourseMate <noreply@course-mate.me>',
                    to: userBEmail,
                    subject: `Match Found: ${courseCode}`,
                    html: createEmailHtml(userBName || userBProfile?.name, userBSection, userAName || userAProfile?.name, userASection),
                });
                emailsSent.push(userBEmail);
            } catch (err) {
                console.error('Failed to send to user B:', err.message);
                errors.push({ user: 'B', error: err.message });
            }
        }

        return NextResponse.json({ success: true, emailsSent, errors, message: emailsSent.length > 0 ? `Sent ${emailsSent.length} notification(s)` : 'No emails sent (users may not have emails in profile)' });
    } catch (error) {
        console.error('Error in notify-match:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
