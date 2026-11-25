import React, { useState } from 'react';
import { Car, Building2, ArrowRight, PlayCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ScanDemoModal from '../components/ScanDemoModal';
export default function LoginPage() {
  const { loginWithCredentials } = useAuth();
  const [selectedRole, setSelectedRole] = useState('surveyor');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [showScanDemo, setShowScanDemo] = useState(false);
  const handleSubmit = (e) => {
    e.preventDefault();
    loginWithCredentials(identifier, password, selectedRole, vehicleNumber);
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', background: '#f8fafc' }}>
      <div style={{ width: '100%', maxWidth: '390px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img src="/logo.png" alt="StreetIQ" style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 8px' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
            StreetIQ Gov
          </h1>
        </div>
        <div className="gov-card" style={{ padding: '24px', width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '18px' }}>
            <button
              type="button"
              onClick={() => setSelectedRole('surveyor')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 8px',
                borderRadius: 'var(--radius-sm)',
                border: `1.5px solid ${selectedRole === 'surveyor' ? '#111827' : '#e2e8f0'}`,
                background: selectedRole === 'surveyor' ? '#111827' : '#ffffff',
                color: selectedRole === 'surveyor' ? '#ffffff' : '#475569',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              <Car size={16} color={selectedRole === 'surveyor' ? '#ffffff' : '#64748b'} />
              <span>Surveyor</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole('official')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 8px',
                borderRadius: 'var(--radius-sm)',
                border: `1.5px solid ${selectedRole === 'official' ? '#111827' : '#e2e8f0'}`,
                background: selectedRole === 'official' ? '#111827' : '#ffffff',
                color: selectedRole === 'official' ? '#ffffff' : '#475569',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              <Building2 size={16} color={selectedRole === 'official' ? '#ffffff' : '#64748b'} />
              <span>Official / Admin</span>
            </button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '150px' }}>
              <div>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="Username / Email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
              <div>
                <input
                  type="password"
                  className="gov-input"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {selectedRole === 'surveyor' && (
                <div>
                  <input
                    type="text"
                    className="gov-input"
                    placeholder="Vehicle Number (e.g. AS-01-BX-4021)"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              )}
            </div>
            <button
              type="submit"
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '11px',
                fontSize: '14px',
                fontWeight: 600,
                backgroundColor: '#111827',
                color: '#ffffff',
                border: '1px solid #111827',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>Sign In as {selectedRole === 'surveyor' ? 'Surveyor' : 'Official'}</span>
              <ArrowRight size={15} />
            </button>
          </form>
          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setShowScanDemo(true)}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid #111827',
                background: '#ffffff',
                color: '#111827',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              <PlayCircle size={16} color="#111827" />
              <span>Check Our Scans</span>
            </button>
            <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
              Preview road defect detection on sample dashcam footage
            </div>
          </div>
        </div>
      </div>
      {showScanDemo && <ScanDemoModal onClose={() => setShowScanDemo(false)} />}
    </div>
  );
}
