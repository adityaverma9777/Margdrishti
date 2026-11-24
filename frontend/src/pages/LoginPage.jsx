import React, { useState } from 'react';
import { Shield, Car, Building2, CheckCircle2, ArrowRight, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { loginAs, loginCustom } = useAuth();
  const [selectedRole, setSelectedRole] = useState('surveyor');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide your authorized government email and password.');
      return;
    }
    if (selectedRole === 'surveyor' && !vehicleNumber) {
      setError('Please enter the registration number of the survey vehicle.');
      return;
    }
    setError('');
    loginCustom(email, selectedRole, vehicleNumber);
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', background: 'radial-gradient(circle at 50% 10%, #f1f5f9 0%, #f8fafc 100%)' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '12px', background: '#e0f2fe', color: 'var(--gov-navy)', marginBottom: '14px', border: '1px solid #bae6fd' }}>
            <Shield size={34} strokeWidth={2.2} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.5px' }}>
            Government Portal Login
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--gov-text-secondary)', marginTop: '6px' }}>
            Road Safety, Pavement Condition Index (PCI) & Survey Management System
          </p>
        </div>

        <div className="gov-card" style={{ padding: '28px', border: '1px solid var(--gov-border)', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ marginBottom: '22px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gov-text-secondary)', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
              Select Your Official Role
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => { setSelectedRole('surveyor'); setError(''); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: `2px solid ${selectedRole === 'surveyor' ? 'var(--gov-blue)' : 'var(--gov-border)'}`,
                  background: selectedRole === 'surveyor' ? '#f0f9ff' : '#ffffff',
                  color: selectedRole === 'surveyor' ? 'var(--gov-navy)' : 'var(--gov-text-secondary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Car size={22} color={selectedRole === 'surveyor' ? 'var(--gov-blue)' : 'var(--gov-text-muted)'} />
                <span>Field Surveyor</span>
                <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--gov-text-muted)' }}>Survey Vehicle Crew</span>
              </button>

              <button
                type="button"
                onClick={() => { setSelectedRole('official'); setError(''); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: `2px solid ${selectedRole === 'official' ? 'var(--gov-blue)' : 'var(--gov-border)'}`,
                  background: selectedRole === 'official' ? '#f0f9ff' : '#ffffff',
                  color: selectedRole === 'official' ? 'var(--gov-navy)' : 'var(--gov-text-secondary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Building2 size={22} color={selectedRole === 'official' ? 'var(--gov-blue)' : 'var(--gov-text-muted)'} />
                <span>Desk Official</span>
                <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--gov-text-muted)' }}>Engineer / Supervisor</span>
              </button>
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--gov-red-light)', border: '1px solid #fca5a5', padding: '10px 12px', borderRadius: 'var(--radius-sm)', color: 'var(--gov-red)', fontSize: '13px', marginBottom: '18px' }}>
              <AlertCircle size={16} flexShrink={0} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gov-text-primary)', display: 'block', marginBottom: '6px' }}>
                Government Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="gov-input"
                  placeholder={selectedRole === 'surveyor' ? 'surveyor.guwahati@pwd.gov.in' : 'engineer.hq@pwd.gov.in'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ paddingLeft: '36px' }}
                />
                <Mail size={16} color="var(--gov-text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gov-text-primary)', display: 'block', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="gov-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingLeft: '36px' }}
                />
                <Lock size={16} color="var(--gov-text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            {selectedRole === 'surveyor' && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gov-text-primary)', display: 'block', marginBottom: '6px' }}>
                  Assigned Vehicle Registration Number
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="gov-input"
                    placeholder="e.g. AS-01-BX-4021"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    style={{ paddingLeft: '36px', letterSpacing: '0.5px', textTransform: 'uppercase' }}
                  />
                  <Car size={16} color="var(--gov-text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="gov-btn-primary"
              style={{ width: '100%', marginTop: '8px', padding: '12px' }}
            >
              <span>Sign In to {selectedRole === 'surveyor' ? 'Survey Portal' : 'Official Portal'}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--gov-border)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gov-text-muted)', textAlign: 'center', marginBottom: '10px', letterSpacing: '0.5px' }}>
              Instant Demo Access
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                className="gov-btn-secondary"
                onClick={() => loginAs('surveyor')}
                style={{ fontSize: '12px', padding: '8px 10px' }}
              >
                <Car size={14} color="var(--gov-green)" />
                <span>Demo Surveyor</span>
              </button>
              <button
                type="button"
                className="gov-btn-secondary"
                onClick={() => loginAs('official')}
                style={{ fontSize: '12px', padding: '8px 10px' }}
              >
                <Building2 size={14} color="var(--gov-blue)" />
                <span>Demo Official</span>
              </button>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--gov-text-muted)' }}>
          Authorised Government Use Only • All Access & Surveys are Cryptographically Logged
        </div>
      </div>
    </div>
  );
}
