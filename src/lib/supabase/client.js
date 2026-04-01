import { createBrowserClient } from '@supabase/ssr';

let supabaseClient = null;

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Check if Supabase is configured
    if (!supabaseUrl || !supabaseKey ||
        supabaseUrl.includes('your-project') ||
        supabaseKey.includes('your-')) {
        // Return a mock client for demo mode
        return createMockClient();
    }

    if (!supabaseClient) supabaseClient = createBrowserClient(supabaseUrl, supabaseKey);

    return supabaseClient;
}

// Mock client for when Supabase is not configured
function createMockClient() {
    const mockStorage = {
        users: [],
        profiles: [],
        posts: [],
        courses: [],
        sections: [],
        matches: [],
        watchlist: [],
    };

    return {
        auth: {
            getUser: async () => ({ data: { user: null }, error: null }),
            signInWithPassword: async () => ({
                error: { message: 'Supabase not configured. Please add your credentials to .env.local' }
            }),
            signUp: async () => ({
                error: { message: 'Supabase not configured. Please add your credentials to .env.local' }
            }),
            signOut: async () => ({ error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
        },
        from: (table) => ({
            select: () => ({
                eq: () => ({
                    single: async () => ({ data: null, error: null }),
                    order: () => ({ data: [], error: null }),
                }),
                in: () => ({
                    order: async () => ({ data: [], error: null }),
                }),
                order: async () => ({ data: [], error: null }),
                or: () => ({
                    in: () => ({
                        order: async () => ({ data: [], error: null }),
                    }),
                }),
            }),
            insert: async () => ({ error: { message: 'Supabase not configured' } }),
            update: () => ({
                eq: async () => ({ error: { message: 'Supabase not configured' } }),
                in: async () => ({ error: { message: 'Supabase not configured' } }),
            }),
            delete: () => ({
                eq: async () => ({ error: { message: 'Supabase not configured' } }),
            }),
        }),
    };
}
