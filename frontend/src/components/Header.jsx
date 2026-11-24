import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { currentUser, logout } = useAuth();

  return (
    <header style={{ background: '#ffffff', borderBottom: '1px solid var(--gov-border)', position: 'sticky', top: 0, zIndex: 100 }}>
      <div className="gov-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.png" alt="StreetIQ" style={{ width: '30px', height: '30px', objectFit: 'contain' }} />
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.3px' }}>StreetIQ Gov</span>
        </div>
        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>{currentUser.name}</div>
              <span className={`gov-badge ${currentUser.role === 'official' ? 'gov-badge-blue' : 'gov-badge-green'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                {currentUser.role === 'official' ? 'Official' : `Surveyor · ${currentUser.vehicleNumber || 'Unit'}`}
              </span>
            </div>
            <button
              onClick={logout}
              className="gov-btn-secondary"
              style={{ padding: '6px 12px', height: '34px', fontSize: '12px' }}
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
