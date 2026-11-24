import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Navigation, RotateCcw, Check, MapPin, Gauge, Clock, Ruler, Save } from 'lucide-react';
import { fetchCommuterRoutes, haversineKm } from '../utils/routingEngine';
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_OPTS = { subdomains: ['a', 'b', 'c'], maxZoom: 19, attribution: '' };
const startIcon = L.divIcon({
  className: '',
  html: '<div style="background:#16a34a;color:#fff;font-size:11px;font-weight:800;padding:4px 8px;border-radius:12px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);white-space:nowrap">Point A (Start)</div>',
  iconSize: [95, 26],
  iconAnchor: [47, 13]
});
const endIcon = L.divIcon({
  className: '',
  html: '<div style="background:#dc2626;color:#fff;font-size:11px;font-weight:800;padding:4px 8px;border-radius:12px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);white-space:nowrap">Point B (End)</div>',
  iconSize: [88, 26],
  iconAnchor: [44, 13]
});
const vehicleIcon = L.divIcon({
  className: '',
  html: '<div style="background:#0284c7;color:#fff;font-size:10px;font-weight:800;padding:3px 7px;border-radius:10px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap">Vehicle Position</div>',
  iconSize: [100, 22],
  iconAnchor: [50, 11]
});
export default function StretchDistanceCheckerModal({ userLocation, onClose, onSaveStretch }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [roadName, setRoadName] = useState('');
  const [targetSpeed, setTargetSpeed] = useState(25);
  const [calculating, setCalculating] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const startPointRef = useRef(null);
  const endPointRef = useRef(null);
  startPointRef.current = startPoint;
  endPointRef.current = endPoint;
  useEffect(() => {
    const el = mapDivRef.current;
    if (!el || mapRef.current) return;
    delete el._leaflet_id;
    const initialCenter = userLocation || [26.1445, 91.7362];
    const map = L.map(el, {
      center: initialCenter,
      zoom: 13,
      zoomControl: true,
      attributionControl: false
    });
    L.tileLayer(TILE_URL, TILE_OPTS).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    if (userLocation) {
      L.marker(userLocation, { icon: vehicleIcon }).addTo(layerRef.current);
    }
    map.on('click', (e) => {
      const latlng = [e.latlng.lat, e.latlng.lng];
      if (!startPointRef.current) {
        setStartPoint(latlng);
      } else if (!endPointRef.current) {
        setEndPoint(latlng);
      } else {
        setStartPoint(latlng);
        setEndPoint(null);
        setRouteInfo(null);
      }
    });
    map.whenReady(() => setTimeout(() => map.invalidateSize(), 50));
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    if (userLocation) {
      L.marker(userLocation, { icon: vehicleIcon }).addTo(layerRef.current);
    }
    if (startPoint) {
      L.marker(startPoint, { icon: startIcon, zIndexOffset: 900 }).addTo(layerRef.current);
    }
    if (endPoint) {
      L.marker(endPoint, { icon: endIcon, zIndexOffset: 900 }).addTo(layerRef.current);
    }
    if (startPoint && endPoint) {
      setCalculating(true);
      fetchCommuterRoutes(startPoint, endPoint).then((routes) => {
        setCalculating(false);
        if (routes && routes.length > 0) {
          const primary = routes[0];
          setRouteInfo(primary);
          if (!roadName) {
            setRoadName(primary.mainRoad || 'Inspected Road Stretch');
          }
          L.polyline(primary.geometry, {
            color: '#0284c7',
            weight: 5,
            opacity: 0.9
          }).addTo(layerRef.current);
          if (mapRef.current) {
            mapRef.current.fitBounds(L.latLngBounds(primary.geometry), { padding: [40, 40] });
          }
        }
      });
    }
  }, [startPoint, endPoint]);
  const handleUseCurrentLocation = () => {
    if (!userLocation) return;
    setStartPoint(userLocation);
    if (mapRef.current) {
      mapRef.current.setView(userLocation, 14, { animate: true });
    }
  };
  const handleReset = () => {
    setStartPoint(null);
    setEndPoint(null);
    setRouteInfo(null);
    setRoadName('');
    if (layerRef.current) {
      layerRef.current.clearLayers();
      if (userLocation) {
        L.marker(userLocation, { icon: vehicleIcon }).addTo(layerRef.current);
      }
    }
  };
  const directDistanceKm = (startPoint && endPoint) ? Math.round(haversineKm(startPoint, endPoint) * 100) / 100 : 0;
  const roadDistanceKm = routeInfo ? routeInfo.distanceKm : directDistanceKm;
  const estimatedScanMinutes = roadDistanceKm > 0 ? Math.round((roadDistanceKm / targetSpeed) * 60) : 0;
  const handleSave = () => {
    if (!roadDistanceKm) return;
    const taskData = {
      title: roadName || 'Survey Stretch Check',
      road_name: roadName || 'Survey Stretch Check',
      target_speed_kmh: Number(targetSpeed) || 25,
      distance_km: roadDistanceKm,
      route_points: routeInfo?.geometry || (startPoint && endPoint ? [startPoint, endPoint] : null),
      start_address: startPoint ? `${startPoint[0].toFixed(4)}, ${startPoint[1].toFixed(4)}` : 'Point A',
      end_address: endPoint ? `${endPoint[0].toFixed(4)}, ${endPoint[1].toFixed(4)}` : 'Point B'
    };
    onSaveStretch(taskData);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="gov-card" style={{ width: '100%', maxWidth: '920px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, boxShadow: '0 20px 48px rgba(0,0,0,0.45)' }}>
        <div style={{ padding: '16px 20px', background: 'var(--gov-card-subtle)', borderBottom: '1px solid var(--gov-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Ruler size={18} color="var(--gov-blue)" />
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--gov-navy)' }}>
                Define Stretch & Distance Checker
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--gov-text-secondary)', marginTop: '2px' }}>
              Verify total road distance, elevation path, and scan duration directly on the map.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gov-text-muted)' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: '380px', flexDirection: 'column' }}>
          <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid var(--gov-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gov-text-primary)' }}>
                {!startPoint ? 'Step 1: Click map for Point A (Start)' : !endPoint ? 'Step 2: Click map for Point B (End)' : 'Stretch Route Calculated'}
              </span>
              {calculating && <span style={{ fontSize: '11px', color: 'var(--gov-blue)', fontWeight: 600 }}>Calculating road distance...</span>}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {userLocation && (
                <button type="button" onClick={handleUseCurrentLocation} className="gov-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  <Navigation size={13} />
                  <span>Start from Current Location</span>
                </button>
              )}
              <button type="button" onClick={handleReset} className="gov-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            </div>
          </div>
          <div ref={mapDivRef} style={{ width: '100%', height: '340px' }} />
          <div style={{ padding: '16px 20px', background: '#ffffff', borderTop: '1px solid var(--gov-border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '12px', background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>Total Road Distance</div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#1e3a8a', marginTop: '4px', lineHeight: 1 }}>
                  {roadDistanceKm > 0 ? `${roadDistanceKm} KM` : '--'}
                </div>
                <div style={{ fontSize: '11px', color: '#60a5fa', marginTop: '4px' }}>
                  {roadDistanceKm > 0 ? `${Math.round(roadDistanceKm * 1000)} meters along road` : 'Click Point A & B'}
                </div>
              </div>
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Direct Displacement</div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px', lineHeight: 1 }}>
                  {directDistanceKm > 0 ? `${directDistanceKm} KM` : '--'}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Straight-line euclidean distance</div>
              </div>
              <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Est. Scan Duration</div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#14532d', marginTop: '4px', lineHeight: 1 }}>
                  {estimatedScanMinutes > 0 ? `${estimatedScanMinutes} min` : '--'}
                </div>
                <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '4px' }}>At {targetSpeed} km/h survey pace</div>
              </div>
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Target Scan Pace</div>
                <select value={targetSpeed} onChange={(e) => setTargetSpeed(Number(e.target.value))} className="gov-input" style={{ marginTop: '4px', fontSize: '13px', padding: '6px' }}>
                  <option value="20">20 km/h (Urban Stretch)</option>
                  <option value="25">25 km/h (Highway Stretch)</option>
                  <option value="30">30 km/h (Bypass Express)</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) 1fr', gap: '12px', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gov-text-secondary)', display: 'block', marginBottom: '4px' }}>Road / Corridor Label</label>
                <input type="text" className="gov-input" placeholder="e.g. Guwahati Bypass East Corridor" value={roadName} onChange={(e) => setRoadName(e.target.value)} style={{ fontSize: '13px' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="gov-btn-secondary" onClick={onClose} style={{ padding: '10px 16px', fontSize: '13px' }}>
                  Close Check
                </button>
                {onSaveStretch && (
                  <button type="button" disabled={!roadDistanceKm} className="gov-btn-primary" onClick={handleSave} style={{ padding: '10px 18px', fontSize: '13px', opacity: roadDistanceKm ? 1 : 0.6 }}>
                    <Save size={14} />
                    <span>Save Stretch</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}