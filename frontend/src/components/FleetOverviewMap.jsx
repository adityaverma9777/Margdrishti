import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATE_COORDINATES } from '../utils/routingEngine';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_OPTS = {
  subdomains: ['a', 'b', 'c'],
  maxZoom: 19,
  attribution: ''
};

function buildVehicleIcon(status, isSelected) {
  const bg = isSelected ? '#0284c7' : '#1e3a8a';
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:#fff;font-size:10px;font-weight:800;padding:4px 8px;border-radius:12px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;display:flex;align-items:center;gap:4px"><span>🚗</span><span>${status === 'in_survey' ? 'Scanning' : 'Unit'}</span></div>`,
    iconSize: [72, 26],
    iconAnchor: [36, 13]
  });
}

const HAZARD_ICON = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;background:#dc2626;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(220,38,38,.7)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

export default function FleetOverviewMap({
  selectedState = 'Assam',
  vehicles = [],
  selectedVehicle,
  onSelectVehicle,
  defects = []
}) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const stateConfig = STATE_COORDINATES[selectedState] || STATE_COORDINATES['Assam'];

  useEffect(() => {
    const el = mapDivRef.current;
    if (!el) return;
    if (mapRef.current) {
      mapRef.current.setView(stateConfig.center, stateConfig.zoom, { animate: true });
      return;
    }
    delete el._leaflet_id;
    const map = L.map(el, {
      center: stateConfig.center,
      zoom: stateConfig.zoom,
      zoomControl: true,
      attributionControl: false
    });
    L.tileLayer(TILE_URL, TILE_OPTS).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.whenReady(() => {
      setTimeout(() => map.invalidateSize(), 50);
    });
    return undefined;
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(stateConfig.center, stateConfig.zoom, { animate: true });
    setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 100);
  }, [selectedState]);

  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();
    vehicles.forEach(v => {
      let pos = stateConfig.center;
      if (v.last_location) {
        try {
          const geo = typeof v.last_location === 'string'
            ? JSON.parse(v.last_location)
            : v.last_location;
          if (geo?.coordinates?.length >= 2) pos = [geo.coordinates[1], geo.coordinates[0]];
        } catch {}
      }
      L.marker(pos, { icon: buildVehicleIcon(v.status, selectedVehicle?.id === v.id) })
        .bindPopup(
          `<div style="padding:4px;min-width:140px"><strong style="font-size:13px">${v.vehicle_number}</strong>` +
          `<div style="font-size:11px;color:#64748b;margin-top:2px">${v.model_name || 'Unit'} · ${v.driver_name || 'Driver'}</div>` +
          `<div style="font-size:11px;margin-top:4px">Status: <strong>${v.status || 'idle'}</strong></div></div>`
        )
        .on('click', () => onSelectVehicle && onSelectVehicle(v))
        .addTo(markersRef.current);
    });
    defects.forEach(d => {
      let coords = null;
      if (d.lat && d.lon) {
        coords = [d.lat, d.lon];
      } else if (d.location_geojson) {
        try {
          const geo = typeof d.location_geojson === 'string'
            ? JSON.parse(d.location_geojson)
            : d.location_geojson;
          if (geo?.coordinates?.length >= 2) coords = [geo.coordinates[1], geo.coordinates[0]];
        } catch {}
      }
      if (coords) {
        L.marker(coords, { icon: HAZARD_ICON })
          .bindPopup(
            `<div style="padding:4px"><strong style="font-size:12px">${d.type === 'pothole' ? 'Pothole' : 'Road Distress'}</strong>` +
            `<div style="font-size:11px;color:#dc2626">Severity: ${d.severity_score || 4}/5</div></div>`
          )
          .addTo(markersRef.current);
      }
    });
  }, [vehicles, selectedVehicle, defects]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', marginBottom: '18px' }}>
      <div
        ref={mapDivRef}
        style={{
          width: '100%',
          height: '340px',
          borderRadius: '10px',
          border: '1px solid var(--gov-border)',
          overflow: 'hidden'
        }}
      />
      <div style={{
        position: 'absolute',
        bottom: 10,
        left: 12,
        zIndex: 1000,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(4px)',
        padding: '5px 10px',
        borderRadius: '6px',
        border: '1px solid var(--gov-border)',
        fontSize: '11px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1e3a8a', display: 'inline-block' }} />
          Vehicles ({vehicles.length})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
          Distress ({defects.length})
        </span>
        <span style={{ color: '#64748b' }}>
          {selectedState}
        </span>
      </div>
    </div>
  );
}
