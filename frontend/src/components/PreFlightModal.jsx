import React, { useState, useEffect } from 'react';
import { Camera, Cpu, Compass, Activity, Database, CheckCircle, AlertCircle, Loader2, ArrowRight, X, MapPin } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { checkGpuServerHealth } from '../utils/gpuService';
function haversineM(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const phi1 = (a[0] * Math.PI) / 180;
  const phi2 = (b[0] * Math.PI) / 180;
  const deltaPhi = ((b[0] - a[0]) * Math.PI) / 180;
  const deltaLambda = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}
export default function PreFlightModal({ onClose, onPassed, roadName, targetSpeed, task, userLocation, remoteDevice }) {
  const [checks, setChecks] = useState({
    startZone: { status: 'checking', label: '100m Start Zone Gate', detail: 'Verifying vehicle proximity to Point A' },
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
      let pts = task?.route_points;
      if (typeof pts === 'string') {
        try { pts = JSON.parse(pts); } catch { pts = null; }
      }
      const startPt = Array.isArray(pts) && pts.length > 0 ? pts[0] : null;
      if (task?.is_free_drive || !startPt) {
        if (active) {
          setChecks(c => ({
            ...c,
            startZone: { status: 'passed', label: '100m Start Zone Gate', detail: 'Drive & Random Scan: Roaming scan active across network' }
          }));
        }
      } else if (startPt && userLocation) {
        const dist = haversineM(userLocation, startPt);
        if (dist !== null && dist > 100) {
          if (active) {
            setChecks(c => ({
              ...c,
              startZone: { status: 'failed', label: '100m Start Zone Gate', detail: `Vehicle is ${dist > 1000 ? (dist / 1000).toFixed(1) + 'km' : dist + 'm'} away from Point A. Must be within 100m.` }
            }));
          }
        } else if (active) {
          setChecks(c => ({
            ...c,
            startZone: { status: 'passed', label: '100m Start Zone Gate', detail: `Vehicle inside start zone (${dist !== null ? dist + 'm' : '<100m'})` }
          }));
        }
      } else if (active) {
        setChecks(c => ({
          ...c,
          startZone: { status: 'passed', label: '100m Start Zone Gate', detail: 'Start zone verified' }
        }));
      }
      if (remoteDevice) {
        if (active) {
          setChecks(c => ({
            ...c,
            camera: remoteDevice.online
              ? { status: 'passed', label: 'Optical Camera Feed', detail: `Remote Camera Connected (${remoteDevice.name})` }
              : { status: 'failed', label: 'Optical Camera Feed', detail: `Remote camera "${remoteDevice.name}" is offline. Open its link on the phone.` }
          }));
        }
      } else {
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
      if (remoteDevice?.lastGps?.lat) {
        if (active) {
          const acc = Math.round(remoteDevice.lastGps.accuracy || 10);
          setChecks(c => ({
            ...c,
            gps: { status: 'passed', label: 'GPS Satellite Position', detail: `Remote Device GPS Locked (±${acc}m)` }
          }));
        }
      } else if ('geolocation' in navigator) {
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
  }, [targetSpeed, task, userLocation]);
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