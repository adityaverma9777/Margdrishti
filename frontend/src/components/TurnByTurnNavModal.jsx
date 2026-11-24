import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Volume2, VolumeX, Navigation, LocateFixed, Play, CheckCircle, Flag, AlertTriangle } from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_OPTS = { subdomains: ['a', 'b', 'c'], maxZoom: 19, attribution: '' };
function formatDistance(m) {
  if (m === null || m === undefined) return '--';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}
function calculateArrivalTime(etaMinutes) {
  if (!etaMinutes) return '--:--';
  const now = new Date();
  now.setMinutes(now.getMinutes() + etaMinutes);
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function parseCoords(routePoints) {
  if (!routePoints) return null;
  if (typeof routePoints === 'string') {
    try {
      const parsed = JSON.parse(routePoints);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      return null;
    }
  }
  if (Array.isArray(routePoints) && routePoints.length > 0) return routePoints;
  return null;
}
export default function TurnByTurnNavModal({ task, userLocation, onClose, onLaunchSurvey }) {
  const [speedKmh, setSpeedKmh] = useState(0);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const vehicleMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const stretchLayerRef = useRef(null);
  const lastSpokenInstructionRef = useRef('');
  const stretchPoints = parseCoords(task?.route_points);
  const destinationCoord = stretchPoints ? stretchPoints[0] : null;
  const {
    route,
    currentStep,
    nextStep,
    maneuverIcon,
    isLoading,
    error,
    distanceToNext,
    remainingDistanceM,
    eta,
    heading,
    arrived,
    fetchRoute,
    startNavigation,
    stopNavigation
  } = useNavigation(userLocation, speedKmh);
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.speed !== null && pos.coords.speed !== undefined && !isNaN(pos.coords.speed)) {
          setSpeedKmh(Math.max(0, Math.round(pos.coords.speed * 3.6)));
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  useEffect(() => {
    if (userLocation && destinationCoord) {
      fetchRoute(userLocation, destinationCoord).then((res) => {
        if (res) startNavigation();
      });
    }
    return () => {
      stopNavigation();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [userLocation?.[0], userLocation?.[1], destinationCoord?.[0], destinationCoord?.[1]]);
  useEffect(() => {
    if (voiceMuted || !currentStep?.instruction) return;
    if (lastSpokenInstructionRef.current === currentStep.instruction) return;
    lastSpokenInstructionRef.current = currentStep.instruction;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentStep.instruction);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, [currentStep?.instruction, voiceMuted]);
  useEffect(() => {
    const el = mapDivRef.current;
    if (!el || mapRef.current) return;
    delete el._leaflet_id;
    const initialCenter = userLocation || destinationCoord || [20.5937, 78.9629];
    const map = L.map(el, {
      center: initialCenter,
      zoom: 17,
      zoomControl: false,
      attributionControl: false
    });
    L.tileLayer(TILE_URL, TILE_OPTS).addTo(map);
    stretchLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on('dragstart', () => setIsFollowing(false));
    map.whenReady(() => setTimeout(() => map.invalidateSize(), 50));
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!mapRef.current || !stretchLayerRef.current || !stretchPoints || stretchPoints.length < 2) return;
    stretchLayerRef.current.clearLayers();
    L.polyline(stretchPoints, {
      color: '#f59e0b',
      weight: 5,
      dashArray: '8 8',
      opacity: 0.85
    }).addTo(stretchLayerRef.current);
    const startPt = stretchPoints[0];
    const flagIcon = L.divIcon({
      className: '',
      html: `<div style="background:#0f172a;color:#fff;padding:4px 8px;border-radius:14px;font-size:11px;font-weight:800;border:2px solid #f59e0b;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;gap:4px"><span>🏁</span><span>START</span></div>`,
      iconSize: [68, 24],
      iconAnchor: [34, 12]
    });
    L.marker(startPt, { icon: flagIcon, zIndexOffset: 800 }).addTo(stretchLayerRef.current);
  }, [stretchPoints]);
  useEffect(() => {
    if (!mapRef.current || !routeLayerRef.current || !route || route.length < 2) return;
    routeLayerRef.current.clearLayers();
    L.polyline(route, {
      color: '#174ea6',
      weight: 8,
      opacity: 0.8
    }).addTo(routeLayerRef.current);
    L.polyline(route, {
      color: '#4285f4',
      weight: 5,
      opacity: 1
    }).addTo(routeLayerRef.current);
    if (!destinationCoord) {
      const bounds = L.latLngBounds(route);
      mapRef.current.fitBounds(bounds, { padding: [80, 80] });
    }
  }, [route]);
  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    const [lat, lng] = userLocation;
    const rot = heading !== null && heading !== undefined ? Math.round(heading) : 0;
    const vehicleIconHtml = `
      <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:44px;height:44px;background:rgba(26,115,232,0.25);border-radius:50%;animation:pulse 2s infinite;"></div>
        <div style="width:28px;height:28px;background:#1a73e8;border:3px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.4);transform:rotate(${rot}deg);transition:transform 0.2s ease;">
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid #ffffff;"></div>
        </div>
      </div>
    `;
    const vehicleIcon = L.divIcon({
      className: '',
      html: vehicleIconHtml,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
    if (!vehicleMarkerRef.current) {
      vehicleMarkerRef.current = L.marker([lat, lng], { icon: vehicleIcon, zIndexOffset: 1200 }).addTo(mapRef.current);
    } else {
      vehicleMarkerRef.current.setLatLng([lat, lng]);
      vehicleMarkerRef.current.setIcon(vehicleIcon);
    }
    if (isFollowing) {
      mapRef.current.setView([lat, lng], 17, { animate: true });
    }
  }, [userLocation, heading, isFollowing]);
  const handleRecenter = () => {
    setIsFollowing(true);
    if (mapRef.current && userLocation) {
      mapRef.current.setView(userLocation, 17, { animate: true });
    }
  };
  const handleFitRoute = () => {
    setIsFollowing(false);
    if (mapRef.current && route && route.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(route), { padding: [80, 80] });
    }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0f172a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <div style={{ background: arrived ? '#0f5132' : '#137333', borderRadius: '18px', padding: '16px 20px', color: '#ffffff', boxShadow: '0 12px 32px rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', gap: 16, pointerEvents: 'auto', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800, flexShrink: 0, boxShadow: 'inset 0 0 8px rgba(0,0,0,0.15)' }}>
            {arrived ? '🏁' : maneuverIcon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isLoading ? (
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>Calculating shortest route...</div>
            ) : error ? (
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#fca5a5' }}>Routing Notice</div>
                <div style={{ fontSize: '13px', color: '#fecaca', marginTop: '2px' }}>{error}</div>
              </div>
            ) : arrived ? (
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.3px' }}>Arrived at Start Point</div>
                <div style={{ fontSize: '13px', color: '#bbf7d0', marginTop: '2px' }}>Stretch: {task?.road_name || task?.title}</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>
                  {formatDistance(distanceToNext)}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#f0fdf4', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentStep?.instruction || `Head to ${task?.road_name || 'Survey Start'}`}
                </div>
                {nextStep?.instruction && (
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Then: {nextStep.instruction}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setVoiceMuted(prev => !prev)}
              style={{ width: 38, height: 38, borderRadius: '50%', background: voiceMuted ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer', transition: 'all 0.15s ease' }}
              title={voiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
            >
              {voiceMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button
              onClick={onClose}
              style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer', transition: 'all 0.15s ease' }}
              title="Exit navigation"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
      <div ref={mapDivRef} style={{ width: '100%', height: '100%', flex: 1, zIndex: 1 }} />
      <div style={{ position: 'absolute', right: 16, bottom: 104, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={handleRecenter}
          style={{ width: 44, height: 44, borderRadius: '50%', background: isFollowing ? '#1a73e8' : '#ffffff', color: isFollowing ? '#ffffff' : '#1e293b', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', cursor: 'pointer' }}
          title="Re-center on vehicle"
        >
          <LocateFixed size={20} />
        </button>
        <button
          onClick={handleFitRoute}
          style={{ width: 44, height: 44, borderRadius: '50%', background: '#ffffff', color: '#1e293b', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', cursor: 'pointer' }}
          title="Overview route"
        >
          <Flag size={18} />
        </button>
      </div>
      <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, zIndex: 1000 }}>
        <div style={{ background: '#ffffff', borderRadius: '18px', padding: '14px 20px', boxShadow: '0 12px 36px rgba(0,0,0,0.35)', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '6px 14px', textAlign: 'center', minWidth: '70px' }}>
              <div style={{ fontSize: '24px', fontWeight: 900, color: speedKmh > (task?.target_speed_kmh || 25) ? '#dc2626' : '#0f172a', lineHeight: 1 }}>
                {speedKmh}
              </div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: '2px' }}>
                km/h
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '26px', fontWeight: 900, color: '#16a34a', letterSpacing: '-0.5px', lineHeight: 1 }}>
                  {eta !== null ? `${eta} min` : '--'}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>
                  ({formatDistance(remainingDistanceM)})
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                Arrival: <strong>{calculateArrivalTime(eta)}</strong> • Target: {task?.target_speed_kmh || 25} km/h
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {arrived ? (
              <button
                onClick={onLaunchSurvey}
                className="gov-btn-primary"
                style={{ padding: '12px 20px', fontSize: '14px', fontWeight: 800, background: '#16a34a', borderColor: '#16a34a', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(22,163,74,0.4)' }}
              >
                <Play size={16} fill="#ffffff" />
                <span>Launch Survey Now</span>
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="gov-btn-secondary"
                  style={{ padding: '10px 16px', fontSize: '13px' }}
                >
                  Exit
                </button>
                <button
                  onClick={onLaunchSurvey}
                  className="gov-btn-primary"
                  style={{ padding: '10px 18px', fontSize: '13px' }}
                >
                  <Play size={14} fill="#ffffff" />
                  <span>Start Survey</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}