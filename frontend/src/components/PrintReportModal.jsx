import React, { useState, useEffect, useMemo } from 'react';
import { X, Printer, FileText, CheckSquare, Square } from 'lucide-react';
import { supabase } from '../supabaseClient';
export default function PrintReportModal({ vehicles, trips, defects, selectedState, onClose }) {
  const realTrips = useMemo(() => (trips || []).filter(t => !t.is_demo), [trips]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('all');
  const [selectedTripId, setSelectedTripId] = useState('all');
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeTrips, setIncludeTrips] = useState(true);
  const [includeDefects, setIncludeDefects] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeSignOff, setIncludeSignOff] = useState(true);
  const [reportDefects, setReportDefects] = useState(defects || []);
  const [loadingDefects, setLoadingDefects] = useState(false);
  const [reportId] = useState(() => `RPT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`);
  useEffect(() => {
    let active = true;
    const loadFilteredDefects = async () => {
      setLoadingDefects(true);
      try {
        let query = supabase
          .from('hazards')
          .select('*')
          .eq('is_demo', false)
          .order('created_at', { ascending: false })
          .limit(200);
        if (selectedTripId !== 'all') {
          query = query.eq('trip_id', selectedTripId);
        } else if (selectedVehicleId !== 'all') {
          const veh = vehicles.find(v => v.id === selectedVehicleId);
          if (veh) {
            query = query.or(`vehicle_id.eq.${veh.id},vehicle_number.eq.${veh.vehicle_number}`);
          }
        }
        const { data } = await query;
        if (active && data) setReportDefects(data);
      } catch {
        if (active) setReportDefects((defects || []).filter(d => !d.is_demo));
      }
      if (active) setLoadingDefects(false);
    };
    loadFilteredDefects();
    return () => { active = false; };
  }, [selectedVehicleId, selectedTripId, vehicles, defects]);
  const availableTrips = useMemo(() => {
    if (selectedVehicleId === 'all') return realTrips;
    const veh = vehicles.find(v => v.id === selectedVehicleId);
    return realTrips.filter(t => t.vehicle_id === selectedVehicleId || (veh && t.vehicle_number === veh.vehicle_number));
  }, [realTrips, selectedVehicleId, vehicles]);
  const includedTrips = useMemo(() => {
    if (selectedTripId !== 'all') return availableTrips.filter(t => t.id === selectedTripId);
    return availableTrips;
  }, [availableTrips, selectedTripId]);
  const handleVehicleChange = (val) => {
    setSelectedVehicleId(val);
    setSelectedTripId('all');
  };
  const selectedVehicleObj = vehicles.find(v => v.id === selectedVehicleId);
  const selectedTripObj = realTrips.find(t => t.id === selectedTripId);
  const totalDistanceKm = useMemo(() => {
    return includedTrips.reduce((sum, t) => sum + (Number(t.total_distance_km) || 0), 0).toFixed(2);
  }, [includedTrips]);
  const avgPci = useMemo(() => {
    if (includedTrips.length === 0) return 100;
    const valid = includedTrips.filter(t => t.calculated_pci !== null && t.calculated_pci !== undefined);
    if (valid.length === 0) return 100;
    return Math.round(valid.reduce((s, t) => s + Number(t.calculated_pci), 0) / valid.length);
  }, [includedTrips]);
  const pciCondition = avgPci >= 85 ? 'Good' : avgPci >= 70 ? 'Satisfactory' : avgPci >= 55 ? 'Fair' : avgPci >= 40 ? 'Poor' : 'Serious';
  const photosList = useMemo(() => reportDefects.filter(d => d.image_url), [reportDefects]);
  const formatDateTime = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const ToggleRow = ({ checked, onChange, label }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
        background: checked ? '#f8fafc' : '#ffffff',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        color: '#0f172a',
        fontSize: '12px',
        fontWeight: 600
      }}
    >
      {checked ? <CheckSquare size={16} color="#111827" /> : <Square size={16} color="#94a3b8" />}
      <span>{label}</span>
    </button>
  );
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4500, background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        .print-modal-layout { display: flex; flex: 1; min-height: 0; overflow: hidden; }
        .print-config-pane { width: 320px; flex-shrink: 0; background: #ffffff; border-right: 1px solid #e2e8f0; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
        .print-preview-pane { flex: 1; background: #e2e8f0; overflow-y: auto; padding: 28px; display: flex; justify-content: center; align-items: flex-start; }
        .print-report-sheet { width: 100%; max-width: 820px; background: #ffffff; border: 1px solid #cbd5e1; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12); padding: 36px 40px; color: #0f172a; font-family: 'Inter', -apple-system, sans-serif; }
        @media (max-width: 900px) {
          .print-modal-layout { flex-direction: column; }
          .print-config-pane { width: 100%; max-height: 40vh; border-right: none; border-bottom: 1px solid #e2e8f0; }
          .print-preview-pane { padding: 14px; }
          .print-report-sheet { padding: 20px; }
        }
        @media print {
          body * { visibility: hidden !important; }
          .no-print { display: none !important; }
          .print-report-sheet, .print-report-sheet * { visibility: visible !important; }
          .print-report-sheet {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 10mm !important;
            margin: 0 !important;
            background: #ffffff !important;
          }
          .print-photo-card { break-inside: avoid; page-break-inside: avoid; }
          tr { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="no-print" style={{ padding: '12px 20px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileText size={18} color="#111827" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Inspection Report Builder</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}
          >
            <X size={15} />
            <span>Close</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            style={{ background: '#111827', border: '1px solid #111827', color: '#ffffff', padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}
          >
            <Printer size={15} />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>
      <div className="print-modal-layout">
        <div className="print-config-pane no-print">
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Select Vehicle
            </label>
            <select
              className="gov-input"
              value={selectedVehicleId}
              onChange={(e) => handleVehicleChange(e.target.value)}
              style={{ width: '100%', fontSize: '13px', fontWeight: 600 }}
            >
              <option value="all">All Registered Vehicles ({vehicles.length})</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.vehicle_number} — {v.model_name || 'Survey Unit'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Select Survey Trip
            </label>
            <select
              className="gov-input"
              value={selectedTripId}
              onChange={(e) => setSelectedTripId(e.target.value)}
              style={{ width: '100%', fontSize: '13px', fontWeight: 600 }}
            >
              <option value="all">All Survey Trips ({availableTrips.length})</option>
              {availableTrips.map(t => (
                <option key={t.id} value={t.id}>
                  {t.road_name || 'Survey Stretch'} ({formatDateTime(t.start_time || t.created_at)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Report Sections
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ToggleRow checked={includeSummary} onChange={setIncludeSummary} label="Summary Metrics & PCI" />
              <ToggleRow checked={includeTrips} onChange={setIncludeTrips} label="Survey Trips Table" />
              <ToggleRow checked={includeDefects} onChange={setIncludeDefects} label="Road Defect Register" />
              <ToggleRow checked={includePhotos} onChange={setIncludePhotos} label={`Defect Photographs (${photosList.length})`} />
              <ToggleRow checked={includeSignOff} onChange={setIncludeSignOff} label="Verification Sign-Off" />
            </div>
          </div>
          <div style={{ marginTop: 'auto', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', color: '#475569', lineHeight: '1.5' }}>
            <div><strong>Records Included:</strong></div>
            <div>Trips: {includedTrips.length}</div>
            <div>Defects: {loadingDefects ? 'Loading...' : reportDefects.length}</div>
            <div>Photos: {includePhotos ? photosList.length : 0}</div>
          </div>
        </div>
        <div className="print-preview-pane">
          <div className="print-report-sheet">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111827', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src="/logo.png" alt="StreetIQ" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    StreetIQ Gov • Road Infrastructure Division
                  </div>
                  <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    Road Surface Inspection Report
                  </h1>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#475569', lineHeight: '1.6' }}>
                <div><strong>Report ID:</strong> {reportId}</div>
                <div><strong>State:</strong> {selectedState}</div>
                <div><strong>Generated:</strong> {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '20px', fontSize: '12px' }}>
              <div>
                <span style={{ color: '#64748b' }}>Vehicle Scope: </span>
                <strong style={{ color: '#0f172a' }}>
                  {selectedVehicleObj ? `${selectedVehicleObj.vehicle_number} (${selectedVehicleObj.model_name || 'Survey Unit'})` : `All Vehicles (${vehicles.length})`}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Trip Scope: </span>
                <strong style={{ color: '#0f172a' }}>
                  {selectedTripObj ? (selectedTripObj.road_name || 'Survey Stretch') : `All Recorded Trips (${includedTrips.length})`}
                </strong>
              </div>
            </div>
            {includeSummary && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '12px' }}>
                  1. Inspection Summary
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Distance Surveyed</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{totalDistanceKm} km</div>
                  </div>
                  <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Survey Trips</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{includedTrips.length}</div>
                  </div>
                  <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Average PCI</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{avgPci}/100 <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>({pciCondition})</span></div>
                  </div>
                  <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Defects Recorded</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{reportDefects.length}</div>
                  </div>
                </div>
              </div>
            )}
            {includeTrips && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '12px' }}>
                  2. Survey Trips Record
                </h2>
                {includedTrips.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#64748b', padding: '12px 0' }}>No survey trips recorded for the selected filter.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Road Stretch</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Vehicle</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Driver</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Start Time</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Distance</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Avg Speed</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>PCI</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {includedTrips.map((t) => (
                        <tr key={t.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px', fontWeight: 600 }}>{t.road_name || 'Survey Stretch'}</td>
                          <td style={{ padding: '8px' }}>{t.vehicle_number || '—'}</td>
                          <td style={{ padding: '8px' }}>{t.driver_name || '—'}</td>
                          <td style={{ padding: '8px' }}>{formatDateTime(t.start_time || t.created_at)}</td>
                          <td style={{ padding: '8px' }}>{t.total_distance_km ? `${t.total_distance_km} km` : '0.0 km'}</td>
                          <td style={{ padding: '8px' }}>{t.avg_speed_kmh ? `${t.avg_speed_kmh} km/h` : '—'}</td>
                          <td style={{ padding: '8px', fontWeight: 700 }}>{t.calculated_pci !== null && t.calculated_pci !== undefined ? `${t.calculated_pci}/100` : '100/100'}</td>
                          <td style={{ padding: '8px', textTransform: 'capitalize' }}>{(t.status || 'completed').replace('_', ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {includeDefects && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '12px' }}>
                  3. Road Defect Register
                </h2>
                {reportDefects.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#64748b', padding: '12px 0' }}>No road defects recorded for the selected scope.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                        <th style={{ padding: '8px', fontWeight: 700 }}>#</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Defect Classification</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Severity</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Confidence</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Vehicle</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Recorded At</th>
                        <th style={{ padding: '8px', fontWeight: 700 }}>Review Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportDefects.map((d, idx) => {
                        const label = d.display_label || (d.type === 'pothole' ? 'Pothole (ASTM 13)' : d.type === 'crack' ? 'Road Crack (ASTM 1/10)' : d.type);
                        const reviewStatus = (d.action_status || d.status || 'pending_review').replace('_', ' ');
                        return (
                          <tr key={d.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px', color: '#64748b' }}>{idx + 1}</td>
                            <td style={{ padding: '8px', fontWeight: 600 }}>{label}</td>
                            <td style={{ padding: '8px', fontWeight: 700 }}>{d.severity_score || 4}/5</td>
                            <td style={{ padding: '8px' }}>{Math.round((d.confidence_score || 0.85) * 100)}%</td>
                            <td style={{ padding: '8px' }}>{d.vehicle_number || '—'}</td>
                            <td style={{ padding: '8px' }}>{formatDateTime(d.created_at)}</td>
                            <td style={{ padding: '8px', textTransform: 'capitalize' }}>{reviewStatus}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {includePhotos && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '12px' }}>
                  4. Photographic Evidence ({photosList.length})
                </h2>
                {photosList.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#64748b', padding: '12px 0' }}>No defect photographs available for the selected scope.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    {photosList.map((d, idx) => {
                      const label = d.display_label || d.type || 'Road Defect';
                      return (
                        <div key={d.id} className="print-photo-card" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', background: '#ffffff' }}>
                          <img
                            src={d.image_url}
                            alt={label}
                            style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block', background: '#09090b' }}
                          />
                          <div style={{ padding: '8px 10px', fontSize: '11px', borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>#{idx + 1} · {label}</div>
                            <div style={{ color: '#475569', marginTop: '2px' }}>
                              Severity {d.severity_score || 4}/5 • {d.vehicle_number || 'Survey Unit'} • {formatDateTime(d.created_at)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {includeSignOff && (
              <div style={{ marginTop: '32px', paddingTop: '18px', borderTop: '1px solid #cbd5e1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', fontSize: '11px', color: '#475569' }}>
                <div>
                  <div style={{ height: '36px', borderBottom: '1px solid #94a3b8', marginBottom: '6px' }}></div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>Prepared By (Survey / Field Unit)</div>
                  <div>Date: _______________________</div>
                </div>
                <div>
                  <div style={{ height: '36px', borderBottom: '1px solid #94a3b8', marginBottom: '6px' }}></div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>Reviewed & Approved By (Admin / PWD)</div>
                  <div>Date: _______________________</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
