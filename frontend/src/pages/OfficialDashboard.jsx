import React, { useState, useEffect, useCallback } from 'react';
import { Car, Plus, Send, RefreshCw, Printer, ShieldCheck, AlertCircle, History, MessageSquare, Check, X, MapPin, Globe, Route, PenTool } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchFleetVehicles,
  registerVehicle,
  removeVehicle,
  fetchSurveyTasks,
  dispatchTask,
  markReplyAsRead,
  fetchDefectsLedger,
  submitDefectAction,
  fetchDefectAuditTrail,
  fetchOfficialSummary
} from '../services/officialApi';
import FleetOverviewMap from '../components/FleetOverviewMap';
import StretchPlannerMap from '../components/StretchPlannerMap';
import { STATE_COORDINATES } from '../utils/routingEngine';

const STATE_OPTIONS = Object.keys(STATE_COORDINATES);

export default function OfficialDashboard() {
  const { currentUser } = useAuth();
  const [selectedState, setSelectedState] = useState('Assam');
  const [activeTab, setActiveTab] = useState('fleet');
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleTasks, setVehicleTasks] = useState([]);
  const [defects, setDefects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedDefectForAudit, setSelectedDefectForAudit] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const [newVehNumber, setNewVehNumber] = useState('');
  const [newVehModel, setNewVehModel] = useState('');
  const [newVehDriver, setNewVehDriver] = useState('');
  const [newVehCrew, setNewVehCrew] = useState('');
  const [newVehJurisdiction, setNewVehJurisdiction] = useState('Assam PWD Central Division');

  const [taskStretchName, setTaskStretchName] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskSpeed, setTaskSpeed] = useState('25');
  const [taskPriority, setTaskPriority] = useState('routine');
  const [taskDistanceKm, setTaskDistanceKm] = useState(0);
  const [taskRoutePoints, setTaskRoutePoints] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [vehList, defectList, sumData] = await Promise.all([
      fetchFleetVehicles(),
      fetchDefectsLedger(),
      fetchOfficialSummary()
    ]);
    const filteredVehicles = vehList.filter(v => !v.state || v.state === selectedState);
    setVehicles(filteredVehicles);
    setDefects(defectList);
    setSummary(sumData);
    if (filteredVehicles.length > 0) {
      const active = selectedVehicle ? filteredVehicles.find(v => v.id === selectedVehicle.id) || filteredVehicles[0] : filteredVehicles[0];
      setSelectedVehicle(active);
      const tasks = await fetchSurveyTasks(active.id);
      setVehicleTasks(tasks);
    } else {
      setSelectedVehicle(null);
      setVehicleTasks([]);
    }
    setLoading(false);
  }, [selectedVehicle, selectedState]);

  useEffect(() => {
    loadData();
  }, [selectedState]);

  const handleSelectVehicle = async (veh) => {
    setSelectedVehicle(veh);
    const tasks = await fetchSurveyTasks(veh.id);
    setVehicleTasks(tasks);
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!newVehNumber) return;
    const crewList = newVehCrew ? newVehCrew.split(',').map(s => s.trim()) : [newVehDriver || 'Driver Assigned'];
    const created = await registerVehicle({
      vehicle_number: newVehNumber.toUpperCase(),
      model_name: newVehModel || 'Inspection Unit',
      driver_name: newVehDriver || 'Driver Assigned',
      crew_members: crewList,
      jurisdiction_name: newVehJurisdiction || `${selectedState} PWD Division`,
      state: selectedState
    });
    if (created) {
      setNewVehNumber('');
      setNewVehModel('');
      setNewVehDriver('');
      setNewVehCrew('');
      setShowAddVehicleModal(false);
      await loadData();
    }
  };

  const handleDeleteVehicle = async (vehId) => {
    if (!window.confirm('Are you sure you want to decommission this vehicle?')) return;
    await removeVehicle(vehId);
    await loadData();
  };

  const handleRouteConfirmedFromMap = (routeInfo) => {
    setTaskStretchName(routeInfo.roadName);
    setTaskDistanceKm(routeInfo.distanceKm);
    setTaskRoutePoints(routeInfo.routePoints);
  };

  const handleAssignTask = async (e) => {
    e.preventDefault();
    if (!taskStretchName || !selectedVehicle) return;
    const newTask = {
      title: taskStretchName,
      road_name: taskStretchName,
      assigned_vehicle_id: selectedVehicle.id,
      target_speed_kmh: Number(taskSpeed) || 25,
      official_notes: taskNotes,
      priority: taskPriority,
      distance_km: taskDistanceKm || 0,
      route_points: taskRoutePoints || null,
      state: selectedState,
      start_address: `${selectedState} Stretch Start`,
      end_address: `${selectedState} Stretch End`
    };
    await dispatchTask(newTask);
    setShowAssignModal(false);
    setTaskStretchName('');
    setTaskNotes('');
    setTaskDistanceKm(0);
    setTaskRoutePoints(null);
    const tasks = await fetchSurveyTasks(selectedVehicle.id);
    setVehicleTasks(tasks);
  };

  const handleMarkReplyRead = async (taskId) => {
    await markReplyAsRead(taskId, selectedVehicle?.id);
    if (selectedVehicle) {
      const tasks = await fetchSurveyTasks(selectedVehicle.id);
      setVehicleTasks(tasks);
      const vehList = await fetchFleetVehicles();
      setVehicles(vehList.filter(v => !v.state || v.state === selectedState));
    }
  };

  const handleDefectAction = async (defectId, action) => {
    const officialName = currentUser?.name || 'Executive Officer';
    await submitDefectAction(defectId, action, officialName, `Reviewed as ${action.toUpperCase()}`);
    const [updatedDefects, sumData] = await Promise.all([
      fetchDefectsLedger(),
      fetchOfficialSummary()
    ]);
    setDefects(updatedDefects);
    setSummary(sumData);
  };

  const handleOpenAuditModal = async (defect) => {
    setSelectedDefectForAudit(defect);
    setLoadingAudit(true);
    const logs = await fetchDefectAuditTrail(defect.id);
    setAuditLogs(logs);
    setLoadingAudit(false);
  };

  return (
    <div className="gov-container" style={{ padding: '24px 20px', minHeight: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.3px' }}>
              Official Desk & Fleet Oversight
            </h1>
            <span className="gov-badge gov-badge-blue">Official Console</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            Officer: <strong>{currentUser?.name || 'Executive Officer'}</strong> • Active State: <strong>{selectedState}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid var(--gov-border)', padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}>
            <Globe size={15} color="var(--gov-blue)" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)' }}>Jurisdiction:</span>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: '13px', color: 'var(--gov-navy)', outline: 'none', cursor: 'pointer' }}
            >
              {STATE_OPTIONS.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <button className="gov-btn-secondary" onClick={loadData}>
            <RefreshCw size={14} />
            <span>Sync</span>
          </button>
          <button className="gov-btn-secondary" onClick={() => window.print()}>
            <Printer size={14} />
            <span>Print Report</span>
          </button>
          <button className="gov-btn-primary" onClick={() => setShowAddVehicleModal(true)}>
            <Plus size={14} />
            <span>Add Vehicle</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Survey Vehicles ({selectedState})
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-navy)', marginTop: '6px' }}>
            {vehicles.length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Units</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            Registered in {selectedState} fleet
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Live Defects Logged
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-red)', marginTop: '6px' }}>
            {summary ? summary.defects.total : defects.length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Items</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            {summary ? summary.defects.pending_review : 0} Pending Verification
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Validation Progress
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-green)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={20} color="var(--gov-green)" />
            <span>{summary ? summary.defects.fit : 0} Verified Fit</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            {summary ? summary.defects.in_validation : 0} In Field Validation
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
          Fleet & Task Dispatch ({vehicles.length})
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
        <button
          onClick={() => setActiveTab('compliance')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'compliance' ? '3px solid var(--gov-blue)' : '3px solid transparent',
            background: 'transparent',
            fontWeight: 700,
            fontSize: '13px',
            color: activeTab === 'compliance' ? 'var(--gov-navy)' : 'var(--gov-text-muted)',
            cursor: 'pointer'
          }}
        >
          Compliance Report
        </button>
      </div>

      {activeTab === 'fleet' && (
        <div>
          <FleetOverviewMap
            selectedState={selectedState}
            vehicles={vehicles}
            selectedVehicle={selectedVehicle}
            onSelectVehicle={handleSelectVehicle}
            defects={defects}
          />

          <div style={{ display: 'grid', gridTemplateColumns: vehicles.length > 0 ? 'minmax(300px, 1.1fr) minmax(360px, 1.9fr)' : '1fr', gap: '20px' }}>
            <div className="gov-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', background: 'var(--gov-card-subtle)', borderBottom: '1px solid var(--gov-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-navy)' }}>
                  Registered Fleet in {selectedState} ({vehicles.length})
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

              {loading ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--gov-text-muted)', fontSize: '13px' }}>
                  Loading fleet data...
                </div>
              ) : vehicles.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                  <Car size={32} color="var(--gov-text-muted)" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>No Vehicles in {selectedState}</div>
                  <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px', maxWidth: '340px', margin: '4px auto 14px' }}>
                    Register an inspection vehicle unit in {selectedState} to dispatch survey stretches.
                  </p>
                  <button
                    className="gov-btn-primary"
                    onClick={() => setShowAddVehicleModal(true)}
                    style={{ fontSize: '13px', padding: '8px 14px' }}
                  >
                    <Plus size={14} />
                    <span>Register Vehicle in {selectedState}</span>
                  </button>
                </div>
              ) : (
                <div>
                  {vehicles.map((v) => {
                    const isSelected = selectedVehicle?.id === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => handleSelectVehicle(v)}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--gov-text-primary)' }}>{v.vehicle_number}</span>
                              {v.has_unread_reply && (
                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626' }} title="Unread surveyor reply" />
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
                              {v.model_name} • Driver: {v.driver_name}
                            </div>
                          </div>
                          <span className={`gov-badge ${v.status === 'in_survey' ? 'gov-badge-green' : 'gov-badge-neutral'}`} style={{ fontSize: '10px' }}>
                            {v.status === 'in_survey' ? 'Surveying' : 'Idle'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedVehicle && (
              <div className="gov-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--gov-border)', paddingBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                      Vehicle {selectedVehicle.vehicle_number}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
                      {selectedVehicle.model_name} • Driver: {selectedVehicle.driver_name} • Division: {selectedVehicle.jurisdiction_name || selectedState}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="gov-btn-primary"
                      onClick={() => setShowAssignModal(true)}
                      style={{ padding: '7px 14px', fontSize: '12px' }}
                    >
                      <Send size={13} />
                      <span>Define & Dispatch Stretch</span>
                    </button>
                    <button
                      className="gov-btn-secondary"
                      onClick={() => handleDeleteVehicle(selectedVehicle.id)}
                      style={{ padding: '7px 10px', fontSize: '12px', color: 'var(--gov-red)' }}
                      title="Decommission vehicle"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                <div style={{ background: 'var(--gov-card-subtle)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Crew Members</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-text-primary)', marginTop: '2px' }}>
                      {Array.isArray(selectedVehicle.crew_members) ? selectedVehicle.crew_members.join(', ') : selectedVehicle.driver_name}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Distance Logged</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-text-primary)', marginTop: '2px' }}>
                      {Number(selectedVehicle.total_distance_km || 0).toFixed(1)} KM
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Defects Logged</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-text-primary)', marginTop: '2px' }}>
                      {selectedVehicle.defects_logged || 0} Points
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--gov-navy)', marginBottom: '10px' }}>
                    Dispatched Tasks ({vehicleTasks.length})
                  </div>

                  {vehicleTasks.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', background: 'var(--gov-card-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
                      <div style={{ fontSize: '13px', color: 'var(--gov-text-secondary)' }}>No survey tasks dispatched to this unit yet.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {vehicleTasks.map((t) => (
                        <div key={t.id} style={{ background: '#ffffff', border: '1px solid var(--gov-border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--gov-text-primary)' }}>{t.road_name || t.title}</span>
                            <span className={`gov-badge ${t.status === 'completed' ? 'gov-badge-green' : t.status === 'in_progress' ? 'gov-badge-blue' : 'gov-badge-neutral'}`} style={{ fontSize: '11px' }}>
                              {t.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
                            Target Speed: {t.target_speed_kmh} km/h • Priority: {t.priority || 'routine'} {t.distance_km ? `• Length: ${t.distance_km} KM` : ''}
                          </div>
                          {t.official_notes && (
                            <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                              Notes: "{t.official_notes}"
                            </div>
                          )}
                          {t.surveyor_reply && (
                            <div style={{ marginTop: '8px', padding: '8px 10px', background: t.reply_unread_by_official ? '#fef2f2' : '#f8fafc', border: `1px solid ${t.reply_unread_by_official ? '#fecaca' : '#e2e8f0'}`, borderRadius: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: t.reply_unread_by_official ? '#dc2626' : '#64748b' }}>
                                  Crew Feedback {t.reply_unread_by_official && '(NEW)'}:
                                </span>
                                {t.reply_unread_by_official && (
                                  <button
                                    onClick={() => handleMarkReplyRead(t.id)}
                                    style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                  >
                                    <Check size={12} />
                                    <span>Mark Read</span>
                                  </button>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', color: '#0f172a', marginTop: '2px' }}>
                                {t.surveyor_reply}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'defects' && (
        <div className="gov-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', background: 'var(--gov-card-subtle)', borderBottom: '1px solid var(--gov-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-navy)' }}>
              Road Defect Ledger ({defects.length})
            </span>
            <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)' }}>
              Real PostGIS Distresses & Engineering Action Matrix
            </div>
          </div>

          {loading ? (
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
            <div style={{ overflowX: 'auto' }}>
              <table className="gov-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Defect Classification</th>
                    <th>Coordinates & Speed</th>
                    <th>Severity</th>
                    <th>Review Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {defects.map((d) => {
                    const defectLabel = d.type === 'pothole' ? 'Pothole (ASTM 13)' : d.type === 'crack' ? 'Road Crack (ASTM 1/10)' : `${d.type} (Distress)`;
                    const actionStatus = d.action_status || (d.status === 'verified' ? 'fit' : d.status === 'under_review' ? 'in_validation' : d.status === 'rejected' ? 'rescan_required' : 'pending_review');
                    const badgeClass = actionStatus === 'fit' ? 'gov-badge-green' : actionStatus === 'in_validation' ? 'gov-badge-blue' : actionStatus === 'rescan_required' ? 'gov-badge-red' : 'gov-badge-neutral';
                    return (
                      <tr key={d.id}>
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--gov-text-primary)' }}>{defectLabel}</div>
                          <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>
                            Confidence: {Math.round((d.confidence_score || 0.85) * 100)}% • Source: {d.source || 'Vehicle Camera'}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                            {d.location_geojson ? 'PostGIS Point Locked' : 'Survey Stretch'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>
                            {d.speed_kmh ? `${d.speed_kmh} km/h` : 'Captured In Survey'}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 800, color: (d.severity_score || 4) >= 4 ? 'var(--gov-red)' : 'var(--gov-amber)' }}>
                            {d.severity_score || 4}/5
                          </span>
                        </td>
                        <td>
                          <span className={`gov-badge ${badgeClass}`} style={{ textTransform: 'capitalize' }}>
                            {actionStatus.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            <button
                              onClick={() => handleDefectAction(d.id, 'fit')}
                              className="gov-btn-secondary"
                              style={{ padding: '3px 7px', fontSize: '11px', color: 'var(--gov-green)' }}
                              title="Mark Fit"
                            >
                              Fit
                            </button>
                            <button
                              onClick={() => handleDefectAction(d.id, 'validate')}
                              className="gov-btn-secondary"
                              style={{ padding: '3px 7px', fontSize: '11px', color: 'var(--gov-blue)' }}
                              title="Send for Field Validation"
                            >
                              Validate
                            </button>
                            <button
                              onClick={() => handleDefectAction(d.id, 'rescan')}
                              className="gov-btn-secondary"
                              style={{ padding: '3px 7px', fontSize: '11px', color: 'var(--gov-red)' }}
                              title="Requires Rescan"
                            >
                              Rescan
                            </button>
                            <button
                              onClick={() => handleDefectAction(d.id, 'fixed')}
                              className="gov-btn-secondary"
                              style={{ padding: '3px 7px', fontSize: '11px', color: 'var(--gov-green)' }}
                              title="Mark Fixed"
                            >
                              Fixed
                            </button>
                            <button
                              onClick={() => handleOpenAuditModal(d)}
                              className="gov-btn-secondary"
                              style={{ padding: '3px 6px', fontSize: '11px' }}
                              title="View Audit Trail"
                            >
                              <History size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'compliance' && (
        <div className="gov-card" style={{ padding: '24px' }}>
          <div style={{ borderBottom: '2px solid var(--gov-navy)', paddingBottom: '14px', marginBottom: '18px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gov-navy)' }}>
              National Road Network Pavement Quality Audit & Compliance Dossier ({selectedState})
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
              Standard ASTM D6433 Pavement Condition Index (PCI) Engineering Audit Summary
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '22px' }}>
            <div style={{ padding: '14px', background: 'var(--gov-card-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)', fontWeight: 600 }}>NETWORK PCI SCORE</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--gov-blue)', marginTop: '4px' }}>
                {summary ? summary.fleet.avg_network_pci : 100} / 100
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>Standard ASTM D6433</div>
            </div>

            <div style={{ padding: '14px', background: 'var(--gov-card-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)', fontWeight: 600 }}>TOTAL DISTANCE AUDITED</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--gov-navy)', marginTop: '4px' }}>
                {summary ? summary.fleet.total_km_surveyed : 0} KM
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>Inspected Stretches</div>
            </div>

            <div style={{ padding: '14px', background: 'var(--gov-card-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)', fontWeight: 600 }}>TOTAL DISTRESS POINTS</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--gov-red)', marginTop: '4px' }}>
                {summary ? summary.defects.total : defects.length}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
                {summary ? summary.defects.potholes : 0} Potholes • {summary ? summary.defects.cracks : 0} Cracks
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid var(--gov-border)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--gov-navy)', marginBottom: '12px' }}>
              Defect Validation State Breakdown
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
              <div style={{ padding: '10px', background: '#f0fdf4', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a' }}>VERIFIED FIT</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>{summary ? summary.defects.fit : 0}</div>
              </div>
              <div style={{ padding: '10px', background: '#eff6ff', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb' }}>IN VALIDATION</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>{summary ? summary.defects.in_validation : 0}</div>
              </div>
              <div style={{ padding: '10px', background: '#fef2f2', borderRadius: '4px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>RESCAN REQUIRED</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>{summary ? summary.defects.rescan_required : 0}</div>
              </div>
              <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>PENDING REVIEW</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#475569', marginTop: '2px' }}>{summary ? summary.defects.pending_review : 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddVehicleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="gov-card" style={{ width: '100%', maxWidth: '440px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                Register Survey Vehicle ({selectedState})
              </h2>
              <button onClick={() => setShowAddVehicleModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
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
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Primary Driver</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. Rajesh Kumar"
                  value={newVehDriver}
                  onChange={(e) => setNewVehDriver(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Crew Members (Comma separated)</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. A. Sharma (Surveyor), R. Verma (Operator)"
                  value={newVehCrew}
                  onChange={(e) => setNewVehCrew(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Jurisdiction Division</label>
                <input
                  type="text"
                  className="gov-input"
                  value={newVehJurisdiction}
                  onChange={(e) => setNewVehJurisdiction(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="gov-btn-secondary" onClick={() => setShowAddVehicleModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="gov-btn-primary">
                  Save Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignModal && selectedVehicle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="gov-card" style={{ width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--gov-border)', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                  Define & Dispatch Stretch to {selectedVehicle.vehicle_number}
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
                  State: <strong>{selectedState}</strong> • Click 2 points for commuter alternatives or draw along roads
                </div>
              </div>
              <button onClick={() => setShowAssignModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <StretchPlannerMap
                selectedState={selectedState}
                onRouteConfirmed={handleRouteConfirmedFromMap}
              />
            </div>

            <form onSubmit={handleAssignTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Selected Road Stretch</label>
                  <input
                    type="text"
                    className="gov-input"
                    placeholder="Click on map to select route or enter name..."
                    value={taskStretchName}
                    onChange={(e) => setTaskStretchName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Length (KM)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="gov-input"
                    value={taskDistanceKm}
                    onChange={(e) => setTaskDistanceKm(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Target Speed</label>
                  <input
                    type="number"
                    className="gov-input"
                    value={taskSpeed}
                    onChange={(e) => setTaskSpeed(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Priority Category</label>
                  <select
                    className="gov-input"
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
                  >
                    <option value="routine">Routine Inspection</option>
                    <option value="urgent">Urgent Highway Audit</option>
                    <option value="post_monsoon">Post-Monsoon Audit</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Official Instructions / Distress Notes</label>
                  <input
                    type="text"
                    className="gov-input"
                    placeholder="Specific potholes or shoulder drop-offs to verify..."
                    value={taskNotes}
                    onChange={(e) => setTaskNotes(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" className="gov-btn-secondary" onClick={() => setShowAssignModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="gov-btn-primary" disabled={!taskStretchName}>
                  <Send size={14} />
                  <span>Dispatch Stretch to {selectedVehicle.vehicle_number}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedDefectForAudit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="gov-card" style={{ width: '100%', maxWidth: '480px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                Defect Audit History
              </h2>
              <button onClick={() => setSelectedDefectForAudit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            {loadingAudit ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gov-text-muted)', fontSize: '13px' }}>
                Loading audit trail...
              </div>
            ) : auditLogs.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gov-text-muted)', fontSize: '13px' }}>
                No past audit actions recorded for this defect yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {auditLogs.map((log) => (
                  <div key={log.id} style={{ padding: '10px 12px', background: 'var(--gov-card-subtle)', borderRadius: '4px', border: '1px solid var(--gov-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--gov-navy)', textTransform: 'uppercase' }}>
                        Action: {log.action_type}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>
                        {new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--gov-text-primary)', marginTop: '3px' }}>
                      Officer: <strong>{log.official_name || 'Executive Engineer'}</strong>
                    </div>
                    {log.official_remarks && (
                      <div style={{ fontSize: '11px', color: 'var(--gov-text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
                        "{log.official_remarks}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button className="gov-btn-secondary" onClick={() => setSelectedDefectForAudit(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}