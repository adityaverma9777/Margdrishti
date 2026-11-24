import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Square, AlertTriangle, ShieldCheck, CheckCircle, Volume2, VolumeX, Eye, ArrowLeft, Camera, Activity, Gauge } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function SurveyCockpit({ task, initialStream, onFinish }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const graphCanvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const stoppedRef = useRef(false);
  const lastAlertTimeRef = useRef(0);

  const [currentSpeed, setCurrentSpeed] = useState(24);
  const [targetSpeed] = useState(task?.target_speed_kmh || 25);
  const [pciScore, setPciScore] = useState(100);
  const [detectionsCount, setDetectionsCount] = useState({ potholes: 0, cracks: 0, patches: 0, total: 0 });
  const [fcwActive, setFcwActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [telemetryHistory, setTelemetryHistory] = useState([]);

  const playCollisionChime = useCallback(() => {
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
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    stoppedRef.current = false;
    let localStream = initialStream;
    const initCamera = async () => {
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
    initCamera();

    const timer = setInterval(() => {
      if (stoppedRef.current) return;
      setElapsedSeconds(s => s + 1);
      setCurrentSpeed(prev => {
        const jitter = (Math.random() - 0.48) * 1.4;
        const next = Math.max(16, Math.min(32, prev + jitter));
        return Math.round(next * 10) / 10;
      });
      setDistanceKm(d => Math.round((d + (24 / 3600)) * 100) / 100);
    }, 1000);

    return () => {
      stoppedRef.current = true;
      clearInterval(timer);
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [initialStream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const renderLoop = (time) => {
      if (stoppedRef.current) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (videoRef.current && videoRef.current.readyState >= 2) {
        ctx.drawImage(videoRef.current, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
      }

      ctx.fillStyle = 'rgba(10, 132, 255, 0.22)';
      ctx.beginPath();
      ctx.moveTo(w * 0.38, h * 0.48);
      ctx.lineTo(w * 0.62, h * 0.48);
      ctx.lineTo(w * 0.88, h);
      ctx.lineTo(w * 0.12, h);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(100, 210, 255, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.38, h * 0.48);
      ctx.lineTo(w * 0.12, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(w * 0.62, h * 0.48);
      ctx.lineTo(w * 0.88, h);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.setLineDash([12, 16]);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.48);
      ctx.lineTo(w * 0.5, h);
      ctx.stroke();
      ctx.setLineDash([]);

      const cycle = (time % 8000) / 8000;
      let hasCollisionAlert = false;

      if (cycle > 0.1 && cycle < 0.65) {
        const leadX = w * 0.46;
        const leadY = h * 0.44 + (cycle * h * 0.15);
        const leadW = 70 + (cycle * 90);
        const leadH = 50 + (cycle * 65);
        const ttc = Math.max(1.4, Math.round((4.2 - (cycle * 3.5)) * 10) / 10);
        const distM = Math.max(8, Math.round(35 - (cycle * 28)));
        const isCritical = ttc < 2.0;

        if (isCritical) {
          hasCollisionAlert = true;
          playCollisionChime();
        }

        const bracketColor = isCritical ? '#dc2626' : ttc < 3.2 ? '#d97706' : '#16a34a';
        ctx.strokeStyle = bracketColor;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(leadX - leadW / 2, leadY - leadH / 2, leadW, leadH);

        ctx.fillStyle = bracketColor;
        ctx.font = 'bold 11px Inter, sans-serif';
        const tagText = `${isCritical ? '⚠️ COLLISION WARNING' : 'Vehicle'} · ${distM}m (${ttc}s TTC)`;
        const tagW = ctx.measureText(tagText).width + 12;
        ctx.fillRect(leadX - leadW / 2, leadY - leadH / 2 - 20, tagW, 20);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(tagText, leadX - leadW / 2 + 6, leadY - leadH / 2 - 6);
      }

      setFcwActive(hasCollisionAlert);

      if (cycle > 0.4 && cycle < 0.95) {
        const potY = h * 0.65 + ((cycle - 0.4) * h * 0.5);
        const potX = w * 0.32;
        const potW = 90;
        const potH = 45;

        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(potX, potY, potW, potH);
        ctx.fillStyle = 'rgba(220, 38, 38, 0.15)';
        ctx.fillRect(potX, potY, potW, potH);

        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillRect(potX, potY - 18, 140, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🕳️ POTHOLE (Sev: 5)', potX + 6, potY - 5);
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [playCollisionChime]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (stoppedRef.current) return;
      const detectedInStep = Math.random() < 0.18 ? 1 : 0;
      if (detectedInStep) {
        setDetectionsCount(c => ({ ...c, potholes: c.potholes + 1, total: c.total + 1 }));
        setPciScore(p => Math.max(35, p - 3));
      }
      setTelemetryHistory(hist => {
        const next = [...hist, {
          time: elapsedSeconds,
          speed: currentSpeed,
          hazardCount: detectedInStep
        }];
        return next.slice(-40);
      });
    }, 1500);
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
      avg_speed_kmh: 24.2,
      max_speed_kmh: 31.0,
      total_hazards_count: detectionsCount.total,
      calculated_pci: pciScore,
      pci_category: pciScore >= 80 ? 'Good' : pciScore >= 65 ? 'Satisfactory' : 'Fair',
      status: 'completed',
      created_at: new Date().toISOString()
    };
    try {
      await supabase.from('survey_trips').insert([finalTrip]);
    } catch {}
    alert(`Survey completed! Total distance: ${distanceKm} km • Defect count: ${detectionsCount.total} • Pavement Index: ${pciScore}/100`);
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
            <div style={{ fontSize: '15px', fontWeight: 800 }}>{task?.road_name || task?.title || 'Active Survey Drive'}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Target Speed: {targetSpeed} km/h • GPS Lock: 1.2m Accuracy</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{ background: 'none', border: 'none', color: soundEnabled ? '#38bdf8' : '#94a3b8', cursor: 'pointer' }}
            title={soundEnabled ? 'Collision sound enabled' : 'Sound muted'}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <div style={{ background: currentSpeed > 32 ? 'rgba(220, 38, 38, 0.25)' : 'rgba(22, 163, 74, 0.25)', border: `1px solid ${currentSpeed > 32 ? '#dc2626' : '#16a34a'}`, padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: currentSpeed > 32 ? '#f87171' : '#4ade80' }}>
            {currentSpeed} km/h (Speed Compliant)
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
          <div style={{ position: 'absolute', top: 16, background: 'rgba(220, 38, 38, 0.92)', color: '#ffffff', padding: '8px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 800, letterSpacing: '0.5px', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.5)', display: 'flex', alignItems: 'center', gap: '8px', animation: 'pulse 1s infinite' }}>
            <AlertTriangle size={18} />
            <span>COLLISION WARNING — MAINTAIN DISTANCE</span>
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
            <span style={{ color: '#94a3b8' }}>PCI:</span> <strong style={{ color: pciScore >= 80 ? '#4ade80' : '#fbbf24' }}>{pciScore}/100</strong>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>Hazards Found:</span> <strong style={{ color: '#f87171' }}>{detectionsCount.total}</strong>
          </div>
        </div>
      </div>

      <div style={{ background: '#ffffff', borderTop: '1px solid #cbd5e1', padding: '12px 18px', color: '#0f172a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.5px' }}>
            Synchronized Road Survey Telemetry (Speed vs. Hazard Frequency)
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            Blue Line: Vehicle Velocity (km/h) • Red Dots: Logged Hazards
          </div>
        </div>
        <div style={{ height: '100px', width: '100%' }}>
          <canvas ref={graphCanvasRef} width={800} height={100} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </div>
  );
}
