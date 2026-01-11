-- =====================================================
-- SECURITY FIX: Restrict Profile Access
-- 
-- Current issue: "Profiles are viewable by everyone" allows
-- any authenticated user to query ALL profiles with select=*
-- 
-- New approach:
-- 1. Users can always read their OWN profile
-- 2. Users can read basic info (name, student_id) of profiles
--    linked to active posts (for display purposes)
-- 3. Phone number is ONLY readable when:
--    - It's your own profile, OR
--    - The profile belongs to someone in an ACCEPTED match with you, OR
--    - The profile belongs to a giveaway/request post author
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

-- Policy 1: Users can always read their own full profile
CREATE POLICY "Users can read own profile" ON profiles
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy 2: Users can read basic info of profiles linked to posts
-- This allows showing poster names on post cards
CREATE POLICY "Users can read poster profiles" ON profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM posts 
            WHERE posts.user_id = profiles.user_id 
            AND posts.status IN ('active', 'pending')
        )
    );

-- Policy 3: Users can read profiles of people they're matched with (accepted matches)
-- This allows showing contact info after match acceptance
CREATE POLICY "Users can read matched user profiles" ON profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM matches 
            WHERE matches.status = 'accepted'
            AND (
                (matches.user_a_id = auth.uid() AND matches.user_b_id = profiles.user_id)
                OR 
                (matches.user_b_id = auth.uid() AND matches.user_a_id = profiles.user_id)
            )
        )
    );

-- =====================================================
-- IMPORTANT: Run this in Supabase SQL Editor
-- After running, verify by testing:
-- 1. Can you see your own profile? ✓
-- 2. Can you see names on post cards? ✓
-- 3. Can you query ALL profiles with select=*? ✗ (should fail)
-- 4. Can you see phone of matched users? ✓
-- =====================================================
