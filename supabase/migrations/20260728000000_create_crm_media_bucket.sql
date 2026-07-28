-- Create the crm-media storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('crm-media', 'crm-media', false, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for crm-media
CREATE POLICY IF NOT EXISTS "crm_media owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'crm-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY IF NOT EXISTS "crm_media owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'crm-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY IF NOT EXISTS "crm_media owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'crm-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY IF NOT EXISTS "crm_media owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'crm-media' AND auth.uid()::text = (storage.foldername(name))[1]);
