import React, { useState, useEffect, useRef } from 'react';
import { Camera, MapPin, Gauge, Wifi, AlertCircle } from 'lucide-react';
import { startCameraBroadcaster } from '../utils/remoteCameraBridge';
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
export default function MobileCameraPage({ deviceId, deviceName }) {
  const videoRef = useRef(null);
  const broadcasterRef = useRef(null);
  const prevGpsRef = useRef(null);
  const wakeLockRef = useRef(null);
  const [peerState, setPeerState] = useState('waiting');
  const [cameraError, setCameraError] = useState(null);
  const [gpsData, setGpsData] = useState({ lat: null, lon: null, speedKmh: 0, accuracy: null });
  const [wakeLockActive, setWakeLockActive] = useState(false);
  useEffect(() => {
    let active = true;
    const acquireWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          if (active) setWakeLockActive(true);
        }
      } catch {}
    };
    acquireWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') acquireWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    let localStream = null;
    const initCamera = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: false
        });
        if (!active) {
          localStream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
          videoRef.current.play().catch(() => {});
        }
        broadcasterRef.current = startCameraBroadcaster({
          deviceId,
          deviceName: deviceName || 'Mobile Camera',
          stream: localStream,
          onPeerState: (st) => {
            if (active) setPeerState(st);
          }
        });
      } catch (err) {
        if (active) setCameraError(err.message || 'Camera permission denied or HTTPS required');
      }
    };
    initCamera();
    let watchId = null;
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!active) return;
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy || 20);
          const rawSpeed = pos.coords.speed;
          const now = Date.now();
          let speedKmh = 0;
          if (rawSpeed !== null && rawSpeed !== undefined && rawSpeed >= 0) {
            speedKmh = Math.round(rawSpeed * 3.6 * 10) / 10;
          } else if (prevGpsRef.current) {
            const dt = (now - prevGpsRef.current.time) / 1000;
            const distKm = haversineDistance(prevGpsRef.current.lat, prevGpsRef.current.lon, lat, lon);
            const distM = distKm * 1000;
            if (dt > 0.8 && distM > Math.max(8, accuracy * 0.5)) {
              speedKmh = Math.round((distKm / (dt / 3600)) * 10) / 10;
            }
          }
          if (speedKmh < 3) speedKmh = 0;
          prevGpsRef.current = { lat, lon, time: now };
          const payload = { lat, lon, speedKmh, accuracy };
          setGpsData(payload);
          if (broadcasterRef.current) {
            broadcasterRef.current.sendGpsUpdate(payload);
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 500, timeout: 5000 }
      );
    }
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (broadcasterRef.current) broadcasterRef.current.cleanup();
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, [deviceId, deviceName]);
  const statusColor = peerState === 'connected' ? '#16a34a' : peerState === 'reconnecting' ? '#d97706' : '#64748b';
  const statusLabel = peerState === 'connected' ? 'Live • Streaming to Dashboard' : peerState === 'reconnecting' ? 'Reconnecting...' : 'Ready • Waiting for Patrol';
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#ffffff', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ padding: '12px 16px', background: '#111827', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.png" alt="StreetIQ" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800 }}>{deviceName || 'Mobile Camera'}</div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>Remote Camera & GPS Unit</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: 700, color: '#ffffff' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor }}></span>
          <span>{statusLabel}</span>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#000000' }}>
        {cameraError ? (
          <div style={{ padding: '24px', textAlign: 'center', maxWidth: '340px' }}>
            <AlertCircle size={36} color="#ef4444" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Camera Access Required</div>
            <div style={{ fontSize: '12px', color: '#9ca3af', lineHeight: '1.5' }}>{cameraError}</div>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>
      <div style={{ padding: '14px 16px', background: '#111827', borderTop: '1px solid #1f2937', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '12px' }}>
        <div style={{ background: '#1f2937', padding: '10px', borderRadius: '8px' }}>
          <div style={{ fontSize: '10px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
            <Gauge size={12} />
            <span>Speed</span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, marginTop: '2px' }}>{gpsData.speedKmh} km/h</div>
        </div>
        <div style={{ background: '#1f2937', padding: '10px', borderRadius: '8px' }}>
          <div style={{ fontSize: '10px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
            <MapPin size={12} />
            <span>GPS Accuracy</span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, marginTop: '2px' }}>{gpsData.accuracy ? `±${gpsData.accuracy}m` : 'Locking...'}</div>
        </div>
        <div style={{ background: '#1f2937', padding: '10px', borderRadius: '8px' }}>
          <div style={{ fontSize: '10px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
            <Wifi size={12} />
            <span>Screen Lock</span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '3px', color: wakeLockActive ? '#4ade80' : '#facc15' }}>
            {wakeLockActive ? 'Awake Active' : 'Standard'}
          </div>
        </div>
      </div>
    </div>
  );
}
