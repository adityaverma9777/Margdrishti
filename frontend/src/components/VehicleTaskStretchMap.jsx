import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATE_COORDINATES } from '../utils/routingEngine';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_OPTS = { subdomains: ['a', 'b', 'c'], maxZoom: 19, attribution: '' };

const startIcon = L.divIcon({
  className: '',
  html: '<div style="background:#16a34a;color:#ffffff;font-size:10px;font-weight:800;padding:3px 7px;border-radius:10px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap">A Start</div>',
  iconSize: [54, 22],
  iconAnchor: [27, 11]
});

const endIcon = L.divIcon({
  className: '',
  html: '<div style="background:#dc2626;color:#ffffff;font-size:10px;font-weight:800;padding:3px 7px;border-radius:10px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap">B End</div>',
  iconSize: [50, 22],
  iconAnchor: [25, 11]
});

const vehicleMarkerIcon = (vehNumber) => L.divIcon({
  className: '',
  html: `<div style="background:#1e3a8a;color:#ffffff;font-size:10px;font-weight:800;padding:4px 8px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.3);white-space:nowrap;display:flex;align-items:center;gap:4px"><span>🚗</span><span>${vehNumber || 'Vehicle'}</span></div>`,
  iconSize: [80, 24],
  iconAnchor: [40, 12]
});

export default function VehicleTaskStretchMap({ task, vehicle, selectedState = 'Assam', height = 280 }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

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
    L.tileLayer(TILE_URL, TILE_OPTS).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.whenReady(() => {
      setTimeout(() => map.invalidateSize(), 60);
    });
    return undefined;
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const layer = layerRef.current;
    layer.clearLayers();

    let points = null;
    if (task && task.route_points) {
      try {
        points = typeof task.route_points === 'string' ? JSON.parse(task.route_points) : task.route_points;
      } catch {}
    }

    if (points && Array.isArray(points) && points.length >= 2) {
      L.polyline(points, {
        color: '#ffffff',
        weight: 8,
        opacity: 0.7
      }).addTo(layer);

      const mainPolyline = L.polyline(points, {
        color: '#0284c7',
        weight: 5,
        opacity: 0.95
      }).addTo(layer);

      L.marker(points[0], { icon: startIcon }).addTo(layer);
      L.marker(points[points.length - 1], { icon: endIcon }).addTo(layer);

      const bounds = mainPolyline.getBounds();
      mapRef.current.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
    } else {
      let vehPos = stateConfig.center;
      if (vehicle && vehicle.last_location) {
        try {
          const geo = typeof vehicle.last_location === 'string' ? JSON.parse(vehicle.last_location) : vehicle.last_location;
          if (geo && geo.coordinates && geo.coordinates.length >= 2) {
            vehPos = [geo.coordinates[1], geo.coordinates[0]];
          }
        } catch {}
      }
      L.marker(vehPos, { icon: vehicleMarkerIcon(vehicle?.vehicle_number) }).addTo(layer);
      mapRef.current.setView(vehPos, 12, { animate: true });
    }

    setTimeout(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    }, 100);
  }, [task, vehicle, stateConfig]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--gov-border)' }}>
      <div ref={mapDivRef} style={{ width: '100%', height: `${height}px` }} />
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(4px)',
        padding: '6px 12px',
        borderRadius: '6px',
        border: '1px solid var(--gov-border)',
        fontSize: '11px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {task ? (
          <>
            <span style={{ color: '#0284c7', fontWeight: 800 }}>STRETCH MAP:</span>
            <span>{task.road_name || task.title}</span>
            <span className="gov-badge gov-badge-blue" style={{ fontSize: '10px' }}>{task.distance_km || 0} KM</span>
            <span style={{ color: '#64748b' }}>Target: {task.target_speed_kmh || 25} km/h</span>
          </>
        ) : (
          <>
            <span style={{ color: '#1e3a8a', fontWeight: 800 }}>UNIT BASE:</span>
            <span>{vehicle?.vehicle_number}</span>
            <span style={{ color: '#64748b' }}>{vehicle?.jurisdiction_name || selectedState}</span>
          </>
        )}
      </div>
    </div>
  );
}
