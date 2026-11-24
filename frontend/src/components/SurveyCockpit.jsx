import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Square, ArrowLeft, Volume2, VolumeX, ShieldCheck, CheckCircle, AlertTriangle } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import { supabase } from '../supabaseClient';
import { checkGpuServerHealth, predictTriLayerGpu } from '../utils/gpuService';
import { runInference, parseYoloOutputAll } from '../utils/tfjsParser';
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
export default function SurveyCockpit({ task, initialStream, onFinish }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const graphCanvasRef = useRef(null);
  const offscreenCanvasRef = useRef(document.createElement('canvas'));
  const audioCtxRef = useRef(null);
  const stoppedRef = useRef(false);
  const lastAlertTimeRef = useRef(0);
  const prevCoordsRef = useRef(null);
  const lastDetectionsRef = useRef([]);
  const lastTriLayerRef = useRef(null);
  const [localModel, setLocalModel] = useState(null);
  const [gpuServerOnline, setGpuServerOnline] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [targetSpeed] = useState(task?.target_speed_kmh || 25);
  const [pciScore, setPciScore] = useState(100);
  const [pciRating, setPciRating] = useState('Good');
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [detectionsCount, setDetectionsCount] = useState({ potholes: 0, cracks: 0, other: 0, total: 0 });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [speedAlert, setSpeedAlert] = useState(false);
  const [fcwActive, setFcwActive] = useState(false);
  useEffect(() => {
    let active = true;
    const initEngine = async () => {
      const gpuHealth = await checkGpuServerHealth();
      if (!active) return;
      if (gpuHealth && gpuHealth.online) {
        setGpuServerOnline(true);
        setEngineReady(true);
      } else {
        try {
          const m = await tf.loadGraphModel('/model/model.json');
          if (active) {
            setLocalModel(m);
            setEngineReady(true);
          }
        } catch {
          if (active) setEngineReady(true);
        }
      }
    };
    initEngine();
    return () => { active = false; };
  }, []);
  const playAlertChime = useCallback((freq = 880) => {
    if (!soundEnabled) return;
    const now = Date.now();
    if (now - lastAlertTimeRef.current < 3500) return;
    lastAlertTimeRef.current = now;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq / 2, ctx.currentTime + 0.22);
      gain.gain.setValueAtTime(0.24, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {}
  }, [soundEnabled]);
  useEffect(() => {
    stoppedRef.current = false;
    let localStream = initialStream;
    const startCamera = async () => {
      if (!localStream) {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
          });
        } catch {}
      }
      if (videoRef.current && localStream) {
        videoRef.current.srcObject = localStream;
        videoRef.current.play().catch(() => {});
      }
    };
    startCamera();
    let watchId = null;
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (stoppedRef.current) return;
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const rawSpeed = pos.coords.speed;
          const accuracy = Math.round(pos.coords.accuracy || 20);
          const now = Date.now();
          let calculatedSpeedKmh = 0;
          if (rawSpeed !== null && rawSpeed !== undefined && rawSpeed >= 0) {
            calculatedSpeedKmh = Math.round(rawSpeed * 3.6 * 10) / 10;
          } else if (prevCoordsRef.current) {
            const dtSeconds = (now - (prevCoordsRef.current.time || now)) / 1000;
            const distKm = haversineDistance(prevCoordsRef.current.lat, prevCoordsRef.current.lon, lat, lon);
            const distMeters = distKm * 1000;
            if (dtSeconds > 1.0 && distMeters > Math.max(12, accuracy * 0.6)) {
              calculatedSpeedKmh = Math.round((distKm / (dtSeconds / 3600)) * 10) / 10;
            }
          }
          if (calculatedSpeedKmh < 3) {
            calculatedSpeedKmh = 0;
          }
          setCurrentSpeed(calculatedSpeedKmh);
          setSpeedAlert(calculatedSpeedKmh > (targetSpeed + 10));
          setUserLocation([lat, lon]);
          setGpsAccuracy(accuracy);
          if (calculatedSpeedKmh >= 3 && prevCoordsRef.current && accuracy <= 35) {
            const distIncrement = haversineDistance(
              prevCoordsRef.current.lat,
              prevCoordsRef.current.lon,
              lat,
              lon
            );
            const distMeters = distIncrement * 1000;
            if (distMeters >= 5 && distIncrement < 0.5) {
              setDistanceKm(d => Math.round((d + distIncrement) * 100) / 100);
            }
          }
          prevCoordsRef.current = { lat, lon, time: now };
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
    }
    const timer = setInterval(() => {
      if (stoppedRef.current) return;
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => {
      stoppedRef.current = true;
      clearInterval(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  }, [initialStream, targetSpeed]);
  const isNearStretch = useCallback((loc) => {
    if (!loc || !task?.route_points || task?.is_free_drive) return true;
    let pts = task.route_points;
    if (typeof pts === 'string') {
      try { pts = JSON.parse(pts); } catch { pts = null; }
    }
    if (!Array.isArray(pts) || pts.length === 0) return true;
    for (let i = 0; i < pts.length; i++) {
      const d = haversineDistance(loc[0], loc[1], pts[i][0], pts[i][1]) * 1000;
      if (d <= 150) return true;
    }
    return false;
  }, [task?.route_points, task?.is_free_drive]);
  const saveRealHazardToDb = useCallback(async (detection, imageBlob) => {
    if (!userLocation || currentSpeed < 3 || !isNearStretch(userLocation)) return;
    try {
      const hazardPayload = {
        type: detection.className || detection.app_type || 'pothole',
        severity_score: detection.severity || 4,
        confidence_score: detection.confidence || 0.85,
        status: 'under_review',
        location: `POINT(${userLocation[1]} ${userLocation[0]})`,
        source: gpuServerOnline ? 'yolo11_survey_unit' : 'tfjs_survey_unit',
        created_at: new Date().toISOString()
      };
      await supabase.from('hazards').insert([hazardPayload]);
    } catch {}
  }, [userLocation, currentSpeed, gpuServerOnline, isNearStretch]);
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !engineReady) return;
    let animId;
    let isInferring = false;
    let lastInferTime = 0;
    const inferenceAndRenderLoop = async (now) => {
      if (stoppedRef.current) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
      }
      const triData = lastTriLayerRef.current;
      const drivablePolys = triData?.drivable_area || [];
      const laneLines = triData?.lane_lines || [];
      const vehicles = triData?.vehicles || [];
      if (drivablePolys.length > 0) {
        drivablePolys.forEach(poly => {
          if (poly.length < 3) return;
          ctx.beginPath();
          ctx.moveTo(poly[0][0] * w, poly[0][1] * h);
          for (let i = 1; i < poly.length; i++) {
            ctx.lineTo(poly[i][0] * w, poly[i][1] * h);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(10, 132, 255, 0.28)';
          ctx.fill();
        });
      } else {
        ctx.fillStyle = 'rgba(10, 132, 255, 0.28)';
        ctx.beginPath();
        ctx.moveTo(w * 0.38, h * 0.52);
        ctx.lineTo(w * 0.62, h * 0.52);
        ctx.lineTo(w * 0.88, h);
        ctx.lineTo(w * 0.12, h);
        ctx.closePath();
        ctx.fill();
      }
      if (laneLines.length > 0) {
        ctx.strokeStyle = 'rgba(100, 210, 255, 0.85)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        laneLines.forEach(line => {
          if (line.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(line[0][0] * w, line[0][1] * h);
          for (let i = 1; i < line.length; i++) {
            ctx.lineTo(line[i][0] * w, line[i][1] * h);
          }
          ctx.stroke();
        });
      } else {
        ctx.strokeStyle = 'rgba(100, 210, 255, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w * 0.38, h * 0.52);
        ctx.lineTo(w * 0.12, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.62, h * 0.52);
        ctx.lineTo(w * 0.88, h);
        ctx.stroke();
      }
      if (vehicles.length > 0) {
        vehicles.forEach(veh => {
          if (!veh.bbox) return;
          let vx, vy, vw, vh;
          if (veh.bbox.normalized) {
            vx = veh.bbox.normalized.x * w;
            vy = veh.bbox.normalized.y * h;
            vw = veh.bbox.normalized.w * w;
            vh = veh.bbox.normalized.h * h;
          } else {
            vx = (veh.bbox.x / 640) * w;
            vy = (veh.bbox.y / 360) * h;
            vw = (veh.bbox.w / 640) * w;
            vh = (veh.bbox.h / 360) * h;
          }
          const bracketColor = veh.color || '#30D158';
          const bracketLen = Math.min(20, Math.min(vw, vh) * 0.35);
          ctx.strokeStyle = bracketColor;
          ctx.lineWidth = veh.alert_level === 'warning' ? 3.5 : 2.5;
          ctx.beginPath();
          ctx.moveTo(vx, vy + bracketLen);
          ctx.lineTo(vx, vy);
          ctx.lineTo(vx + bracketLen, vy);
          ctx.moveTo(vx + vw - bracketLen, vy);
          ctx.lineTo(vx + vw, vy);
          ctx.lineTo(vx + vw, vy + bracketLen);
          ctx.moveTo(vx, vy + vh - bracketLen);
          ctx.lineTo(vx, vy + vh);
          ctx.lineTo(vx + bracketLen, vy + vh);
          ctx.moveTo(vx + vw - bracketLen, vy + vh);
          ctx.lineTo(vx + vw, vy + vh);
          ctx.lineTo(vx + vw, vy + vh - bracketLen);
          ctx.stroke();
          const ttcPart = veh.ttc_s ? ` · ${veh.ttc_s}s` : '';
          const tagLabel = `▲ ${veh.distance_m}m${ttcPart} · ${veh.status_text}`;
          ctx.font = 'bold 11px Inter, -apple-system, sans-serif';
          const tagW = ctx.measureText(tagLabel).width + 12;
          const tagX = vx + vw / 2 - tagW / 2;
          const tagY = Math.max(16, vy - 24);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.beginPath();
          ctx.roundRect(tagX, tagY, tagW, 20, 4);
          ctx.fill();
          ctx.strokeStyle = bracketColor;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = bracketColor;
          ctx.fillText(tagLabel, tagX + 6, tagY + 14);
        });
      }
      const activeDetections = lastDetectionsRef.current;
      if (activeDetections && activeDetections.length > 0) {
        activeDetections.forEach(d => {
          if (!d.bbox) return;
          let bx, by, bw, bh;
          if (d.bbox.normalized) {
            bx = d.bbox.normalized.x * w;
            by = d.bbox.normalized.y * h;
            bw = d.bbox.normalized.w * w;
            bh = d.bbox.normalized.h * h;
          } else {
            const { cx, cy, w: bwRaw, h: bhRaw } = d.bbox;
            bx = ((cx - bwRaw / 2) / 640) * w;
            by = ((cy - bhRaw / 2) / 640) * h;
            bw = (bwRaw / 640) * w;
            bh = (bhRaw / 640) * h;
          }
          const label = d.display_label || d.displayLabel || d.className || 'Hazard';
          const isPothole = label.toLowerCase().includes('pothole');
          const boxColor = isPothole ? '#ef4444' : '#f59e0b';
          ctx.strokeStyle = boxColor;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(bx, by, bw, bh);
          ctx.fillStyle = isPothole ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)';
          ctx.fillRect(bx, by, bw, bh);
          const astmStr = d.severity ? ` · Sev ${d.severity}` : '';
          const tagText = `${label} (${Math.round(d.confidence * 100)}%)${astmStr}`;
          ctx.font = 'bold 11px Inter, -apple-system, sans-serif';
          const tagW = ctx.measureText(tagText).width + 12;
          ctx.fillStyle = boxColor;
          ctx.beginPath();
          ctx.roundRect(bx, Math.max(0, by - 20), tagW, 20, 3);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(tagText, bx + 6, Math.max(14, by - 6));
        });
      }
      if (!isInferring && now - lastInferTime > 110 && video.readyState >= 2) {
        isInferring = true;
        lastInferTime = now;
        try {
          if (gpuServerOnline) {
            const res = await predictTriLayerGpu(video, 0.15);
            if (res) {
              lastTriLayerRef.current = res;
              const hazs = res.hazards || res.detections || [];
              lastDetectionsRef.current = hazs;
              if (res.estimated_pci !== undefined) {
                setPciScore(res.estimated_pci);
                setPciRating(res.pci_rating || 'Good');
              }
              setFcwActive(Boolean(res.fcw_alert));
              if (res.fcw_audio) {
                playAlertChime(880);
              }
              if (hazs.length > 0) {
                playAlertChime(660);
                let newPotholes = 0;
                let newCracks = 0;
                let newOther = 0;
                hazs.forEach(d => {
                  const label = (d.display_label || d.className || '').toLowerCase();
                  if (label.includes('pothole')) newPotholes++;
                  else if (label.includes('crack')) newCracks++;
                  else newOther++;
                });
                setDetectionsCount(prev => ({
                  potholes: prev.potholes + newPotholes,
                  cracks: prev.cracks + newCracks,
                  other: prev.other + newOther,
                  total: prev.total + hazs.length
                }));
                const offCanvas = offscreenCanvasRef.current;
                offCanvas.width = 640;
                offCanvas.height = 360;
                offCanvas.getContext('2d').drawImage(video, 0, 0, 640, 360);
                offCanvas.toBlob((blob) => {
                  if (blob) saveRealHazardToDb(hazs[0], blob);
                }, 'image/jpeg', 0.8);
              }
            }
          } else if (localModel) {
            const preds = runInference(localModel, video);
            const currentDetections = await parseYoloOutputAll(preds, 0.14);
            if (Array.isArray(preds)) preds.forEach(t => t.dispose());
            else preds.dispose();
            lastDetectionsRef.current = currentDetections;
            if (currentDetections.length > 0) {
              playAlertChime(660);
              let newPotholes = 0;
              let newCracks = 0;
              let newOther = 0;
              currentDetections.forEach(d => {
                const label = (d.displayLabel || d.className || '').toLowerCase();
                if (label.includes('pothole')) newPotholes++;
                else if (label.includes('crack')) newCracks++;
                else newOther++;
              });
              setDetectionsCount(prev => ({
                potholes: prev.potholes + newPotholes,
                cracks: prev.cracks + newCracks,
                other: prev.other + newOther,
                total: prev.total + currentDetections.length
              }));
              const offCanvas = offscreenCanvasRef.current;
              offCanvas.width = 640;
              offCanvas.height = 360;
              offCanvas.getContext('2d').drawImage(video, 0, 0, 640, 360);
              offCanvas.toBlob((blob) => {
                if (blob) saveRealHazardToDb(currentDetections[0], blob);
              }, 'image/jpeg', 0.8);
            }
          }
        } catch {}
        isInferring = false;
      }
      animId = requestAnimationFrame(inferenceAndRenderLoop);
    };
    animId = requestAnimationFrame(inferenceAndRenderLoop);
    return () => cancelAnimationFrame(animId);
  }, [engineReady, gpuServerOnline, localModel, playAlertChime, saveRealHazardToDb]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (stoppedRef.current) return;
      const countNow = lastDetectionsRef.current.length;
      setTelemetryHistory(hist => {
        const next = [...hist, {
          time: elapsedSeconds,
          speed: currentSpeed,
          hazardCount: countNow
        }];
        return next.slice(-40);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentSpeed, elapsedSeconds]);
  useEffect(() => {
    const canvas = graphCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let y = 20; y < h; y += 25) {
      ctx.beginPath();
      ctx.moveTo(35, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('40 km/h', 2, 25);
    ctx.fillText('20 km/h', 2, 60);
    ctx.fillText('0', 14, 95);
    if (telemetryHistory.length > 1) {
      const stepX = (w - 50) / Math.max(1, telemetryHistory.length - 1);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      telemetryHistory.forEach((pt, i) => {
        const x = 40 + i * stepX;
        const normSpeed = Math.min(40, Math.max(0, pt.speed)) / 40;
        const y = 95 - normSpeed * 75;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      telemetryHistory.forEach((pt, i) => {
        if (pt.hazardCount > 0) {
          const x = 40 + i * stepX;
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(x, 25, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }, [telemetryHistory]);
  const handleStopSurvey = async () => {
    stoppedRef.current = true;
    const finalTrip = {
      id: `trip_${Date.now()}`,
      task_id: task?.id || null,
      total_distance_km: distanceKm,
      avg_speed_kmh: currentSpeed,
      max_speed_kmh: currentSpeed,
      total_hazards_count: detectionsCount.total,
      calculated_pci: pciScore,
      pci_category: pciRating,
      status: 'completed',
      created_at: new Date().toISOString()
    };
    try {
      await supabase.from('survey_trips').insert([finalTrip]);
    } catch {}
    onFinish();
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 2000, display: 'flex', flexDirection: 'column', color: '#ffffff' }}>
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleStopSurvey}
            style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none', color: '#ffffff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={14} />
            <span>Exit Survey</span>
          </button>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{task?.road_name || task?.title || 'Active Road Survey'}</span>
              {task?.is_free_drive && (
                <span style={{ fontSize: '10px', background: '#0284c7', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                  Free Drive Mode
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {task?.is_free_drive ? 'Roaming Patrol • Automatic Geotagging & Defect Detection Everywhere' : `Target Speed: ${targetSpeed} km/h • GPS Lock: ${gpsAccuracy ? `${gpsAccuracy}m Accuracy` : 'Acquiring GPS...'}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{ background: 'none', border: 'none', color: soundEnabled ? '#38bdf8' : '#94a3b8', cursor: 'pointer' }}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <div style={{ background: speedAlert ? 'rgba(220, 38, 38, 0.25)' : currentSpeed < 3 ? 'rgba(100, 116, 139, 0.25)' : 'rgba(22, 163, 74, 0.25)', border: `1px solid ${speedAlert ? '#dc2626' : currentSpeed < 3 ? '#64748b' : '#16a34a'}`, padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: speedAlert ? '#f87171' : currentSpeed < 3 ? '#94a3b8' : '#4ade80' }}>
            {currentSpeed < 3 ? 'Vehicle Stationary (0 km/h)' : `${currentSpeed} km/h ${speedAlert ? '(Reduce Speed)' : '(Speed Compliant)'}`}
          </div>
          <button
            onClick={handleStopSurvey}
            style={{ background: '#dc2626', border: 'none', color: '#ffffff', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Square size={14} fill="#ffffff" />
            <span>Finish Survey</span>
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000', overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{ display: 'none' }} />
        <canvas ref={canvasRef} width={1280} height={720} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        {fcwActive && (
          <div style={{ position: 'absolute', top: 16, background: '#dc2626', color: '#ffffff', padding: '10px 24px', borderRadius: '8px', fontSize: '15px', fontWeight: 900, letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 0 25px rgba(220, 38, 38, 0.85)', animation: 'pulse 1s infinite' }}>
            <AlertTriangle size={22} />
            <span>COLLISION WARNING — BRAKE</span>
          </div>
        )}
        {currentSpeed < 3 && !fcwActive && (
          <div style={{ position: 'absolute', top: 16, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid #475569', color: '#94a3b8', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748b', display: 'inline-block' }}></span>
            <span>Vehicle Stationary — Ready to scan once driving begins</span>
          </div>
        )}
        {speedAlert && !fcwActive && (
          <div style={{ position: 'absolute', top: 16, background: 'rgba(220, 38, 38, 0.92)', color: '#ffffff', padding: '8px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 800, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span>REDUCE SPEED — TARGET IS {targetSpeed} KM/H</span>
          </div>
        )}
        {!isNearStretch(userLocation) && task?.route_points && !task?.is_free_drive && !fcwActive && (
          <div style={{ position: 'absolute', top: speedAlert ? 60 : 16, background: 'rgba(234, 88, 12, 0.92)', color: '#ffffff', padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span>OUTSIDE STRETCH VICINITY — DEFECT LOGGING PAUSED</span>
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 14, left: 16, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', padding: '8px 14px', borderRadius: '8px', border: '1px solid #334155', display: 'flex', gap: '16px', fontSize: '12px' }}>
          <div>
            <span style={{ color: '#94a3b8' }}>Distance:</span> <strong style={{ color: '#ffffff' }}>{distanceKm} KM</strong>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>Elapsed:</span> <strong style={{ color: '#ffffff' }}>{Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s</strong>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>PCI:</span> <strong style={{ color: pciScore >= 80 ? '#4ade80' : pciScore >= 65 ? '#facc15' : '#fb923c' }}>{pciScore}/100 ({pciRating})</strong>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>Hazards Detected:</span> <strong style={{ color: '#f87171' }}>{detectionsCount.total}</strong>
          </div>
        </div>
      </div>
      <div style={{ background: '#ffffff', borderTop: '1px solid #cbd5e1', padding: '12px 18px', color: '#0f172a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.5px' }}>
            Live Survey Telemetry (Speed vs. Defect Occurrences)
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            Blue Line: Velocity (km/h) • Red Points: Actual Model Detections
          </div>
        </div>
        <div style={{ height: '100px', width: '100%' }}>
          <canvas ref={graphCanvasRef} width={800} height={100} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </div>
  );
}
