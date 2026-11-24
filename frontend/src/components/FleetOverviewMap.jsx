import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Car, AlertCircle } from 'lucide-react';
import { STATE_COORDINATES } from '../utils/routingEngine';

const createVehicleIcon = (status, isSelected) => L.divIcon({
  className: '',
  html: `<div style="background:${isSelected ? '#0284c7' : '#1e3a8a'};color:#ffffff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.3);white-space:nowrap;display:flex;align-items:center;gap:4px;"><span>🚗</span><span>${status === 'in_survey' ? 'Scanning' : 'Unit'}</span></div>`,
  iconSize: [64, 24],
  iconAnchor: [32, 12]
});

const hazardIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#dc2626;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 6px rgba(220,38,38,0.6);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

function MapPanController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom, { animate: true, duration: 0.8 });
    }
  }, [center, zoom, map]);
  return null;
}

export default function FleetOverviewMap({ selectedState = 'Assam', vehicles = [], selectedVehicle, onSelectVehicle, defects = [] }) {
  const stateConfig = STATE_COORDINATES[selectedState] || STATE_COORDINATES['Assam'];

  return (
    <div style={{ position: 'relative', width: '100%', height: '320px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--gov-border)', marginBottom: '18px' }}>
      <MapContainer
        center={stateConfig.center}
        zoom={stateConfig.zoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <MapPanController center={stateConfig.center} zoom={stateConfig.zoom} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />

        {vehicles.map((v, idx) => {
          const lat = stateConfig.center[0] + (idx === 0 ? 0 : (idx % 2 === 0 ? 0.03 : -0.02) * Math.ceil(idx / 2));
          const lng = stateConfig.center[1] + (idx === 0 ? 0 : (idx % 2 === 0 ? -0.04 : 0.03) * Math.ceil(idx / 2));
          const isSelected = selectedVehicle?.id === v.id;
          return (
            <Marker
              key={v.id}
              position={[lat, lng]}
              icon={createVehicleIcon(v.status, isSelected)}
              eventHandlers={{
                click: () => onSelectVehicle(v)
              }}
            >
              <Popup>
                <div style={{ padding: '4px' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px' }}>{v.vehicle_number}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{v.model_name} • Driver: {v.driver_name}</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Status: <strong>{v.status}</strong></div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {defects.map((d, idx) => {
          const lat = stateConfig.center[0] + 0.02 - (idx * 0.005);
          const lng = stateConfig.center[1] - 0.03 + (idx * 0.006);
          return (
            <Marker
              key={d.id || idx}
              position={[lat, lng]}
              icon={hazardIcon}
            >
              <Popup>
                <div style={{ padding: '4px' }}>
                  <div style={{ fontWeight: 700, fontSize: '12px' }}>{d.type === 'pothole' ? 'Pothole (ASTM 13)' : 'Road Crack (ASTM 1/10)'}</div>
                  <div style={{ fontSize: '11px', color: '#dc2626' }}>Severity: {d.severity_score || 4}/5</div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div style={{ position: 'absolute', bottom: 10, left: 12, zIndex: 500, background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(4px)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--gov-border)', fontSize: '11px', display: 'flex', gap: '12px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#1e3a8a' }}></span>
          <span>Inspection Vehicles ({vehicles.length})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626' }}></span>
          <span>Distress Pins</span>
        </div>
        <div style={{ color: '#64748b' }}>
          Jurisdiction: <strong>{selectedState}</strong>
        </div>
      </div>
    </div>
  );
}
