-- ============================================================
-- Migration: shared_lists table + RLS
-- Run this in Supabase → SQL Editor
-- ============================================================

-- 1. Create shared_lists table
CREATE TABLE IF NOT EXISTS public.shared_lists (
  id        TEXT PRIMARY KEY,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.shared_lists ENABLE ROW LEVEL SECURITY;

-- 3. Anyone can read (needed to resolve share link → user_id)
CREATE POLICY "Public read shared_lists"
  ON public.shared_lists FOR SELECT
  USING (true);

-- 4. Owner can insert and delete their own share links
CREATE POLICY "Owner manages shared_lists"
  ON public.shared_lists FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Allow public to read medicines of users who have a share link
CREATE POLICY "Public read medicines via share"
  ON public.medicines FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM public.shared_lists
      WHERE shared_lists.user_id = medicines.user_id
    )
  );
