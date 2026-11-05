ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_wallet_widget boolean NOT NULL DEFAULT false;
