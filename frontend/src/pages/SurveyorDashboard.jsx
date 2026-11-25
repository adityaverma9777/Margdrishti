import React, { useState, useEffect, useRef } from 'react';
import { Play, Navigation, CheckCircle, Clock, Plus, Route, AlertCircle, Compass, Smartphone, Copy, Check, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import PreFlightModal from '../components/PreFlightModal';
import SurveyCockpit from '../components/SurveyCockpit';
import SurveyorTrackMap from '../components/SurveyorTrackMap';
import TurnByTurnNavModal from '../components/TurnByTurnNavModal';
import StretchDistanceCheckerModal from '../components/StretchDistanceCheckerModal';
import { startCameraReceiver } from '../utils/remoteCameraBridge';
function getTaskStartPoint(task) {
  if (!task) return null;
  let pts = task.route_points;
  if (typeof pts === 'string') {
    try { pts = JSON.parse(pts); } catch { pts = null; }
  }
  if (Array.isArray(pts) && pts.length > 0) return pts[0];
  return null;
}
function calculateDirectDistanceMeters(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const phi1 = (a[0] * Math.PI) / 180;
  const phi2 = (b[0] * Math.PI) / 180;
  const deltaPhi = ((b[0] - a[0]) * Math.PI) / 180;
  const deltaLambda = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}
function formatDistanceLabel(m) {
  if (m === null || m === undefined) return '';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}
export default function SurveyorDashboard() {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDefineModal, setShowDefineModal] = useState(false);
  const [showPreFlight, setShowPreFlight] = useState(false);
  const [isNavigatingToStart, setIsNavigatingToStart] = useState(false);
  const [isSurveyingActive, setIsSurveyingActive] = useState(false);
  const [surveyStream, setSurveyStream] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [trackPoints, setTrackPoints] = useState([]);
  const [pairedDevices, setPairedDevices] = useState(() => {
    try {
      const saved = localStorage.getItem('streetiq_paired_devices');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedCameraSource, setSelectedCameraSource] = useState('local');
  const [deviceStatusMap, setDeviceStatusMap] = useState({});
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [copiedDeviceId, setCopiedDeviceId] = useState(null);
  const [, setStatusTick] = useState(0);
  const prevCoordsRef = useRef(null);
  useEffect(() => {
    try {
      localStorage.setItem('streetiq_paired_devices', JSON.stringify(pairedDevices));
    } catch {}
  }, [pairedDevices]);
  useEffect(() => {
    if (pairedDevices.length === 0) return;
    const receivers = pairedDevices.map(dev =>
      startCameraReceiver({
        deviceId: dev.id,
        onHeartbeat: (hb) => {
          setDeviceStatusMap(prev => ({
            ...prev,
            [dev.id]: {
              ...(prev[dev.id] || {}),
              lastSeen: Date.now(),
              deviceName: hb?.deviceName || dev.name
            }
          }));
        },
        onGpsUpdate: (gps) => {
          if (!gps) return;
          setDeviceStatusMap(prev => ({
            ...prev,
            [dev.id]: {
              ...(prev[dev.id] || {}),
              lastSeen: Date.now(),
              lastGps: gps
            }
          }));
        }
      })
    );
    const tick = setInterval(() => setStatusTick(t => t + 1), 3000);
    return () => {
      clearInterval(tick);
      receivers.forEach(r => r.cleanup());
    };
  }, [pairedDevices]);
  const getDeviceOnline = (id) => {
    const info = deviceStatusMap[id];
    return Boolean(info && info.lastSeen && (Date.now() - info.lastSeen) < 8000);
  };
  const selectedRemoteDeviceObj = selectedCameraSource !== 'local'
    ? pairedDevices.find(d => d.id === selectedCameraSource)
    : null;
  const activeRemoteDevice = selectedRemoteDeviceObj
    ? {
        ...selectedRemoteDeviceObj,
        online: getDeviceOnline(selectedRemoteDeviceObj.id),
        lastGps: deviceStatusMap[selectedRemoteDeviceObj.id]?.lastGps || null
      }
    : null;
  const effectiveUserLocation = (activeRemoteDevice?.lastGps?.lat && activeRemoteDevice?.lastGps?.lon)
    ? [activeRemoteDevice.lastGps.lat, activeRemoteDevice.lastGps.lon]
    : userLocation;
  const handleAddDevice = (e) => {
    e.preventDefault();
    const trimmed = newDeviceName.trim();
    if (!trimmed) return;
    const newDev = {
      id: `cam_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name: trimmed,
      createdAt: new Date().toISOString()
    };
    setPairedDevices(prev => [newDev, ...prev]);
    setSelectedCameraSource(newDev.id);
    setNewDeviceName('');
  };
  const handleRemoveDevice = (id) => {
    setPairedDevices(prev => prev.filter(d => d.id !== id));
    if (selectedCameraSource === id) setSelectedCameraSource('local');
  };
  const getDeviceLink = (dev) => `${window.location.origin}/?cam=${dev.id}&name=${encodeURIComponent(dev.name)}`;
  const handleCopyDeviceLink = (dev) => {
    navigator.clipboard.writeText(getDeviceLink(dev)).then(() => {
      setCopiedDeviceId(dev.id);
      setTimeout(() => setCopiedDeviceId(null), 2000);
    }).catch(() => {});
  };
  const taskStartPoint = getTaskStartPoint(selectedTask);
  const distanceToStartM = (effectiveUserLocation && taskStartPoint) ? calculateDirectDistanceMeters(effectiveUserLocation, taskStartPoint) : null;
  const isInStartVicinity = selectedTask?.is_free_drive ? true : (distanceToStartM !== null ? distanceToStartM <= 100 : false);
  const handleStartFreeDrive = () => {
    const freeDriveTask = {
      id: `free_drive_${Date.now()}`,
      title: 'Drive & Random Scan (Roaming Patrol)',
      road_name: 'Drive & Random Scan',
      target_speed_kmh: 25,
      is_free_drive: true,
      route_points: null,
      start_address: 'Any Road / Highway',
      end_address: 'Continuous Patrol'
    };
    setSelectedTask(freeDriveTask);
    setShowPreFlight(true);
  };
  const loadSurveyData = async () => {
    setLoading(true);
    try {
      const { data: dbTasks } = await supabase
        .from('survey_tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (dbTasks) {
        setTasks(dbTasks);
        if (dbTasks.length > 0 && !selectedTask) {
          setSelectedTask(dbTasks[0]);
        }
      }
    } catch { }
    try {
      const { data: dbTrips } = await supabase
        .from('survey_trips')
        .select('*')
        .order('created_at', { ascending: false });
      if (dbTrips) setTrips(dbTrips);
    } catch { }
    setLoading(false);
  };
  useEffect(() => {
    loadSurveyData();
  }, []);
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation([lat, lng]);
        if (pos.coords.speed !== null && pos.coords.speed < 0.8) return;
        setTrackPoints(prev => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dLat = Math.abs(last[0] - lat);
            const dLng = Math.abs(last[1] - lng);
            if (dLat < 0.0001 && dLng < 0.0001) return prev;
          }
          return [...prev, [lat, lng]];
        });
      },
      () => { },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  const handleSaveStretchFromChecker = async (taskData) => {
    const newTask = {
      id: `task_${Date.now()}`,
      title: taskData.title,
      road_name: taskData.road_name,
      start_address: taskData.start_address,
      end_address: taskData.end_address,
      target_speed_kmh: taskData.target_speed_kmh || 25,
      distance_km: taskData.distance_km || 0,
      route_points: taskData.route_points || null,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    try {
      await supabase.from('survey_tasks').insert([newTask]);
    } catch {}
    setTasks(prev => [newTask, ...prev]);
    setSelectedTask(newTask);
    setShowDefineModal(false);
  };
  const totalKmSurveyed = trips.reduce((acc, t) => acc + (Number(t.total_distance_km) || 0), 0);
  const avgPci = trips.length > 0
    ? Math.round(trips.reduce((acc, t) => acc + (Number(t.calculated_pci) || 0), 0) / trips.length)
    : null;
  return (
    <div className="gov-container" style={{ padding: '24px 20px', minHeight: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-navy)', letterSpacing: '-0.3px' }}>
              Surveyor Console
            </h1>
            <span className="gov-badge gov-badge-green">Unit Active</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px' }}>
            Vehicle: <strong>{currentUser?.vehicleNumber || 'Unassigned Unit'}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="gov-btn-secondary"
            onClick={() => setShowAddDeviceModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Smartphone size={15} />
            <span>Add Device {pairedDevices.length > 0 ? `(${pairedDevices.length})` : ''}</span>
          </button>
          <button
            className="gov-btn-secondary"
            onClick={() => setShowDefineModal(true)}
          >
            <Plus size={15} />
            <span>Define Stretch</span>
          </button>
          <button
            className="gov-btn-secondary"
            onClick={handleStartFreeDrive}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Compass size={15} />
            <span>Drive & Free Scan</span>
          </button>
          {isInStartVicinity || !selectedTask ? (
            <button
              className="gov-btn-primary"
              onClick={() => setShowPreFlight(true)}
            >
              <Play size={15} fill="#ffffff" />
              <span>Start Survey</span>
            </button>
          ) : (
            <button
              className="gov-btn-primary"
              onClick={() => setIsNavigatingToStart(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Compass size={15} />
              <span>Navigate to Start {distanceToStartM !== null ? `(${formatDistanceLabel(distanceToStartM)})` : ''}</span>
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Distance Surveyed
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-text-primary)', marginTop: '6px' }}>
            {totalKmSurveyed.toFixed(1)} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>KM</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            {trips.length} Completed Trips
          </div>
        </div>
        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Assigned Stretches
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--gov-navy)', marginTop: '6px' }}>
            {tasks.length} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gov-text-muted)' }}>Stretches</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            Tasks from Official Desk
          </div>
        </div>
        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Pavement Index (PCI)
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: avgPci ? 'var(--gov-blue)' : 'var(--gov-text-muted)', marginTop: '6px' }}>
            {avgPci !== null ? `${avgPci} / 100` : 'No Data'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            Calculated from completed scans
          </div>
        </div>
        <div className="gov-card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gov-text-secondary)', textTransform: 'uppercase' }}>
            Sensor & Camera
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gov-green)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={20} color="var(--gov-green)" />
            <span>Hardware Ready</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
            WebGPU Vision Engine Active
          </div>
        </div>
      </div>
      <SurveyorTrackMap
        userLocation={effectiveUserLocation}
        trackPoints={trackPoints}
        taskRoutePoints={selectedTask?.route_points || null}
        height={200}
      />
      <div className="gov-card" style={{ padding: '14px 18px', marginTop: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Video & GPS Source:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCameraSource('local')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: `1.5px solid ${selectedCameraSource === 'local' ? '#111827' : '#cbd5e1'}`,
              background: selectedCameraSource === 'local' ? '#111827' : '#ffffff',
              color: selectedCameraSource === 'local' ? '#ffffff' : '#334155',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Local Device Camera
          </button>
          {pairedDevices.map(dev => {
            const online = getDeviceOnline(dev.id);
            const isSel = selectedCameraSource === dev.id;
            return (
              <button
                key={dev.id}
                type="button"
                onClick={() => setSelectedCameraSource(dev.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: `1.5px solid ${isSel ? '#111827' : '#cbd5e1'}`,
                  background: isSel ? '#111827' : '#ffffff',
                  color: isSel ? '#ffffff' : '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: online ? '#22c55e' : '#94a3b8' }}></span>
                <span>{dev.name}</span>
                <span style={{ fontSize: '10px', opacity: 0.8 }}>{online ? '· Connected' : '· Offline'}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowAddDeviceModal(true)}
          className="gov-btn-secondary"
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          <Smartphone size={14} />
          <span>Manage / Add Device</span>
        </button>
      </div>
      <div className="gov-card" style={{ padding: '16px 20px', marginBottom: '20px', marginTop: '14px', background: '#111827', color: '#ffffff', border: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
            <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '-0.2px' }}>Drive & Random Scan Mode (Roaming Patrol)</span>
          </div>
          <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', maxWidth: '580px' }}>
            Drive anywhere across the road network without a pre-assigned stretch. The selected camera continuously logs road defects with live GPS coordinates.
          </p>
        </div>
        <button
          onClick={handleStartFreeDrive}
          style={{ background: '#ffffff', color: '#111827', border: 'none', borderRadius: '6px', padding: '10px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Play size={15} fill="#111827" />
          <span>Turn On Drive & Scan</span>
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: tasks.length > 0 ? 'minmax(320px, 1.2fr) minmax(360px, 1.8fr)' : '1fr', gap: '20px' }}>
        <div className="gov-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', background: 'var(--gov-card-subtle)', borderBottom: '1px solid var(--gov-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gov-navy)' }}>
              Assigned Road Stretches ({tasks.length})
            </span>
          </div>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--gov-text-muted)', fontSize: '13px' }}>
              Loading stretches...
            </div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center' }}>
              <Route size={32} color="var(--gov-text-muted)" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>No Stretches Assigned Yet</div>
              <p style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '4px', maxWidth: '360px', margin: '4px auto 14px' }}>
                Tasks dispatched by the official desk will appear here, or you can manually define a stretch to scan.
              </p>
              <button
                className="gov-btn-primary"
                onClick={() => setShowDefineModal(true)}
                style={{ fontSize: '13px', padding: '8px 14px' }}
              >
                <Plus size={14} />
                <span>Define New Stretch</span>
              </button>
            </div>
          ) : (
            <div>
              {tasks.map((t) => {
                const isSelected = selectedTask?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTask(t)}
                    style={{
                      padding: '14px 18px',
                      borderBottom: '1px solid var(--gov-border)',
                      cursor: 'pointer',
                      background: isSelected ? '#f0f9ff' : '#ffffff',
                      borderLeft: isSelected ? '4px solid var(--gov-blue)' : '4px solid transparent'
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>{t.road_name || t.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '3px' }}>
                      {t.start_address} → {t.end_address}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)', marginTop: '4px' }}>
                      Target Speed: {t.target_speed_kmh || 25} km/h
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {selectedTask && (
          <div className="gov-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ borderBottom: '1px solid var(--gov-border)', paddingBottom: '12px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                {selectedTask.road_name || selectedTask.title}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
                {selectedTask.start_address} to {selectedTask.end_address}
              </div>
            </div>
            <SurveyorTrackMap
              userLocation={userLocation}
              trackPoints={trackPoints}
              taskRoutePoints={selectedTask.route_points || null}
              height={260}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: 'var(--gov-card-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Target Survey Speed</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gov-blue)', marginTop: '2px' }}>
                  {selectedTask.target_speed_kmh || 25} km/h
                </div>
              </div>
              <div style={{ background: isInStartVicinity ? '#f0fdf4' : '#fef2f2', padding: '12px', borderRadius: 'var(--radius-sm)', border: isInStartVicinity ? '1px solid #bbf7d0' : '1px solid #fecaca' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: isInStartVicinity ? '#16a34a' : '#dc2626', textTransform: 'uppercase' }}>Inspection Status</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: isInStartVicinity ? '#16a34a' : '#dc2626', marginTop: '4px' }}>
                  {selectedTask?.is_free_drive ? 'Free Drive Patrol (Ready to Scan)' : isInStartVicinity ? `In 100m Zone (${distanceToStartM !== null ? distanceToStartM + 'm' : 'Ready'})` : `Locked (${distanceToStartM !== null ? formatDistanceLabel(distanceToStartM) + ' away' : 'Outside 100m'})`}
                </div>
              </div>
            </div>
            {isInStartVicinity ? (
              <div style={{ paddingTop: '8px', borderTop: '1px solid var(--gov-border)', display: 'flex', gap: '10px' }}>
                {!selectedTask?.is_free_drive && (
                  <button
                    className="gov-btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setIsNavigatingToStart(true)}
                  >
                    <Compass size={15} />
                    <span>View Route Map</span>
                  </button>
                )}
                <button
                  className="gov-btn-primary"
                  style={{ flex: 1.4, background: '#16a34a', borderColor: '#16a34a' }}
                  onClick={() => setShowPreFlight(true)}
                >
                  <Play size={15} fill="#ffffff" />
                  <span>{selectedTask?.is_free_drive ? 'Start Drive & Scan' : 'Launch Survey (In Zone)'}</span>
                </button>
              </div>
            ) : (
              <div style={{ paddingTop: '8px', borderTop: '1px solid var(--gov-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  className="gov-btn-primary"
                  style={{ width: '100%', background: '#1e3a8a', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => setIsNavigatingToStart(true)}
                >
                  <Compass size={16} />
                  <span>Navigate to Starting Point {distanceToStartM !== null ? `(${formatDistanceLabel(distanceToStartM)} away)` : ''}</span>
                </button>
                <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)', textAlign: 'center' }}>
                  Vehicle must reach within 100m of Point A before scan mode & AI defect detections are unlocked.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {showDefineModal && (
        <StretchDistanceCheckerModal
          userLocation={effectiveUserLocation}
          onClose={() => setShowDefineModal(false)}
          onSaveStretch={handleSaveStretchFromChecker}
        />
      )}
      {showPreFlight && (
        <PreFlightModal
          roadName={selectedTask?.road_name || selectedTask?.title || 'Road Inspection Run'}
          targetSpeed={selectedTask?.target_speed_kmh || 25}
          task={selectedTask}
          userLocation={effectiveUserLocation}
          remoteDevice={activeRemoteDevice}
          onClose={() => setShowPreFlight(false)}
          onPassed={(stream) => {
            setShowPreFlight(false);
            setSurveyStream(stream);
            setIsSurveyingActive(true);
          }}
        />
      )}
      {isSurveyingActive && (
        <SurveyCockpit
          task={selectedTask}
          initialStream={surveyStream}
          remoteDevice={activeRemoteDevice}
          onFinish={() => {
            setIsSurveyingActive(false);
            setSurveyStream(null);
            loadSurveyData();
          }}
        />
      )}
      {isNavigatingToStart && selectedTask && (
        <TurnByTurnNavModal
          task={selectedTask}
          userLocation={effectiveUserLocation}
          onClose={() => setIsNavigatingToStart(false)}
          onLaunchSurvey={() => {
            setIsNavigatingToStart(false);
            setShowPreFlight(true);
          }}
        />
      )}
      {showAddDeviceModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3500, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="gov-card" style={{ width: '100%', maxWidth: '500px', padding: '22px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={18} color="#111827" />
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Add Remote Camera & GPS Device</h2>
              </div>
              <button onClick={() => setShowAddDeviceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', marginBottom: '14px', lineHeight: '1.5' }}>
              Name a mobile device to generate a pairing link. Open that link on your phone to stream its rear camera and live GPS directly to this dashboard.
            </p>
            <form onSubmit={handleAddDevice} style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              <input
                type="text"
                className="gov-input"
                placeholder="Device name (e.g. Dashcam Phone 1)"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                required
                style={{ flex: 1 }}
              />
              <button type="submit" className="gov-btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                <Plus size={14} />
                <span>Add</span>
              </button>
            </form>
            {pairedDevices.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b' }}>
                No remote devices added yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pairedDevices.map(dev => {
                  const online = getDeviceOnline(dev.id);
                  const gps = deviceStatusMap[dev.id]?.lastGps;
                  const link = getDeviceLink(dev);
                  const isCopied = copiedDeviceId === dev.id;
                  return (
                    <div key={dev.id} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: online ? '#22c55e' : '#94a3b8' }}></span>
                          <strong style={{ fontSize: '13px', color: '#0f172a' }}>{dev.name}</strong>
                          <span style={{ fontSize: '11px', color: online ? '#166534' : '#64748b', fontWeight: 600 }}>
                            {online ? (gps?.accuracy ? `Connected · GPS ±${gps.accuracy}m` : 'Connected') : 'Waiting for device'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDevice(dev.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}
                          title="Remove device"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          readOnly
                          value={link}
                          className="gov-input"
                          style={{ flex: 1, fontSize: '11px', background: '#f8fafc', color: '#475569', padding: '6px 8px' }}
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyDeviceLink(dev)}
                          className="gov-btn-primary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          {isCopied ? <Check size={13} /> : <Copy size={13} />}
                          <span>{isCopied ? 'Copied' : 'Copy Link'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}