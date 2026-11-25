import * as ort from 'onnxruntime-web';
ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1;
const PCI_LABELS = {
  0: { raw: 'longitudinal_transverse_crack', display: 'Longitudinal / Transverse Crack', type: 'crack', severity: 3 },
  1: { raw: 'alligator_crack', display: 'Alligator Crack', type: 'crack', severity: 4 },
  2: { raw: 'block_crack', display: 'Block Crack', type: 'crack', severity: 3 },
  3: { raw: 'patching', display: 'Patching', type: 'patch', severity: 2 },
  4: { raw: 'pothole', display: 'Pothole', type: 'pothole', severity: 5 },
  5: { raw: 'weathering_raveling', display: 'Weathering / Raveling', type: 'surface_damage', severity: 2 },
  6: { raw: 'lane_shoulder_drop_off', display: 'Lane / Shoulder Drop-off', type: 'shoulder_drop', severity: 4 },
  7: { raw: 'marking_manhole', display: 'Marking / Manhole', type: 'manhole', severity: 2 },
  8: { raw: 'edge_crack', display: 'Edge Crack', type: 'crack', severity: 3 },
  9: { raw: 'bumps_and_sags', display: 'Bumps and Sags', type: 'surface_damage', severity: 3 }
};
const VEHICLE_META = {
  0: { name: 'Pedestrian', height: 1.7 },
  1: { name: 'Bicycle', height: 1.4 },
  2: { name: 'Car', height: 1.5 },
  3: { name: 'Motorcycle', height: 1.4 },
  5: { name: 'Bus', height: 3.2 },
  7: { name: 'Truck', height: 3.0 }
};
let pciSession = null;
let twinLiteSession = null;
let vehicleSession = null;
let loadingPromise = null;
const prepCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
let vehicleTracks = {};
let nextTrackId = 1;
export async function loadLocalTriLayerModels() {
  if (pciSession && twinLiteSession && vehicleSession) {
    return { defectModel: pciSession, twinLiteSession, vehicleSession };
  }
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const tasks = [];
    if (!pciSession) {
      tasks.push(
        ort.InferenceSession.create('/models/yolo11l_pci.onnx', { executionProviders: ['wasm'] })
          .then(s => { pciSession = s; })
          .catch(() => {})
      );
    }
    if (!twinLiteSession) {
      tasks.push(
        ort.InferenceSession.create('/models/twinlitenet.onnx', { executionProviders: ['wasm'] })
          .then(s => { twinLiteSession = s; })
          .catch(() => {})
      );
    }
    if (!vehicleSession) {
      tasks.push(
        ort.InferenceSession.create('/models/yolo11n.onnx', { executionProviders: ['wasm'] })
          .then(s => { vehicleSession = s; })
          .catch(() => {})
      );
    }
    await Promise.all(tasks);
    loadingPromise = null;
    return { defectModel: pciSession, twinLiteSession, vehicleSession };
  })();
  return loadingPromise;
}
function extractNCHWTensor640(videoEl) {
  if (!prepCanvas) return null;
  prepCanvas.width = 640;
  prepCanvas.height = 640;
  const ctx = prepCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoEl, 0, 0, 640, 640);
  const { data } = ctx.getImageData(0, 0, 640, 640);
  const totalPixels = 640 * 640;
  const floatData = new Float32Array(3 * totalPixels);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = (r + g + b) / 3;
    sum += lum;
    sumSq += lum * lum;
    floatData[i] = r / 255.0;
    floatData[totalPixels + i] = g / 255.0;
    floatData[2 * totalPixels + i] = b / 255.0;
  }
  const mean = sum / totalPixels;
  const std = Math.sqrt(Math.max(0, sumSq / totalPixels - mean * mean));
  return {
    tensor: new ort.Tensor('float32', floatData, [1, 3, 640, 640]),
    isDark: mean < 25 || std < 14
  };
}
function extractDrivableAndLanes(daData, llData) {
  const size = 640;
  const hw = size * size;
  const leftEdge = [];
  const rightEdge = [];
  for (let y = 260; y < size; y += 16) {
    let minX = size;
    let maxX = -1;
    let count = 0;
    const rowOffset = y * size;
    for (let x = 0; x < size; x += 4) {
      const c0 = daData[rowOffset + x];
      const c1 = daData[hw + rowOffset + x];
      const prob = 1.0 / (1.0 + Math.exp(c0 - c1));
      if (prob > 0.62) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        count++;
      }
    }
    if (count >= 12 && maxX - minX >= 48) {
      leftEdge.push([Number((minX / size).toFixed(4)), Number((y / size).toFixed(4))]);
      rightEdge.push([Number((maxX / size).toFixed(4)), Number((y / size).toFixed(4))]);
    }
  }
  const drivableArea = [];
  if (leftEdge.length >= 4) {
    const poly = [...leftEdge, ...rightEdge.reverse()];
    drivableArea.push(poly);
  }
  const laneClusters = [];
  for (let y = 200; y < size; y += 16) {
    const rowOffset = y * size;
    let inSeg = false;
    let segStart = 0;
    for (let x = 0; x < size; x += 2) {
      const c0 = llData[rowOffset + x];
      const c1 = llData[hw + rowOffset + x];
      const prob = 1.0 / (1.0 + Math.exp(c0 - c1));
      if (prob > 0.50) {
        if (!inSeg) {
          inSeg = true;
          segStart = x;
        }
      } else if (inSeg) {
        inSeg = false;
        const cx = (segStart + x) / 2;
        const normPt = [Number((cx / size).toFixed(4)), Number((y / size).toFixed(4))];
        let placed = false;
        for (const cluster of laneClusters) {
          const last = cluster[cluster.length - 1];
          if (Math.abs(last[0] - normPt[0]) < 0.08 && Math.abs(last[1] - normPt[1]) < 0.08) {
            cluster.push(normPt);
            placed = true;
            break;
          }
        }
        if (!placed) laneClusters.push([normPt]);
      }
    }
  }
  const laneLines = laneClusters.filter(c => c.length >= 3);
  return { drivableArea, laneLines };
}
function computeIoU(a, b) {
  const xA = Math.max(a[0], b[0]);
  const yA = Math.max(a[1], b[1]);
  const xB = Math.min(a[2], b[2]);
  const yB = Math.min(a[3], b[3]);
  const inter = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const denom = areaA + areaB - inter;
  return denom > 0 ? inter / denom : 0;
}
function nms(candidates, iouThresh = 0.45) {
  candidates.sort((a, b) => b.conf - a.conf);
  const selected = [];
  for (const cand of candidates) {
    let keep = true;
    for (const s of selected) {
      if (computeIoU(cand.xyxy, s.xyxy) > iouThresh) {
        keep = false;
        break;
      }
    }
    if (keep) selected.push(cand);
  }
  return selected;
}
function parsePciDetections(outputData, threshold = 0.15) {
  const numAnchors = 8400;
  const numClasses = 10;
  const candidates = [];
  for (let i = 0; i < numAnchors; i++) {
    let bestCls = -1;
    let bestScore = threshold;
    for (let c = 0; c < numClasses; c++) {
      const score = outputData[(4 + c) * numAnchors + i];
      if (score > bestScore) {
        bestScore = score;
        bestCls = c;
      }
    }
    if (bestCls === -1) continue;
    const cx = outputData[0 * numAnchors + i];
    const cy = outputData[1 * numAnchors + i];
    const bw = outputData[2 * numAnchors + i];
    const bh = outputData[3 * numAnchors + i];
    if (bw < 8 || bh < 8) continue;
    const x1 = cx - bw / 2;
    const y1 = cy - bh / 2;
    const x2 = cx + bw / 2;
    const y2 = cy + bh / 2;
    const info = PCI_LABELS[bestCls] || { raw: 'unknown', display: 'Unknown', type: 'other', severity: 2 };
    candidates.push({
      conf: bestScore,
      xyxy: [x1, y1, x2, y2],
      bw, bh,
      classIndex: bestCls,
      display_label: info.display,
      displayLabel: info.display,
      className: info.type,
      app_type: info.type,
      severity: info.severity,
      confidence: bestScore,
      bbox: {
        cx: Math.round(cx * 10) / 10,
        cy: Math.round(cy * 10) / 10,
        w: Math.round(bw * 10) / 10,
        h: Math.round(bh * 10) / 10,
        x: Math.round(x1 * 10) / 10,
        y: Math.round(y1 * 10) / 10,
        normalized: {
          x: Number((x1 / 640).toFixed(4)),
          y: Number((y1 / 640).toFixed(4)),
          w: Number((bw / 640).toFixed(4)),
          h: Number((bh / 640).toFixed(4))
        }
      }
    });
  }
  return nms(candidates, 0.45);
}
function parseVehicleDetections(outputData) {
  const numAnchors = 8400;
  const targetClasses = Object.keys(VEHICLE_META).map(Number);
  const candidates = [];
  for (let i = 0; i < numAnchors; i++) {
    let bestCls = -1;
    let bestScore = 0.30;
    for (const clsId of targetClasses) {
      const score = outputData[(4 + clsId) * numAnchors + i];
      if (score > bestScore) {
        bestScore = score;
        bestCls = clsId;
      }
    }
    if (bestCls === -1) continue;
    const cx = outputData[0 * numAnchors + i];
    const cy = outputData[1 * numAnchors + i];
    const bw = outputData[2 * numAnchors + i];
    const bh = outputData[3 * numAnchors + i];
    if (bw < 18 || bh < 18) continue;
    const x1 = cx - bw / 2;
    const y1 = cy - bh / 2;
    const x2 = cx + bw / 2;
    const y2 = cy + bh / 2;
    candidates.push({ clsId: bestCls, conf: bestScore, xyxy: [x1, y1, x2, y2], bw, bh });
  }
  const selected = nms(candidates, 0.45);
  const now = Date.now() / 1000;
  const matchedIds = new Set();
  const tracked = [];
  for (const det of selected) {
    let bestId = null;
    let bestIoU = 0.20;
    for (const tid of Object.keys(vehicleTracks)) {
      if (matchedIds.has(tid)) continue;
      const iou = computeIoU(det.xyxy, vehicleTracks[tid].xyxy);
      if (iou > bestIoU) { bestIoU = iou; bestId = tid; }
    }
    let assignedId = bestId;
    if (!assignedId) {
      assignedId = String(nextTrackId++);
      vehicleTracks[assignedId] = { clsId: det.clsId, xyxy: det.xyxy, h: det.bh, t: now, ttc: 999, lastDhDt: 0 };
    } else {
      const prev = vehicleTracks[assignedId];
      const dt = Math.max(0.01, now - prev.t);
      const dh = det.bh - prev.h;
      const dhDt = dh / dt;
      const smoothed = 0.65 * dhDt + 0.35 * prev.lastDhDt;
      const ttc = smoothed > 1.5 ? Math.round(det.bh / smoothed * 10) / 10 : 999;
      prev.xyxy = det.xyxy;
      prev.h = det.bh;
      prev.t = now;
      prev.ttc = ttc;
      prev.lastDhDt = smoothed;
    }
    matchedIds.add(assignedId);
    const meta = VEHICLE_META[det.clsId];
    const focalPx = 650;
    const distM = Math.round(Math.max(2, Math.min(120, (focalPx * meta.height) / Math.max(1, det.bh))) * 10) / 10;
    const ttcVal = vehicleTracks[assignedId].ttc;
    let alertLevel = 'safe';
    let statusText = 'Safe';
    let color = '#30D158';
    if (ttcVal < 2.0 && distM < 35) {
      alertLevel = 'warning'; statusText = 'COLLISION WARNING'; color = '#FF453A';
    } else if (ttcVal <= 3.5 && distM < 50) {
      alertLevel = 'caution'; statusText = 'APPROACHING'; color = '#FF9F0A';
    }
    tracked.push({
      track_id: Number(assignedId),
      class_name: meta.name,
      confidence: Math.round(det.conf * 100) / 100,
      distance_m: distM,
      ttc_s: ttcVal < 100 ? ttcVal : null,
      alert_level: alertLevel,
      status_text: statusText,
      color,
      bbox: {
        x: Math.round(det.xyxy[0] * 10) / 10,
        y: Math.round(det.xyxy[1] * 10) / 10,
        w: Math.round(det.bw * 10) / 10,
        h: Math.round(det.bh * 10) / 10,
        normalized: {
          x: Number((det.xyxy[0] / 640).toFixed(4)),
          y: Number((det.xyxy[1] / 640).toFixed(4)),
          w: Number((det.bw / 640).toFixed(4)),
          h: Number((det.bh / 640).toFixed(4))
        }
      }
    });
  }
  for (const tid of Object.keys(vehicleTracks)) {
    if (now - vehicleTracks[tid].t > 1.2) delete vehicleTracks[tid];
  }
  return tracked;
}
export async function predictLocalTriLayer(videoEl, options = {}) {
  const { enableDefects = true, enableVehicles = true, enableRoad = true } = options;
  await loadLocalTriLayerModels();
  let hazards = [];
  let drivableArea = [];
  let laneLines = [];
  let vehicles = [];
  let deductPoints = 0;
  const prep = extractNCHWTensor640(videoEl);
  if (!prep) {
    return { hazards: [], drivable_area: [], lane_lines: [], vehicles: [], estimated_pci: 100, pci_rating: 'Good' };
  }
  if (enableDefects && pciSession) {
    try {
      const out = await pciSession.run({ images: prep.tensor });
      const outName = pciSession.outputNames[0];
      hazards = parsePciDetections(out[outName].data, 0.15);
      for (const h of hazards) {
        const sev = h.severity || 2;
        if (sev >= 4) deductPoints += 15;
        else if (sev === 3) deductPoints += 8;
        else deductPoints += 3;
      }
    } catch {}
  }
  if (enableRoad && twinLiteSession && !prep.isDark) {
    try {
      const out = await twinLiteSession.run({ images: prep.tensor });
      const seg = extractDrivableAndLanes(out.da_out.data, out.ll_out.data);
      drivableArea = seg.drivableArea;
      laneLines = seg.laneLines;
    } catch {}
  }
  if (enableVehicles && vehicleSession) {
    try {
      const out = await vehicleSession.run({ images: prep.tensor });
      const outName = vehicleSession.outputNames[0];
      vehicles = parseVehicleDetections(out[outName].data);
    } catch {}
  }
  const estimatedPci = Math.max(0, Math.min(100, 100 - deductPoints));
  const pciRating = estimatedPci >= 85 ? 'Good' : estimatedPci >= 70 ? 'Satisfactory' : estimatedPci >= 55 ? 'Fair' : estimatedPci >= 40 ? 'Poor' : 'Serious';
  return {
    hazards,
    detections: hazards,
    drivable_area: drivableArea,
    lane_lines: laneLines,
    vehicles,
    estimated_pci: estimatedPci,
    pci_rating: pciRating
  };
}