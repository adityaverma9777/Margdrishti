CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('hazard-images', 'hazard-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('demo-scans', 'demo-scans', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;
DROP POLICY IF EXISTS "Public Access Hazard Images" ON storage.objects;
CREATE POLICY "Public Access Hazard Images" ON storage.objects
  FOR SELECT USING (bucket_id IN ('hazard-images', 'demo-scans'));
DROP POLICY IF EXISTS "Allow Upload Hazard Images" ON storage.objects;
CREATE POLICY "Allow Upload Hazard Images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id IN ('hazard-images', 'demo-scans'));
DROP POLICY IF EXISTS "Allow Update Hazard Images" ON storage.objects;
CREATE POLICY "Allow Update Hazard Images" ON storage.objects
  FOR UPDATE USING (bucket_id IN ('hazard-images', 'demo-scans'));
CREATE TABLE IF NOT EXISTS public.gov_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('surveyor', 'official')),
    full_name TEXT NOT NULL,
    department TEXT,
    phone TEXT,
    assigned_state TEXT DEFAULT 'Assam',
    assigned_city TEXT DEFAULT 'Guwahati',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.survey_vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_number TEXT UNIQUE NOT NULL,
    model_name TEXT,
    driver_name TEXT,
    crew_members TEXT[],
    jurisdiction_name TEXT,
    status TEXT DEFAULT 'idle',
    total_distance_km NUMERIC DEFAULT 0,
    defects_logged INTEGER DEFAULT 0,
    has_unread_reply BOOLEAN DEFAULT false,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    last_location GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.survey_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    road_name TEXT NOT NULL,
    assigned_vehicle_id UUID REFERENCES public.survey_vehicles(id) ON DELETE SET NULL,
    assigned_vehicle_number TEXT,
    target_speed_kmh NUMERIC DEFAULT 25.0,
    start_address TEXT,
    end_address TEXT,
    start_location GEOMETRY(Point, 4326),
    end_location GEOMETRY(Point, 4326),
    route_points JSONB,
    distance_km NUMERIC DEFAULT 0,
    official_notes TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'routine',
    surveyor_reply TEXT,
    reply_unread_by_official BOOLEAN DEFAULT false,
    is_free_drive BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.survey_trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES public.survey_tasks(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES public.survey_vehicles(id) ON DELETE SET NULL,
    vehicle_number TEXT,
    road_name TEXT DEFAULT 'Drive & Random Scan',
    driver_name TEXT,
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    start_location GEOMETRY(Point, 4326),
    end_location GEOMETRY(Point, 4326),
    start_address TEXT,
    end_address TEXT,
    total_distance_km NUMERIC DEFAULT 0,
    avg_speed_kmh NUMERIC DEFAULT 0,
    max_speed_kmh NUMERIC DEFAULT 0,
    total_hazards_count INTEGER DEFAULT 0,
    calculated_pci INTEGER DEFAULT 100,
    pci_category TEXT DEFAULT 'Good',
    trip_route_geojson JSONB,
    speed_telemetry JSONB,
    is_demo BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'in_progress',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.hazards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES public.survey_trips(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES public.survey_vehicles(id) ON DELETE SET NULL,
    vehicle_number TEXT,
    type VARCHAR NOT NULL,
    display_label TEXT,
    astm_code INTEGER,
    severity_score INTEGER DEFAULT 3,
    confidence_score DOUBLE PRECISION DEFAULT 0.85,
    speed_kmh NUMERIC DEFAULT 0,
    location GEOMETRY(Point, 4326),
    image_url TEXT,
    is_demo BOOLEAN DEFAULT false,
    source VARCHAR DEFAULT 'yolo11_survey_unit',
    status VARCHAR DEFAULT 'under_review',
    action_status VARCHAR DEFAULT 'pending_review',
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    official_remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.defect_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hazard_id UUID REFERENCES public.hazards(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    action_type TEXT NOT NULL,
    official_name TEXT,
    official_remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS road_name TEXT DEFAULT 'Drive & Random Scan';
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS start_location GEOMETRY(Point, 4326);
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS end_location GEOMETRY(Point, 4326);
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS start_address TEXT;
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS end_address TEXT;
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS trip_route_geojson JSONB;
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS speed_telemetry JSONB;
ALTER TABLE public.survey_trips ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES public.survey_trips(id) ON DELETE SET NULL;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.survey_vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS vehicle_number TEXT;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS display_label TEXT;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS astm_code INTEGER;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_hazards_trip_id ON public.hazards(trip_id);
CREATE INDEX IF NOT EXISTS idx_hazards_vehicle_id ON public.hazards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_hazards_is_demo ON public.hazards(is_demo);
CREATE INDEX IF NOT EXISTS idx_survey_trips_vehicle_id ON public.survey_trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_survey_trips_is_demo ON public.survey_trips(is_demo);
CREATE INDEX IF NOT EXISTS idx_survey_trips_status ON public.survey_trips(status);
GRANT ALL ON TABLE public.gov_profiles TO anon, authenticated, service_role, postgres;
GRANT ALL ON TABLE public.survey_vehicles TO anon, authenticated, service_role, postgres;
GRANT ALL ON TABLE public.survey_tasks TO anon, authenticated, service_role, postgres;
GRANT ALL ON TABLE public.survey_trips TO anon, authenticated, service_role, postgres;
GRANT ALL ON TABLE public.hazards TO anon, authenticated, service_role, postgres;
GRANT ALL ON TABLE public.defect_audit_logs TO anon, authenticated, service_role, postgres;
ALTER TABLE public.gov_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access gov_profiles" ON public.gov_profiles;
CREATE POLICY "Public access gov_profiles" ON public.gov_profiles FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public access survey_vehicles" ON public.survey_vehicles;
CREATE POLICY "Public access survey_vehicles" ON public.survey_vehicles FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public access survey_tasks" ON public.survey_tasks;
CREATE POLICY "Public access survey_tasks" ON public.survey_tasks FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public access survey_trips" ON public.survey_trips;
CREATE POLICY "Public access survey_trips" ON public.survey_trips FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public access hazards" ON public.hazards;
CREATE POLICY "Public access hazards" ON public.hazards FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public access defect_audit_logs" ON public.defect_audit_logs;
CREATE POLICY "Public access defect_audit_logs" ON public.defect_audit_logs FOR ALL USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';
