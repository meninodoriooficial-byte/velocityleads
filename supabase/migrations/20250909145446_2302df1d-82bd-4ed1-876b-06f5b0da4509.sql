-- Create admin user profile (since the auth user doesn't exist yet)
-- First, we'll create a direct insert for the admin user
-- Note: This creates just the profile entry, the actual auth user needs to be created via signup

-- Insert admin profile with the specified email
INSERT INTO public.profiles (user_id, email, full_name, role, searches_used, plan_searches_limit)
VALUES (
  '00000000-0000-0000-0000-000000000001', -- Temporary user_id for admin
  'sempre.boa.noticia@gmail.com',
  'Administrador',
  'admin',
  0,
  999999
) ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  plan_searches_limit = EXCLUDED.plan_searches_limit;

-- Update the trigger to handle admin user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Check if this is the admin email
  IF NEW.email = 'sempre.boa.noticia@gmail.com' THEN
    INSERT INTO public.profiles (user_id, email, full_name, role, searches_used, plan_searches_limit)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Administrador'),
      'admin',
      0,
      999999
    );
  ELSE
    -- Regular user
    INSERT INTO public.profiles (user_id, email, full_name, role, searches_used, plan_searches_limit)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      'basic',
      0,
      10
    );
  END IF;
  
  RETURN NEW;
END;
$$;