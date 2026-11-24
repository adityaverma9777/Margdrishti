import React, { useState } from 'react';
import { Car, Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { loginWithCredentials } = useAuth();
  const [selectedRole, setSelectedRole] = useState('surveyor');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    loginWithCredentials(identifier, password, selectedRole, vehicleNumber);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', background: '#f8fafc', overflow: 'hidden' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img src="/logo.png" alt="StreetIQ" style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 8px' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.3px' }}>
            StreetIQ Gov
          </h1>
        </div>

        <div className="gov-card" style={{ padding: '24px' }}>
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
                border: `1.5px solid ${selectedRole === 'surveyor' ? 'var(--gov-blue)' : 'var(--gov-border)'}`,
                background: selectedRole === 'surveyor' ? '#f0f9ff' : '#ffffff',
                color: selectedRole === 'surveyor' ? 'var(--gov-navy)' : 'var(--gov-text-secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              <Car size={16} color={selectedRole === 'surveyor' ? 'var(--gov-blue)' : 'var(--gov-text-muted)'} />
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
                border: `1.5px solid ${selectedRole === 'official' ? 'var(--gov-blue)' : 'var(--gov-border)'}`,
                background: selectedRole === 'official' ? '#f0f9ff' : '#ffffff',
                color: selectedRole === 'official' ? 'var(--gov-navy)' : 'var(--gov-text-secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              <Building2 size={16} color={selectedRole === 'official' ? 'var(--gov-blue)' : 'var(--gov-text-muted)'} />
              <span>Official</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

            <button
              type="submit"
              className="gov-btn-primary"
              style={{ width: '100%', marginTop: '4px', padding: '11px', fontSize: '14px' }}
            >
              <span>Sign In</span>
              <ArrowRight size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
