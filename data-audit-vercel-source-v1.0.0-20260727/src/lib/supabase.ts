import { createClient } from '@supabase/supabase-js';

const runtimeConfig = typeof window === 'undefined' ? undefined : window.__APP_CONFIG__;
const supabaseUrl = runtimeConfig?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = runtimeConfig?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);
