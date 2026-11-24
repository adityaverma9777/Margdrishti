import React, { useState } from 'react';
import { Play, Map, Compass, Navigation, AlertTriangle, ShieldAlert, CheckCircle, Clock, Info, ChevronRight, Layers, Gauge } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SAMPLE_STRETCHES = [
  {
    id: 'st_01',
    name: 'NH-27 Guwahati Bypass (Khanapara to Jalukbari)',
    type: 'NH',
    distanceKm: 18.4,
    status: 'needs_survey',
    lastSurveyDate: '12-Oct-2025',
    avgPci: 72,
    potholesFound: 6,
    recommendedSpeed: '25 km/h'
  },
  {
    id: 'st_02',
    name: 'SH-03 Assam Trunk Road (Paltan Bazar to Dispur)',
    type: 'SH',
    distanceKm: 8.2,
    status: 'surveyed',
    lastSurveyDate: '20-Nov-2026',
    avgPci: 86,
    potholesFound: 2,
    recommendedSpeed: '20 km/h'
  },
  {
    id: 'st_03',
    name: 'GS Road Arterial (Bhangagarh to Six Mile)',
    type: 'MDR',
    distanceKm: 6.8,
    status: 'surveyed',
    lastSurveyDate: '18-Nov-2026',
    avgPci: 81,
    potholesFound: 3,
    recommendedSpeed: '20 km/h'
  },
  {
    id: 'st_04',
    name: 'VIP Road (Six Mile to Narangi Tiniali)',
    type: 'MDR',
    distanceKm: 5.5,
    status: 'needs_survey',
    lastSurveyDate: '04-Aug-2025',
    avgPci: 58,
    potholesFound: 14,
    recommendedSpeed: '20 km/h'
  }
];

export default function SurveyorDashboard() {
  const { currentUser, activeRegion } = useAuth();
  const [filterType, setFilterType] = useState('ALL');
  const [selectedStretch, setSelectedStretch] = useState(SAMPLE_STRETCHES[0]);
  const [activeTab, setActiveTab] = useState('stretches');

  const filteredStretches = SAMPLE_STRETCHES.filter(st => {
    if (filterType === 'ALL') return true;
    return st.type === filterType;
  });

  const totalKm = SAMPLE_STRETCHES.reduce((acc, curr) => acc + curr.distanceKm, 0);
  const surveyedKm = SAMPLE_STRETCHES.filter(s => s.status === 'surveyed').reduce((acc, curr) => acc + curr.distanceKm, 0);

  return (
    <div className="gov-container" style={{ padding: '24px 20px', minHeight: 'calc(100vh - 68px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.4px' }}>
              Field Surveyor Console
            </h1>
            <span className="gov-badge gov-badge-green">Vehicle Unit Active</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            Inspection Crew for Vehicle: <strong>{currentUser?.vehicleNumber || 'AS-01-BX-4021'}</strong> ({currentUser?.vehicleModel || 'Inspection Bolero #03'}) • Division: {activeRegion.city}, {activeRegion.state}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="gov-btn-secondary"
            onClick={() => setActiveTab('history')}
            style={{ border: activeTab === 'history' ? '2px solid var(--gov-blue)' : undefined }}
          >
            <Clock size={16} color="var(--gov-blue)" />
            <span>Past Surveys</span>
          </button>
          <button
            className="gov-btn-primary"
            onClick={() => alert('Pre-Flight Hardware Check & Optical Sensor initialization will launch in Milestone 5.')}
            style={{ padding: '10px 20px', fontSize: '14px' }}
          >
            <Play size={16} fill="#ffffff" />
            <span>Launch Survey Inspection</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Road Network in Division
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-text-primary)', marginTop: '6px' }}>
            {totalKm.toFixed(1)} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>KM Total</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-green)', marginTop: '4px', fontWeight: 600 }}>
            {surveyedKm.toFixed(1)} KM Audited ({Math.round((surveyedKm / totalKm) * 100)}%)
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Pending Inspections
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-amber)', marginTop: '6px' }}>
            {SAMPLE_STRETCHES.filter(s => s.status === 'needs_survey').length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Stretches</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            Scheduled for current inspection cycle
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Average Pavement Index (PCI)
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-blue)', marginTop: '6px' }}>
            79 <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>/ 100</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-blue)', marginTop: '4px', fontWeight: 600 }}>
            Satisfactory Quality Standard
          </div>
        </div>

        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            On-Device Sensor Status
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-green)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={22} color="var(--gov-green)" />
            <span>Hardware Ready</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            Browser WebGPU & Camera Ready
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(360px, 1.8fr)', gap: '20px' }}>
        <div className="gov-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--gov-border)', background: 'var(--gov-card-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-navy)' }}>
                Road Stretches in Jurisdiction
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)' }}>
                Select a stretch to inspect or review
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['ALL', 'NH', 'SH', 'MDR'].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: '1px solid',
                    borderColor: filterType === t ? 'var(--gov-navy)' : 'var(--gov-border)',
                    background: filterType === t ? 'var(--gov-navy)' : '#ffffff',
                    color: filterType === t ? '#ffffff' : 'var(--gov-text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '540px' }}>
            {filteredStretches.map((st) => {
              const isSelected = selectedStretch.id === st.id;
              return (
                <div
                  key={st.id}
                  onClick={() => setSelectedStretch(st)}
                  style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--gov-border)',
                    cursor: 'pointer',
                    background: isSelected ? '#f0f9ff' : '#ffffff',
                    borderLeft: isSelected ? '4px solid var(--gov-blue)' : '4px solid transparent',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span className={`gov-badge ${st.type === 'NH' ? 'gov-badge-red' : st.type === 'SH' ? 'gov-badge-amber' : 'gov-badge-blue'}`} style={{ fontSize: '10px' }}>
                          {st.type === 'NH' ? 'National Highway' : st.type === 'SH' ? 'State Highway' : 'Major District Road'}
                        </span>
                        <span className={`gov-badge ${st.status === 'surveyed' ? 'gov-badge-green' : 'gov-badge-amber'}`} style={{ fontSize: '10px' }}>
                          {st.status === 'surveyed' ? 'Audited' : 'Needs Survey'}
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>
                        {st.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '4px', display: 'flex', gap: '14px' }}>
                        <span>Length: <strong>{st.distanceKm} km</strong></span>
                        <span>Speed Limit: <strong>{st.recommendedSpeed}</strong></span>
                        <span>PCI: <strong>{st.avgPci}/100</strong></span>
                      </div>
                    </div>
                    <ChevronRight size={18} color={isSelected ? 'var(--gov-blue)' : 'var(--gov-text-muted)'} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="gov-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--gov-border)', background: 'var(--gov-card-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Navigation size={18} color="var(--gov-blue)" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-navy)' }}>
                Stretch Navigation & Overview
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', fontWeight: 600 }}>
              Inspection Guidance
            </div>
          </div>

          <div style={{ padding: '18px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid var(--gov-border)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-text-primary)' }}>
                {selectedStretch.name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                Official highway classification under Public Works Department jurisdiction. Survey vehicles must maintain uniform speeds between <strong>15 km/h and 30 km/h</strong> for optimal road surface defect tracking.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: '#ffffff', border: '1px solid var(--gov-border)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Survey Stretch Distance</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-text-primary)', marginTop: '2px' }}>{selectedStretch.distanceKm} KM</div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid var(--gov-border)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Recommended Vehicle Speed</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-blue)', marginTop: '2px' }}>{selectedStretch.recommendedSpeed}</div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid var(--gov-border)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Last Official Survey</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-text-primary)', marginTop: '4px' }}>{selectedStretch.lastSurveyDate}</div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid var(--gov-border)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Pavement Rating</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: selectedStretch.avgPci >= 80 ? 'var(--gov-green)' : 'var(--gov-amber)', marginTop: '4px' }}>
                  {selectedStretch.avgPci}/100 ({selectedStretch.avgPci >= 80 ? 'Good' : 'Satisfactory'})
                </div>
              </div>
            </div>

            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '12px 14px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Info size={18} color="var(--gov-amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.4 }}>
                <strong>Survey Protocol Notice:</strong> Raw survey telemetry and hazard detection logs are cryptographically immutable. Surveyors can review all historical inspections but cannot alter or delete defect logs.
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid var(--gov-border)', display: 'flex', gap: '10px' }}>
              <button
                className="gov-btn-secondary"
                style={{ flex: 1 }}
                onClick={() => alert(`Navigating vehicle to start point of ${selectedStretch.name}`)}
              >
                <Compass size={16} />
                <span>Navigate to Start Point</span>
              </button>
              <button
                className="gov-btn-primary"
                style={{ flex: 1.3 }}
                onClick={() => alert(`Starting pre-flight checks for ${selectedStretch.name}...`)}
              >
                <Play size={16} fill="#ffffff" />
                <span>Begin Survey Run</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
