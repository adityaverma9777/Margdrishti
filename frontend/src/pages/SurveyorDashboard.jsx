import React, { useState, useEffect, useRef } from 'react';
import { Play, Navigation, CheckCircle, Clock, Plus, Route, AlertCircle, Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import PreFlightModal from '../components/PreFlightModal';
import SurveyCockpit from '../components/SurveyCockpit';
import SurveyorTrackMap from '../components/SurveyorTrackMap';
import TurnByTurnNavModal from '../components/TurnByTurnNavModal';
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
  const [newRoadName, setNewRoadName] = useState('');
  const [startPoint, setStartPoint] = useState('');
  const [endPoint, setEndPoint] = useState('');
  const [targetSpeed, setTargetSpeed] = useState('25');
  const [selectedTask, setSelectedTask] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [trackPoints, setTrackPoints] = useState([]);
  const prevCoordsRef = useRef(null);
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
    } catch {}
    try {
      const { data: dbTrips } = await supabase
        .from('survey_trips')
        .select('*')
        .order('created_at', { ascending: false });
      if (dbTrips) setTrips(dbTrips);
    } catch {}
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
        setTrackPoints(prev => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dLat = Math.abs(last[0] - lat);
            const dLng = Math.abs(last[1] - lng);
            if (dLat < 0.00005 && dLng < 0.00005) return prev;
          }
          return [...prev, [lat, lng]];
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  const handleCreateStretch = async (e) => {
    e.preventDefault();
    if (!newRoadName) return;
    const newTask = {
      id: `task_${Date.now()}`,
      title: newRoadName,
      road_name: newRoadName,
      start_address: startPoint || 'Current Location',
      end_address: endPoint || 'Endpoint',
      target_speed_kmh: Number(targetSpeed) || 25,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    try {
      await supabase.from('survey_tasks').insert([newTask]);
    } catch {}
    const updated = [newTask, ...tasks];
    setTasks(updated);
    setSelectedTask(newTask);
    setShowDefineModal(false);
    setNewRoadName('');
    setStartPoint('');
    setEndPoint('');
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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="gov-btn-secondary"
            onClick={() => setShowDefineModal(true)}
          >
            <Plus size={15} />
            <span>Define Stretch</span>
          </button>
          <button
            className="gov-btn-primary"
            onClick={() => setShowPreFlight(true)}
          >
            <Play size={15} fill="#ffffff" />
            <span>Start Survey</span>
          </button>
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
        userLocation={userLocation}
        trackPoints={trackPoints}
        taskRoutePoints={selectedTask?.route_points || null}
        height={200}
      />
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
              <div style={{ background: 'var(--gov-card-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gov-border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gov-text-muted)', textTransform: 'uppercase' }}>Inspection Status</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gov-amber)', marginTop: '4px' }}>
                  Ready to Scan
                </div>
              </div>
            </div>
            <div style={{ paddingTop: '4px', borderTop: '1px solid var(--gov-border)', display: 'flex', gap: '10px' }}>
              <button
                className="gov-btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setIsNavigatingToStart(true)}
              >
                <Compass size={15} />
                <span>Navigate to Start</span>
              </button>
              <button
                className="gov-btn-primary"
                style={{ flex: 1.2 }}
                onClick={() => setShowPreFlight(true)}
              >
                <Play size={15} fill="#ffffff" />
                <span>Launch Survey</span>
              </button>
            </div>
          </div>
        )}
      </div>
      {showDefineModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="gov-card" style={{ width: '100%', maxWidth: '440px', padding: '22px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)', marginBottom: '14px' }}>
              Define Road Stretch
            </h2>
            <form onSubmit={handleCreateStretch} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Road Name</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="e.g. Ring Road Section A"
                  value={newRoadName}
                  onChange={(e) => setNewRoadName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Start Location</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="Start point or Landmark"
                  value={startPoint}
                  onChange={(e) => setStartPoint(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>End Location</label>
                <input
                  type="text"
                  className="gov-input"
                  placeholder="End point or Landmark"
                  value={endPoint}
                  onChange={(e) => setEndPoint(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Target Speed (km/h)</label>
                <select
                  value={targetSpeed}
                  onChange={(e) => setTargetSpeed(e.target.value)}
                  className="gov-input"
                >
                  <option value="20">20 km/h (Urban / Arterial)</option>
                  <option value="25">25 km/h (State Highway)</option>
                  <option value="30">30 km/h (National Highway Bypass)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="gov-btn-secondary"
                  onClick={() => setShowDefineModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gov-btn-primary"
                >
                  Save Stretch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showPreFlight && (
        <PreFlightModal
          roadName={selectedTask?.road_name || selectedTask?.title || 'Road Inspection Run'}
          targetSpeed={selectedTask?.target_speed_kmh || 25}
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
          userLocation={userLocation}
          onClose={() => setIsNavigatingToStart(false)}
          onLaunchSurvey={() => {
            setIsNavigatingToStart(false);
            setShowPreFlight(true);
          }}
        />
      )}
    </div>
  );
}