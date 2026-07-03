/* Server-side Web Push sender. Loads a user's stored subscriptions and
   dispatches a notification to each of their devices, pruning any that the
   push service reports as gone (404/410). Best-effort: never throws. */

import webpush from 'web-push';

let configured = false;
function ensureConfigured() {
    if (configured) return true;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return false;
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:noreply@course-mate.me',
        publicKey,
        privateKey
    );
    configured = true;
    return true;
}

/**
 * Send a push notification to every device of the given users.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin - service-role client
 * @param {string[]} userIds - recipients
 * @param {{title: string, body: string, url?: string, tag?: string, icon?: string}} payload
 * @returns {Promise<{sent: number, pruned: number}>}
 */
export async function sendPushToUsers(admin, userIds, payload) {
    const result = { sent: 0, pruned: 0 };
    try {
        if (!ensureConfigured()) return result;
        const ids = [...new Set((userIds || []).filter(Boolean))];
        if (ids.length === 0) return result;

        const { data: subs } = await admin
            .from('push_subscriptions')
            .select('endpoint, keys')
            .in('user_id', ids);
        if (!subs || subs.length === 0) return result;

        const body = JSON.stringify(payload);
        const stale = [];

        await Promise.all(
            subs.map(async (row) => {
                const subscription = { endpoint: row.endpoint, keys: row.keys };
                try {
                    await webpush.sendNotification(subscription, body);
                    result.sent++;
                } catch (err) {
                    // 404/410 mean the subscription is dead — drop it.
                    if (err && (err.statusCode === 404 || err.statusCode === 410)) {
                        stale.push(row.endpoint);
                    }
                }
            })
        );

        if (stale.length > 0) {
            await admin.from('push_subscriptions').delete().in('endpoint', stale);
            result.pruned = stale.length;
        }
    } catch {
        // Push is best-effort; swallow everything so callers are unaffected.
    }
    return result;
}
