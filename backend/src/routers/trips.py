from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from ..database import get_db

router = APIRouter(prefix="/api/trips", tags=["Survey Trips & PCI"])

class TripCreate(BaseModel):
    task_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    vehicle_number: Optional[str] = "Unit"
    total_distance_km: Optional[float] = 0.0
    avg_speed_kmh: Optional[float] = 0.0
    max_speed_kmh: Optional[float] = 0.0
    total_hazards_count: Optional[int] = 0
    calculated_pci: Optional[int] = 100
    pci_category: Optional[str] = "Good"

@router.get("")
def list_trips(vehicle_id: Optional[str] = None):
    with get_db() as conn:
        with conn.cursor() as cur:
            if vehicle_id:
                cur.execute("""
                    SELECT id, task_id, vehicle_id, vehicle_number, total_distance_km,
                           avg_speed_kmh, max_speed_kmh, total_hazards_count,
                           calculated_pci, pci_category, status, created_at
                    FROM public.survey_trips
                    WHERE vehicle_id = %s
                    ORDER BY created_at DESC;
                """, (vehicle_id,))
            else:
                cur.execute("""
                    SELECT id, task_id, vehicle_id, vehicle_number, total_distance_km,
                           avg_speed_kmh, max_speed_kmh, total_hazards_count,
                           calculated_pci, pci_category, status, created_at
                    FROM public.survey_trips
                    ORDER BY created_at DESC;
                """)
            return [dict(r) for r in cur.fetchall()]

@router.post("", status_code=status.HTTP_201_CREATED)
def create_trip(payload: TripCreate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO public.survey_trips
                    (task_id, vehicle_id, vehicle_number, total_distance_km, avg_speed_kmh,
                     max_speed_kmh, total_hazards_count, calculated_pci, pci_category, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'completed')
                RETURNING id, task_id, vehicle_id, vehicle_number, total_distance_km,
                          avg_speed_kmh, max_speed_kmh, total_hazards_count,
                          calculated_pci, pci_category, status, created_at;
            """, (payload.task_id, payload.vehicle_id, payload.vehicle_number,
                  payload.total_distance_km, payload.avg_speed_kmh, payload.max_speed_kmh,
                  payload.total_hazards_count, payload.calculated_pci, payload.pci_category))
            new_trip = cur.fetchone()
            if payload.vehicle_id:
                cur.execute("""
                    UPDATE public.survey_vehicles
                    SET total_distance_km = total_distance_km + %s,
                        defects_logged = defects_logged + %s,
                        updated_at = NOW()
                    WHERE id = %s;
                """, (payload.total_distance_km, payload.total_hazards_count, payload.vehicle_id))
            if payload.task_id:
                cur.execute("""
                    UPDATE public.survey_tasks
                    SET status = 'completed', updated_at = NOW()
                    WHERE id = %s;
                """, (payload.task_id,))
            return dict(new_trip)

@router.get("/{trip_id}")
def get_trip(trip_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, task_id, vehicle_id, vehicle_number, total_distance_km,
                       avg_speed_kmh, max_speed_kmh, total_hazards_count,
                       calculated_pci, pci_category, status, created_at
                FROM public.survey_trips
                WHERE id = %s;
            """, (trip_id,))
            trip = cur.fetchone()
            if not trip:
                raise HTTPException(status_code=404, detail="Trip record not found")
            return dict(trip)
