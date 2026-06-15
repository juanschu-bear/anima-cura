-- ============================================================
-- ANIMA CURA – Auth Profiles (Migration 003)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'verwaltung', 'lesezugriff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ensure_default_auth_user(
  p_user_id UUID,
  p_email TEXT,
  p_password TEXT,
  p_role TEXT,
  p_full_name TEXT
)
RETURNS UUID AS $$
DECLARE
  effective_user_id UUID;
BEGIN
  SELECT id
  INTO effective_user_id
  FROM auth.users
  WHERE email = p_email;

  IF effective_user_id IS NULL THEN
    effective_user_id := p_user_id;

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      confirmation_sent_at,
      recovery_token,
      recovery_sent_at,
      email_change_token_new,
      email_change,
      email_change_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      phone,
      phone_confirmed_at,
      phone_change,
      phone_change_token,
      phone_change_sent_at,
      confirmed_at,
      email_change_token_current,
      email_change_confirm_status,
      banned_until,
      reauthentication_token,
      reauthentication_sent_at,
      is_sso_user,
      deleted_at
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      effective_user_id,
      'authenticated',
      'authenticated',
      p_email,
      crypt(p_password, gen_salt('bf')),
      NOW(),
      NULL,
      '',
      NULL,
      '',
      NULL,
      '',
      '',
      NULL,
      NOW(),
      jsonb_build_object(
        'provider', 'email',
        'providers', ARRAY['email'],
        'role', p_role
      ),
      jsonb_build_object(
        'display_name', p_full_name,
        'full_name', p_full_name,
        'role', p_role
      ),
      FALSE,
      NOW(),
      NOW(),
      NULL,
      NULL,
      '',
      '',
      NULL,
      NOW(),
      '',
      0,
      NULL,
      '',
      NULL,
      FALSE,
      NULL
    );
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = crypt(p_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmed_at = COALESCE(confirmed_at, NOW()),
      raw_app_meta_data = jsonb_build_object(
        'provider', 'email',
        'providers', ARRAY['email'],
        'role', p_role
      ),
      raw_user_meta_data = jsonb_build_object(
        'display_name', p_full_name,
        'full_name', p_full_name,
        'role', p_role
      ),
      updated_at = NOW()
    WHERE id = effective_user_id;
  END IF;

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    effective_user_id,
    jsonb_build_object(
      'sub', effective_user_id::TEXT,
      'email', p_email
    ),
    'email',
    effective_user_id::TEXT,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE
  SET
    identity_data = EXCLUDED.identity_data,
    user_id = EXCLUDED.user_id,
    last_sign_in_at = EXCLUDED.last_sign_in_at,
    updated_at = NOW();

  RETURN effective_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_auth_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, ''), '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, ''), '@', 1)),
    COALESCE(NEW.raw_app_meta_data->>'role', 'lesezugriff')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_profile_changed ON auth.users;
CREATE TRIGGER on_auth_user_profile_changed
AFTER INSERT OR UPDATE OF email, raw_app_meta_data, raw_user_meta_data ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_profile();

CREATE POLICY "Users can view their own profile"
ON user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON user_profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_profiles viewer
    WHERE viewer.id = auth.uid()
      AND viewer.role = 'admin'
  )
);

CREATE POLICY "Admins can update profiles"
ON user_profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_profiles viewer
    WHERE viewer.id = auth.uid()
      AND viewer.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_profiles viewer
    WHERE viewer.id = auth.uid()
      AND viewer.role = 'admin'
  )
);

SELECT public.ensure_default_auth_user(
  '11111111-1111-4111-8111-111111111111',
  'maria@praxis-schubert.de',
  'ms13sr06?!',
  'admin',
  'Dr. Maria Schubert'
);

SELECT public.ensure_default_auth_user(
  '22222222-2222-4222-8222-222222222222',
  'sabine@praxis-schubert.de',
  'ms13sr06?!',
  'verwaltung',
  'Sabine'
);

SELECT public.ensure_default_auth_user(
  '33333333-3333-4333-8333-333333333333',
  'empfang@praxis-schubert.de',
  'empfang2026!',
  'lesezugriff',
  'Empfang'
);

INSERT INTO public.user_profiles (id, email, display_name, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name', 'Anima Cura'),
  COALESCE(u.raw_user_meta_data->>'full_name', 'Anima Cura'),
  COALESCE(u.raw_app_meta_data->>'role', 'lesezugriff')
FROM auth.users u
WHERE u.email IN (
  'maria@praxis-schubert.de',
  'sabine@praxis-schubert.de',
  'empfang@praxis-schubert.de'
)
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  updated_at = NOW();

DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
