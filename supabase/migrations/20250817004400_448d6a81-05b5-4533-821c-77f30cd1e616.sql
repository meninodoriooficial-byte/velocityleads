-- Create user roles enum
CREATE TYPE public.user_role AS ENUM ('admin', 'premium', 'basic');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role user_role NOT NULL DEFAULT 'basic',
  plan_searches_limit INTEGER DEFAULT 10,
  searches_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create search_packages table
CREATE TABLE public.search_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  searches_limit INTEGER NOT NULL,
  price DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create searches table
CREATE TABLE public.searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  search_query TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  results_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create search_results table
CREATE TABLE public.search_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_id UUID NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  social_media JSONB,
  owner_name TEXT,
  business_type TEXT,
  rating DECIMAL(3,2),
  reviews_count INTEGER,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  additional_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE user_id = user_uuid;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

-- RLS Policies for search_packages
CREATE POLICY "Everyone can view active packages" ON public.search_packages
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage packages" ON public.search_packages
  FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- RLS Policies for searches
CREATE POLICY "Users can view own searches" ON public.searches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create searches" ON public.searches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all searches" ON public.searches
  FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

-- RLS Policies for search_results
CREATE POLICY "Users can view results of own searches" ON public.search_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.searches 
      WHERE searches.id = search_results.search_id 
      AND searches.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all results" ON public.search_results
  FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', 'Usuário')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON public.search_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_searches_updated_at BEFORE UPDATE ON public.searches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default search packages
INSERT INTO public.search_packages (name, description, searches_limit, price) VALUES
('Básico', 'Pacote ideal para pequenos negócios', 10, 29.90),
('Premium', 'Pacote para empresas em crescimento', 50, 99.90),
('Empresarial', 'Pacote completo para grandes empresas', 200, 299.90);

-- Create indexes for performance
CREATE INDEX idx_searches_user_id ON public.searches(user_id);
CREATE INDEX idx_search_results_search_id ON public.search_results(search_id);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);