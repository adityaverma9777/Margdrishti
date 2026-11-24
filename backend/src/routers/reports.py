from fastapi import APIRouter
from ..database import get_db

router = APIRouter(prefix="/api/reports", tags=["Official Compliance Reports"])

@router.get("/summary")
def get_official_summary():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as count FROM public.survey_vehicles;")
            total_vehicles = cur.fetchone()["count"]

            cur.execute("""
                SELECT COALESCE(SUM(total_distance_km), 0) as total_km,
                       COUNT(*) as total_trips,
                       COALESCE(AVG(calculated_pci), 100) as avg_pci
                FROM public.survey_trips;
            """)
            trips_stats = cur.fetchone()

            cur.execute("""
                SELECT 
                    COUNT(*) as total_defects,
                    COUNT(*) FILTER (WHERE type = 'pothole') as potholes,
                    COUNT(*) FILTER (WHERE type = 'crack') as cracks,
                    COUNT(*) FILTER (WHERE action_status = 'fit' OR status = 'verified') as fit_count,
                    COUNT(*) FILTER (WHERE action_status = 'in_validation' OR status = 'under_review') as validation_count,
                    COUNT(*) FILTER (WHERE action_status = 'rescan_required' OR status = 'rejected') as rescan_count,
                    COUNT(*) FILTER (WHERE action_status = 'fixed') as fixed_count,
                    COUNT(*) FILTER (WHERE action_status = 'pending_review' OR action_status IS NULL) as pending_count
                FROM public.hazards;
            """)
            defects_stats = cur.fetchone()

            return {
                "fleet": {
                    "total_vehicles": total_vehicles,
                    "total_km_surveyed": round(float(trips_stats["total_km"]), 2),
                    "total_trips": trips_stats["total_trips"],
                    "avg_network_pci": round(float(trips_stats["avg_pci"]), 1)
                },
                "defects": {
                    "total": defects_stats["total_defects"],
                    "potholes": defects_stats["potholes"],
                    "cracks": defects_stats["cracks"],
                    "fit": defects_stats["fit_count"],
                    "in_validation": defects_stats["validation_count"],
                    "rescan_required": defects_stats["rescan_count"],
                    "fixed": defects_stats["fixed_count"],
                    "pending_review": defects_stats["pending_count"]
                }
            }

@router.get("/vehicle/{vehicle_id}")
def get_vehicle_compliance_dossier(vehicle_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, vehicle_number, model_name, driver_name, crew_members,
                       jurisdiction_name, status, total_distance_km, defects_logged, created_at
                FROM public.survey_vehicles
                WHERE id = %s;
            """, (vehicle_id,))
            veh = cur.fetchone()
            if not veh:
                return {"error": "Vehicle not found"}
            cur.execute("""
                SELECT id, title, road_name, target_speed_kmh, status, created_at
                FROM public.survey_tasks
                WHERE assigned_vehicle_id = %s
                ORDER BY created_at DESC;
            """, (vehicle_id,))
            tasks = [dict(t) for t in cur.fetchall()]
            cur.execute("""
                SELECT id, total_distance_km, avg_speed_kmh, total_hazards_count,
                       calculated_pci, pci_category, created_at
                FROM public.survey_trips
                WHERE vehicle_id = %s
                ORDER BY created_at DESC;
            """, (vehicle_id,))
            trips = [dict(tr) for tr in cur.fetchall()]
            return {
                "vehicle": dict(veh),
                "tasks": tasks,
                "trips": trips
            }
