import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, PenTool, RotateCcw, Check, MapPin, Route, Layers, Compass, Zap } from 'lucide-react';
import { STATE_COORDINATES, fetchCommuterRoutes, calculatePathDistance } from '../utils/routingEngine';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const startIcon = L.divIcon({
  className: '',
  html: '<div style="background:#16a34a;color:#ffffff;font-size:11px;font-weight:800;padding:4px 8px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;display:flex;align-items:center;gap:4px;"><span>A</span><span>Start</span></div>',
  iconSize: [60, 26],
  iconAnchor: [30, 13]
});

const endIcon = L.divIcon({
  className: '',
  html: '<div style="background:#dc2626;color:#ffffff;font-size:11px;font-weight:800;padding:4px 8px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;display:flex;align-items:center;gap:4px;"><span>B</span><span>End</span></div>',
  iconSize: [55, 26],
  iconAnchor: [27, 13]
});

const waypointIcon = L.divIcon({
  className: '',
  html: '<div style="width:10px;height:10px;background:#38bdf8;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 6px #0284c7;"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5]
});

function MapViewController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom, { animate: true, duration: 0.8 });
    }
  }, [center, zoom, map]);
  return null;
}

function MapClickHandler({ mode, onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick([e.latlng.lat, e.latlng.lng]);
    }
  });
  return null;
}

export default function StretchPlannerMap({ selectedState = 'Assam', onRouteConfirmed }) {
  const stateConfig = STATE_COORDINATES[selectedState] || STATE_COORDINATES['Assam'];
  const [mapCenter, setMapCenter] = useState(stateConfig.center);
  const [mapZoom, setMapZoom] = useState(stateConfig.zoom);
  const [planMode, setPlanMode] = useState('commuter');
  const [whiteRoadsActive, setWhiteRoadsActive] = useState(false);

  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [commuterRoutes, setCommuterRoutes] = useState([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [calculatingRoutes, setCalculatingRoutes] = useState(false);

  const [drawnPoints, setDrawnPoints] = useState([]);
  const [drawnDistance, setDrawnDistance] = useState(0);

  useEffect(() => {
    const config = STATE_COORDINATES[selectedState] || STATE_COORDINATES['Assam'];
    setMapCenter(config.center);
    setMapZoom(config.zoom);
    handleReset();
  }, [selectedState]);

  useEffect(() => {
    if (planMode === 'draw') {
      setWhiteRoadsActive(true);
    } else {
      setWhiteRoadsActive(false);
    }
  }, [planMode]);

  const handleReset = () => {
    setStartPoint(null);
    setEndPoint(null);
    setCommuterRoutes([]);
    setSelectedRouteIdx(0);
    setDrawnPoints([]);
    setDrawnDistance(0);
  };

  const handleMapClick = async (coords) => {
    if (planMode === 'commuter') {
      if (!startPoint) {
        setStartPoint(coords);
      } else if (!endPoint) {
        setEndPoint(coords);
        setCalculatingRoutes(true);
        const routes = await fetchCommuterRoutes(startPoint, coords);
        setCommuterRoutes(routes);
        setSelectedRouteIdx(0);
        setCalculatingRoutes(false);
      } else {
        setStartPoint(coords);
        setEndPoint(null);
        setCommuterRoutes([]);
        setSelectedRouteIdx(0);
      }
    } else if (planMode === 'draw') {
      const next = [...drawnPoints, coords];
      setDrawnPoints(next);
      setDrawnDistance(calculatePathDistance(next));
    }
  };

  const handleUndoDrawnPoint = () => {
    if (drawnPoints.length === 0) return;
    const next = drawnPoints.slice(0, -1);
    setDrawnPoints(next);
    setDrawnDistance(calculatePathDistance(next));
  };

  const handleConfirmCurrentRoute = () => {
    if (planMode === 'commuter') {
      const activeRoute = commuterRoutes[selectedRouteIdx];
      if (!activeRoute) return;
      onRouteConfirmed({
        roadName: activeRoute.title,
        mainRoad: activeRoute.mainRoad,
        distanceKm: activeRoute.distanceKm,
        durationMin: activeRoute.durationMin,
        routePoints: activeRoute.geometry,
        startCoords: startPoint,
        endCoords: endPoint,
        state: selectedState
      });
    } else if (planMode === 'draw') {
      if (drawnPoints.length < 2) return;
      onRouteConfirmed({
        roadName: `Custom Drawn Stretch (${drawnPoints.length} Waypoints)`,
        mainRoad: 'Custom Surveyor Corridor',
        distanceKm: drawnDistance,
        durationMin: Math.round((drawnDistance / 25) * 60),
        routePoints: drawnPoints,
        startCoords: drawnPoints[0],
        endCoords: drawnPoints[drawnPoints.length - 1],
        state: selectedState
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => { setPlanMode('commuter'); handleReset(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${planMode === 'commuter' ? 'var(--gov-blue)' : 'var(--gov-border)'}`,
              background: planMode === 'commuter' ? '#f0f9ff' : '#ffffff',
              color: planMode === 'commuter' ? 'var(--gov-navy)' : 'var(--gov-text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <Route size={15} />
            <span>Commuter Route Alternatives</span>
          </button>

          <button
            type="button"
            onClick={() => { setPlanMode('draw'); handleReset(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${planMode === 'draw' ? '#0f172a' : 'var(--gov-border)'}`,
              background: planMode === 'draw' ? '#0f172a' : '#ffffff',
              color: planMode === 'draw' ? '#ffffff' : 'var(--gov-text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <PenTool size={15} />
            <span>Manual Road Drawing (White Highlight)</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {planMode === 'draw' && (
            <button
              type="button"
              onClick={() => setWhiteRoadsActive(!whiteRoadsActive)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--gov-border)',
                background: whiteRoadsActive ? '#1e293b' : '#ffffff',
                color: whiteRoadsActive ? '#ffffff' : 'var(--gov-text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Zap size={13} color={whiteRoadsActive ? '#38bdf8' : '#64748b'} />
              <span>White Road Contrast</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="gov-btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            <RotateCcw size={13} />
            <span>Reset Map</span>
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', height: '380px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--gov-border)' }}>
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ width: '100%', height: '100%', cursor: planMode === 'draw' ? 'crosshair' : 'default' }}
          zoomControl={false}
        >
          <MapViewController center={mapCenter} zoom={mapZoom} />
          <MapClickHandler mode={planMode} onMapClick={handleMapClick} />

          {whiteRoadsActive ? (
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            />
          ) : (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
          )}

          {startPoint && <Marker position={startPoint} icon={startIcon} />}
          {endPoint && <Marker position={endPoint} icon={endIcon} />}

          {planMode === 'commuter' && commuterRoutes.map((route, i) => {
            const isSelected = selectedRouteIdx === i;
            return (
              <Polyline
                key={route.id}
                positions={route.geometry}
                eventHandlers={{ click: () => setSelectedRouteIdx(i) }}
                pathOptions={{
                  color: isSelected ? '#0284c7' : '#94a3b8',
                  weight: isSelected ? 5.5 : 3.5,
                  opacity: isSelected ? 0.95 : 0.6,
                  dashArray: isSelected ? null : '6, 6'
                }}
              />
            );
          })}

          {planMode === 'draw' && (
            <>
              {drawnPoints.map((pt, idx) => (
                <Marker key={idx} position={pt} icon={waypointIcon} />
              ))}
              {drawnPoints.length > 1 && (
                <Polyline
                  positions={drawnPoints}
                  pathOptions={{
                    color: whiteRoadsActive ? '#38bdf8' : '#0284c7',
                    weight: 4.5,
                    opacity: 0.95
                  }}
                />
              )}
            </>
          )}
        </MapContainer>

        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 500, background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(6px)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--gov-border)', fontSize: '12px', boxShadow: 'var(--shadow-sm)' }}>
          {planMode === 'commuter' ? (
            <div>
              {!startPoint && <span>Click anywhere on the map to place <strong>Point A (Start)</strong></span>}
              {startPoint && !endPoint && <span>Click destination point to place <strong>Point B (End)</strong></span>}
              {startPoint && endPoint && calculatingRoutes && <span>Calculating commuter route options via OSRM...</span>}
              {startPoint && endPoint && !calculatingRoutes && <span>Select preferred commuter route below</span>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Drawing Mode Active • Click along roads to trace stretch • <strong>{drawnPoints.length} Waypoints ({drawnDistance} KM)</strong></span>
              {drawnPoints.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndoDrawnPoint}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Undo
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {planMode === 'commuter' && commuterRoutes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gov-navy)', textTransform: 'uppercase' }}>
            Commuter Route Alternatives ({commuterRoutes.length} Available)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            {commuterRoutes.map((route, i) => {
              const isSelected = selectedRouteIdx === i;
              return (
                <div
                  key={route.id}
                  onClick={() => setSelectedRouteIdx(i)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${isSelected ? 'var(--gov-blue)' : 'var(--gov-border)'}`,
                    background: isSelected ? '#f0f9ff' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? 'var(--gov-navy)' : 'var(--gov-text-primary)' }}>
                      {route.title}
                    </span>
                    <span className={`gov-badge ${isSelected ? 'gov-badge-blue' : 'gov-badge-neutral'}`} style={{ fontSize: '10px' }}>
                      {route.distanceKm} KM
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--gov-text-secondary)' }}>
                    Road Corridor: {route.roadNames}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--gov-text-muted)' }}>
                    Est. Commuter Pace: ~{route.durationMin} mins
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {((planMode === 'commuter' && commuterRoutes.length > 0) || (planMode === 'draw' && drawnPoints.length >= 2)) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
          <button
            type="button"
            className="gov-btn-primary"
            onClick={handleConfirmCurrentRoute}
            style={{ padding: '9px 18px', fontSize: '13px' }}
          >
            <Check size={14} />
            <span>Select Route For Vehicle Assignment</span>
          </button>
        </div>
      )}
    </div>
  );
}