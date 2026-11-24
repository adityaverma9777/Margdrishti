import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://clukfafywaqbaohbowsv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsdWtmYWZ5d2FxYmFvaGJvd3N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjI3ODcsImV4cCI6MjA5NzE5ODc4N30.QBmUwDiIvljmwEedyjU2wpAZaHUGKavkXWrDMRUj1AE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
