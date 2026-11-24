import React from 'react';
import { Shield, MapPin, User, LogOut, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { currentUser, logout, activeRegion, updateRegion } = useAuth();

  const handleRegionChange = (e) => {
    const [state, city] = e.target.value.split(':');
    updateRegion(state, city);
  };

  return (
    <header style={{ background: '#ffffff', borderBottom: '1px solid var(--gov-border)', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ background: 'var(--gov-navy)', color: '#ffffff', padding: '4px 20px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.4px', fontWeight: 500 }}>
          <span>GOVERNMENT OF INDIA</span>
          <span>•</span>
          <span>MINISTRY OF ROAD TRANSPORT & HIGHWAYS (MORT&H)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', opacity: 0.9 }}>
          <span>Public Works Department (PWD) Portal</span>
          <span>Secure Gov Network</span>
        </div>
      </div>
      <div className="gov-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '68px', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#e0f2fe', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gov-navy)', flexShrink: 0 }}>
            <Shield size={24} strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.4px' }}>StreetIQ Gov</span>
              <span className="gov-badge gov-badge-blue" style={{ fontSize: '10px', textTransform: 'uppercase' }}>Official Portal</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', fontWeight: 500 }}>
              National Road Condition Survey & Pavement Quality Audit System
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--gov-card-subtle)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
            <MapPin size={15} color="var(--gov-blue)" />
            <select
              value={`${activeRegion.state}:${activeRegion.city}`}
              onChange={handleRegionChange}
              style={{ background: 'transparent', border: 'none', fontSize: '13px', fontWeight: 600, color: 'var(--gov-text-primary)', outline: 'none', cursor: 'pointer' }}
            >
              <option value="Assam:Guwahati">Assam — Guwahati Division</option>
              <option value="Assam:Jorhat">Assam — Jorhat Division</option>
              <option value="Maharashtra:Mumbai">Maharashtra — Mumbai Metro</option>
              <option value="Delhi:New Delhi">Delhi — Capital Division</option>
              <option value="Karnataka:Bengaluru">Karnataka — Bengaluru City</option>
            </select>
          </div>
          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '12px', borderLeft: '1px solid var(--gov-border)' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>{currentUser.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px', marginTop: '1px' }}>
                  <span className={`gov-badge ${currentUser.role === 'official' ? 'gov-badge-blue' : 'gov-badge-green'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                    {currentUser.role === 'official' ? 'Desk Officer' : `Surveyor · ${currentUser.vehicleNumber || 'Vehicle #03'}`}
                  </span>
                </div>
              </div>
              <button
                onClick={logout}
                title="Sign out of portal"
                className="gov-btn-secondary"
                style={{ padding: '8px 12px', height: '36px' }}
              >
                <LogOut size={15} />
                <span style={{ fontSize: '12px' }}>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
