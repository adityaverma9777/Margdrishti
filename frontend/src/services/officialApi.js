import { supabase } from '../supabaseClient';

const BACKEND_BASE = import.meta.env.VITE_OFFICIAL_API_URL || 'http://127.0.0.1:8001/api';

async function requestBackend(endpoint, options = {}) {
  try {
    const res = await fetch(`${BACKEND_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchFleetVehicles() {
  const backendRes = await requestBackend('/fleet/vehicles');
  if (backendRes) return backendRes;
  const { data } = await supabase
    .from('survey_vehicles')
    .select('*')
    .order('created_at', { ascending: false });
  return data || [];
}

export async function registerVehicle(vehicleData) {
  const backendRes = await requestBackend('/fleet/vehicles', {
    method: 'POST',
    body: JSON.stringify(vehicleData)
  });
  if (backendRes) return backendRes;
  const payload = {
    vehicle_number: vehicleData.vehicle_number.toUpperCase(),
    model_name: vehicleData.model_name || 'Inspection Unit',
    driver_name: vehicleData.driver_name || 'Driver Assigned',
    crew_members: vehicleData.crew_members || [vehicleData.driver_name || 'Driver'],
    jurisdiction_name: vehicleData.jurisdiction_name || 'General Division',
    status: 'idle'
  };
  const { data } = await supabase
    .from('survey_vehicles')
    .insert([payload])
    .select()
    .single();
  return data;
}

export async function removeVehicle(vehicleId) {
  const backendRes = await requestBackend(`/fleet/vehicles/${vehicleId}`, {
    method: 'DELETE'
  });
  if (backendRes) return backendRes;
  const { error } = await supabase
    .from('survey_vehicles')
    .delete()
    .eq('id', vehicleId);
  return !error;
}

export async function fetchSurveyTasks(vehicleId = null) {
  const endpoint = vehicleId ? `/tasks?vehicle_id=${vehicleId}` : '/tasks';
  const backendRes = await requestBackend(endpoint);
  if (backendRes) return backendRes;
  let query = supabase.from('survey_tasks').select('*').order('created_at', { ascending: false });
  if (vehicleId) query = query.eq('assigned_vehicle_id', vehicleId);
  const { data } = await query;
  return data || [];
}

export async function dispatchTask(taskData) {
  const backendRes = await requestBackend('/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData)
  });
  if (backendRes) return backendRes;
  const { data } = await supabase
    .from('survey_tasks')
    .insert([taskData])
    .select()
    .single();
  return data;
}

export async function markReplyAsRead(taskId, vehicleId) {
  const backendRes = await requestBackend(`/tasks/${taskId}/mark-read`, {
    method: 'PATCH'
  });
  if (backendRes) return backendRes;
  await supabase
    .from('survey_tasks')
    .update({ reply_unread_by_official: false })
    .eq('id', taskId);
  if (vehicleId) {
    const { count } = await supabase
      .from('survey_tasks')
      .select('id', { count: 'exact' })
      .eq('assigned_vehicle_id', vehicleId)
      .eq('reply_unread_by_official', true);
    if (count === 0) {
      await supabase
        .from('survey_vehicles')
        .update({ has_unread_reply: false })
        .eq('id', vehicleId);
    }
  }
  return true;
}

export async function fetchDefectsLedger(statusFilter = null) {
  const endpoint = statusFilter ? `/defects?status_filter=${statusFilter}` : '/defects';
  const backendRes = await requestBackend(endpoint);
  if (backendRes) return backendRes;
  let query = supabase.from('hazards').select('*').order('created_at', { ascending: false }).limit(60);
  if (statusFilter) query = query.eq('action_status', statusFilter);
  const { data } = await query;
  return data || [];
}

export async function submitDefectAction(defectId, action, officialName, remarks) {
  const backendRes = await requestBackend(`/defects/${defectId}/action`, {
    method: 'PATCH',
    body: JSON.stringify({ action, official_name: officialName, remarks })
  });
  if (backendRes) return backendRes;
  const statusMap = {
    fit: { status: 'verified', action_status: 'fit' },
    validate: { status: 'under_review', action_status: 'in_validation' },
    rescan: { status: 'rejected', action_status: 'rescan_required' },
    fixed: { status: 'fixed', action_status: 'fixed' }
  };
  const updatePayload = {
    ...(statusMap[action] || { status: 'under_review', action_status: 'in_validation' }),
    reviewed_by: officialName,
    reviewed_at: new Date().toISOString(),
    official_remarks: remarks
  };
  const { data } = await supabase
    .from('hazards')
    .update(updatePayload)
    .eq('id', defectId)
    .select()
    .single();
  try {
    await supabase.from('defect_audit_logs').insert([{
      hazard_id: defectId,
      action_type: action,
      new_status: updatePayload.action_status,
      official_name: officialName,
      official_remarks: remarks
    }]);
  } catch {}
  return data;
}

export async function fetchDefectAuditTrail(defectId) {
  const backendRes = await requestBackend(`/defects/${defectId}/audit`);
  if (backendRes) return backendRes;
  const { data } = await supabase
    .from('defect_audit_logs')
    .select('*')
    .eq('hazard_id', defectId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function fetchSurveyTrips(typeFilter = null) {
  let query = supabase.from('survey_trips').select('*').order('created_at', { ascending: false });
  if (typeFilter === 'real') query = query.eq('is_demo', false);
  else if (typeFilter === 'demo') query = query.eq('is_demo', true);
  const { data } = await query;
  return data || [];
}
export async function fetchOfficialSummary() {
  const backendRes = await requestBackend('/reports/summary');
  if (backendRes) return backendRes;
  const { count: totalVehicles } = await supabase.from('survey_vehicles').select('id', { count: 'exact' });
  const { data: defects } = await supabase.from('hazards').select('type, status, action_status');
  const dList = defects || [];
  return {
    fleet: {
      total_vehicles: totalVehicles || 0,
      total_km_surveyed: 0,
      total_trips: 0,
      avg_network_pci: 100
    },
    defects: {
      total: dList.length,
      potholes: dList.filter(d => d.type === 'pothole').length,
      cracks: dList.filter(d => d.type === 'crack').length,
      fit: dList.filter(d => d.action_status === 'fit' || d.status === 'verified').length,
      in_validation: dList.filter(d => d.action_status === 'in_validation' || d.status === 'under_review').length,
      rescan_required: dList.filter(d => d.action_status === 'rescan_required' || d.status === 'rejected').length,
      fixed: dList.filter(d => d.action_status === 'fixed').length,
      pending_review: dList.filter(d => !d.action_status || d.action_status === 'pending_review').length
    }
  };
}
