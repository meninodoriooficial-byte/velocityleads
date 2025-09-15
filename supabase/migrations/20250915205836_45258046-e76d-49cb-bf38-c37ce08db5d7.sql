-- Update the trigger to automatically make sempre.boa.noticia@gmail.com an admin
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