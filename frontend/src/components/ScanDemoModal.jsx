import React, { useRef, useState, useEffect } from 'react';
import { X, Play, Pause, RotateCcw, Loader2, Camera } from 'lucide-react';
import { checkGpuServerHealth, predictTriLayerGpu } from '../utils/gpuService';
import { loadLocalTriLayerModels, predictLocalTriLayer } from '../utils/localTriLayerEngine';
const DEMO_VIDEOS = [
  { id: 'video1', src: '/demo_scans/video1.mp4', label: 'Footage 1' },
  { id: 'video2', src: '/demo_scans/video2.mp4', label: 'Footage 2' },
  { id: 'video3', src: '/demo_scans/video3.mp4', label: 'Footage 3' }
];
export default function ScanDemoModal({ onClose }) {
  const [selectedVideo, setSelectedVideo] = useState(DEMO_VIDEOS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pciScore, setPciScore] = useState(100);
  const [pciRating, setPciRating] = useState('Good');
  const [hazardsCount, setHazardsCount] = useState(0);
  const [vehiclesCount, setVehiclesCount] = useState(0);
  const [gpuServerOnline, setGpuServerOnline] = useState(false);
  const [localModelReady, setLocalModelReady] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [detectedFeed, setDetectedFeed] = useState([]);
  const [enableDefects, setEnableDefects] = useState(true);
  const [enableVehicles, setEnableVehicles] = useState(true);
  const [enableRoad, setEnableRoad] = useState(true);
  const [syncRate, setSyncRate] = useState(1);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const lastTriLayerRef = useRef(null);
  const lastDetectionsRef = useRef([]);
  const isInferringRef = useRef(false);
  const lastInferTimeRef = useRef(0);
  const inferVideoTimeRef = useRef(0);
  const emaLatencyRef = useRef(0);
  const userPausedRef = useRef(false);
  const syncPausedRef = useRef(false);
  const stoppedRef = useRef(false);
  const lastSnapshotTimesRef = useRef({});
  const modelTogglesRef = useRef({ enableDefects: true, enableVehicles: true, enableRoad: true });
  modelTogglesRef.current = { enableDefects, enableVehicles, enableRoad };
  const engineConnected = localModelReady || gpuServerOnline;
  const formatTime = (sec) => {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  const captureTempSnapshot = (videoEl) => {
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = 640;
      offscreen.height = 360;
      const octx = offscreen.getContext('2d');
      octx.drawImage(videoEl, 0, 0, 640, 360);
      if (canvasRef.current) {
        octx.drawImage(canvasRef.current, 0, 0, 640, 360);
      }
      return offscreen.toDataURL('image/jpeg', 0.65);
    } catch {
      return null;
    }
  };
  const handleDefectLogging = (defectsList, videoEl) => {
    if (!defectsList || defectsList.length === 0 || !videoEl) return;
    const now = Date.now();
    for (const d of defectsList) {
      const label = d.display_label || d.displayLabel || d.className || 'Hazard';
      const lastTime = lastSnapshotTimesRef.current[label] || 0;
      if (now - lastTime < 6000) continue;
      lastSnapshotTimesRef.current[label] = now;
      const isPothole = label.toLowerCase().includes('pothole');
      const confScore = d.confidence ? Number(Number(d.confidence).toFixed(2)) : 0.85;
      const sevScore = d.severity || (isPothole ? 4 : 2);
      const videoTimestamp = formatTime(videoEl.currentTime || 0);
      const feedId = `feed_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const dataUrl = captureTempSnapshot(videoEl);
      if (dataUrl) {
        setDetectedFeed(prev => [{
          id: feedId,
          label,
          confidence: Math.round(confScore * 100),
          severity: sevScore,
          isPothole,
          videoTime: videoTimestamp,
          imageSrc: dataUrl
        }, ...prev].slice(0, 60));
      }
    }
  };
  useEffect(() => {
    let active = true;
    const init = async () => {
      checkGpuServerHealth().then(gpuHealth => {
        if (active) {
          setGpuServerOnline(gpuHealth?.online || false);
          setIsWakingUp(!gpuHealth?.online && Boolean(gpuHealth?.wakingUp));
        }
      }).catch(() => {});
      try {
        const loaded = await loadLocalTriLayerModels();
        if (active && loaded?.defectModel && loaded?.twinLiteSession && loaded?.vehicleSession) {
          setLocalModelReady(true);
        }
      } catch {}
    };
    init();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (engineConnected) {
      if (video.readyState >= 2) {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [engineConnected, selectedVideo]);
  const handleSelectVideo = (v) => {
    lastSnapshotTimesRef.current = {};
    emaLatencyRef.current = 0;
    inferVideoTimeRef.current = 0;
    userPausedRef.current = false;
    syncPausedRef.current = false;
    setSyncRate(1);
    if (videoRef.current) videoRef.current.playbackRate = 1;
    setSelectedVideo(v);
    setPciScore(100);
    setPciRating('Good');
    setHazardsCount(0);
    setVehiclesCount(0);
    setDetectedFeed([]);
    setCurrentTime(0);
    lastTriLayerRef.current = null;
    lastDetectionsRef.current = [];
  };
  const togglePlay = () => {
    if (!videoRef.current || !engineConnected) return;
    if (isPlaying) {
      userPausedRef.current = true;
      syncPausedRef.current = false;
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      userPausedRef.current = false;
      syncPausedRef.current = false;
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };
  const handleRestart = () => {
    if (!videoRef.current || !engineConnected) return;
    userPausedRef.current = false;
    syncPausedRef.current = false;
    inferVideoTimeRef.current = 0;
    videoRef.current.currentTime = 0;
    videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
  };
  const handleSeek = (e) => {
    if (!engineConnected) return;
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      inferVideoTimeRef.current = val;
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };
  useEffect(() => {
    stoppedRef.current = false;
    let animId;
    const runInference = async (video, now) => {
      isInferringRef.current = true;
      lastInferTimeRef.current = now;
      inferVideoTimeRef.current = video.currentTime;
      const tStart = performance.now();
      const toggles = modelTogglesRef.current;
      try {
        if (localModelReady) {
          const res = await predictLocalTriLayer(video, toggles);
          if (res && !stoppedRef.current) {
            lastTriLayerRef.current = res;
            const hazs = res.hazards || [];
            lastDetectionsRef.current = hazs;
            setPciScore(res.estimated_pci);
            setPciRating(res.pci_rating);
            setVehiclesCount((res.vehicles || []).length);
            setHazardsCount(hazs.length);
            if (hazs.length > 0) {
              handleDefectLogging(hazs, video);
            }
          }
        } else if (gpuServerOnline) {
          const res = await predictTriLayerGpu(video, 0.15, toggles);
          if (res && !stoppedRef.current) {
            lastTriLayerRef.current = res;
            const hazs = toggles.enableDefects ? (res.hazards || res.detections || []) : [];
            lastDetectionsRef.current = hazs;
            if (res.estimated_pci !== undefined) {
              setPciScore(toggles.enableDefects ? res.estimated_pci : 100);
              setPciRating(toggles.enableDefects ? (res.pci_rating || 'Good') : 'Good');
            }
            setVehiclesCount(toggles.enableVehicles ? (res.vehicles || []).length : 0);
            setHazardsCount(hazs.length);
            if (hazs.length > 0) {
              handleDefectLogging(hazs, video);
            }
          }
        }
      } catch {}
      const elapsed = Math.max(16, performance.now() - tStart);
      emaLatencyRef.current = emaLatencyRef.current ? (emaLatencyRef.current * 0.65 + elapsed * 0.35) : elapsed;
      const targetRate = Math.max(0.12, Math.min(1.0, Math.round((180 / emaLatencyRef.current) * 20) / 20));
      if (videoRef.current && !stoppedRef.current) {
        videoRef.current.playbackRate = targetRate;
        setSyncRate(targetRate);
        if (syncPausedRef.current && !userPausedRef.current && videoRef.current.paused) {
          syncPausedRef.current = false;
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }
      isInferringRef.current = false;
    };
    const renderLoop = (now) => {
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
        const toggles = modelTogglesRef.current;
        const triData = lastTriLayerRef.current;
        const drivablePolys = toggles.enableRoad ? (triData?.drivable_area || []) : [];
        const laneLines = toggles.enableRoad ? (triData?.lane_lines || []) : [];
        const vehicles = toggles.enableVehicles ? (triData?.vehicles || []) : [];
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
        const activeDetections = toggles.enableDefects ? lastDetectionsRef.current : [];
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
        if (isInferringRef.current && !video.paused && !userPausedRef.current && Math.abs(video.currentTime - inferVideoTimeRef.current) > 0.25) {
          syncPausedRef.current = true;
          video.pause();
        }
        if (engineConnected && !isInferringRef.current && now - lastInferTimeRef.current > 40 && video.readyState >= 2 && !userPausedRef.current && (toggles.enableDefects || toggles.enableVehicles || toggles.enableRoad)) {
          runInference(video, now);
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);
    return () => {
      stoppedRef.current = true;
      cancelAnimationFrame(animId);
    };
  }, [gpuServerOnline, engineConnected]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--gov-bg, #f8fafc)', display: 'flex', flexDirection: 'column', color: 'var(--gov-text-primary, #0f172a)', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        .scan-demo-body { display: flex; flex: 1; min-height: 0; overflow: hidden; flex-direction: row; }
        .scan-demo-video-pane { flex: 0 0 70%; min-width: 0; min-height: 0; position: relative; background: #09090b; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .scan-demo-feed-pane { flex: 0 0 30%; min-width: 0; min-height: 0; background: #f8fafc; border-left: 1px solid #e2e8f0; display: flex; flex-direction: column; }
        @media (max-width: 900px) {
          .scan-demo-body { flex-direction: column; }
          .scan-demo-video-pane { flex: 0 0 54%; width: 100%; }
          .scan-demo-feed-pane { flex: 1 1 46%; width: 100%; border-left: none; border-top: 1px solid #e2e8f0; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ padding: '12px 20px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.png" alt="StreetIQ" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>Demo Detections on Footage</span>
              <span style={{ fontSize: '11px', background: engineConnected ? '#dcfce7' : '#fef3c7', color: engineConnected ? '#166534' : '#92400e', border: `1px solid ${engineConnected ? '#bbf7d0' : '#fde68a'}`, padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                {localModelReady ? 'Local Scanner Ready' : gpuServerOnline ? 'Cloud Scanner' : isWakingUp ? 'Connecting...' : 'Loading Models...'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          {DEMO_VIDEOS.map((v) => {
            const isSelected = selectedVideo.id === v.id;
            return (
              <button
                key={v.id}
                onClick={() => handleSelectVideo(v)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: isSelected ? '#111827' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: isSelected ? '#ffffff' : '#475569',
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
        <button
          onClick={onClose}
          style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}
        >
          <X size={15} />
          <span>Close</span>
        </button>
      </div>
      <div className="scan-demo-body">
        <div className="scan-demo-video-pane">
          <video
            ref={videoRef}
            key={selectedVideo.src}
            src={selectedVideo.src}
            playsInline
            muted
            loop
            onCanPlay={() => {
              if (engineConnected && videoRef.current && videoRef.current.paused) {
                videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
              }
            }}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
          />
          {!engineConnected && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(248, 250, 252, 0.92)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px', textAlign: 'center', zIndex: 10 }}>
              <Loader2 size={34} color="#111827" style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                Loading Road Scan Models...
              </div>
              <div style={{ fontSize: '13px', color: '#475569', maxWidth: '380px' }}>
                Downloading and initializing Road Defect, Vehicle Detection, and Road & Lane models. Playback will start automatically once all models are ready.
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(8px)', border: '1px solid #e2e8f0', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)', color: '#0f172a' }}>
            <div>
              <span style={{ color: '#64748b', fontWeight: 600 }}>PCI: </span>
              <strong style={{ color: pciScore >= 80 ? '#16a34a' : pciScore >= 65 ? '#ca8a04' : '#dc2626' }}>{pciScore}/100 ({pciRating})</strong>
            </div>
            <div style={{ width: '1px', height: '12px', background: '#cbd5e1' }}></div>
            <div>
              <span style={{ color: '#64748b', fontWeight: 600 }}>Hazards: </span>
              <strong style={{ color: '#0f172a' }}>{hazardsCount}</strong>
            </div>
            <div style={{ width: '1px', height: '12px', background: '#cbd5e1' }}></div>
            <div>
              <span style={{ color: '#64748b', fontWeight: 600 }}>Vehicles: </span>
              <strong style={{ color: '#0f172a' }}>{vehiclesCount}</strong>
            </div>
            <div style={{ width: '1px', height: '12px', background: '#cbd5e1' }}></div>
            <div>
              <span style={{ color: '#64748b', fontWeight: 600 }}>Sync: </span>
              <strong style={{ color: syncRate < 1 ? '#0284c7' : '#16a34a' }}>{syncRate.toFixed(2).replace(/\.?0+$/, '')}x</strong>
            </div>
          </div>
          <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(8px)', border: '1px solid #e2e8f0', padding: '5px 8px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setEnableDefects(v => !v)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: `1px solid ${enableDefects ? '#111827' : '#cbd5e1'}`,
                background: enableDefects ? '#111827' : '#ffffff',
                color: enableDefects ? '#ffffff' : '#475569',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Road Defects
            </button>
            <button
              type="button"
              onClick={() => setEnableVehicles(v => !v)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: `1px solid ${enableVehicles ? '#111827' : '#cbd5e1'}`,
                background: enableVehicles ? '#111827' : '#ffffff',
                color: enableVehicles ? '#ffffff' : '#475569',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Vehicle Hazard
            </button>
            <button
              type="button"
              onClick={() => setEnableRoad(v => !v)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: `1px solid ${enableRoad ? '#111827' : '#cbd5e1'}`,
                background: enableRoad ? '#111827' : '#ffffff',
                color: enableRoad ? '#ffffff' : '#475569',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Road & Lanes
            </button>
          </div>
          <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.14)', opacity: engineConnected ? 1 : 0.5 }}>
            <button
              onClick={togglePlay}
              disabled={!engineConnected}
              style={{ width: '34px', height: '34px', borderRadius: '6px', background: '#111827', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: engineConnected ? 'pointer' : 'not-allowed' }}
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              onClick={handleRestart}
              disabled={!engineConnected}
              style={{ width: '34px', height: '34px', borderRadius: '6px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: engineConnected ? 'pointer' : 'not-allowed' }}
            >
              <RotateCcw size={14} />
            </button>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', minWidth: '76px', fontVariantNumeric: 'tabular-nums' }}>
              <span>{formatTime(currentTime)}</span> / <span>{formatTime(duration)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              disabled={!engineConnected}
              style={{ flex: 1, cursor: engineConnected ? 'pointer' : 'not-allowed', accentColor: '#111827' }}
            />
          </div>
        </div>
        <div className="scan-demo-feed-pane">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={15} color="#111827" />
                <span>Live Detections</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Temporary live session snapshots
              </div>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 800, background: '#111827', color: '#ffffff', padding: '2px 10px', borderRadius: '12px' }}>
              {detectedFeed.length}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {detectedFeed.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '28px 16px', color: '#64748b' }}>
                <Camera size={28} color="#cbd5e1" style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  {engineConnected ? 'Scanning Roadway...' : 'Waiting for Connection...'}
                </div>
                <div style={{ fontSize: '11px', marginTop: '4px', maxWidth: '220px', lineHeight: '1.45', color: '#64748b' }}>
                  Detected potholes and surface cracks will appear here with captured frames as the footage plays.
                </div>
              </div>
            ) : (
              detectedFeed.map((item) => (
                <div key={item.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}>
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#09090b' }}>
                    <img
                      src={item.imageSrc}
                      alt={item.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <span style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px', background: item.isPothole ? '#dc2626' : '#d97706', color: '#ffffff' }}>
                      Sev {item.severity}/5
                    </span>
                    <span style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'rgba(17, 24, 39, 0.85)', color: '#ffffff' }}>
                      {item.videoTime}
                    </span>
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{item.label}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{item.confidence}% confidence</div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '4px' }}>
                      Session
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
