import React, { useRef, useState, useEffect } from 'react';
import { X, Play, Pause, RotateCcw, Activity } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import { supabase } from '../supabaseClient';
import { checkGpuServerHealth, predictTriLayerGpu } from '../utils/gpuService';
import { runInference, parseYoloOutputAll } from '../utils/tfjsParser';
const DEMO_VIDEOS = [
  { id: 'video1', src: '/demo_scans/video1.mp4', label: 'Footage 1' },
  { id: 'video2', src: '/demo_scans/video2.mp4', label: 'Footage 2' },
  { id: 'video3', src: '/demo_scans/video3.mp4', label: 'Footage 3' }
];
export default function ScanDemoModal({ onClose }) {
  const [selectedVideo, setSelectedVideo] = useState(DEMO_VIDEOS[0]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [pciScore, setPciScore] = useState(100);
  const [pciRating, setPciRating] = useState('Good');
  const [hazardsCount, setHazardsCount] = useState(0);
  const [vehiclesCount, setVehiclesCount] = useState(0);
  const [gpuServerOnline, setGpuServerOnline] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const lastTriLayerRef = useRef(null);
  const lastDetectionsRef = useRef([]);
  const localModelRef = useRef(null);
  const isInferringRef = useRef(false);
  const lastInferTimeRef = useRef(0);
  const stoppedRef = useRef(false);
  const tripIdRef = useRef(`demo_${Date.now()}`);
  const pciScoreRef = useRef(100);
  const lastSnapshotTimesRef = useRef({});
  const uploadDemoSnapshot = async (videoEl) => {
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = 640;
      offscreen.height = 360;
      const octx = offscreen.getContext('2d');
      octx.drawImage(videoEl, 0, 0, 640, 360);
      if (canvasRef.current) {
        octx.drawImage(canvasRef.current, 0, 0, 640, 360);
      }
      const blob = await new Promise(resolve => offscreen.toBlob(resolve, 'image/jpeg', 0.65));
      if (!blob) return null;
      const fileName = `${tripIdRef.current}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('demo-scans')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadErr) return null;
      const { data: pubData } = supabase.storage.from('demo-scans').getPublicUrl(fileName);
      return pubData?.publicUrl || null;
    } catch {
      return null;
    }
  };
  const handleDefectLogging = async (defectsList, videoEl) => {
    if (!defectsList || defectsList.length === 0 || !videoEl) return;
    const now = Date.now();
    for (const d of defectsList) {
      const label = d.display_label || d.displayLabel || d.className || 'Hazard';
      const lastTime = lastSnapshotTimesRef.current[label] || 0;
      if (now - lastTime < 6000) continue;
      lastSnapshotTimesRef.current[label] = now;
      const isPothole = label.toLowerCase().includes('pothole');
      const photoUrl = await uploadDemoSnapshot(videoEl);
      try {
        await supabase.from('hazards').insert([{
          trip_id: tripIdRef.current,
          vehicle_number: 'DEMO-UNIT-01',
          type: isPothole ? 'pothole' : 'crack',
          display_label: label,
          confidence_score: d.confidence ? Number(Number(d.confidence).toFixed(2)) : 0.85,
          severity_score: d.severity || (isPothole ? 4 : 2),
          image_url: photoUrl,
          source: 'demo_dashcam_scan',
          is_demo: true,
          status: 'unverified',
          action_status: 'pending_review',
          location: 'POINT(91.7362 26.1445)'
        }]);
      } catch { }
    }
  };
  useEffect(() => {
    let mounted = true;
    const initTrip = async () => {
      try {
        await supabase.from('survey_trips').insert([{
          id: tripIdRef.current,
          road_name: `Demo Footage Scan: ${selectedVideo.label}`,
          driver_name: 'AI Simulation Agent',
          vehicle_number: 'DEMO-UNIT-01',
          start_time: new Date().toISOString(),
          status: 'in_progress',
          is_demo: true,
          calculated_pci: 100
        }]);
      } catch { }
    };
    initTrip();
    return () => {
      mounted = false;
      supabase.from('survey_trips').update({
        end_time: new Date().toISOString(),
        status: 'completed',
        calculated_pci: pciScoreRef.current,
        total_distance_km: 1.25,
        avg_speed_kmh: 32,
        max_speed_kmh: 45
      }).eq('id', tripIdRef.current).then(() => { }).catch(() => { });
    };
  }, []);
  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      const gpuHealth = await checkGpuServerHealth();
      if (!active) return;
      if (gpuHealth && gpuHealth.online) {
        setGpuServerOnline(true);
        setIsWakingUp(false);
      } else {
        setGpuServerOnline(false);
        setIsWakingUp(Boolean(gpuHealth?.wakingUp));
        if (!localModelRef.current) {
          try {
            const m = await tf.loadGraphModel('/model/model.json');
            if (active) localModelRef.current = m;
          } catch { }
        }
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);
  const handleSelectVideo = async (v) => {
    const prevTripId = tripIdRef.current;
    supabase.from('survey_trips').update({
      end_time: new Date().toISOString(),
      status: 'completed',
      calculated_pci: pciScoreRef.current,
      total_distance_km: 1.25,
      avg_speed_kmh: 32,
      max_speed_kmh: 45
    }).eq('id', prevTripId).then(() => {}).catch(() => {});
    const nextTripId = `demo_${Date.now()}`;
    tripIdRef.current = nextTripId;
    lastSnapshotTimesRef.current = {};
    setSelectedVideo(v);
    setPciScore(100);
    pciScoreRef.current = 100;
    setPciRating('Good');
    setHazardsCount(0);
    setVehiclesCount(0);
    lastTriLayerRef.current = null;
    lastDetectionsRef.current = [];
    supabase.from('survey_trips').insert([{
      id: nextTripId,
      road_name: `Demo Footage Scan: ${v.label}`,
      driver_name: 'AI Simulation Agent',
      vehicle_number: 'DEMO-UNIT-01',
      start_time: new Date().toISOString(),
      status: 'in_progress',
      is_demo: true,
      calculated_pci: 100
    }]).then(() => {}).catch(() => {});
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => { });
    }
  };
  const handleRestart = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play().then(() => setIsPlaying(true)).catch(() => { });
  };
  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };
  useEffect(() => {
    stoppedRef.current = false;
    let animId;
    const renderLoop = async (now) => {
      if (stoppedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        if (video.readyState >= 2) {
          setCurrentTime(video.currentTime);
          if (video.duration && !isNaN(video.duration)) setDuration(video.duration);
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
            ctx.fillStyle = 'rgba(10, 132, 255, 0.30)';
            ctx.fill();
          });
        }
        if (laneLines.length > 0) {
          ctx.strokeStyle = 'rgba(100, 210, 255, 0.90)';
          ctx.lineWidth = 3.5;
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
            const boxColor = veh.alert_level === 'warning' ? '#ef4444' : veh.alert_level === 'caution' ? '#f59e0b' : '#0ea5e9';
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(vx, vy, vw, vh);
            ctx.fillStyle = veh.alert_level === 'warning' ? 'rgba(239, 68, 68, 0.12)' : veh.alert_level === 'caution' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(14, 165, 233, 0.10)';
            ctx.fillRect(vx, vy, vw, vh);
            const ttcPart = veh.ttc_s ? ` · ${veh.ttc_s}s` : '';
            const tagText = `${veh.class_name || 'Vehicle'} · ${veh.distance_m}m${ttcPart}`;
            ctx.font = 'bold 11px Inter, -apple-system, sans-serif';
            const tagW = ctx.measureText(tagText).width + 12;
            ctx.fillStyle = boxColor;
            ctx.beginPath();
            ctx.roundRect(vx, Math.max(0, vy - 20), tagW, 20, 3);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(tagText, vx + 6, Math.max(14, vy - 6));
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
        if (!isInferringRef.current && now - lastInferTimeRef.current > 100 && video.readyState >= 2 && !video.paused) {
          isInferringRef.current = true;
          lastInferTimeRef.current = now;
          try {
            if (gpuServerOnline) {
              const res = await predictTriLayerGpu(video, 0.15);
              if (res) {
                lastTriLayerRef.current = res;
                const hazs = res.hazards || res.detections || [];
                lastDetectionsRef.current = hazs;
                if (res.estimated_pci !== undefined) {
                  setPciScore(res.estimated_pci);
                  pciScoreRef.current = res.estimated_pci;
                  setPciRating(res.pci_rating || 'Good');
                }
                setVehiclesCount((res.vehicles || []).length);
                setHazardsCount(hazs.length);
                if (hazs.length > 0) {
                  handleDefectLogging(hazs, video);
                }
              }
            } else if (localModelRef.current) {
              const preds = runInference(localModelRef.current, video);
              const currentDetections = await parseYoloOutputAll(preds, 0.14);
              if (Array.isArray(preds)) preds.forEach(t => t.dispose());
              else preds.dispose();
              lastDetectionsRef.current = currentDetections;
              setHazardsCount(currentDetections.length);
              if (currentDetections.length > 0) {
                handleDefectLogging(currentDetections, video);
              }
            }
          } catch { }
          isInferringRef.current = false;
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);
    return () => {
      stoppedRef.current = true;
      cancelAnimationFrame(animId);
    };
  }, [gpuServerOnline]);
  const formatTime = (sec) => {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#0a0f1d', display: 'flex', flexDirection: 'column', color: '#ffffff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ padding: '12px 20px', background: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={18} color="#38bdf8" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>StreetIQ Vision</span>
          <span style={{ fontSize: '11px', background: gpuServerOnline ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)', color: gpuServerOnline ? '#4ade80' : '#facc15', border: `1px solid ${gpuServerOnline ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`, padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
            {gpuServerOnline ? 'Cloud Tri-Layer Engine Online' : isWakingUp ? 'Waking up Cloud Engine...' : 'Connecting to Cloud Engine...'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#020617', padding: '4px', borderRadius: '8px', border: '1px solid #1e293b' }}>
          {DEMO_VIDEOS.map((v) => {
            const isSelected = selectedVideo.id === v.id;
            return (
              <button
                key={v.id}
                onClick={() => handleSelectVideo(v)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: isSelected ? '#0284c7' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 700,
                  transition: 'all 0.15s ease'
                }}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255, 255, 255, 0.08)', border: 'none', color: '#ffffff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600 }}
          >
            <X size={15} />
            <span>Close</span>
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          key={selectedVideo.src}
          src={selectedVideo.src}
          playsInline
          muted
          loop
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
        />
        <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid #334155', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div>
            <span style={{ color: '#94a3b8' }}>PCI: </span>
            <strong style={{ color: pciScore >= 80 ? '#4ade80' : pciScore >= 65 ? '#facc15' : '#fb923c' }}>{pciScore}/100 ({pciRating})</strong>
          </div>
          <div style={{ width: '1px', height: '12px', background: '#334155' }}></div>
          <div>
            <span style={{ color: '#94a3b8' }}>Hazards: </span>
            <strong style={{ color: '#ffffff' }}>{hazardsCount}</strong>
          </div>
          <div style={{ width: '1px', height: '12px', background: '#334155' }}></div>
          <div>
            <span style={{ color: '#94a3b8' }}>Vehicles: </span>
            <strong style={{ color: '#ffffff' }}>{vehiclesCount}</strong>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(8px)', border: '1px solid #334155', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={togglePlay}
            style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#0284c7', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            onClick={handleRestart}
            style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.08)', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <RotateCcw size={14} />
          </button>
          <div style={{ fontSize: '11px', color: '#94a3b8', minWidth: '70px' }}>
            <span>{formatTime(currentTime)}</span> / <span>{formatTime(duration)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            style={{ flex: 1, cursor: 'pointer', accentColor: '#38bdf8' }}
          />
        </div>
      </div>
    </div>
  );
}
