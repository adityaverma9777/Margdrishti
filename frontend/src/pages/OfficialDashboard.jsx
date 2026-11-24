import React, { useState, useEffect } from 'react';
import { Car, Plus, Send, RefreshCw, Printer, ShieldCheck, Route, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

export default function OfficialDashboard() {
  const { currentUser } = useAuth();
  const [vehicles, setVehicles] = useState(() => {
    try {
      const saved = localStorage.getItem('streetiq_gov_vehicles');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [defects, setDefects] = useState([]);
  const [loadingDefects, setLoadingDefects] = useState(true);
  const [activeTab, setActiveTab] = useState('fleet');
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [newVehNumber, setNewVehNumber] = useState('');
  const [newVehModel, setNewVehModel] = useState('');
  const [newVehDriver, setNewVehDriver] = useState('');
  const [newVehCrew, setNewVehCrew] = useState('');
  const [taskStretchName, setTaskStretchName] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskSpeed, setTaskSpeed] = useState('25');

  const fetchDatabaseData = async () => {
    setLoadingDefects(true);
    try {
      const { data: dbVehicles } = await supabase
        .from('survey_vehicles')
        .select('*')
        .order('created_at', { ascending: false });
      if (dbVehicles && dbVehicles.length > 0) {
        setVehicles(dbVehicles);
        localStorage.setItem('streetiq_gov_vehicles', JSON.stringify(dbVehicles));
        if (!selectedVehicle) setSelectedVehicle(dbVehicles[0]);
      } else if (vehicles.length > 0 && !selectedVehicle) {
        setSelectedVehicle(vehicles[0]);
      }
    } catch {}

    try {
      const { data: dbHazards } = await supabase
        .from('hazards')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (dbHazards && dbHazards.length > 0) {
        const mapped = dbHazards.map(h => ({
          id: h.id,
          defectType: h.type === 'pothole' ? 'Pothole (ASTM 13)' : h.type === 'crack' ? 'Road Crack (ASTM 1/10)' : `${h.type} (Distress)`,
          severity: h.severity_score || 4,
          speedKmh: 24,
          location: h.location ? `Geo: ${JSON.stringify(h.location)}` : 'Survey Segment',
          time: new Date(h.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          status: h.status === 'verified' ? 'fit' : h.status === 'under_review' ? 'in_validation' : h.status === 'rejected' ? 'rescan_required' : 'pending_review',
          confidence: h.confidence_score || 0.88,
          source: h.source || 'Vehicle Scan'
        }));
        setDefects(mapped);
      } else {
        setDefects([]);
      }
    } catch {}
    setLoadingDefects(false);
  };

  useEffect(() => {
    fetchDatabaseData();
  }, []);

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!newVehNumber) return;
    const newVeh = {
      id: `veh_${Date.now()}`,
      number: newVehNumber.toUpperCase(),
      model: newVehModel || 'Inspection Vehicle',
      driver: newVehDriver || 'Driver Assigned',
      crew: newVehCrew ? newVehCrew.split(',').map(s => s.trim()) : [newVehDriver || 'Driver'],
      status: 'idle',
      totalKm: 0,
      defectsLogged: 0,
      hasUnreadReply: false,
      created_at: new Date().toISOString()
    };
    try {
      await supabase.from('survey_vehicles').insert([newVeh]);
    } catch {}
    const updated = [newVeh, ...vehicles];
    setVehicles(updated);
    setSelectedVehicle(newVeh);
    localStorage.setItem('streetiq_gov_vehicles', JSON.stringify(updated));
    setShowAddVehicleModal(false);
    setNewVehNumber('');
    setNewVehModel('');
    setNewVehDriver('');
    setNewVehCrew('');
  };

  const handleUpdateDefectStatus = async (defectId, newStatus) => {
    const dbStatus = newStatus === 'fit' ? 'verified' : newStatus === 'rescan_required' ? 'rejected' : 'under_review';
    setDefects(defects.map(d => d.id === defectId ? { ...d, status: newStatus } : d));
    try {
      await supabase.from('hazards').update({ status: dbStatus, updated_at: new Date().toISOString() }).eq('id', defectId);
    } catch {}
  };

  const handleAssignTask = async (e) => {
    e.preventDefault();
    if (!taskStretchName || !selectedVehicle) return;
    const newTask = {
      id: `task_${Date.now()}`,
      title: taskStretchName,
      road_name: taskStretchName,
      assigned_vehicle_id: selectedVehicle.id,
      target_speed_kmh: Number(taskSpeed) || 25,
      official_notes: taskNotes,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    try {
      await supabase.from('survey_tasks').insert([newTask]);
    } catch {}
    alert(`Survey stretch assigned to ${selectedVehicle.number}.`);
    setShowAssignModal(false);
    setTaskStretchName('');
    setTaskNotes('');
  };

  return (
    <div className="gov-container" style={{ padding: '24px 20px', minHeight: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.3px' }}>
              Official Desk & Fleet Oversight
            </h1>
            <span className="gov-badge gov-badge-blue">Official Console</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            Officer: <strong>{currentUser?.name || 'Executive Officer'}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="gov-btn-secondary"
            onClick={fetchDatabaseData}
          >
            <RefreshCw size={14} />
            <span>Sync</span>
          </button>
          <button
            className="gov-btn-secondary"
            onClick={() => window.print()}
          >
            <Printer size={14} />
            <span>Print Report</span>
          </button>
          <button
            className="gov-btn-primary"
            onClick={() => setShowAddVehicleModal(true)}
          >
            <Plus size={14} />
            <span>Add Vehicle</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Survey Vehicles
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-navy)', marginTop: '6px' }}>
            {vehicles.length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Units</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            Registered in fleet
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Live Defects Logged
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-red)', marginTop: '6px' }}>
            {defects.length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Items</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            {defects.filter(d => d.status === 'pending_review' || d.status === 'in_validation').length} Pending Review
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Boundary Check
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-green)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={20} color="var(--gov-green)" />
            <span>Zone Guard Active</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            Geofence tracking active
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--gov-border)', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('fleet')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'fleet' ? '3px solid var(--gov-blue)' : '3px solid transparent',
            background: 'transparent',
            fontWeight: 700,
            fontSize: '13px',
            color: activeTab === 'fleet' ? 'var(--gov-navy)' : 'var(--gov-text-muted)',
            cursor: 'pointer'
          }}
        >
          Survey Vehicles ({vehicles.length})
        </button>
        <button
          onClick={() => setActiveTab('defects')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'defects' ? '3px solid var(--gov-blue)' : '3px solid transparent',
            background: 'transparent',
            fontWeight: 700,
            fontSize: '13px',
            color: activeTab === 'defects' ? 'var(--gov-navy)' : 'var(--gov-text-muted)',
            cursor: 'pointer'
          }}
        >
          Defect Ledger ({defects.length})
        </button>
      </div>

      {activeTab === 'fleet' && (
        <div style={{ display: 'grid', gridTemplateColumns: vehicles.length > 0 ? 'minmax(300px, 1.2fr) minmax(340px, 1.8fr)' : '1fr', gap: '20px' }}>
          <div className="gov-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', background: 'var(--gov-card-subtle)', borderBottom: '1px solid var(--gov-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-navy)' }}>
                Registered Fleet ({vehicles.length})
              </span>
              <button
                className="gov-btn-primary"
                onClick={() => setShowAddVehicleModal(true)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                <Plus size={13} />
                <span>Add Vehicle</span>
              </button>
            </div>

            {vehicles.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                <Car size={32} color="var(--gov-text-muted)" style={{ margin: '0 auto 10px' }} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>No Survey Vehicles Registered</div>
                <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px', maxWidth: '340px', margin: '4px auto 14px' }}>
                  Register your first vehicle unit to dispatch road stretches and track field surveys.
                </p>
                <button
                  className="gov-btn-primary"
                  onClick={() => setShowAddVehicleModal(true)}
                  style={{ fontSize: '13px', padding: '8px 14px' }}
                >
                  <Plus size={14} />
                  <span>Register Vehicle</span>
                </button>
              </div>
            ) : (
              <div>
                {vehicles.map((v) => {
                  const isSelected = selectedVehicle?.id === v.id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => setSelectedVehicle(v)}
                      style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid var(--gov-border)',
                        cursor: 'pointer',
                        background: isSelected ? '#f0f9ff' : '#ffffff',
                        borderLeft: isSelected ? '4px solid var(--gov-blue)' : '4px solid transparent'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--gov-text-primary)' }}>{v.number}</div>
                          <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
                            {v.model} • Driver: {v.driver}
                          </div>
                        </div>
                        <span className={`gov-badge ${v.status === 'surveying' ? 'gov-badge-green' : 'gov-badge-neutral'}`} style={{ fontSize: '10px' }}>
                          {v.status === 'surveying' ? 'Active' : 'Idle'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedVehicle && (
            <div className="gov-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--gov-border)', paddingBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                    Vehicle {selectedVehicle.number}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
                    {selectedVehicle.model} • Driver: {selectedVehicle.driver}
                  </div>
                </div>
                <button
                  className="gov-btn-primary"
                  onClick={() => setShowAssignModal(true)}
                  style={{ padding: '8px 14px', fontSize: '12px' }}
                >
                  <Send size={13} />
                  <span>Dispatch Task</span>
                </button>
              </div>

              <div style={{ background: 'var(--gov-card-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Crew Members</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-text-primary)', marginTop: '3px' }}>
                  {Array.isArray(selectedVehicle.crew) ? selectedVehicle.crew.join(', ') : selectedVehicle.driver}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'defects' && (
        <div className="gov-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', background: 'var(--gov-card-subtle)', borderBottom: '1px solid var(--gov-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-navy)' }}>
              Road Defect Ledger ({defects.length})
            </span>
          </div>

          {loadingDefects ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--gov-text-muted)', fontSize: '13px' }}>
              Loading defect records...
            </div>
          ) : defects.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center' }}>
              <AlertCircle size={32} color="var(--gov-text-muted)" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>No Defects Recorded Yet</div>
              <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px', maxWidth: '340px', margin: '4px auto' }}>
                When survey vehicles run scans, detected potholes and cracks will appear here for engineering verification.
              </p>
            </div>
          ) : (
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Defect Type</th>
                  <th>Location & Time</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {defects.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{d.defectType}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>Confidence: {Math.round(d.confidence * 100)}%</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>{d.location}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>{d.time}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: d.severity >= 4 ? 'var(--gov-red)' : 'var(--gov-amber)' }}>{d.severity}/5</span>
                    </td>
                    <td>
                      <span className={`gov-badge ${d.status === 'fit' ? 'gov-badge-green' : d.status === 'in_validation' ? 'gov-badge-amber' : 'gov-badge-neutral'}`}>
                        {d.status === 'fit' ? 'Fit' : d.status === 'in_validation' ? 'Validate' : 'Pending'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          onClick={() => handleUpdateDefectStatus(d.id, 'fit')}
                          className="gov-btn-secondary"
                          style={{ padding: '3px 7px', fontSize: '11px', color: 'var(--gov-green)' }}
                        >
                          Mark Fit
                        </button>
                        <button
                          onClick={() => handleUpdateDefectStatus(d.id, 'in_validation')}
                          className="gov-btn-secondary"
                          style={{ padding: '3px 7px', fontSize: '11px', color: 'var(--gov-blue)' }}
                        >
                          Validate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showAddVehicleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="gov-card" style={{ width: '100%', maxWidth: '440px', padding: '22px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)', marginBottom: '14px' }}>
              Register Survey Vehicle
            </h2>
            <form onSubmit={handleAddVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Registration Number</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. AS-01-BX-4021"
                  value={newVehNumber}
                  onChange={(e) => setNewVehNumber(e.target.value.toUpperCase())}
                  style={{ textTransform: 'uppercase' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Vehicle Model</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. Mahindra Bolero Unit #01"
                  value={newVehModel}
                  onChange={(e) => setNewVehModel(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Driver Name</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. Rajesh Sharma"
                  value={newVehDriver}
                  onChange={(e) => setNewVehDriver(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Crew Personnel (comma separated)</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. Rajesh Sharma, Bipul Das"
                  value={newVehCrew}
                  onChange={(e) => setNewVehCrew(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="gov-btn-secondary"
                  onClick={() => setShowAddVehicleModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gov-btn-primary"
                >
                  Register Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignModal && selectedVehicle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="gov-card" style={{ width: '100%', maxWidth: '440px', padding: '22px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)', marginBottom: '14px' }}>
              Dispatch Road Stretch to {selectedVehicle.number}
            </h2>
            <form onSubmit={handleAssignTask} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Road Stretch Name</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. Ring Road Junction A to B"
                  value={taskStretchName}
                  onChange={(e) => setTaskStretchName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Target Speed (km/h)</label>
                <select
                  value={taskSpeed}
                  onChange={(e) => setTaskSpeed(e.target.value)}
                  className="gov-input"
                >
                  <option value="20">20 km/h (Urban / Arterial)</option>
                  <option value="25">25 km/h (State Highway)</option>
                  <option value="30">30 km/h (Bypass Corridor)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Field Directives</label>
                <textarea
                  className="gov-input"
                  rows={2}
                  placeholder="Optional field notes..."
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="gov-btn-secondary"
                  onClick={() => setShowAssignModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gov-btn-primary"
                >
                  Dispatch Stretch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
