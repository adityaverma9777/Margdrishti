from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..database import get_db

router = APIRouter(prefix="/api/defects", tags=["Defect Ledger & Review"])

class DefectAction(BaseModel):
    action: str
    official_name: Optional[str] = "Executive Engineer"
    remarks: Optional[str] = ""

ACTION_MAP = {
    "fit": ("verified", "fit"),
    "validate": ("under_review", "in_validation"),
    "rescan": ("rejected", "rescan_required"),
    "fixed": ("fixed", "fixed")
}

@router.get("")
def list_defects(limit: int = 50, status_filter: Optional[str] = None):
    with get_db() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT id, type, severity_score, confidence_score, status,
                       COALESCE(action_status, 'pending_review') as action_status,
                       speed_kmh, image_url, source, reviewed_by, reviewed_at,
                       official_remarks, created_at, trip_id, vehicle_number,
                       display_label, astm_code, COALESCE(is_demo, false) as is_demo,
                       ST_AsGeoJSON(location) as location_geojson
                FROM public.hazards
            """
            params = []
            if status_filter:
                query += " WHERE action_status = %s "
                params.append(status_filter)
            query += " ORDER BY created_at DESC LIMIT %s;"
            params.append(limit)
            cur.execute(query, tuple(params))
            rows = cur.fetchall()
            return [dict(r) for r in rows]

@router.patch("/{defect_id}/action")
def apply_defect_action(defect_id: str, payload: DefectAction):
    action_key = payload.action.lower()
    if action_key not in ACTION_MAP:
        raise HTTPException(status_code=400, detail="Invalid action. Allowed: fit, validate, rescan, fixed")
    db_status, action_status = ACTION_MAP[action_key]
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, status, action_status FROM public.hazards WHERE id = %s;", (defect_id,))
            current = cur.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Defect record not found")
            prev_status = current.get("action_status") or current.get("status") or "pending_review"
            cur.execute("""
                UPDATE public.hazards
                SET status = %s,
                    action_status = %s,
                    reviewed_by = %s,
                    reviewed_at = NOW(),
                    official_remarks = %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING id, type, severity_score, status, action_status, reviewed_by, reviewed_at, official_remarks;
            """, (db_status, action_status, payload.official_name, payload.remarks, defect_id))
            updated = cur.fetchone()
            cur.execute("""
                INSERT INTO public.defect_audit_logs
                    (hazard_id, previous_status, new_status, action_type, official_name, official_remarks)
                VALUES (%s, %s, %s, %s, %s, %s);
            """, (defect_id, prev_status, action_status, action_key, payload.official_name, payload.remarks))
            return dict(updated)

@router.get("/{defect_id}/audit")
def get_defect_audit(defect_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, hazard_id, previous_status, new_status, action_type,
                       official_name, official_remarks, created_at
                FROM public.defect_audit_logs
                WHERE hazard_id = %s
                ORDER BY created_at DESC;
            """, (defect_id,))
            return [dict(r) for r in cur.fetchall()]
