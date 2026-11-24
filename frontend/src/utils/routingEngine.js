const OSRM_BASE = 'https://router.project-osrm.org';
const INDIA_TRAFFIC_FACTOR = 1.8;

export const STATE_COORDINATES = {
  'Assam': { center: [26.1445, 91.7362], zoom: 12, label: 'Assam (Dispur / Guwahati Division)' },
  'Delhi': { center: [28.6139, 77.2090], zoom: 12, label: 'Delhi NCR' },
  'Maharashtra': { center: [19.0760, 72.8777], zoom: 12, label: 'Maharashtra (Mumbai Division)' },
  'Karnataka': { center: [12.9716, 77.5946], zoom: 12, label: 'Karnataka (Bengaluru Division)' },
  'Uttar Pradesh': { center: [26.8467, 80.9462], zoom: 12, label: 'Uttar Pradesh (Lucknow Division)' },
  'Tamil Nadu': { center: [13.0827, 80.2707], zoom: 12, label: 'Tamil Nadu (Chennai Division)' },
  'West Bengal': { center: [22.5726, 88.3639], zoom: 12, label: 'West Bengal (Kolkata Division)' }
};

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const sa = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
}

export function calculatePathDistance(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineKm(points[i], points[i + 1]);
  }
  return Math.round(total * 100) / 100;
}

export async function fetchCommuterRoutes(startCoords, endCoords) {
  const [startLat, startLng] = startCoords;
  const [endLat, endLng] = endCoords;
  const url = `${OSRM_BASE}/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true&alternatives=3`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM network failure');
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('No driving routes found');
    }
    const routes = data.routes.map((r, idx) => {
      const geometry = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const steps = [];
      if (r.legs && r.legs[0] && r.legs[0].steps) {
        for (const s of r.legs[0].steps) {
          if (s.name && !steps.includes(s.name)) steps.push(s.name);
        }
      }
      const distKm = Math.round((r.distance / 1000) * 10) / 10;
      const durationMin = Math.round(((r.duration * INDIA_TRAFFIC_FACTOR) / 60));
      const mainRoad = steps[0] || `Corridor ${idx + 1}`;
      const title = idx === 0 ? `Primary Commuter Route (${mainRoad})` : idx === 1 ? `Bypass Route via ${mainRoad}` : `Arterial Alternate via ${mainRoad}`;
      return {
        id: `route_${idx}`,
        title,
        mainRoad,
        roadNames: steps.join(' → ') || mainRoad,
        distanceKm: distKm,
        durationMin,
        geometry,
        color: idx === 0 ? '#0284c7' : idx === 1 ? '#16a34a' : '#d97706'
      };
    });
    return routes;
  } catch (err) {
    const directDistance = Math.round(haversineKm(startCoords, endCoords) * 10) / 10;
    return [{
      id: 'route_direct',
      title: 'Direct Stretch Connection',
      mainRoad: 'Direct Road Axis',
      roadNames: 'Direct Point-to-Point Corridor',
      distanceKm: directDistance,
      durationMin: Math.round((directDistance / 25) * 60),
      geometry: [startCoords, endCoords],
      color: '#0284c7'
    }];
  }
}
