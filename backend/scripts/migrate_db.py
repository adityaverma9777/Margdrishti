import psycopg2

DB_URL = 'postgresql://postgres:XgBS8CEpEVRim8jG@db.clukfafywaqbaohbowsv.supabase.co:5432/postgres'

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

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
    official_notes TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'routine',
    surveyor_reply TEXT,
    reply_unread_by_official BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.survey_trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES public.survey_tasks(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES public.survey_vehicles(id) ON DELETE SET NULL,
    vehicle_number TEXT,
    total_distance_km NUMERIC DEFAULT 0,
    avg_speed_kmh NUMERIC DEFAULT 0,
    max_speed_kmh NUMERIC DEFAULT 0,
    total_hazards_count INTEGER DEFAULT 0,
    calculated_pci INTEGER DEFAULT 100,
    pci_category TEXT DEFAULT 'Good',
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
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

ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS action_status VARCHAR DEFAULT 'pending_review';
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS speed_kmh NUMERIC;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.hazards ADD COLUMN IF NOT EXISTS official_remarks TEXT;

GRANT ALL ON TABLE public.survey_vehicles TO anon, authenticated, service_role, postgres;
GRANT ALL ON TABLE public.survey_tasks TO anon, authenticated, service_role, postgres;
GRANT ALL ON TABLE public.survey_trips TO anon, authenticated, service_role, postgres;
GRANT ALL ON TABLE public.defect_audit_logs TO anon, authenticated, service_role, postgres;
GRANT ALL ON TABLE public.hazards TO anon, authenticated, service_role, postgres;

ALTER TABLE public.survey_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access survey_vehicles" ON public.survey_vehicles;
CREATE POLICY "Public access survey_vehicles" ON public.survey_vehicles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access survey_tasks" ON public.survey_tasks;
CREATE POLICY "Public access survey_tasks" ON public.survey_tasks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access survey_trips" ON public.survey_trips;
CREATE POLICY "Public access survey_trips" ON public.survey_trips FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access defect_audit_logs" ON public.defect_audit_logs;
CREATE POLICY "Public access defect_audit_logs" ON public.defect_audit_logs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
"""

def run_migration():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(SCHEMA_SQL)
    print("Migration executed successfully. PostgREST schema cache reloaded.")
    conn.close()

if __name__ == '__main__':
    run_migration()
