import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Route, PenTool, RotateCcw, Check, Zap } from 'lucide-react';
import { STATE_COORDINATES, fetchCommuterRoutes, calculatePathDistance } from '../utils/routingEngine';

const TILE_VOYAGER = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const TILE_OPTS = { subdomains: ['a', 'b', 'c', 'd'], maxZoom: 19, attribution: '' };

const startIcon = L.divIcon({
  className: '',
  html: '<div style="background:#16a34a;color:#fff;font-size:11px;font-weight:800;padding:4px 8px;border-radius:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);white-space:nowrap">A Start</div>',
  iconSize: [60, 26],
  iconAnchor: [30, 13]
});

const endIcon = L.divIcon({
  className: '',
  html: '<div style="background:#dc2626;color:#fff;font-size:11px;font-weight:800;padding:4px 8px;border-radius:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);white-space:nowrap">B End</div>',
  iconSize: [56, 26],
  iconAnchor: [28, 13]
});

const waypointIcon = L.divIcon({
  className: '',
  html: '<div style="width:10px;height:10px;background:#38bdf8;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px #0284c7"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5]
});

export default function StretchPlannerMap({ selectedState = 'Assam', onRouteConfirmed }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const overlayRef = useRef(null);

  const planModeRef = useRef('commuter');
  const startPointRef = useRef(null);
  const endPointRef = useRef(null);
  const drawnPointsRef = useRef([]);

  const [planMode, setPlanMode] = useState('commuter');
  const [darkTile, setDarkTile] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [commuterRoutes, setCommuterRoutes] = useState([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState([]);
  const [drawnDistance, setDrawnDistance] = useState(0);

  planModeRef.current = planMode;
  startPointRef.current = startPoint;
  endPointRef.current = endPoint;
  drawnPointsRef.current = drawnPoints;

  const stateConfig = STATE_COORDINATES[selectedState] || STATE_COORDINATES['Assam'];

  useEffect(() => {
    const el = mapDivRef.current;
    if (!el || mapRef.current) return;
    delete el._leaflet_id;
    const map = L.map(el, {
      center: stateConfig.center,
      zoom: stateConfig.zoom,
      zoomControl: true,
      attributionControl: false
    });
    tileRef.current = L.tileLayer(TILE_VOYAGER, TILE_OPTS).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on('click', e => {
      const coords = [e.latlng.lat, e.latlng.lng];
      if (planModeRef.current === 'commuter') {
        if (!startPointRef.current) {
          setStartPoint(coords);
        } else if (!endPointRef.current) {
          setEndPoint(coords);
          setCalculating(true);
          fetchCommuterRoutes(startPointRef.current, coords).then(routes => {
            setCommuterRoutes(routes);
            setSelectedRouteIdx(0);
            setCalculating(false);
          });
        } else {
          setStartPoint(coords);
          setEndPoint(null);
          setCommuterRoutes([]);
          setSelectedRouteIdx(0);
        }
      } else {
        const next = [...drawnPointsRef.current, coords];
        setDrawnPoints(next);
        setDrawnDistance(calculatePathDistance(next));
      }
    });
    map.whenReady(() => setTimeout(() => map.invalidateSize(), 50));
    return undefined;
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(stateConfig.center, stateConfig.zoom, { animate: true });
  }, [selectedState]);

  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    mapRef.current.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(darkTile ? TILE_DARK : TILE_VOYAGER, TILE_OPTS).addTo(mapRef.current);
  }, [darkTile]);

  useEffect(() => {
    if (planMode === 'draw') setDarkTile(true);
    else setDarkTile(false);
  }, [planMode]);

  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.clearLayers();
    if (startPoint) L.marker(startPoint, { icon: startIcon }).addTo(overlayRef.current);
    if (endPoint) L.marker(endPoint, { icon: endIcon }).addTo(overlayRef.current);
    if (planMode === 'commuter' && commuterRoutes.length > 0) {
      commuterRoutes.forEach((route, i) => {
        const isSel = selectedRouteIdx === i;
        L.polyline(route.geometry, {
          color: isSel ? route.color : '#94a3b8',
          weight: isSel ? 6 : 3.5,
          opacity: isSel ? 1 : 0.55,
          dashArray: isSel ? undefined : '7 5'
        }).on('click', () => setSelectedRouteIdx(i)).addTo(overlayRef.current);
      });
    }
    if (planMode === 'draw') {
      drawnPoints.forEach(pt => L.marker(pt, { icon: waypointIcon }).addTo(overlayRef.current));
      if (drawnPoints.length > 1) {
        L.polyline(drawnPoints, {
          color: '#38bdf8',
          weight: 5,
          opacity: 0.95
        }).addTo(overlayRef.current);
      }
    }
  }, [startPoint, endPoint, commuterRoutes, selectedRouteIdx, planMode, drawnPoints]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleReset = () => {
    setStartPoint(null);
    setEndPoint(null);
    setCommuterRoutes([]);
    setSelectedRouteIdx(0);
    setDrawnPoints([]);
    setDrawnDistance(0);
  };

  const handleUndo = () => {
    const next = drawnPoints.slice(0, -1);
    setDrawnPoints(next);
    setDrawnDistance(calculatePathDistance(next));
  };

  const handleConfirm = () => {
    if (planMode === 'commuter') {
      const r = commuterRoutes[selectedRouteIdx];
      if (!r) return;
      onRouteConfirmed({
        roadName: r.title,
        mainRoad: r.mainRoad,
        distanceKm: r.distanceKm,
        durationMin: r.durationMin,
        routePoints: r.geometry,
        startCoords: startPoint,
        endCoords: endPoint,
        state: selectedState
      });
    } else {
      if (drawnPoints.length < 2) return;
      onRouteConfirmed({
        roadName: `Custom Stretch (${drawnPoints.length} pts)`,
        mainRoad: 'Custom Corridor',
        distanceKm: drawnDistance,
        durationMin: Math.round((drawnDistance / 25) * 60),
        routePoints: drawnPoints,
        startCoords: drawnPoints[0],
        endCoords: drawnPoints[drawnPoints.length - 1],
        state: selectedState
      });
    }
  };

  const canConfirm = (planMode === 'commuter' && commuterRoutes.length > 0) ||
    (planMode === 'draw' && drawnPoints.length >= 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => { setPlanMode('commuter'); handleReset(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${planMode === 'commuter' ? 'var(--gov-blue)' : 'var(--gov-border)'}`,
              background: planMode === 'commuter' ? '#f0f9ff' : '#ffffff',
              color: planMode === 'commuter' ? 'var(--gov-navy)' : 'var(--gov-text-secondary)',
              fontWeight: 700, fontSize: '13px', cursor: 'pointer'
            }}
          >
            <Route size={15} />
            <span>Commuter Routes</span>
          </button>
          <button
            type="button"
            onClick={() => { setPlanMode('draw'); handleReset(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${planMode === 'draw' ? '#0f172a' : 'var(--gov-border)'}`,
              background: planMode === 'draw' ? '#0f172a' : '#ffffff',
              color: planMode === 'draw' ? '#ffffff' : 'var(--gov-text-secondary)',
              fontWeight: 700, fontSize: '13px', cursor: 'pointer'
            }}
          >
            <PenTool size={15} />
            <span>Draw Road Stretch</span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {planMode === 'draw' && (
            <button
              type="button"
              onClick={() => setDarkTile(d => !d)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--gov-border)',
                background: darkTile ? '#1e293b' : '#ffffff',
                color: darkTile ? '#ffffff' : 'var(--gov-text-primary)',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              <Zap size={13} color={darkTile ? '#38bdf8' : '#64748b'} />
              <span>Road Contrast</span>
            </button>
          )}
          <button type="button" onClick={handleReset} className="gov-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%' }}>
        <div
          ref={mapDivRef}
          style={{
            width: '100%',
            height: '380px',
            borderRadius: '10px',
            border: '1px solid var(--gov-border)',
            cursor: planMode === 'draw' ? 'crosshair' : 'default'
          }}
        />
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 1000,
          background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(6px)',
          padding: '7px 11px', borderRadius: '6px', border: '1px solid var(--gov-border)',
          fontSize: '12px', boxShadow: 'var(--shadow-sm)', maxWidth: '320px'
        }}>
          {planMode === 'commuter' ? (
            <>
              {!startPoint && <span>Click the map to set <strong>Point A (Start)</strong></span>}
              {startPoint && !endPoint && <span>Click to set <strong>Point B (End)</strong></span>}
              {startPoint && endPoint && calculating && <span>Fetching OSRM route alternatives…</span>}
              {startPoint && endPoint && !calculating && commuterRoutes.length > 0 && <span>Select a route below</span>}
            </>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Drawing — <strong>{drawnPoints.length} pts · {drawnDistance} km</strong>
              {drawnPoints.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndo}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Undo
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      {planMode === 'commuter' && commuterRoutes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gov-navy)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Route Alternatives ({commuterRoutes.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '8px' }}>
            {commuterRoutes.map((route, i) => {
              const isSel = selectedRouteIdx === i;
              return (
                <div
                  key={route.id}
                  onClick={() => setSelectedRouteIdx(i)}
                  style={{
                    padding: '11px 13px', borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${isSel ? route.color : 'var(--gov-border)'}`,
                    background: isSel ? '#f0f9ff' : '#ffffff',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '3px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--gov-text-primary)' }}>{route.title}</span>
                    <span className={`gov-badge ${isSel ? 'gov-badge-blue' : 'gov-badge-neutral'}`} style={{ fontSize: '10px' }}>{route.distanceKm} km</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--gov-text-secondary)' }}>{route.roadNames}</div>
                  <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>~{route.durationMin} min (India traffic)</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canConfirm && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="gov-btn-primary" onClick={handleConfirm} style={{ padding: '9px 18px', fontSize: '13px' }}>
            <Check size={14} />
            <span>Confirm & Assign Route</span>
          </button>
        </div>
      )}
    </div>
  );
}
