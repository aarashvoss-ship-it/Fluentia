import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kmpcilwdndrpjhsvdvdc.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cdhA_pIqPDZ4F6wqAVfHSQ_xWtjzuyd";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
