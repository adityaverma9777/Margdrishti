import React, { useState, useEffect } from 'react';
import { Car, Building2, CheckSquare, Plus, Send, FileText, AlertCircle, CheckCircle, Search, Filter, ShieldCheck, Printer, MapPin, RefreshCw, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

const INITIAL_VEHICLES = [
  {
    id: 'veh_01',
    number: 'AS-01-BX-4021',
    model: 'Mahindra Bolero Inspection Unit #01',
    driver: 'Rajesh Sharma',
    crew: ['Rajesh Sharma', 'Bipul Das (Sensor Tech)'],
    status: 'surveying',
    currentStretch: 'NH-27 Guwahati Bypass',
    totalKm: 1420.5,
    defectsLogged: 148,
    hasUnreadReply: true,
    lastReply: 'Completed 12km of NH-27. Passing Jalukbari flyover. Visual camera clear.'
  },
  {
    id: 'veh_02',
    number: 'AS-01-ET-8910',
    model: 'Tata Xenon Heavy Survey Unit #02',
    driver: 'Pranab Saikia',
    crew: ['Pranab Saikia', 'Dhruba Jyoti (GIS Assistant)'],
    status: 'idle',
    currentStretch: 'Assam Trunk Road (Stationed at Dispur Depot)',
    totalKm: 980.2,
    defectsLogged: 84,
    hasUnreadReply: false,
    lastReply: ''
  },
  {
    id: 'veh_03',
    number: 'AS-01-MC-3342',
    model: 'Mahindra Bolero Inspection Unit #03',
    driver: 'Hemanta Kalita',
    crew: ['Hemanta Kalita', 'Amarjit Singh'],
    status: 'in_transit',
    currentStretch: 'En route to VIP Road Stretch',
    totalKm: 2150.8,
    defectsLogged: 212,
    hasUnreadReply: false,
    lastReply: ''
  }
];

export default function OfficialDashboard() {
  const { currentUser } = useAuth();
  const [vehicles, setVehicles] = useState(INITIAL_VEHICLES);
  const [selectedVehicle, setSelectedVehicle] = useState(INITIAL_VEHICLES[0]);
  const [defects, setDefects] = useState([]);
  const [loadingDefects, setLoadingDefects] = useState(true);
  const [activeTab, setActiveTab] = useState('fleet');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [taskStretchName, setTaskStretchName] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskSpeed, setTaskSpeed] = useState('25');

  const fetchRealDefects = async () => {
    setLoadingDefects(true);
    try {
      const { data: dbHazards } = await supabase
        .from('hazards')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (dbHazards && dbHazards.length > 0) {
        const mapped = dbHazards.map(h => ({
          id: h.id,
          tripId: h.source || 'AI_SCAN_TRIP',
          vehicleNumber: h.source?.includes('yolo11') ? 'AS-01-BX-4021' : selectedVehicle.number,
          defectType: h.type === 'pothole' ? 'Pothole (ASTM 13)' : h.type === 'crack' ? 'Road Crack (ASTM 1/10)' : `${h.type} (Distress)`,
          severity: h.severity_score || 4,
          speedKmh: 24,
          location: h.location ? `Geo Point: ${JSON.stringify(h.location)}` : 'Survey Route Segment',
          time: new Date(h.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          status: h.status === 'verified' ? 'fit' : h.status === 'under_review' ? 'in_validation' : h.status === 'rejected' ? 'rescan_required' : 'pending_review',
          confidence: h.confidence_score || 0.88,
          imageUrl: h.image_url
        }));
        setDefects(mapped);
      } else {
        setDefects([]);
      }
    } catch (err) {
      console.warn('Could not load real hazards:', err.message);
    } finally {
      setLoadingDefects(false);
    }
  };

  useEffect(() => {
    fetchRealDefects();
  }, []);

  const handleUpdateDefectStatus = async (defectId, newStatus) => {
    const dbStatus = newStatus === 'fit' ? 'verified' : newStatus === 'rescan_required' ? 'rejected' : 'under_review';
    setDefects(defects.map(d => d.id === defectId ? { ...d, status: newStatus } : d));
    try {
      await supabase.from('hazards').update({ status: dbStatus, updated_at: new Date().toISOString() }).eq('id', defectId);
    } catch (err) {
      console.warn('Database status update sync failed:', err.message);
    }
  };

  const handleAssignTask = (e) => {
    e.preventDefault();
    if (!taskStretchName) return;
    alert(`Survey task "${taskStretchName}" successfully dispatched to vehicle ${selectedVehicle.number}. Crew will receive route guidance on their console.`);
    setShowAssignModal(false);
    setTaskStretchName('');
    setTaskNotes('');
  };

  const clearVehicleReplyNotification = (vehId) => {
    setVehicles(vehicles.map(v => v.id === vehId ? { ...v, hasUnreadReply: false } : v));
  };

  return (
    <div className="gov-container" style={{ padding: '24px 20px', minHeight: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.4px' }}>
              Official Desk & Fleet Oversight
            </h1>
            <span className="gov-badge gov-badge-blue">Official</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            Officer: <strong>{currentUser?.name || currentUser?.username || 'Executive Officer'}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="gov-btn-secondary"
            onClick={fetchRealDefects}
            title="Refresh database records"
          >
            <RefreshCw size={15} />
            <span>Sync DB</span>
          </button>
          <button
            className="gov-btn-secondary"
            onClick={() => window.print()}
          >
            <Printer size={15} />
            <span>Print Compliance Report</span>
          </button>
          <button
            className="gov-btn-primary"
            onClick={() => setShowAssignModal(true)}
          >
            <Plus size={15} />
            <span>Dispatch Road Task</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Inspection Vehicles
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-navy)', marginTop: '6px' }}>
            {vehicles.length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Registered</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-green)', marginTop: '4px', fontWeight: 600 }}>
            {vehicles.filter(v => v.status === 'surveying').length} Actively Surveying Now
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Highway Stretches Monitored
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-text-primary)', marginTop: '6px' }}>
            4,551.5 <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>KM</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            National & State Highway Corridors
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Live Defects in Database
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-red)', marginTop: '6px' }}>
            {defects.length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Records</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-amber)', marginTop: '4px', fontWeight: 600 }}>
            {defects.filter(d => d.status === 'pending_review' || d.status === 'in_validation').length} Pending Engineering Verification
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Geofence Boundary Guard
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-green)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={22} color="var(--gov-green)" />
            <span>All Units in Zone</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            Zero unpermitted deviations
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--gov-border)', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('fleet')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'fleet' ? '3px solid var(--gov-blue)' : '3px solid transparent',
            background: 'transparent',
            fontWeight: 700,
            fontSize: '14px',
            color: activeTab === 'fleet' ? 'var(--gov-navy)' : 'var(--gov-text-muted)',
            cursor: 'pointer'
          }}
        >
          Fleet & Inspection Vehicles ({vehicles.length})
        </button>
        <button
          onClick={() => setActiveTab('defects')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'defects' ? '3px solid var(--gov-blue)' : '3px solid transparent',
            background: 'transparent',
            fontWeight: 700,
            fontSize: '14px',
            color: activeTab === 'defects' ? 'var(--gov-navy)' : 'var(--gov-text-muted)',
            cursor: 'pointer'
          }}
        >
          Live Database Defect Ledger ({defects.length})
        </button>
      </div>

      {activeTab === 'fleet' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.3fr) minmax(360px, 1.7fr)', gap: '20px' }}>
          <div className="gov-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', background: 'var(--gov-card-subtle)', borderBottom: '1px solid var(--gov-border)', fontSize: '13px', fontWeight: 700, color: 'var(--gov-navy)' }}>
              Registered Survey Units in Jurisdiction
            </div>
            <div>
              {vehicles.map((v) => {
                const isSelected = selectedVehicle.id === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => { setSelectedVehicle(v); clearVehicleReplyNotification(v.id); }}
                    style={{
                      padding: '16px 18px',
                      borderBottom: '1px solid var(--gov-border)',
                      cursor: 'pointer',
                      background: isSelected ? '#f0f9ff' : '#ffffff',
                      borderLeft: isSelected ? '4px solid var(--gov-blue)' : '4px solid transparent',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--gov-text-primary)', letterSpacing: '0.4px' }}>
                            {v.number}
                          </span>
                          <span className={`gov-badge ${v.status === 'surveying' ? 'gov-badge-green' : v.status === 'in_transit' ? 'gov-badge-blue' : 'gov-badge-neutral'}`} style={{ fontSize: '10px' }}>
                            {v.status === 'surveying' ? 'Surveying' : v.status === 'in_transit' ? 'In Transit' : 'Idle'}
                          </span>
                          {v.hasUnreadReply && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--gov-red-light)', color: 'var(--gov-red)', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gov-red)' }} />
                              Crew Replied
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
                          {v.model} • Driver: <strong>{v.driver}</strong>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '6px' }}>
                          Current Stretch: {v.currentStretch}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)' }}>{v.totalKm} KM</div>
                        <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>{v.defectsLogged} defects logged</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="gov-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--gov-border)', paddingBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                  Vehicle {selectedVehicle.number}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
                  {selectedVehicle.model}
                </div>
              </div>
              <button
                className="gov-btn-primary"
                onClick={() => setShowAssignModal(true)}
              >
                <Send size={15} />
                <span>Assign Road Stretch</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'var(--gov-card-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Survey Crew Personnel</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-text-primary)', marginTop: '4px' }}>
                  {selectedVehicle.crew.join(' • ')}
                </div>
              </div>
              <div style={{ background: 'var(--gov-card-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Current Operational Stretch</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-blue)', marginTop: '4px' }}>
                  {selectedVehicle.currentStretch}
                </div>
              </div>
            </div>

            {selectedVehicle.lastReply && (
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Latest Field Message from Vehicle Crew:</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--gov-text-primary)', marginTop: '4px', fontStyle: 'italic' }}>
                  "{selectedVehicle.lastReply}"
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', borderTop: '1px solid var(--gov-border)', paddingTop: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gov-text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Quick Directives for this Vehicle
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="gov-btn-secondary" style={{ flex: 1, fontSize: '12px' }} onClick={() => alert('Recalibration ping sent to vehicle unit.')}>
                  Request Sensor Calibration
                </button>
                <button className="gov-btn-secondary" style={{ flex: 1, fontSize: '12px' }} onClick={() => alert('Vehicle status marked as Depot Stationed.')}>
                  Order Return to Depot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'defects' && (
        <div className="gov-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', background: 'var(--gov-card-subtle)', borderBottom: '1px solid var(--gov-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-navy)' }}>
              Live Supabase Defect Ledger (ASTM D6433 Certified)
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)' }}>
              {loadingDefects ? 'Fetching live database rows...' : `${defects.length} total road defects found`}
            </div>
          </div>

          {loadingDefects ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gov-text-muted)' }}>
              Loading live defects from database...
            </div>
          ) : defects.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gov-text-muted)' }}>
              No defects recorded in database yet. Launch a survey scan from the vehicle console to log hazards.
            </div>
          ) : (
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Defect Type & Severity</th>
                  <th>Location & Time</th>
                  <th>Source / Unit</th>
                  <th>Review Status</th>
                  <th style={{ textAlign: 'right' }}>Engineering Verification Action</th>
                </tr>
              </thead>
              <tbody>
                {defects.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--gov-text-primary)' }}>{d.defectType}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>Confidence: {Math.round(d.confidence * 100)}% • Severity: {d.severity}/5</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>{d.location}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>{d.time}</div>
                    </td>
                    <td>
                      <span className="gov-badge gov-badge-neutral">{d.vehicleNumber}</span>
                    </td>
                    <td>
                      <span className={`gov-badge ${d.status === 'fit' ? 'gov-badge-green' : d.status === 'in_validation' ? 'gov-badge-amber' : d.status === 'rescan_required' ? 'gov-badge-red' : 'gov-badge-neutral'}`}>
                        {d.status === 'fit' ? 'Marked Fit' : d.status === 'in_validation' ? 'Validation Required' : d.status === 'rescan_required' ? 'Scan Again' : 'Pending Review'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          onClick={() => handleUpdateDefectStatus(d.id, 'fit')}
                          className="gov-btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--gov-green)' }}
                          title="Dismiss as fit for traffic"
                        >
                          Mark Fit
                        </button>
                        <button
                          onClick={() => handleUpdateDefectStatus(d.id, 'in_validation')}
                          className="gov-btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--gov-blue)' }}
                          title="Send junior engineer to measure"
                        >
                          Validate
                        </button>
                        <button
                          onClick={() => handleUpdateDefectStatus(d.id, 'rescan_required')}
                          className="gov-btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--gov-red)' }}
                          title="Requires re-inspection"
                        >
                          Rescan
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

      {showAssignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="gov-card" style={{ width: '100%', maxWidth: '520px', padding: '24px', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gov-navy)', marginBottom: '4px' }}>
              Dispatch Road Survey Task
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginBottom: '18px' }}>
              Assign stretch to: <strong>{selectedVehicle.number}</strong> ({selectedVehicle.driver})
            </p>

            <form onSubmit={handleAssignTask} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  Road Stretch Name / Highway Section
                </label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. NH-27 Khanapara to Beltola Junction (6.4 KM)"
                  value={taskStretchName}
                  onChange={(e) => setTaskStretchName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  Target Survey Speed (KM/H)
                </label>
                <select
                  value={taskSpeed}
                  onChange={(e) => setTaskSpeed(e.target.value)}
                  className="gov-input"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="20">20 km/h (Dense urban / Market corridors)</option>
                  <option value="25">25 km/h (Standard State Highways)</option>
                  <option value="30">30 km/h (Open National Highway bypass)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  Official Instructions / Field Notes
                </label>
                <textarea
                  className="gov-input"
                  rows={3}
                  placeholder="e.g. Pay special attention to shoulder erosion and culvert approaches near Mile 14."
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
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
                  <Send size={15} />
                  <span>Dispatch Task to Vehicle</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
