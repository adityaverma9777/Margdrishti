import React, { useState } from 'react';
import { Shield, Car, Building2, ArrowRight, Lock, Mail, AlertCircle, UserPlus, Key } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { loginWithCredentials, registerAccount } = useAuth();
  const [selectedRole, setSelectedRole] = useState('surveyor');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Please provide your authorized government ID/Email and password.');
      return;
    }
    if (selectedRole === 'surveyor' && !vehicleNumber) {
      setError('Please provide the vehicle registration number.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isRegisterMode) {
        await registerAccount(identifier, password, selectedRole, fullName, vehicleNumber);
      } else {
        await loginWithCredentials(identifier, password, selectedRole, vehicleNumber);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', background: 'radial-gradient(circle at 50% 10%, #f1f5f9 0%, #f8fafc 100%)' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '12px', background: '#e0f2fe', color: 'var(--gov-navy)', marginBottom: '14px', border: '1px solid #bae6fd' }}>
            <Shield size={34} strokeWidth={2.2} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.5px' }}>
            {isRegisterMode ? 'Register Government Account' : 'Government Portal Login'}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--gov-text-secondary)', marginTop: '6px' }}>
            National Road Safety, Pavement Condition Index (PCI) & Survey Management
          </p>
        </div>

        <div className="gov-card" style={{ padding: '28px', border: '1px solid var(--gov-border)', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ marginBottom: '22px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gov-text-secondary)', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
              Select Operational Role
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
            {isRegisterMode && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gov-text-primary)', display: 'block', marginBottom: '6px' }}>
                  Full Officer / Driver Name
                </label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. Er. Rajiv Baruah"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gov-text-primary)', display: 'block', marginBottom: '6px' }}>
                Official Username or Email ID
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="gov-input"
                  placeholder={selectedRole === 'surveyor' ? 'surveyor.guwahati@pwd.gov.in' : 'engineer.hq@pwd.gov.in'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  style={{ paddingLeft: '36px' }}
                  required
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
                  required
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
                    required
                  />
                  <Car size={16} color="var(--gov-text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="gov-btn-primary"
              style={{ width: '100%', marginTop: '8px', padding: '12px', opacity: loading ? 0.7 : 1 }}
            >
              <span>{loading ? 'Authenticating...' : isRegisterMode ? 'Create Official Account' : `Sign In to ${selectedRole === 'surveyor' ? 'Survey Console' : 'Official Desk'}`}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--gov-border)', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => { setIsRegisterMode(!isRegisterMode); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--gov-blue)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              {isRegisterMode ? 'Already have an official account? Sign In' : 'Need to register a new survey vehicle or official account? Click here'}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--gov-text-muted)' }}>
          Authorised Government Use Only • All Access & Surveys are Cryptographically Logged
        </div>
      </div>
    </div>
  );
}
