-- ============================================
-- VilkasAnalytics Auth System
-- Migration: 005_auth_system.sql
-- Created: 2026-01-06
-- ============================================

-- 1. PROFILES TABLE
-- Links to Supabase auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. SHOP_MEMBERS TABLE
-- M:N relationship between users and shops
CREATE TABLE IF NOT EXISTS shop_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')) DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, user_id)
);

-- Enable RLS
ALTER TABLE shop_members ENABLE ROW LEVEL SECURITY;

-- Shop members policies
CREATE POLICY "Users can view their shop memberships"
  ON shop_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all members of their shops"
  ON shop_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shop_members sm
      WHERE sm.shop_id = shop_members.shop_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert members"
  ON shop_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shop_members sm
      WHERE sm.shop_id = shop_members.shop_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete members"
  ON shop_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM shop_members sm
      WHERE sm.shop_id = shop_members.shop_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'admin'
    )
  );

-- 3. INVITATIONS TABLE
-- Pending user invitations
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')) DEFAULT 'viewer',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token UUID DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, email)
);

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Invitations policies
CREATE POLICY "Admins can view invitations for their shops"
  ON invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shop_members sm
      WHERE sm.shop_id = invitations.shop_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'admin'
    )
  );

CREATE POLICY "Admins can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shop_members sm
      WHERE sm.shop_id = invitations.shop_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete invitations"
  ON invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM shop_members sm
      WHERE sm.shop_id = invitations.shop_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'admin'
    )
  );

-- 4. UPDATE SHOPS TABLE RLS
-- Enable RLS on shops if not already enabled
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Members can view their shops" ON shops;

-- Users can only see shops they're members of
CREATE POLICY "Members can view their shops"
  ON shops FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shop_members sm
      WHERE sm.shop_id = shops.id
      AND sm.user_id = auth.uid()
    )
  );

-- 5. TRIGGER: Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. RPC: Get user's shops with role
CREATE OR REPLACE FUNCTION get_user_shops()
RETURNS TABLE (
  shop_id UUID,
  shop_name TEXT,
  store_id TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS shop_id,
    s.name AS shop_name,
    s.store_id,
    sm.role,
    sm.joined_at
  FROM shop_members sm
  JOIN shops s ON s.id = sm.shop_id
  WHERE sm.user_id = auth.uid();
END;
$$;

-- 7. RPC: Invite user to shop
CREATE OR REPLACE FUNCTION invite_user(
  p_shop_id UUID,
  p_email TEXT,
  p_role TEXT DEFAULT 'viewer'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Check if caller is admin of this shop
  SELECT EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = p_shop_id
    AND user_id = auth.uid()
    AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can invite users';
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM shop_members sm
    JOIN profiles p ON p.id = sm.user_id
    WHERE sm.shop_id = p_shop_id
    AND p.email = p_email
  ) THEN
    RAISE EXCEPTION 'User is already a member of this shop';
  END IF;

  -- Create or update invitation
  INSERT INTO invitations (shop_id, email, role, invited_by)
  VALUES (p_shop_id, p_email, p_role, auth.uid())
  ON CONFLICT (shop_id, email)
  DO UPDATE SET
    role = EXCLUDED.role,
    invited_by = EXCLUDED.invited_by,
    token = gen_random_uuid(),
    expires_at = NOW() + INTERVAL '7 days',
    accepted_at = NULL
  RETURNING id INTO v_invitation_id;

  RETURN v_invitation_id;
END;
$$;

-- 8. RPC: Accept invitation (called after user signs up via magic link)
CREATE OR REPLACE FUNCTION accept_invitation(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation RECORD;
BEGIN
  -- Find valid invitation
  SELECT * INTO v_invitation
  FROM invitations
  WHERE token = p_token
  AND accepted_at IS NULL
  AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;

  -- Check if email matches
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND email = v_invitation.email
  ) THEN
    RAISE EXCEPTION 'Email does not match invitation';
  END IF;

  -- Add user to shop
  INSERT INTO shop_members (shop_id, user_id, role, invited_by, joined_at)
  VALUES (
    v_invitation.shop_id,
    auth.uid(),
    v_invitation.role,
    v_invitation.invited_by,
    NOW()
  )
  ON CONFLICT (shop_id, user_id) DO NOTHING;

  -- Mark invitation as accepted
  UPDATE invitations
  SET accepted_at = NOW()
  WHERE id = v_invitation.id;

  RETURN TRUE;
END;
$$;

-- 9. RPC: Get pending invitations for a shop
CREATE OR REPLACE FUNCTION get_shop_invitations(p_shop_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  invited_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  invited_by_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = p_shop_id
    AND user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can view invitations';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.email,
    i.role,
    i.created_at AS invited_at,
    i.expires_at,
    p.email AS invited_by_email
  FROM invitations i
  LEFT JOIN profiles p ON p.id = i.invited_by
  WHERE i.shop_id = p_shop_id
  AND i.accepted_at IS NULL
  AND i.expires_at > NOW();
END;
$$;

-- 10. RPC: Get shop members
CREATE OR REPLACE FUNCTION get_shop_members(p_shop_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check if caller is member of this shop
  IF NOT EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = p_shop_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not a member of this shop';
  END IF;

  RETURN QUERY
  SELECT
    sm.id,
    sm.user_id,
    p.email,
    p.full_name,
    sm.role,
    sm.joined_at
  FROM shop_members sm
  JOIN profiles p ON p.id = sm.user_id
  WHERE sm.shop_id = p_shop_id;
END;
$$;

-- 11. RPC: Remove member from shop
CREATE OR REPLACE FUNCTION remove_shop_member(p_shop_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = p_shop_id
    AND user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can remove members';
  END IF;

  -- Prevent removing yourself if you're the only admin
  IF p_user_id = auth.uid() THEN
    IF (
      SELECT COUNT(*) FROM shop_members
      WHERE shop_id = p_shop_id
      AND role = 'admin'
    ) <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last admin';
    END IF;
  END IF;

  DELETE FROM shop_members
  WHERE shop_id = p_shop_id
  AND user_id = p_user_id;

  RETURN TRUE;
END;
$$;

-- 12. RPC: Check if user has access to shop
CREATE OR REPLACE FUNCTION has_shop_access(p_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = p_shop_id
    AND user_id = auth.uid()
  );
END;
$$;

-- 13. RPC: Check if user is admin of shop
CREATE OR REPLACE FUNCTION is_shop_admin(p_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = p_shop_id
    AND user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_shop_members_user_id ON shop_members(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_members_shop_id ON shop_members(shop_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
