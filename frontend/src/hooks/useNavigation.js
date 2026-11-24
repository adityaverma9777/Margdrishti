import { useState, useRef, useCallback, useEffect } from 'react';
const OSRM_BASE = 'https://router.project-osrm.org';
const INDIA_TRAFFIC_FACTOR = 1.8;
const STEP_ADVANCE_RADIUS_M = 30;
const OFF_ROUTE_THRESHOLD_M = 50;
const REROUTE_DEBOUNCE_MS = 4000;
function haversine(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const phi1 = (a[0] * Math.PI) / 180;
  const phi2 = (b[0] * Math.PI) / 180;
  const deltaPhi = ((b[0] - a[0]) * Math.PI) / 180;
  const deltaLambda = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function minDistanceToPolyline(point, polyline) {
  if (!point || !polyline || polyline.length === 0) return 0;
  let minD = Infinity;
  for (let i = 0; i < polyline.length; i++) {
    const d = haversine(point, polyline[i]);
    if (d < minD) minD = d;
  }
  return minD;
}
function getManeuverIcon(maneuver) {
  if (!maneuver) return '↑';
  const { type, modifier } = maneuver;
  if (type === 'arrive') return '🏁';
  if (type === 'depart') return '🚗';
  if (type === 'roundabout' || type === 'rotary') return '🔄';
  if (type === 'fork') return modifier?.includes('left') ? '↙' : '↘';
  if (type === 'merge') return '⬆';
  if (!modifier) return '↑';
  if (modifier === 'sharp left') return '↰';
  if (modifier === 'left') return '←';
  if (modifier === 'slight left') return '↖';
  if (modifier === 'straight') return '↑';
  if (modifier === 'slight right') return '↗';
  if (modifier === 'right') return '→';
  if (modifier === 'sharp right') return '↱';
  if (modifier === 'uturn') return '↩';
  return '↑';
}
function bearingToCompass(bearing) {
  const dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return dirs[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}
function buildInstruction(step) {
  const { maneuver, name } = step;
  const roadName = name ? `onto ${name}` : '';
  const { type, modifier } = maneuver;
  if (type === 'depart') return `Head ${maneuver.bearing_after !== undefined ? bearingToCompass(maneuver.bearing_after) : (modifier || 'forward')}${name ? ` on ${name}` : ''}`;
  if (type === 'arrive') return 'You have arrived at the survey start point';
  if (type === 'turn') return `Turn ${modifier} ${roadName}`;
  if (type === 'new name') return `Continue ${modifier || 'straight'} ${roadName}`;
  if (type === 'continue') return `Continue straight ${roadName}`;
  if (type === 'merge') return `Merge ${modifier} ${roadName}`;
  if (type === 'on ramp') return `Take the ramp ${modifier} ${roadName}`;
  if (type === 'off ramp') return `Take exit ${modifier} ${roadName}`;
  if (type === 'fork') return `Keep ${modifier} at the fork ${roadName}`;
  if (type === 'end of road') return `Turn ${modifier} at end of road ${roadName}`;
  if (type === 'roundabout' || type === 'rotary') return `At the roundabout, take ${maneuver.exit ? `exit ${maneuver.exit} ` : ''}${roadName}`;
  return `Continue ${roadName}`;
}
export function useNavigation(userLocation, speedKmh = 0) {
  const [route, setRoute] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [steps, setSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRerouting, setIsRerouting] = useState(false);
  const [error, setError] = useState(null);
  const [distanceToNext, setDistanceToNext] = useState(null);
  const [remainingDistanceM, setRemainingDistanceM] = useState(null);
  const [distanceToStartPoint, setDistanceToStartPoint] = useState(null);
  const [eta, setEta] = useState(null);
  const [heading, setHeading] = useState(null);
  const [arrived, setArrived] = useState(false);
  const stepsRef = useRef([]);
  const currentIdxRef = useRef(0);
  const compassWatchRef = useRef(null);
  const smoothedEtaRef = useRef(null);
  const destinationRef = useRef(null);
  const routeRef = useRef(null);
  const lastRerouteTimeRef = useRef(0);
  const isReroutingRef = useRef(false);
  const fetchRoute = useCallback(async (start, end) => {
    destinationRef.current = end;
    setIsLoading(true);
    setError(null);
    setArrived(false);
    try {
      const [startLat, startLng] = start;
      const [endLat, endLng] = end;
      const url = `${OSRM_BASE}/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error('No driving route found to start point');
      }
      const osrmRoute = data.routes[0];
      const geometry = osrmRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const extractedSteps = [];
      for (const leg of osrmRoute.legs) {
        for (const step of leg.steps) {
          const loc = step.maneuver.location;
          extractedSteps.push({
            instruction: buildInstruction(step),
            distance: Math.round(step.distance),
            duration: Math.round(step.duration * INDIA_TRAFFIC_FACTOR),
            maneuver: { type: step.maneuver.type, modifier: step.maneuver.modifier, bearing_after: step.maneuver.bearing_after },
            maneuver_location: [loc[1], loc[0]],
            name: step.name || ''
          });
        }
      }
      const rawDuration = osrmRoute.duration;
      const routeResult = {
        geometry,
        steps: extractedSteps,
        distance: Math.round(osrmRoute.distance),
        duration: Math.round(rawDuration * INDIA_TRAFFIC_FACTOR)
      };
      setRoute(geometry);
      routeRef.current = geometry;
      setSteps(extractedSteps);
      setRouteData(routeResult);
      stepsRef.current = extractedSteps;
      currentIdxRef.current = 0;
      setCurrentStepIdx(0);
      setEta(Math.max(1, Math.round(routeResult.duration / 60)));
      setRemainingDistanceM(routeResult.distance);
      if (extractedSteps.length > 0) {
        setDistanceToNext(extractedSteps[0].distance);
      }
      return routeResult;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setIsLoading(false);
      setIsRerouting(false);
      isReroutingRef.current = false;
    }
  }, []);
  const startNavigation = useCallback(() => {
    setCurrentStepIdx(0);
    currentIdxRef.current = 0;
    setIsNavigating(true);
    setArrived(false);
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(perm => {
          if (perm === 'granted') {
            const handler = (e) => {
              if (e.absolute && e.alpha !== null) setHeading(360 - e.alpha);
            };
            window.addEventListener('deviceorientationabsolute', handler, true);
            compassWatchRef.current = () => window.removeEventListener('deviceorientationabsolute', handler, true);
          }
        }).catch(() => {});
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      const handler = (e) => {
        if (e.alpha !== null) setHeading(360 - e.alpha);
      };
      window.addEventListener('deviceorientationabsolute', handler, true);
      compassWatchRef.current = () => window.removeEventListener('deviceorientationabsolute', handler, true);
    }
  }, []);
  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setRoute(null);
    routeRef.current = null;
    setRouteData(null);
    setSteps([]);
    stepsRef.current = [];
    setCurrentStepIdx(0);
    currentIdxRef.current = 0;
    setDistanceToNext(null);
    setRemainingDistanceM(null);
    setDistanceToStartPoint(null);
    setEta(null);
    setHeading(null);
    setArrived(false);
    setIsRerouting(false);
    isReroutingRef.current = false;
    destinationRef.current = null;
    smoothedEtaRef.current = null;
    if (compassWatchRef.current) {
      compassWatchRef.current();
      compassWatchRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (!userLocation || !destinationRef.current) return;
    const directDist = Math.round(haversine(userLocation, destinationRef.current));
    setDistanceToStartPoint(directDist);
    if (directDist <= 35) {
      setArrived(true);
    }
  }, [userLocation]);
  useEffect(() => {
    if (!isNavigating || !userLocation) return;
    const currentSteps = stepsRef.current;
    if (!currentSteps.length) return;
    if (routeRef.current && routeRef.current.length > 0 && destinationRef.current && !isReroutingRef.current) {
      const offRouteDist = minDistanceToPolyline(userLocation, routeRef.current);
      const now = Date.now();
      if (offRouteDist > OFF_ROUTE_THRESHOLD_M && now - lastRerouteTimeRef.current > REROUTE_DEBOUNCE_MS) {
        lastRerouteTimeRef.current = now;
        isReroutingRef.current = true;
        setIsRerouting(true);
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(new SpeechSynthesisUtterance('Rerouting to start point'));
        }
        fetchRoute(userLocation, destinationRef.current);
        return;
      }
    }
    const idx = currentIdxRef.current;
    if (idx >= currentSteps.length) {
      setArrived(true);
      return;
    }
    const nextIdx = idx + 1;
    let distToNextManeuver = null;
    if (nextIdx < currentSteps.length) {
      const nextStepLoc = currentSteps[nextIdx].maneuver_location;
      if (nextStepLoc) {
        const dist = haversine(userLocation, nextStepLoc);
        distToNextManeuver = Math.round(dist);
        setDistanceToNext(distToNextManeuver);
        if (dist < STEP_ADVANCE_RADIUS_M) {
          currentIdxRef.current = idx + 1;
          setCurrentStepIdx(idx + 1);
        }
      }
    } else {
      const finalLoc = currentSteps[idx].maneuver_location;
      if (finalLoc) {
        const dist = haversine(userLocation, finalLoc);
        distToNextManeuver = Math.round(dist);
        setDistanceToNext(distToNextManeuver);
        if (dist < STEP_ADVANCE_RADIUS_M) {
          setArrived(true);
        }
      }
    }
    const futureStepsDistance = currentSteps
      .slice(currentIdxRef.current + 1)
      .reduce((sum, st) => sum + st.distance, 0);
    const remaining = (distToNextManeuver ?? 0) + futureStepsDistance;
    setRemainingDistanceM(remaining);
    if (remaining <= 35) {
      setArrived(true);
    }
    if (speedKmh > 4) {
      const speedMs = speedKmh / 3.6;
      const rawEtaSec = remaining / speedMs;
      const prev = smoothedEtaRef.current;
      const smoothed = prev === null ? rawEtaSec : prev * 0.85 + rawEtaSec * 0.15;
      smoothedEtaRef.current = smoothed;
      setEta(Math.max(1, Math.round(smoothed / 60)));
    } else {
      const staticRemaining = currentSteps.slice(currentIdxRef.current).reduce((s, st) => s + st.duration, 0);
      if (smoothedEtaRef.current === null) {
        setEta(Math.max(1, Math.round(staticRemaining / 60)));
      }
    }
  }, [userLocation, speedKmh, isNavigating, fetchRoute]);
  useEffect(() => {
    if (!isNavigating) return;
    const gpsBearing = (pos) => {
      if (pos.coords.heading !== null && pos.coords.heading !== undefined && !isNaN(pos.coords.heading)) {
        setHeading(pos.coords.heading);
      }
    };
    const watchId = navigator.geolocation?.watchPosition(gpsBearing, () => {}, { enableHighAccuracy: true });
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isNavigating]);
  const currentStep = steps[currentStepIdx] || null;
  const nextStep = steps[currentStepIdx + 1] || null;
  const maneuverIcon = getManeuverIcon(currentStep?.maneuver);
  const isInStartVicinity = distanceToStartPoint !== null && distanceToStartPoint <= 100;
  return {
    route,
    routeData,
    steps,
    currentStep,
    nextStep,
    currentStepIdx,
    maneuverIcon,
    isNavigating,
    isLoading,
    isRerouting,
    error,
    distanceToNext,
    remainingDistanceM,
    distanceToStartPoint,
    isInStartVicinity,
    eta,
    heading,
    arrived,
    fetchRoute,
    startNavigation,
    stopNavigation
  };
}