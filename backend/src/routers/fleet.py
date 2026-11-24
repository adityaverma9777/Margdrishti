from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from ..database import get_db

router = APIRouter(prefix="/api/fleet", tags=["Fleet Management"])

class VehicleCreate(BaseModel):
    vehicle_number: str
    model_name: Optional[str] = "Inspection Unit"
    driver_name: Optional[str] = "Driver Assigned"
    crew_members: Optional[List[str]] = []
    jurisdiction_name: Optional[str] = "General Division"

class VehicleUpdate(BaseModel):
    model_name: Optional[str] = None
    driver_name: Optional[str] = None
    crew_members: Optional[List[str]] = None
    status: Optional[str] = None
    jurisdiction_name: Optional[str] = None

@router.get("/vehicles")
def list_vehicles():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, vehicle_number, model_name, driver_name, crew_members, 
                       jurisdiction_name, status, total_distance_km, defects_logged, 
                       has_unread_reply, last_heartbeat, created_at
                FROM public.survey_vehicles
                ORDER BY created_at DESC;
            """)
            rows = cur.fetchall()
            return [dict(r) for r in rows]

@router.post("/vehicles", status_code=status.HTTP_201_CREATED)
def create_vehicle(payload: VehicleCreate):
    veh_num = payload.vehicle_number.strip().upper()
    if not veh_num:
        raise HTTPException(status_code=400, detail="Vehicle number is required")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM public.survey_vehicles WHERE vehicle_number = %s;", (veh_num,))
            if cur.fetchone():
                raise HTTPException(status_code=409, detail=f"Vehicle {veh_num} is already registered")
            crew = payload.crew_members if payload.crew_members else [payload.driver_name]
            cur.execute("""
                INSERT INTO public.survey_vehicles 
                    (vehicle_number, model_name, driver_name, crew_members, jurisdiction_name, status)
                VALUES (%s, %s, %s, %s, %s, 'idle')
                RETURNING id, vehicle_number, model_name, driver_name, crew_members, 
                          jurisdiction_name, status, total_distance_km, defects_logged, 
                          has_unread_reply, created_at;
            """, (veh_num, payload.model_name, payload.driver_name, crew, payload.jurisdiction_name))
            new_veh = cur.fetchone()
            return dict(new_veh)

@router.get("/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, vehicle_number, model_name, driver_name, crew_members, 
                       jurisdiction_name, status, total_distance_km, defects_logged, 
                       has_unread_reply, last_heartbeat, created_at
                FROM public.survey_vehicles
                WHERE id = %s;
            """, (vehicle_id,))
            veh = cur.fetchone()
            if not veh:
                raise HTTPException(status_code=404, detail="Vehicle not found")
            cur.execute("""
                SELECT id, title, road_name, target_speed_kmh, status, created_at
                FROM public.survey_tasks
                WHERE assigned_vehicle_id = %s
                ORDER BY created_at DESC
                LIMIT 5;
            """, (vehicle_id,))
            tasks = [dict(t) for t in cur.fetchall()]
            data = dict(veh)
            data["recent_tasks"] = tasks
            return data

@router.delete("/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM public.survey_vehicles WHERE id = %s RETURNING id;", (vehicle_id,))
            deleted = cur.fetchone()
            if not deleted:
                raise HTTPException(status_code=404, detail="Vehicle not found")
            return {"success": True, "deleted_id": vehicle_id}
