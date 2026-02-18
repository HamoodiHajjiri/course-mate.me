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
        const {
            userAId,
            userBId,
            courseCode,
            courseName,
            userASection,
            userBSection,
            userAName,
            userBName
        } = await request.json();

        // Get user emails from profiles
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

        // Email HTML template
        const createEmailHtml = (recipientName, theirSection, otherUserName, otherSection) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #1a2a4a 0%, #0d1929 100%); padding: 20px; border-radius: 10px; text-align: center;">
                    <h1 style="color: #c9a227; margin: 0;">🎉 You Have a Match!</h1>
                </div>
                
                <div style="padding: 20px; background: #f8f9fa; border-radius: 10px; margin-top: 20px;">
                    <h2 style="color: #333; margin-bottom: 20px;">CourseMate Match Found</h2>
                    
                    <p style="color: #666; font-size: 16px;">
                        Great news, <strong>${recipientName || 'Student'}</strong>! Someone wants to swap sections with you.
                    </p>
                    
                    <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #c9a227;">
                        <p style="margin: 0 0 10px 0; color: #333;"><strong>Course:</strong> ${courseCode} - ${courseName || ''}</p>
                        <p style="margin: 0 0 10px 0; color: #333;"><strong>You have:</strong> Section ${theirSection}</p>
                        <p style="margin: 0 0 10px 0; color: #333;"><strong>They have:</strong> Section ${otherSection}</p>
                        <p style="margin: 0; color: #333;"><strong>Match with:</strong> ${otherUserName || 'A student'}</p>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                        Log in to CourseMate to accept or decline this match.
                    </p>
                    
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/matches" 
                           style="background: #c9a227; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold;">
                            View Match
                        </a>
                    </div>
                </div>
                
                <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
                    CourseMate - University Section Exchange Platform
                </p>
            </div>
        `;

        const emailsSent = [];
        const errors = [];

        // Send email to User A
        if (userAEmail && getResend()) {
            try {
                await getResend().emails.send({
                    from: 'CourseMate <noreply@course-mate.me>',
                    to: userAEmail,
                    subject: `🔄 Match Found for ${courseCode}!`,
                    html: createEmailHtml(userAName || userAProfile?.name, userASection, userBName || userBProfile?.name, userBSection),
                });
                emailsSent.push(userAEmail);
            } catch (err) {
                console.error('Failed to send to user A:', err.message);
                errors.push({ user: 'A', error: err.message });
            }
        }

        // Send email to User B
        if (userBEmail && getResend()) {
            try {
                await getResend().emails.send({
                    from: 'CourseMate <noreply@course-mate.me>',
                    to: userBEmail,
                    subject: `🔄 Match Found for ${courseCode}!`,
                    html: createEmailHtml(userBName || userBProfile?.name, userBSection, userAName || userAProfile?.name, userASection),
                });
                emailsSent.push(userBEmail);
            } catch (err) {
                console.error('Failed to send to user B:', err.message);
                errors.push({ user: 'B', error: err.message });
            }
        }

        return NextResponse.json({
            success: true,
            emailsSent,
            errors,
            message: emailsSent.length > 0
                ? `Sent ${emailsSent.length} notification(s)`
                : 'No emails sent (users may not have emails in profile)'
        });
    } catch (error) {
        console.error('Error in notify-match:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
