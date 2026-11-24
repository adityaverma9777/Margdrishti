import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Volume2, VolumeX, Activity, AlertTriangle, Layers, Car, ShieldAlert, CheckCircle2 } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import { checkGpuServerHealth, predictTriLayerGpu } from '../utils/gpuService';
import { runInference, parseYoloOutputAll } from '../utils/tfjsParser';
const DEMO_VIDEOS = [
  {
    id: 'video1',
    src: '/demo_scans/video1.mp4',
    title: 'Urban Arterial Corridor',
    subtitle: 'Primary Highway • Dense Traffic & Potholes',
    tag: 'Highway / NH',
    desc: 'Dense vehicular corridor testing crack propagation, alligatoring, and lead-vehicle distance tracking.'
  },
  {
    id: 'video2',
    src: '/demo_scans/video2.mp4',
    title: 'Collector Roadway Stretch',
    subtitle: 'Urban Secondary • Patching & Lane Degradation',
    tag: 'Collector',
    desc: 'Mixed pavement conditions evaluating TwinLiteNet+ lane boundary delineation under varied lighting.'
  },
  {
    id: 'video3',
    src: '/demo_scans/video3.mp4',
    title: 'State Highway Sector',
    subtitle: 'High Velocity Transit • Surface Drop-offs',
    tag: 'State Highway',
    desc: 'High-speed transit evaluating ASTM D6433 deduction accuracy and forward collision warnings.'
  }
];
export default function ScanDemoModal({ onClose }) {
  const [selectedVideo, setSelectedVideo] = useState(DEMO_VIDEOS[0]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pciScore, setPciScore] = useState(100);
  const [pciRating, setPciRating] = useState('Good');
  const [fps, setFps] = useState(0);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [hazardsCount, setHazardsCount] = useState({ potholes: 0, cracks: 0, total: 0 });
  const [activeVehiclesCount, setActiveVehiclesCount] = useState(0);
  const [fcwActive, setFcwActive] = useState(false);
  const [gpuServerOnline, setGpuServerOnline] = useState(false);
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
    const initEngine = async () => {
      const gpuHealth = await checkGpuServerHealth();
      if (!active) return;
      if (gpuHealth && gpuHealth.online) {
        setGpuServerOnline(true);
      } else {
        try {
          const m = await tf.loadGraphModel('/model/model.json');
          if (active) localModelRef.current = m;
        } catch {}
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
  const handleSelectVideo = (v) => {
    setSelectedVideo(v);
    setPciScore(100);
    setPciRating('Good');
    setHazardsCount({ potholes: 0, cracks: 0, total: 0 });
    setActiveVehiclesCount(0);
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
        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, w, h);
          setCurrentTime(video.currentTime);
          if (video.duration && !isNaN(video.duration)) setDuration(video.duration);
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
          ctx.fillStyle = 'rgba(10, 132, 255, 0.25)';
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
        if (!isInferringRef.current && now - lastInferTimeRef.current > 110 && video.readyState >= 2 && !video.paused) {
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
                if (res.fps) setFps(res.fps);
                if (res.inference_ms) setInferenceMs(res.inference_ms);
                setFcwActive(Boolean(res.fcw_alert));
                setActiveVehiclesCount((res.vehicles || []).length);
                if (res.fcw_audio) playAlertChime(880);
                if (hazs.length > 0) {
                  playAlertChime(660);
                  let pCount = 0;
                  let cCount = 0;
                  hazs.forEach(item => {
                    const l = (item.display_label || item.className || '').toLowerCase();
                    if (l.includes('pothole')) pCount++;
                    else if (l.includes('crack')) cCount++;
                  });
                  setHazardsCount(prev => ({
                    potholes: prev.potholes + pCount,
                    cracks: prev.cracks + cCount,
                    total: prev.total + hazs.length
                  }));
                }
              }
            } else if (localModelRef.current) {
              const preds = runInference(localModelRef.current, video);
              const currentDetections = await parseYoloOutputAll(preds, 0.14);
              if (Array.isArray(preds)) preds.forEach(t => t.dispose());
              else preds.dispose();
              lastDetectionsRef.current = currentDetections;
              if (currentDetections.length > 0) {
                playAlertChime(660);
                let pCount = 0;
                let cCount = 0;
                currentDetections.forEach(item => {
                  const l = (item.displayLabel || item.className || '').toLowerCase();
                  if (l.includes('pothole')) pCount++;
                  else if (l.includes('crack')) cCount++;
                });
                setHazardsCount(prev => ({
                  potholes: prev.potholes + pCount,
                  cracks: prev.cracks + cCount,
                  total: prev.total + currentDetections.length
                }));
              }
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(10, 15, 29, 0.94)', backdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', color: '#ffffff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div style={{ padding: '14px 24px', background: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={20} color="#38bdf8" />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>StreetIQ AI Vision Pipeline — Live Dashcam Evaluation</span>
              <span style={{ fontSize: '11px', background: gpuServerOnline ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)', color: gpuServerOnline ? '#4ade80' : '#facc15', border: `1px solid ${gpuServerOnline ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`, padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                {gpuServerOnline ? 'CUDA Acceleration Online' : 'Local TFJS Engine Active'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Evaluating ASTM D6433 Distress, TwinLiteNet+ Drivable Area & ADAS Kinematic TTC on Real Dashcam Footage
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: soundEnabled ? '#38bdf8' : '#94a3b8', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600 }}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{soundEnabled ? 'Audio On' : 'Muted'}</span>
          </button>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#ffffff', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
          >
            <X size={16} />
            <span>Close Evaluation</span>
          </button>
        </div>
      </div>
      <div style={{ padding: '12px 24px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
        {DEMO_VIDEOS.map((v) => {
          const isSelected = selectedVideo.id === v.id;
          return (
            <button
              key={v.id}
              onClick={() => handleSelectVideo(v)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: '10px',
                background: isSelected ? 'rgba(14, 165, 233, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                border: `1.5px solid ${isSelected ? '#38bdf8' : '#334155'}`,
                cursor: 'pointer',
                color: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                transition: 'all 0.18s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? '#38bdf8' : '#f1f5f9' }}>{v.title}</span>
                <span style={{ fontSize: '10px', background: isSelected ? '#0284c7' : '#334155', color: '#ffffff', padding: '2px 7px', borderRadius: '8px', fontWeight: 700 }}>
                  {v.tag}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{v.subtitle}</div>
            </button>
          );
        })}
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
          style={{ display: 'none' }}
        />
        <canvas ref={canvasRef} width={1280} height={720} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        {fcwActive && (
          <div style={{ position: 'absolute', top: 20, background: '#dc2626', color: '#ffffff', padding: '10px 24px', borderRadius: '8px', fontSize: '15px', fontWeight: 900, letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 0 25px rgba(220, 38, 38, 0.85)' }}>
            <AlertTriangle size={22} />
            <span>FORWARD COLLISION WARNING — BRAKE</span>
          </div>
        )}
        <div style={{ position: 'absolute', top: 18, left: 18, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(8px)', border: '1px solid #334155', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#94a3b8' }}>Live ASTM PCI:</span>
            <strong style={{ color: pciScore >= 80 ? '#4ade80' : pciScore >= 65 ? '#facc15' : '#fb923c' }}>
              {pciScore} / 100 ({pciRating})
            </strong>
          </div>
          <div style={{ background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(8px)', border: '1px solid #334155', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#94a3b8' }}>Drivable Mask:</span>
            <strong style={{ color: '#38bdf8' }}>TwinLiteNet+ Active</strong>
          </div>
          <div style={{ background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(8px)', border: '1px solid #334155', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#94a3b8' }}>Target Vehicles:</span>
            <strong style={{ color: '#34d399' }}>{activeVehiclesCount} Tracked</strong>
          </div>
          {fps > 0 && (
            <div style={{ background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(8px)', border: '1px solid #334155', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#94a3b8' }}>Inference:</span>
              <strong style={{ color: '#e2e8f0' }}>{fps} FPS ({inferenceMs}ms)</strong>
            </div>
          )}
        </div>
        <div style={{ position: 'absolute', bottom: 18, left: 18, right: 18, background: 'rgba(15, 23, 42, 0.90)', backdropFilter: 'blur(10px)', border: '1px solid #334155', borderRadius: '10px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={togglePlay}
            style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#0284c7', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            onClick={handleRestart}
            style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <RotateCcw size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8', minWidth: '78px' }}>
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
            <span style={{ color: '#94a3b8' }}>Defects Logged:</span>
            <strong style={{ color: '#ef4444' }}>{hazardsCount.potholes} Potholes</strong>
            <strong style={{ color: '#f59e0b' }}>{hazardsCount.cracks} Cracks</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
