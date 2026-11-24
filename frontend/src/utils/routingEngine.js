const OSRM_BASE = 'https://router.project-osrm.org';
const INDIA_TRAFFIC_FACTOR = 1.8;

export const STATE_COORDINATES = {
  'Assam': { center: [26.1445, 91.7362], zoom: 11, label: 'Assam' },
  'Andhra Pradesh': { center: [15.9129, 79.7400], zoom: 7, label: 'Andhra Pradesh' },
  'Arunachal Pradesh': { center: [28.2180, 94.7278], zoom: 7, label: 'Arunachal Pradesh' },
  'Bihar': { center: [25.0961, 85.3131], zoom: 8, label: 'Bihar' },
  'Chhattisgarh': { center: [21.2787, 81.8661], zoom: 7, label: 'Chhattisgarh' },
  'Goa': { center: [15.2993, 74.1240], zoom: 10, label: 'Goa' },
  'Gujarat': { center: [22.2587, 71.1924], zoom: 7, label: 'Gujarat' },
  'Haryana': { center: [29.0588, 76.0856], zoom: 8, label: 'Haryana' },
  'Himachal Pradesh': { center: [31.1048, 77.1734], zoom: 8, label: 'Himachal Pradesh' },
  'Jharkhand': { center: [23.6102, 85.2799], zoom: 8, label: 'Jharkhand' },
  'Karnataka': { center: [12.9716, 77.5946], zoom: 11, label: 'Karnataka' },
  'Kerala': { center: [10.8505, 76.2711], zoom: 8, label: 'Kerala' },
  'Madhya Pradesh': { center: [22.9734, 78.6569], zoom: 7, label: 'Madhya Pradesh' },
  'Maharashtra': { center: [19.0760, 72.8777], zoom: 11, label: 'Maharashtra' },
  'Manipur': { center: [24.6637, 93.9063], zoom: 8, label: 'Manipur' },
  'Meghalaya': { center: [25.4670, 91.3662], zoom: 8, label: 'Meghalaya' },
  'Mizoram': { center: [23.1645, 92.9376], zoom: 8, label: 'Mizoram' },
  'Nagaland': { center: [26.1584, 94.5624], zoom: 8, label: 'Nagaland' },
  'Odisha': { center: [20.9517, 85.0985], zoom: 7, label: 'Odisha' },
  'Punjab': { center: [31.1471, 75.3412], zoom: 8, label: 'Punjab' },
  'Rajasthan': { center: [27.0238, 74.2179], zoom: 7, label: 'Rajasthan' },
  'Sikkim': { center: [27.5330, 88.5122], zoom: 9, label: 'Sikkim' },
  'Tamil Nadu': { center: [13.0827, 80.2707], zoom: 11, label: 'Tamil Nadu' },
  'Telangana': { center: [17.3850, 78.4867], zoom: 11, label: 'Telangana' },
  'Tripura': { center: [23.9408, 91.9882], zoom: 9, label: 'Tripura' },
  'Uttar Pradesh': { center: [26.8467, 80.9462], zoom: 8, label: 'Uttar Pradesh' },
  'Uttarakhand': { center: [30.0668, 79.0193], zoom: 8, label: 'Uttarakhand' },
  'West Bengal': { center: [22.5726, 88.3639], zoom: 11, label: 'West Bengal' },
  'Andaman and Nicobar Islands': { center: [11.7401, 92.6586], zoom: 8, label: 'Andaman and Nicobar' },
  'Chandigarh': { center: [30.7333, 76.7794], zoom: 12, label: 'Chandigarh' },
  'Dadra and Nagar Haveli and Daman and Diu': { center: [20.4283, 72.8397], zoom: 10, label: 'Dadra and Nagar Haveli' },
  'Delhi': { center: [28.6139, 77.2090], zoom: 11, label: 'Delhi' },
  'Jammu and Kashmir': { center: [34.0837, 74.7973], zoom: 8, label: 'Jammu and Kashmir' },
  'Ladakh': { center: [34.1526, 77.5771], zoom: 8, label: 'Ladakh' },
  'Lakshadweep': { center: [10.5667, 72.6417], zoom: 10, label: 'Lakshadweep' },
  'Puducherry': { center: [11.9416, 79.8083], zoom: 12, label: 'Puducherry' }
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

export async function detectRoadNetworkFromPoints(points) {
  if (!points || points.length < 2) return null;
  const coords = points.map(p => `${p[1]},${p[0]}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM match failed');
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('No road match found');
    }
    const r = data.routes[0];
    const geometry = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const roadNames = [];
    if (r.legs) {
      for (const leg of r.legs) {
        if (leg.steps) {
          for (const s of leg.steps) {
            if (s.name && !roadNames.includes(s.name)) roadNames.push(s.name);
          }
        }
      }
    }
    const distKm = Math.round((r.distance / 1000) * 10) / 10;
    const durationMin = Math.round((r.duration * INDIA_TRAFFIC_FACTOR) / 60);
    const mainRoad = roadNames[0] || (r.legs && r.legs[0]?.summary) || 'Detected Road Stretch';
    const fullName = roadNames.length > 0 ? roadNames.join(' → ') : mainRoad;
    return {
      snapped: true,
      geometry,
      mainRoad,
      roadNames: fullName,
      title: `${mainRoad} (${distKm} KM)`,
      distanceKm: distKm,
      durationMin: durationMin || Math.round((distKm / 25) * 60)
    };
  } catch (err) {
    const directDist = calculatePathDistance(points);
    return {
      snapped: false,
      geometry: points,
      mainRoad: 'Direct Field Corridor',
      roadNames: 'Field Road Axis',
      title: `Field Stretch (${directDist} KM)`,
      distanceKm: directDist,
      durationMin: Math.round((directDist / 25) * 60)
    };
  }
}
