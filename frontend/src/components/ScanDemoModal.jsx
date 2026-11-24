import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Volume2, VolumeX, Activity, AlertTriangle } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pciScore, setPciScore] = useState(100);
  const [pciRating, setPciRating] = useState('Good');
  const [hazardsCount, setHazardsCount] = useState(0);
  const [vehiclesCount, setVehiclesCount] = useState(0);
  const [fcwActive, setFcwActive] = useState(false);
  const [gpuServerOnline, setGpuServerOnline] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const lastAlertTimeRef = useRef(0);
  const lastTriLayerRef = useRef(null);
  const lastDetectionsRef = useRef([]);
  const localModelRef = useRef(null);
  const isInferringRef = useRef(false);
  const lastInferTimeRef = useRef(0);
  const stoppedRef = useRef(false);
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
          } catch {}
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
  const handleSelectVideo = (v) => {
    setSelectedVideo(v);
    setPciScore(100);
    setPciRating('Good');
    setHazardsCount(0);
    setVehiclesCount(0);
    setFcwActive(false);
    lastTriLayerRef.current = null;
    lastDetectionsRef.current = [];
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
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };
  const handleRestart = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
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
            const bracketColor = veh.color || '#30D158';
            const bracketLen = Math.min(22, Math.min(vw, vh) * 0.35);
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
                  setPciRating(res.pci_rating || 'Good');
                }
                setFcwActive(Boolean(res.fcw_alert));
                setVehiclesCount((res.vehicles || []).length);
                setHazardsCount(hazs.length);
                if (res.fcw_audio) playAlertChime(880);
                if (hazs.length > 0) playAlertChime(660);
              }
            } else if (localModelRef.current) {
              const preds = runInference(localModelRef.current, video);
              const currentDetections = await parseYoloOutputAll(preds, 0.14);
              if (Array.isArray(preds)) preds.forEach(t => t.dispose());
              else preds.dispose();
              lastDetectionsRef.current = currentDetections;
              setHazardsCount(currentDetections.length);
              if (currentDetections.length > 0) playAlertChime(660);
            }
          } catch {}
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
  }, [gpuServerOnline, playAlertChime]);
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
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{ background: 'transparent', border: 'none', color: soundEnabled ? '#38bdf8' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '6px' }}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
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
        {fcwActive && (
          <div style={{ position: 'absolute', top: 20, background: '#dc2626', color: '#ffffff', padding: '8px 20px', borderRadius: '6px', fontSize: '14px', fontWeight: 900, letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 20px rgba(220, 38, 38, 0.85)' }}>
            <AlertTriangle size={18} />
            <span>COLLISION WARNING — BRAKE</span>
          </div>
        )}
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
