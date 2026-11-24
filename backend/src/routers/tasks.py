from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from ..database import get_db

router = APIRouter(prefix="/api/tasks", tags=["Task Dispatch"])

class TaskCreate(BaseModel):
    title: str
    road_name: str
    assigned_vehicle_id: str
    target_speed_kmh: Optional[float] = 25.0
    start_address: Optional[str] = "Stretch Start"
    end_address: Optional[str] = "Stretch End"
    official_notes: Optional[str] = ""
    priority: Optional[str] = "routine"

class TaskStatusUpdate(BaseModel):
    status: str

class TaskReply(BaseModel):
    reply_text: str

@router.get("")
def list_tasks(vehicle_id: Optional[str] = None):
    with get_db() as conn:
        with conn.cursor() as cur:
            if vehicle_id:
                cur.execute("""
                    SELECT id, title, road_name, assigned_vehicle_id, assigned_vehicle_number,
                           target_speed_kmh, start_address, end_address, official_notes,
                           status, priority, surveyor_reply, reply_unread_by_official, created_at
                    FROM public.survey_tasks
                    WHERE assigned_vehicle_id = %s
                    ORDER BY created_at DESC;
                """, (vehicle_id,))
            else:
                cur.execute("""
                    SELECT id, title, road_name, assigned_vehicle_id, assigned_vehicle_number,
                           target_speed_kmh, start_address, end_address, official_notes,
                           status, priority, surveyor_reply, reply_unread_by_official, created_at
                    FROM public.survey_tasks
                    ORDER BY created_at DESC;
                """)
            return [dict(r) for r in cur.fetchall()]

@router.post("", status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT vehicle_number FROM public.survey_vehicles WHERE id = %s;", (payload.assigned_vehicle_id,))
            veh = cur.fetchone()
            if not veh:
                raise HTTPException(status_code=404, detail="Assigned vehicle not found")
            veh_number = veh["vehicle_number"]
            cur.execute("""
                INSERT INTO public.survey_tasks
                    (title, road_name, assigned_vehicle_id, assigned_vehicle_number,
                     target_speed_kmh, start_address, end_address, official_notes, priority, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
                RETURNING id, title, road_name, assigned_vehicle_id, assigned_vehicle_number,
                          target_speed_kmh, start_address, end_address, official_notes,
                          priority, status, surveyor_reply, reply_unread_by_official, created_at;
            """, (payload.title, payload.road_name, payload.assigned_vehicle_id, veh_number,
                  payload.target_speed_kmh, payload.start_address, payload.end_address,
                  payload.official_notes, payload.priority))
            new_task = cur.fetchone()
            return dict(new_task)

@router.patch("/{task_id}/status")
def update_task_status(task_id: str, payload: TaskStatusUpdate):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE public.survey_tasks
                SET status = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING id, status, updated_at;
            """, (payload.status, task_id))
            updated = cur.fetchone()
            if not updated:
                raise HTTPException(status_code=404, detail="Task not found")
            return dict(updated)

@router.post("/{task_id}/reply")
def reply_to_task(task_id: str, payload: TaskReply):
    reply_msg = payload.reply_text.strip()
    if not reply_msg:
        raise HTTPException(status_code=400, detail="Reply message cannot be empty")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE public.survey_tasks
                SET surveyor_reply = %s, reply_unread_by_official = true, updated_at = NOW()
                WHERE id = %s
                RETURNING id, assigned_vehicle_id;
            """, (reply_msg, task_id))
            task_row = cur.fetchone()
            if not task_row:
                raise HTTPException(status_code=404, detail="Task not found")
            if task_row["assigned_vehicle_id"]:
                cur.execute("""
                    UPDATE public.survey_vehicles
                    SET has_unread_reply = true
                    WHERE id = %s;
                """, (task_row["assigned_vehicle_id"],))
            return {"success": True, "task_id": task_id, "reply": reply_msg}

@router.patch("/{task_id}/mark-read")
def mark_reply_read(task_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE public.survey_tasks
                SET reply_unread_by_official = false
                WHERE id = %s
                RETURNING id, assigned_vehicle_id;
            """, (task_id,))
            task_row = cur.fetchone()
            if not task_row:
                raise HTTPException(status_code=404, detail="Task not found")
            if task_row["assigned_vehicle_id"]:
                cur.execute("""
                    SELECT COUNT(*) as unread_count
                    FROM public.survey_tasks
                    WHERE assigned_vehicle_id = %s AND reply_unread_by_official = true;
                """, (task_row["assigned_vehicle_id"],))
                count_res = cur.fetchone()
                if count_res and count_res["unread_count"] == 0:
                    cur.execute("""
                        UPDATE public.survey_vehicles
                        SET has_unread_reply = false
                        WHERE id = %s;
                    """, (task_row["assigned_vehicle_id"],))
            return {"success": True, "task_id": task_id}
