import React, { useState, useEffect, useCallback } from 'react';
import { Car, Plus, Send, RefreshCw, Printer, ShieldCheck, AlertCircle, History, MessageSquare, Check, X, MapPin, Globe, Route, PenTool, Compass, Eye, Search } from 'lucide-react';
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
  fetchOfficialSummary,
  fetchSurveyTrips
} from '../services/officialApi';
import FleetOverviewMap from '../components/FleetOverviewMap';
import StretchPlannerMap from '../components/StretchPlannerMap';
import VehicleTaskStretchMap from '../components/VehicleTaskStretchMap';
import SurveyTripDetailModal from '../components/SurveyTripDetailModal';
import PrintReportModal from '../components/PrintReportModal';
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
  const [trips, setTrips] = useState([]);
  const [selectedTripForModal, setSelectedTripForModal] = useState(null);
  const [tripFilter, setTripFilter] = useState('all');
  const [tripSearch, setTripSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
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
  const [routeConfirmedBanner, setRouteConfirmedBanner] = useState(null);
  const [dispatchAlert, setDispatchAlert] = useState(null);
  const [selectedTaskForMap, setSelectedTaskForMap] = useState(null);
  const [taskFilterTab, setTaskFilterTab] = useState('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [vehList, defectList, sumData, tripsList] = await Promise.all([
      fetchFleetVehicles(),
      fetchDefectsLedger(),
      fetchOfficialSummary(),
      fetchSurveyTrips()
    ]);
    const filteredVehicles = vehList.filter(v => !v.state || v.state === selectedState);
    setVehicles(filteredVehicles);
    setDefects(defectList);
    setSummary(sumData);
    setTrips(tripsList);
    if (filteredVehicles.length > 0) {
      const active = selectedVehicle ? filteredVehicles.find(v => v.id === selectedVehicle.id) || filteredVehicles[0] : filteredVehicles[0];
      setSelectedVehicle(active);
      const tasks = await fetchSurveyTasks(active.id);
      setVehicleTasks(tasks);
      setSelectedTaskForMap(tasks.length > 0 ? tasks[0] : null);
    } else {
      setSelectedVehicle(null);
      setVehicleTasks([]);
      setSelectedTaskForMap(null);
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
    setSelectedTaskForMap(tasks.length > 0 ? tasks[0] : null);
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
    setRouteConfirmedBanner(`✓ Route locked: "${routeInfo.roadName}" (${routeInfo.distanceKm} KM). Ready to dispatch.`);
  };

  const handleInstantDispatch = async (routeInfo) => {
    if (!selectedVehicle) return;
    const stretchTitle = routeInfo?.roadName || taskStretchName;
    if (!stretchTitle) return;
    const newTask = {
      title: stretchTitle,
      road_name: stretchTitle,
      assigned_vehicle_id: selectedVehicle.id,
      assigned_vehicle_number: selectedVehicle.vehicle_number,
      target_speed_kmh: Number(taskSpeed) || 25,
      official_notes: taskNotes || 'Audit requested via Official Console',
      priority: taskPriority || 'routine',
      distance_km: routeInfo?.distanceKm || taskDistanceKm || 0,
      route_points: routeInfo?.routePoints || taskRoutePoints || null,
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
    setRouteConfirmedBanner(null);
    setDispatchAlert(`Stretch "${stretchTitle}" successfully dispatched to ${selectedVehicle.vehicle_number}!`);
    setTimeout(() => setDispatchAlert(null), 5000);
    const tasks = await fetchSurveyTasks(selectedVehicle.id);
    setVehicleTasks(tasks);
    if (tasks.length > 0) setSelectedTaskForMap(tasks[0]);
  };

  const handleAssignTask = async (e) => {
    e.preventDefault();
    if (!taskStretchName || !selectedVehicle) return;
    const newTask = {
      title: taskStretchName,
      road_name: taskStretchName,
      assigned_vehicle_id: selectedVehicle.id,
      assigned_vehicle_number: selectedVehicle.vehicle_number,
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
    setRouteConfirmedBanner(null);
    setDispatchAlert(`Stretch "${taskStretchName}" successfully dispatched to ${selectedVehicle.vehicle_number}!`);
    setTimeout(() => setDispatchAlert(null), 5000);
    const tasks = await fetchSurveyTasks(selectedVehicle.id);
    setVehicleTasks(tasks);
    if (tasks.length > 0) setSelectedTaskForMap(tasks[0]);
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
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
            Fleet & Survey Oversight
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            Active State: <strong>{selectedState}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid var(--gov-border)', padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}>
            <Globe size={15} color="#0f172a" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)' }}>State:</span>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: '13px', color: '#0f172a', outline: 'none', cursor: 'pointer' }}
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
          <button className="gov-btn-secondary" onClick={() => setShowPrintModal(true)}>
            <Printer size={14} />
            <span>Print Report</span>
          </button>
          <button className="gov-btn-primary" onClick={() => setShowAddVehicleModal(true)}>
            <Plus size={14} />
            <span>Add Vehicle</span>
          </button>
        </div>
      </div>

      {dispatchAlert && (
        <div style={{ marginBottom: '18px', padding: '12px 16px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 'var(--radius-sm)', color: '#166534', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={16} color="#16a34a" />
          <span>{dispatchAlert}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Survey Vehicles ({selectedState})
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
            {vehicles.length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Units</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            Registered in {selectedState}
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Survey Trips
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
            {trips.filter(t => !t.is_demo).length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Trips</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            {trips.filter(t => !t.is_demo && t.status === 'completed').length} Completed
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Defects Logged
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-red)', marginTop: '6px' }}>
            {summary ? summary.defects.total : defects.length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Items</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            {summary ? summary.defects.pending_review : 0} Pending Review
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
            {summary ? summary.defects.in_validation : 0} In Validation
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--gov-border)', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('fleet')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'fleet' ? '3px solid #111827' : '3px solid transparent',
            background: 'transparent',
            fontWeight: 700,
            fontSize: '13px',
            color: activeTab === 'fleet' ? '#0f172a' : 'var(--gov-text-muted)',
            cursor: 'pointer'
          }}
        >
          Fleet & Task Dispatch ({vehicles.length})
        </button>
        <button
          onClick={() => setActiveTab('surveys')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'surveys' ? '3px solid #111827' : '3px solid transparent',
            background: 'transparent',
            fontWeight: 700,
            fontSize: '13px',
            color: activeTab === 'surveys' ? '#0f172a' : 'var(--gov-text-muted)',
            cursor: 'pointer'
          }}
        >
          Visit Surveys ({trips.filter(t => !t.is_demo).length})
        </button>
        <button
          onClick={() => setActiveTab('defects')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom: activeTab === 'defects' ? '3px solid #111827' : '3px solid transparent',
            background: 'transparent',
            fontWeight: 700,
            fontSize: '13px',
            color: activeTab === 'defects' ? '#0f172a' : 'var(--gov-text-muted)',
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
            borderBottom: activeTab === 'compliance' ? '3px solid #111827' : '3px solid transparent',
            background: 'transparent',
            fontWeight: 700,
            fontSize: '13px',
            color: activeTab === 'compliance' ? '#0f172a' : 'var(--gov-text-muted)',
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

            {selectedVehicle && (() => {
              const pendingTasks = vehicleTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
              const completedTasks = vehicleTasks.filter(t => t.status === 'completed');
              const displayedTasks = taskFilterTab === 'pending' ? pendingTasks : taskFilterTab === 'completed' ? completedTasks : vehicleTasks;
              const activeTaskForDisplay = selectedTaskForMap || (vehicleTasks.length > 0 ? vehicleTasks[0] : null);

              return (
                <div className="gov-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--gov-border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                          Vehicle {selectedVehicle.vehicle_number}
                        </span>
                        <span className={`gov-badge ${selectedVehicle.status === 'in_survey' ? 'gov-badge-green' : 'gov-badge-neutral'}`} style={{ fontSize: '11px' }}>
                          {selectedVehicle.status === 'in_survey' ? 'Scanning Active' : 'Idle / Standby'}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '3px' }}>
                        {selectedVehicle.model_name} • Driver: <strong>{selectedVehicle.driver_name}</strong> • Division: {selectedVehicle.jurisdiction_name || selectedState}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="gov-btn-primary"
                        onClick={() => setShowAssignModal(true)}
                        style={{ padding: '8px 14px', fontSize: '12px' }}
                      >
                        <Send size={13} />
                        <span>Define & Dispatch Stretch</span>
                      </button>
                      <button
                        className="gov-btn-secondary"
                        onClick={() => handleDeleteVehicle(selectedVehicle.id)}
                        style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--gov-red)' }}
                        title="Decommission vehicle"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    <div style={{ padding: '12px', background: 'var(--gov-card-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Total Assigned</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--gov-navy)', marginTop: '2px' }}>
                        {vehicleTasks.length}
                      </div>
                    </div>
                    <div style={{ padding: '12px', background: '#eff6ff', borderRadius: 'var(--radius-sm)', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Pending Tasks</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                        {pendingTasks.length}
                      </div>
                    </div>
                    <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: 'var(--radius-sm)', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Total Tasks Done</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
                        {completedTasks.length}
                      </div>
                    </div>
                    <div style={{ padding: '12px', background: 'var(--gov-card-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Distance Logged</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--gov-text-primary)', marginTop: '2px' }}>
                        {Number(selectedVehicle.total_distance_km || 0).toFixed(1)} <span style={{ fontSize: '12px', fontWeight: 600 }}>KM</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)', padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: 'var(--gov-text-muted)' }}>Crew Members: </span>
                      <strong style={{ color: 'var(--gov-text-primary)' }}>
                        {Array.isArray(selectedVehicle.crew_members) ? selectedVehicle.crew_members.join(', ') : selectedVehicle.driver_name}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--gov-text-muted)' }}>Defects Logged: </span>
                      <strong style={{ color: 'var(--gov-red)' }}>{selectedVehicle.defects_logged || 0} Points</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--gov-text-muted)' }}>Jurisdiction: </span>
                      <strong style={{ color: 'var(--gov-text-primary)' }}>{selectedVehicle.jurisdiction_name || selectedState}</strong>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                          Stretch Route Map in Detail
                        </span>
                        <div style={{ fontSize: '11px', color: 'var(--gov-text-secondary)' }}>
                          {activeTaskForDisplay ? `Displaying geometry for: ${activeTaskForDisplay.road_name || activeTaskForDisplay.title}` : 'Select a stretch below to inspect its route coordinates on map'}
                        </div>
                      </div>
                    </div>
                    <VehicleTaskStretchMap
                      task={activeTaskForDisplay}
                      vehicle={selectedVehicle}
                      selectedState={selectedState}
                      height={270}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                        Vehicle Assigned Stretches ({vehicleTasks.length})
                      </span>
                      <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setTaskFilterTab('all')}
                          style={{
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: taskFilterTab === 'all' ? '#ffffff' : 'transparent',
                            color: taskFilterTab === 'all' ? 'var(--gov-navy)' : 'var(--gov-text-secondary)',
                            boxShadow: taskFilterTab === 'all' ? 'var(--shadow-sm)' : 'none'
                          }}
                        >
                          All ({vehicleTasks.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskFilterTab('pending')}
                          style={{
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: taskFilterTab === 'pending' ? '#ffffff' : 'transparent',
                            color: taskFilterTab === 'pending' ? 'var(--gov-blue)' : 'var(--gov-text-secondary)',
                            boxShadow: taskFilterTab === 'pending' ? 'var(--shadow-sm)' : 'none'
                          }}
                        >
                          Pending ({pendingTasks.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskFilterTab('completed')}
                          style={{
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: taskFilterTab === 'completed' ? '#ffffff' : 'transparent',
                            color: taskFilterTab === 'completed' ? 'var(--gov-green)' : 'var(--gov-text-secondary)',
                            boxShadow: taskFilterTab === 'completed' ? 'var(--shadow-sm)' : 'none'
                          }}
                        >
                          Done ({completedTasks.length})
                        </button>
                      </div>
                    </div>

                    {displayedTasks.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', background: 'var(--gov-card-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
                        <div style={{ fontSize: '13px', color: 'var(--gov-text-secondary)' }}>
                          No {taskFilterTab === 'all' ? 'assigned' : taskFilterTab} tasks for this vehicle.
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {displayedTasks.map((t) => {
                          const isSelectedForMap = activeTaskForDisplay?.id === t.id;
                          return (
                            <div
                              key={t.id}
                              onClick={() => setSelectedTaskForMap(t)}
                              style={{
                                background: isSelectedForMap ? '#f0f9ff' : '#ffffff',
                                border: `1.5px solid ${isSelectedForMap ? 'var(--gov-blue)' : 'var(--gov-border)'}`,
                                borderRadius: 'var(--radius-sm)',
                                padding: '12px 14px',
                                cursor: 'pointer',
                                transition: 'border-color 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: 800, color: isSelectedForMap ? 'var(--gov-navy)' : 'var(--gov-text-primary)' }}>
                                    {t.road_name || t.title}
                                  </span>
                                  {isSelectedForMap && (
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gov-blue)', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px' }}>
                                      Active on Map
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <span className={`gov-badge ${t.priority === 'urgent' ? 'gov-badge-red' : t.priority === 'post_monsoon' ? 'gov-badge-amber' : 'gov-badge-neutral'}`} style={{ fontSize: '10px' }}>
                                    {t.priority || 'routine'}
                                  </span>
                                  <span className={`gov-badge ${t.status === 'completed' ? 'gov-badge-green' : t.status === 'in_progress' ? 'gov-badge-blue' : 'gov-badge-neutral'}`} style={{ fontSize: '10px' }}>
                                    {t.status}
                                  </span>
                                </div>
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
                                Corridor: {t.start_address} → {t.end_address} • Length: <strong>{t.distance_km || 0} KM</strong> • Target Speed: <strong>{t.target_speed_kmh} km/h</strong>
                              </div>
                              {t.official_notes && (
                                <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                                  Official Instructions: "{t.official_notes}"
                                </div>
                              )}
                              {t.surveyor_reply && (
                                <div style={{ marginTop: '8px', padding: '8px 10px', background: t.reply_unread_by_official ? '#fef2f2' : '#f8fafc', border: `1px solid ${t.reply_unread_by_official ? '#fecaca' : '#e2e8f0'}`, borderRadius: '4px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: t.reply_unread_by_official ? '#dc2626' : '#64748b' }}>
                                      Survey Crew Feedback {t.reply_unread_by_official && '(NEW)'}:
                                    </span>
                                    {t.reply_unread_by_official && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMarkReplyRead(t.id);
                                        }}
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
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
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
                    const defectLabel = d.display_label || (d.type === 'pothole' ? 'Pothole (ASTM 13)' : d.type === 'crack' ? 'Road Crack (ASTM 1/10)' : `${d.type} (Distress)`);
                    const actionStatus = d.action_status || (d.status === 'verified' ? 'fit' : d.status === 'under_review' ? 'in_validation' : d.status === 'rejected' ? 'rescan_required' : 'pending_review');
                    const badgeClass = actionStatus === 'fit' ? 'gov-badge-green' : actionStatus === 'in_validation' ? 'gov-badge-blue' : actionStatus === 'rescan_required' ? 'gov-badge-red' : 'gov-badge-neutral';
                    return (
                      <tr key={d.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {d.image_url && (
                              <a href={d.image_url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                                <img
                                  src={d.image_url}
                                  alt={defectLabel}
                                  style={{ width: '56px', height: '36px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--gov-border)' }}
                                />
                              </a>
                            )}
                            <div>
                              <div style={{ fontWeight: 800, color: 'var(--gov-text-primary)' }}>{defectLabel}</div>
                              <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>
                                Confidence: {Math.round((d.confidence_score || 0.85) * 100)}% • {d.vehicle_number || d.source || 'Vehicle Camera'}
                              </div>
                            </div>
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

      {activeTab === 'surveys' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="gov-card" style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
              Survey Trips ({trips.filter(t => !t.is_demo).length})
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gov-text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search road name, vehicle, or driver..."
                  className="gov-input"
                  value={tripSearch}
                  onChange={(e) => setTripSearch(e.target.value)}
                  style={{ paddingLeft: '32px', fontSize: '12px', width: '100%' }}
                />
              </div>
            </div>
          </div>

          {trips.filter(t => {
            if (t.is_demo) return false;
            if (tripSearch) {
              const q = tripSearch.toLowerCase();
              const road = (t.road_name || '').toLowerCase();
              const veh = (t.vehicle_number || '').toLowerCase();
              const drv = (t.driver_name || '').toLowerCase();
              if (!road.includes(q) && !veh.includes(q) && !drv.includes(q)) return false;
            }
            return true;
          }).length === 0 ? (
            <div className="gov-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--gov-text-muted)' }}>
              <Compass size={36} color="var(--gov-border)" style={{ margin: '0 auto 12px auto' }} />
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>No Survey Trips Found</div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>Completed and active field patrol trips will appear here.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '16px' }}>
              {trips.filter(t => {
                if (t.is_demo) return false;
                if (tripSearch) {
                  const q = tripSearch.toLowerCase();
                  const road = (t.road_name || '').toLowerCase();
                  const veh = (t.vehicle_number || '').toLowerCase();
                  const drv = (t.driver_name || '').toLowerCase();
                  if (!road.includes(q) && !veh.includes(q) && !drv.includes(q)) return false;
                }
                return true;
              }).map((trip) => {
                const isCompleted = trip.status === 'completed';
                const pci = trip.calculated_pci !== null && trip.calculated_pci !== undefined ? trip.calculated_pci : 100;
                const pciColor = pci >= 80 ? '#16a34a' : pci >= 65 ? '#ca8a04' : '#dc2626';
                const dateStr = trip.start_time || trip.created_at;
                const formattedDate = dateStr ? new Date(dateStr).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                return (
                  <div key={trip.id} className="gov-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px', border: '1px solid var(--gov-border)', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                            {trip.road_name || 'Highway Survey Stretch'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)', marginTop: '2px' }}>
                            {formattedDate}
                          </div>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', padding: '2px 8px', borderRadius: '10px', background: isCompleted ? '#dcfce7' : '#f1f5f9', color: isCompleted ? '#166534' : '#334155', border: `1px solid ${isCompleted ? '#bbf7d0' : '#cbd5e1'}` }}>
                          {isCompleted ? 'Completed' : 'In Progress'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '14px', padding: '10px', background: 'var(--gov-card-subtle)', borderRadius: '6px', border: '1px solid var(--gov-border)' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--gov-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Distance</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--gov-navy)', marginTop: '2px' }}>
                            {trip.total_distance_km ? `${trip.total_distance_km} KM` : '0.0 KM'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--gov-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>PCI Score</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: pciColor, marginTop: '2px' }}>
                            {pci}/100
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--gov-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Avg Speed</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--gov-navy)', marginTop: '2px' }}>
                            {trip.avg_speed_kmh ? `${trip.avg_speed_kmh} km/h` : '—'}
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '10px' }}>
                        Unit: <strong style={{ color: 'var(--gov-navy)' }}>{trip.vehicle_number || 'Inspection Unit'}</strong> • Driver: <strong style={{ color: 'var(--gov-navy)' }}>{trip.driver_name || 'Assigned Crew'}</strong>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedTripForModal(trip)}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--gov-navy)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <Eye size={14} />
                      <span>Inspect Trip, Route & Evidence</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
                onInstantDispatch={handleInstantDispatch}
              />
            </div>

            {routeConfirmedBanner && (
              <div style={{ padding: '10px 14px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 'var(--radius-sm)', color: '#166534', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <span>{routeConfirmedBanner}</span>
                <button
                  type="button"
                  className="gov-btn-primary"
                  onClick={() => handleInstantDispatch()}
                  style={{ padding: '6px 14px', fontSize: '12px', background: '#166534' }}
                >
                  <Send size={13} />
                  <span>Dispatch Now</span>
                </button>
              </div>
            )}

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

      {selectedTripForModal && (
        <SurveyTripDetailModal
          trip={selectedTripForModal}
          onClose={() => setSelectedTripForModal(null)}
        />
      )}

      {showPrintModal && (
        <PrintReportModal
          vehicles={vehicles}
          trips={trips}
          defects={defects}
          selectedState={selectedState}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}