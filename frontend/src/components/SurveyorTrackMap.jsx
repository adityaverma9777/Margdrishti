import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
const TILE_OPTS = { subdomains: ['a', 'b', 'c', 'd'], maxZoom: 19, attribution: '' };

const GPS_ICON = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;background:#0284c7;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(2,132,199,.7)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

export default function SurveyorTrackMap({ userLocation, trackPoints = [], taskRoutePoints = null, height = 280 }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const gpsMarkerRef = useRef(null);
  const trackLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const hasCenteredRef = useRef(false);

  useEffect(() => {
    const el = mapDivRef.current;
    if (!el || mapRef.current) return;
    delete el._leaflet_id;
    const defaultCenter = [20.5937, 78.9629];
    const map = L.map(el, {
      center: defaultCenter,
      zoom: 5,
      zoomControl: true,
      attributionControl: false
    });
    L.tileLayer(TILE_URL, TILE_OPTS).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    trackLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.whenReady(() => setTimeout(() => map.invalidateSize(), 50));
    return undefined;
  }, []);

  useEffect(() => {
    if (!mapRef.current || !taskRoutePoints || taskRoutePoints.length < 2) return;
    routeLayerRef.current.clearLayers();
    L.polyline(taskRoutePoints, {
      color: '#1e3a8a',
      weight: 4,
      opacity: 0.5,
      dashArray: '8 6'
    }).addTo(routeLayerRef.current);
    if (!hasCenteredRef.current) {
      const bounds = L.latLngBounds(taskRoutePoints);
      mapRef.current.fitBounds(bounds, { padding: [32, 32] });
    }
  }, [taskRoutePoints]);

  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    const [lat, lng] = userLocation;
    if (!gpsMarkerRef.current) {
      gpsMarkerRef.current = L.marker([lat, lng], { icon: GPS_ICON, zIndexOffset: 1000 }).addTo(mapRef.current);
    } else {
      gpsMarkerRef.current.setLatLng([lat, lng]);
    }
    if (!hasCenteredRef.current) {
      mapRef.current.setView([lat, lng], 15, { animate: true });
      hasCenteredRef.current = true;
    }
  }, [userLocation]);

  useEffect(() => {
    if (!trackLayerRef.current || trackPoints.length < 2) return;
    trackLayerRef.current.clearLayers();
    L.polyline(trackPoints, {
      color: '#0284c7',
      weight: 4,
      opacity: 0.9
    }).addTo(trackLayerRef.current);
  }, [trackPoints]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        ref={mapDivRef}
        style={{
          width: '100%',
          height: `${height}px`,
          borderRadius: '10px',
          border: '1px solid var(--gov-border)'
        }}
      />
      <div style={{
        position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
        padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--gov-border)',
        fontSize: '11px', display: 'flex', gap: '10px', alignItems: 'center',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284c7', display: 'inline-block' }} />
          Live Track
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '2px', background: '#1e3a8a', display: 'inline-block', borderRadius: '1px' }} />
          Assigned Route
        </span>
        {!userLocation && <span style={{ color: '#94a3b8' }}>Waiting for GPS…</span>}
      </div>
    </div>
  );
}
