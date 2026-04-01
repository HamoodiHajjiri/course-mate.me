import { Resend } from 'resend';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const targetEmail = searchParams.get('email');

    if (!targetEmail) return NextResponse.json({ error: 'Please provide email parameter: /api/test-email?email=your@email.com' }, { status: 400 });

    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY is missing in environment variables' }, { status: 500 });

    try {
        const resend = new Resend(apiKey);

        const data = await resend.emails.send({
            from: 'CourseMate <noreply@course-mate.me>',
            to: targetEmail,
            subject: 'Test Email - CourseMate Verification',
            html: `
                <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #0a2540;">CourseMate Email Verification</h2>
                    <p>This is a confirmation that your email system is configured correctly.</p>
                    <p>You can ignore this message.</p>
                </div>
            `
        });

        return NextResponse.json({
            success: true,
            message: 'Email sent successfully',
            data,
            envCheck: {
                hasKey: !!apiKey,
                keyLength: apiKey.length,
                appUrl: process.env.NEXT_PUBLIC_APP_URL
            }
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack,
            envCheck: {
                hasKey: !!apiKey,
            }
        }, { status: 500 });
    }
}
