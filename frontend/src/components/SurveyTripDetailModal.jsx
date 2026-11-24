import React, { useState, useEffect } from 'react';
import { X, MapPin, Gauge, ShieldAlert, Calendar, Clock, Navigation, CheckCircle2, AlertTriangle, Layers, ExternalLink } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../supabaseClient';
const startIcon = new L.DivIcon({
  className: 'custom-start-marker',
  html: '<div style="background:#16a34a;color:#ffffff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">S</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});
const endIcon = new L.DivIcon({
  className: 'custom-end-marker',
  html: '<div style="background:#dc2626;color:#ffffff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">E</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});
const hazardIcon = new L.DivIcon({
  className: 'custom-hazard-marker',
  html: '<div style="background:#f59e0b;color:#ffffff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:10px;border:2px solid #ffffff;box-shadow:0 2px 5px rgba(0,0,0,0.35);">!</div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});
export default function SurveyTripDetailModal({ trip, onClose }) {
  const [tripHazards, setTripHazards] = useState([]);
  const [loadingHazards, setLoadingHazards] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  useEffect(() => {
    let active = true;
    const fetchHazards = async () => {
      setLoadingHazards(true);
      try {
        const { data } = await supabase
          .from('hazards')
          .select('*')
          .eq('trip_id', trip.id)
          .order('created_at', { ascending: true });
        if (active && data) setTripHazards(data);
      } catch {}
      if (active) setLoadingHazards(false);
    };
    fetchHazards();
    return () => { active = false; };
  }, [trip.id]);
  let routeCoords = [];
  if (trip.trip_route_geojson) {
    let raw = trip.trip_route_geojson;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { raw = []; }
    }
    if (Array.isArray(raw)) {
      routeCoords = raw.map(p => {
        if (Array.isArray(p)) return [p[0], p[1]];
        if (p.lat && p.lon) return [p.lat, p.lon];
        return null;
      }).filter(Boolean);
    }
  }
  let mapCenter = [26.1445, 91.7362];
  if (routeCoords.length > 0) {
    mapCenter = routeCoords[0];
  } else if (tripHazards.length > 0 && tripHazards[0].location) {
    const match = /POINT\(([^ ]+) ([^ ]+)\)/.exec(tripHazards[0].location);
    if (match) mapCenter = [parseFloat(match[2]), parseFloat(match[1])];
  }
  const formatTime = (ts) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: '#ffffff', width: '100%', maxWidth: '1080px', maxHeight: '92vh', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)', border: '1px solid #e2e8f0' }}>
        <div style={{ padding: '16px 24px', background: 'var(--gov-navy, #0f172a)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800 }}>{trip.road_name || 'Road Survey Inspection'}</span>
              <span style={{ fontSize: '11px', background: trip.status === 'completed' ? '#16a34a' : '#0284c7', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                {trip.status === 'completed' ? 'Completed' : 'In-Progress'}
              </span>
              {trip.is_demo && (
                <span style={{ fontSize: '11px', background: '#eab308', color: '#000000', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>
                  Demo Scan
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Vehicle: <strong style={{ color: '#ffffff' }}>{trip.vehicle_number || 'Inspection Unit'}</strong> • Driver: <strong style={{ color: '#ffffff' }}>{trip.driver_name || 'Assigned Crew'}</strong> • Started: <strong style={{ color: '#ffffff' }}>{formatTime(trip.start_time || trip.created_at)}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none', color: '#ffffff', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '14px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
          <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Total Distance</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{trip.total_distance_km || 0} KM</div>
          </div>
          <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Calculated PCI</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: (trip.calculated_pci || 100) >= 80 ? '#16a34a' : '#d97706', marginTop: '2px' }}>
              {trip.calculated_pci || 100}/100 ({trip.pci_category || 'Good'})
            </div>
          </div>
          <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Defects Logged</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
              {tripHazards.length > 0 ? tripHazards.length : (trip.total_hazards_count || 0)} Scans
            </div>
          </div>
          <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Avg / Max Speed</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {trip.avg_speed_kmh || 0} / {trip.max_speed_kmh || 0} <span style={{ fontSize: '12px', fontWeight: 600 }}>km/h</span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Navigation size={15} color="#0284c7" />
              <span>Surveyed Route & Defect Map</span>
            </div>
            <div style={{ height: '320px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
              <MapContainer center={mapCenter} zoom={14} style={{ width: '100%', height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                {routeCoords.length > 1 && (
                  <Polyline positions={routeCoords} pathOptions={{ color: '#0284c7', weight: 4.5, opacity: 0.85 }} />
                )}
                {routeCoords.length > 0 && (
                  <Marker position={routeCoords[0]} icon={startIcon}>
                    <Popup>Survey Start Location</Popup>
                  </Marker>
                )}
                {routeCoords.length > 1 && (
                  <Marker position={routeCoords[routeCoords.length - 1]} icon={endIcon}>
                    <Popup>Survey End Location</Popup>
                  </Marker>
                )}
                {tripHazards.map((h, i) => {
                  let lat, lon;
                  if (h.location) {
                    const match = /POINT\(([^ ]+) ([^ ]+)\)/.exec(h.location);
                    if (match) {
                      lon = parseFloat(match[1]);
                      lat = parseFloat(match[2]);
                    }
                  }
                  if (!lat || !lon) return null;
                  return (
                    <Marker key={h.id || i} position={[lat, lon]} icon={hazardIcon}>
                      <Popup>
                        <div style={{ fontSize: '12px', fontWeight: 700 }}>
                          <div>{h.display_label || h.type}</div>
                          <div style={{ color: '#dc2626' }}>Severity: {h.severity_score}/5</div>
                          {h.image_url && (
                            <img src={h.image_url} alt="Defect" style={{ width: '140px', height: '80px', objectFit: 'cover', borderRadius: '4px', marginTop: '4px' }} />
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={15} color="#dc2626" />
                <span>Captured Defect Photo Evidence ({tripHazards.length} Scans)</span>
              </div>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Optimized 640×360 JPEG Snapshots</span>
            </div>
            {loadingHazards ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>Loading trip scans...</div>
            ) : tripHazards.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '13px' }}>
                No defects detected during this trip. Road surface evaluated as optimal condition.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                {tripHazards.map((h, i) => (
                  <div
                    key={h.id || i}
                    onClick={() => h.image_url && setSelectedPhoto(h)}
                    style={{
                      background: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      overflow: 'hidden',
                      cursor: h.image_url ? 'pointer' : 'default',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    <div style={{ height: '124px', background: '#0f172a', position: 'relative' }}>
                      {h.image_url ? (
                        <img src={h.image_url} alt={h.display_label || h.type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '11px' }}>
                          No Photo
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(15, 23, 42, 0.85)', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                        Sev {h.severity_score || 3}/5
                      </div>
                    </div>
                    <div style={{ padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{h.display_label || h.type}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Conf: {Math.round((h.confidence_score || 0.85) * 100)}%</span>
                        <span>{formatTime(h.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0, 0, 0, 0.90)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '100%', background: '#0f172a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
            <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b' }}>
              <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '14px' }}>
                {selectedPhoto.display_label || selectedPhoto.type} • Severity {selectedPhoto.severity_score}/5
              </div>
              <button onClick={() => setSelectedPhoto(null)} style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <img src={selectedPhoto.image_url} alt="Full defect" style={{ width: '100%', maxHeight: '68vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </div>
  );
}
