import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { STATE_COORDINATES } from '../utils/routingEngine';

const createVehicleIcon = (status, isSelected) => L.divIcon({
  className: '',
  html: `<div style="background:${isSelected ? '#0284c7' : '#1e3a8a'};color:#ffffff;font-size:10px;font-weight:800;padding:4px 8px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.3);white-space:nowrap;display:flex;align-items:center;gap:4px;"><span>🚗</span><span>${status === 'in_survey' ? 'Scanning' : 'Unit'}</span></div>`,
  iconSize: [68, 26],
  iconAnchor: [34, 13]
});

const hazardIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#dc2626;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 6px rgba(220,38,38,0.7);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

export default function FleetOverviewMap({ selectedState = 'Assam', vehicles = [], selectedVehicle, onSelectVehicle, defects = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);

  const stateConfig = STATE_COORDINATES[selectedState] || STATE_COORDINATES['Assam'];

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapRef.current) {
      if (containerRef.current._leaflet_id) {
        containerRef.current._leaflet_id = null;
      }
      const map = L.map(containerRef.current, {
        center: stateConfig.center,
        zoom: stateConfig.zoom,
        zoomControl: false
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
        subdomains: ['a', 'b', 'c', 'd'],
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap &copy; CARTO'
      }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapRef.current = map;

      const t1 = setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 100);
      const t2 = setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 400);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else {
      mapRef.current.setView(stateConfig.center, stateConfig.zoom, { animate: true });
      const t = setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 150);
      return () => clearTimeout(t);
    }
  }, [selectedState]);

  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    vehicles.forEach((v) => {
      let pos = stateConfig.center;
      if (v.last_location) {
        try {
          const geo = typeof v.last_location === 'string' ? JSON.parse(v.last_location) : v.last_location;
          if (geo && geo.coordinates && geo.coordinates.length >= 2) {
            pos = [geo.coordinates[1], geo.coordinates[0]];
          }
        } catch {}
      }
      const isSelected = selectedVehicle?.id === v.id;
      const marker = L.marker(pos, { icon: createVehicleIcon(v.status, isSelected) });
      marker.bindPopup(`
        <div style="padding:4px">
          <div style="font-weight:800;font-size:13px">${v.vehicle_number}</div>
          <div style="font-size:11px;color:#64748b">${v.model_name || 'Inspection Unit'} • Driver: ${v.driver_name || 'Assigned'}</div>
          <div style="font-size:11px;margin-top:4px">Status: <strong>${v.status || 'idle'}</strong></div>
        </div>
      `);
      marker.on('click', () => onSelectVehicle && onSelectVehicle(v));
      marker.addTo(layer);
    });

    defects.forEach((d) => {
      let coords = null;
      if (d.lat && d.lon) coords = [d.lat, d.lon];
      else if (d.location_geojson) {
        try {
          const geo = typeof d.location_geojson === 'string' ? JSON.parse(d.location_geojson) : d.location_geojson;
          if (geo && geo.coordinates && geo.coordinates.length >= 2) {
            coords = [geo.coordinates[1], geo.coordinates[0]];
          }
        } catch {}
      }
      if (coords) {
        const marker = L.marker(coords, { icon: hazardIcon });
        marker.bindPopup(`
          <div style="padding:4px">
            <div style="font-weight:700;font-size:12px">${d.type === 'pothole' ? 'Pothole (ASTM 13)' : 'Road Distress'}</div>
            <div style="font-size:11px;color:#dc2626">Severity: ${d.severity_score || 4}/5</div>
          </div>
        `);
        marker.addTo(layer);
      }
    });
  }, [vehicles, selectedVehicle, defects, stateConfig]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '340px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--gov-border)', marginBottom: '18px', background: '#f8fafc' }}>
      <div ref={containerRef} style={{ width: '100%', height: '340px' }} />
      <div style={{ position: 'absolute', bottom: 10, left: 12, zIndex: 1000, background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(4px)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--gov-border)', fontSize: '11px', display: 'flex', gap: '12px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#1e3a8a' }}></span>
          <span>Inspection Vehicles ({vehicles.length})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626' }}></span>
          <span>Distress Pins ({defects.length})</span>
        </div>
        <div style={{ color: '#64748b' }}>
          Jurisdiction: <strong>{selectedState}</strong>
        </div>
      </div>
    </div>
  );
}
