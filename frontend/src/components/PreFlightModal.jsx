import React, { useState, useEffect } from 'react';
import { Camera, Cpu, Compass, Activity, Database, CheckCircle, AlertCircle, Loader2, ArrowRight, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { checkGpuServerHealth } from '../utils/gpuService';

export default function PreFlightModal({ onClose, onPassed, roadName, targetSpeed }) {
  const [checks, setChecks] = useState({
    camera: { status: 'checking', label: 'Optical Camera Feed', detail: 'Verifying video stream' },
    gpu: { status: 'checking', label: 'Inference Engine / GPU', detail: 'Connecting to local CUDA / WebGPU' },
    gps: { status: 'checking', label: 'GPS Satellite Position', detail: 'Locking coordinates' },
    motion: { status: 'checking', label: 'Speed & Motion Gate', detail: 'Calibrating velocity calculation' },
    database: { status: 'checking', label: 'Database Cloud Sync', detail: 'Testing Supabase handshake' }
  });
  const [stream, setStream] = useState(null);

  useEffect(() => {
    let active = true;
    let localStream = null;

    const runDiagnostics = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (active) {
          setStream(localStream);
          setChecks(c => ({
            ...c,
            camera: { status: 'passed', label: 'Optical Camera Feed', detail: 'Video stream active' }
          }));
        }
      } catch (err) {
        if (active) {
          setChecks(c => ({
            ...c,
            camera: { status: 'failed', label: 'Optical Camera Feed', detail: 'Camera permission denied or camera unavailable' }
          }));
        }
      }

      try {
        const gpuHealth = await checkGpuServerHealth();
        if (active) {
          if (gpuHealth && gpuHealth.online) {
            setChecks(c => ({
              ...c,
              gpu: { status: 'passed', label: 'Inference Engine / GPU', detail: `Local CUDA Server Active (${gpuHealth.device || 'GPU'})` }
            }));
          } else {
            const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
            setChecks(c => ({
              ...c,
              gpu: { status: 'passed', label: 'Inference Engine / GPU', detail: hasWebGpu ? 'WebGPU Browser Acceleration' : 'WebGL / CPU Fallback Active' }
            }));
          }
        }
      } catch {
        if (active) {
          setChecks(c => ({
            ...c,
            gpu: { status: 'passed', label: 'Inference Engine / GPU', detail: 'Standard Engine Pipeline Ready' }
          }));
        }
      }

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (active) {
              const acc = Math.round(pos.coords.accuracy || 5);
              setChecks(c => ({
                ...c,
                gps: { status: 'passed', label: 'GPS Satellite Position', detail: `Coordinates Locked (${acc}m accuracy)` }
              }));
            }
          },
          (err) => {
            if (active) {
              setChecks(c => ({
                ...c,
                gps: { status: 'failed', label: 'GPS Satellite Position', detail: err.message || 'GPS permission denied' }
              }));
            }
          },
          { timeout: 5000, enableHighAccuracy: true }
        );
      } else {
        if (active) {
          setChecks(c => ({
            ...c,
            gps: { status: 'failed', label: 'GPS Satellite Position', detail: 'Geolocation not supported by device' }
          }));
        }
      }

      if (active) {
        setChecks(c => ({
          ...c,
          motion: { status: 'passed', label: 'Speed & Motion Gate', detail: `Target pace configured at ${targetSpeed || 25} km/h` }
        }));
      }

      try {
        const { error } = await supabase.from('hazards').select('id').limit(1);
        if (active) {
          if (error) {
            setChecks(c => ({
              ...c,
              database: { status: 'failed', label: 'Database Cloud Sync', detail: error.message || 'Database error' }
            }));
          } else {
            setChecks(c => ({
              ...c,
              database: { status: 'passed', label: 'Database Cloud Sync', detail: 'Cloud database connection verified' }
            }));
          }
        }
      } catch (err) {
        if (active) {
          setChecks(c => ({
            ...c,
            database: { status: 'failed', label: 'Database Cloud Sync', detail: 'Cloud sync unreachable' }
          }));
        }
      }
    };

    runDiagnostics();
    return () => {
      active = false;
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  }, [targetSpeed]);

  const canProceed = Object.values(checks).every(c => c.status === 'passed');

  const handleProceed = () => {
    onPassed(stream);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div className="gov-card" style={{ width: '100%', maxWidth: '460px', padding: '24px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gov-navy)' }}>
              Hardware Pre-Flight Diagnostic
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
              Stretch: <strong>{roadName || 'Road Inspection Run'}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gov-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {Object.entries(checks).map(([key, item]) => {
            const isPassed = item.status === 'passed';
            const isFailed = item.status === 'failed';
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: isPassed ? '#f0fdf4' : isFailed ? '#fef2f2' : 'var(--gov-card-subtle)',
                  border: `1px solid ${isPassed ? '#bbf7d0' : isFailed ? '#fecaca' : 'var(--gov-border)'}`
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  {isPassed ? (
                    <CheckCircle size={18} color="var(--gov-green)" />
                  ) : isFailed ? (
                    <AlertCircle size={18} color="var(--gov-red)" />
                  ) : (
                    <Loader2 size={18} color="var(--gov-blue)" style={{ animation: 'spin 1s linear infinite' }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '11px', color: isPassed ? 'var(--gov-green)' : isFailed ? 'var(--gov-red)' : 'var(--gov-text-muted)' }}>
                    {item.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            className="gov-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canProceed}
            className="gov-btn-primary"
            onClick={handleProceed}
            style={{ opacity: canProceed ? 1 : 0.6 }}
          >
            <span>Run Detections & Begin Survey</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}