/* Browser-side Web Push helpers: feature detection, subscribe, unsubscribe.
   Subscriptions are stored in `push_subscriptions` (RLS: users manage only
   their own rows), which the notify API routes read via the service role. */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// True only where the browser can actually deliver Web Push. On iOS this
// requires the site to be installed to the Home Screen (standalone PWA).
export function isPushSupported() {
    if (typeof window === 'undefined') return false;
    return (
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window &&
        !!VAPID_PUBLIC_KEY
    );
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

async function getRegistration() {
    // Reuse an existing registration; otherwise register the root-scoped worker.
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return navigator.serviceWorker.register('/sw.js');
}

// Whether this device already has an active push subscription.
export async function getPushState() {
    if (!isPushSupported()) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
}

// Register the SW, request permission, subscribe, and persist to Supabase.
// Returns true on success. Throws with a friendly message on failure.
export async function subscribeToPush(supabase, userId) {
    if (!isPushSupported()) throw new Error('Push notifications are not supported on this device.');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error('Notification permission was not granted.');
    }

    const reg = await getRegistration();
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
    }

    const json = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
        {
            user_id: userId,
            endpoint: json.endpoint,
            keys: json.keys,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        },
        { onConflict: 'endpoint' }
    );
    if (error) throw new Error('Could not save your subscription.');
    return true;
}

// Remove this device's subscription (both in the browser and in Supabase).
export async function unsubscribeFromPush(supabase) {
    if (!isPushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
