import os
os.environ["YOLO_CONFIG_DIR"] = os.path.join(os.path.dirname(__file__), "..", "..", "yolo_config")
os.makedirs(os.environ["YOLO_CONFIG_DIR"], exist_ok=True)
import io
import time
import base64
import torch
import cv2
import numpy as np
from PIL import Image
from fastapi import APIRouter, File, UploadFile, Form
from pydantic import BaseModel
from typing import Optional
from ultralytics import YOLO
from types import SimpleNamespace
from safetensors.torch import load_file
from .. import twinlite_config as cfg
from ..twinlitenet_model import TwinLiteNetPlus
router = APIRouter(prefix="", tags=["vision"])
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
WEIGHTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "weights")
os.makedirs(WEIGHTS_DIR, exist_ok=True)
PCI_WEIGHTS_PATH = os.path.join(WEIGHTS_DIR, "yolo11l_640_best.pt")
VEHICLE_WEIGHTS_PATH = os.path.join(WEIGHTS_DIR, "yolo11n.pt")
TWINLITE_WEIGHTS_PATH = os.path.join(WEIGHTS_DIR, "model.safetensors")
PCI_CLASS_MAPPING = {
    0: {"raw": "longitudinal_transverse_crack", "display": "Longitudinal / Transverse Crack", "type": "crack", "severity": 3, "astm": 10},
    1: {"raw": "alligator_crack", "display": "Alligator Crack", "type": "crack", "severity": 4, "astm": 1},
    2: {"raw": "block_crack", "display": "Block Crack", "type": "crack", "severity": 3, "astm": 3},
    3: {"raw": "patching", "display": "Patching", "type": "patch", "severity": 2, "astm": 11},
    4: {"raw": "pothole", "display": "Pothole", "type": "pothole", "severity": 5, "astm": 13},
    5: {"raw": "weathering_raveling", "display": "Weathering / Raveling", "type": "surface_damage", "severity": 2, "astm": 19},
    6: {"raw": "lane_shoulder_drop_off", "display": "Lane / Shoulder Drop-off", "type": "shoulder_drop", "severity": 4, "astm": 9},
    7: {"raw": "marking_manhole", "display": "Marking / Manhole", "type": "manhole", "severity": 2, "astm": None},
}
VEHICLE_CLASSES = {
    0: {"name": "Pedestrian", "height": 1.7},
    1: {"name": "Bicycle", "height": 1.4},
    2: {"name": "Car", "height": 1.5},
    3: {"name": "Motorcycle", "height": 1.4},
    5: {"name": "Bus", "height": 3.2},
    7: {"name": "Truck", "height": 3.0},
}
pci_model = None
veh_model = None
twin_model = None
def get_vision_models():
    global pci_model, veh_model, twin_model, PCI_WEIGHTS_PATH, TWINLITE_WEIGHTS_PATH
    if pci_model is not None and veh_model is not None and twin_model is not None:
        return pci_model, veh_model, twin_model
    from huggingface_hub import hf_hub_download
    if not os.path.exists(PCI_WEIGHTS_PATH):
        try:
            PCI_WEIGHTS_PATH = hf_hub_download(repo_id="uzbtrust/smart-road-pci-yolo11", filename="yolo11l_640_best.pt", local_dir=WEIGHTS_DIR)
        except Exception:
            PCI_WEIGHTS_PATH = "yolo11n.pt"
    if not os.path.exists(TWINLITE_WEIGHTS_PATH):
        try:
            TWINLITE_WEIGHTS_PATH = hf_hub_download(repo_id="nielsr/twinlitenetplus-nano", filename="model.safetensors", local_dir=WEIGHTS_DIR)
        except Exception:
            pass
    if pci_model is None:
        pci_model = YOLO(PCI_WEIGHTS_PATH)
        pci_model.to(DEVICE)
    if veh_model is None:
        veh_model = YOLO(VEHICLE_WEIGHTS_PATH if os.path.exists(VEHICLE_WEIGHTS_PATH) else "yolo11n.pt")
        veh_model.to(DEVICE)
    if twin_model is None:
        twin_args = SimpleNamespace(config="nano")
        twin_model = TwinLiteNetPlus(twin_args)
        if os.path.exists(TWINLITE_WEIGHTS_PATH):
            twin_model.load_state_dict(load_file(TWINLITE_WEIGHTS_PATH))
        twin_model.to(DEVICE)
        twin_model.eval()
    return pci_model, veh_model, twin_model
vehicle_tracks = {}
next_track_id = 1
last_global_chime_time = 0
class Base64FrameRequest(BaseModel):
    image: str
    confidence: Optional[float] = 0.15
def compute_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    boxBArea = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])
    denom = float(boxAArea + boxBArea - interArea)
    if denom <= 0:
        return 0.0
    return interArea / denom
def run_tri_layer_detection(img: Image.Image, conf_threshold: float):
    global vehicle_tracks, next_track_id, last_global_chime_time
    pci_model, veh_model, twin_model = get_vision_models()
    t0 = time.perf_counter()
    w, h = img.size
    img_np = np.array(img)
    pci_results = pci_model.predict(
        img,
        imgsz=640,
        conf=conf_threshold,
        classes=list(range(8)),
        device=DEVICE,
        verbose=False
    )
    hazards = []
    counts_by_type = {}
    deduct_points = 0
    if pci_results and len(pci_results) > 0:
        boxes = pci_results[0].boxes
        for box in boxes:
            cls_idx = int(box.cls.item())
            if cls_idx not in PCI_CLASS_MAPPING:
                continue
            conf = float(box.conf.item())
            xyxy = box.xyxy[0].tolist()
            bx1, by1, bx2, by2 = xyxy
            info = PCI_CLASS_MAPPING[cls_idx]
            disp = info["display"]
            app_t = info["type"]
            sev = info["severity"]
            counts_by_type[disp] = counts_by_type.get(disp, 0) + 1
            if sev >= 4:
                deduct_points += 15
            elif sev == 3:
                deduct_points += 8
            else:
                deduct_points += 3
            hazards.append({
                "class_index": cls_idx,
                "display_label": disp,
                "app_type": app_t,
                "severity": sev,
                "confidence": round(conf, 3),
                "bbox": {
                    "x": round(bx1, 1),
                    "y": round(by1, 1),
                    "w": round(bx2 - bx1, 1),
                    "h": round(by2 - by1, 1),
                    "cx": round((bx1 + bx2) / 2, 1),
                    "cy": round((by1 + by2) / 2, 1),
                    "normalized": {
                        "x": round(bx1 / w, 4),
                        "y": round(by1 / h, 4),
                        "w": round((bx2 - bx1) / w, 4),
                        "h": round((by2 - by1) / h, 4)
                    }
                }
            })
    estimated_pci = max(0, min(100, 100 - deduct_points))
    img_mean = float(np.mean(img_np))
    img_std = float(np.std(img_np))
    drivable_area_polygons = []
    lane_line_polygons = []
    if img_mean >= 25.0 and img_std >= 14.0:
        img_resized_640 = cv2.resize(img_np, (640, 640))
        tensor_img = torch.from_numpy(img_resized_640).permute(2, 0, 1).unsqueeze(0).float().to(DEVICE) / 255.0
        with torch.no_grad():
            da_out, ll_out = twin_model(tensor_img)
            da_mask = (torch.softmax(da_out, dim=1)[0, 1] > 0.58).cpu().numpy().astype(np.uint8)
            ll_mask = (torch.softmax(ll_out, dim=1)[0, 1] > 0.50).cpu().numpy().astype(np.uint8)
        da_contours, _ = cv2.findContours(da_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in da_contours:
            if cv2.contourArea(cnt) > 2200:
                epsilon = 0.007 * cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, epsilon, True)
                pts = [[round(p[0][0] / 640.0, 4), round(p[0][1] / 640.0, 4)] for p in approx]
                if len(pts) >= 3:
                    drivable_area_polygons.append(pts)
        ll_contours, _ = cv2.findContours(ll_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in ll_contours:
            if cv2.contourArea(cnt) > 120:
                epsilon = 0.005 * cv2.arcLength(cnt, False)
                approx = cv2.approxPolyDP(cnt, epsilon, False)
                pts = [[round(p[0][0] / 640.0, 4), round(p[0][1] / 640.0, 4)] for p in approx]
                if len(pts) >= 2:
                    lane_line_polygons.append(pts)
    veh_results = veh_model.predict(
        img,
        imgsz=640,
        conf=0.25,
        classes=list(VEHICLE_CLASSES.keys()),
        device=DEVICE,
        verbose=False
    )
    current_time = time.time()
    detected_vehicles = []
    if veh_results and len(veh_results) > 0:
        v_boxes = veh_results[0].boxes
        for box in v_boxes:
            c_idx = int(box.cls.item())
            if c_idx not in VEHICLE_CLASSES:
                continue
            conf = float(box.conf.item())
            xyxy = box.xyxy[0].tolist()
            vx1, vy1, vx2, vy2 = xyxy
            bw = vx2 - vx1
            bh = vy2 - vy1
            if bw < 18 or bh < 18:
                continue
            detected_vehicles.append({
                "cls_idx": c_idx,
                "conf": conf,
                "xyxy": [vx1, vy1, vx2, vy2],
                "cx": (vx1 + vx2) / 2.0,
                "cy": (vy1 + vy2) / 2.0,
                "w": bw,
                "h": bh
            })
    tracked_vehicles = []
    matched_track_ids = set()
    fcw_active = False
    trigger_audio = False
    for det in detected_vehicles:
        best_id = None
        best_iou = 0.20
        det_box = det["xyxy"]
        for tid, trk in vehicle_tracks.items():
            if tid in matched_track_ids:
                continue
            iou = compute_iou(det_box, trk["xyxy"])
            if iou > best_iou:
                best_iou = iou
                best_id = tid
        assigned_id = best_id
        if assigned_id is None:
            assigned_id = next_track_id
            next_track_id += 1
            vehicle_tracks[assigned_id] = {
                "cls_idx": det["cls_idx"],
                "xyxy": det_box,
                "h": det["h"],
                "t": current_time,
                "ttc": 999.0,
                "last_dh_dt": 0.0,
                "last_alert_time": 0.0
            }
        else:
            prev_trk = vehicle_tracks[assigned_id]
            dt = max(0.01, current_time - prev_trk["t"])
            dh = det["h"] - prev_trk["h"]
            dh_dt = dh / dt
            smoothed_dh_dt = 0.65 * dh_dt + 0.35 * prev_trk["last_dh_dt"]
            if smoothed_dh_dt > 1.5:
                calculated_ttc = round(det["h"] / smoothed_dh_dt, 1)
            else:
                calculated_ttc = 999.0
            prev_trk["xyxy"] = det_box
            prev_trk["h"] = det["h"]
            prev_trk["t"] = current_time
            prev_trk["ttc"] = calculated_ttc
            prev_trk["last_dh_dt"] = smoothed_dh_dt
        matched_track_ids.add(assigned_id)
        v_meta = VEHICLE_CLASSES[det["cls_idx"]]
        nominal_h = v_meta["height"]
        focal_px = 650.0 * (w / 640.0)
        dist_m = round(max(2.0, min(120.0, (focal_px * nominal_h) / max(1.0, det["h"]))), 1)
        ttc_val = vehicle_tracks[assigned_id]["ttc"]
        if ttc_val < 2.0 and dist_m < 35.0:
            alert_lvl = "warning"
            status_txt = "COLLISION WARNING"
            color_hex = "#FF453A"
            fcw_active = True
            trk_record = vehicle_tracks[assigned_id]
            time_since_alert = current_time - trk_record["last_alert_time"]
            dh_surge = (trk_record["last_dh_dt"] - prev_trk.get("last_dh_dt", 0)) / max(0.1, abs(prev_trk.get("last_dh_dt", 1.0)))
            if time_since_alert >= 4.0 or dh_surge >= 0.40:
                trigger_audio = True
                trk_record["last_alert_time"] = current_time
                last_global_chime_time = current_time
        elif ttc_val <= 3.5 and dist_m < 50.0:
            alert_lvl = "caution"
            status_txt = "APPROACHING"
            color_hex = "#FF9F0A"
        else:
            alert_lvl = "safe"
            status_txt = "Safe"
            color_hex = "#30D158"
        tracked_vehicles.append({
            "track_id": assigned_id,
            "class_name": v_meta["name"],
            "confidence": round(det["conf"], 2),
            "distance_m": dist_m,
            "ttc_s": ttc_val if ttc_val < 100.0 else None,
            "alert_level": alert_lvl,
            "status_text": status_txt,
            "color": color_hex,
            "bbox": {
                "x": round(det["xyxy"][0], 1),
                "y": round(det["xyxy"][1], 1),
                "w": round(det["w"], 1),
                "h": round(det["h"], 1),
                "normalized": {
                    "x": round(det["xyxy"][0] / w, 4),
                    "y": round(det["xyxy"][1] / h, 4),
                    "w": round(det["w"] / w, 4),
                    "h": round(det["h"] / h, 4)
                }
            }
        })
    expired_ids = [tid for tid, trk in vehicle_tracks.items() if current_time - trk["t"] > 1.2]
    for tid in expired_ids:
        del vehicle_tracks[tid]
    latency_ms = (time.perf_counter() - t0) * 1000
    pci_cat = "Good" if estimated_pci >= 85 else "Satisfactory" if estimated_pci >= 70 else "Fair" if estimated_pci >= 55 else "Poor" if estimated_pci >= 40 else "Serious"
    return {
        "device": DEVICE,
        "inference_ms": round(latency_ms, 1),
        "fps": round(1000 / max(latency_ms, 0.001), 1),
        "hazards": hazards,
        "detections": hazards,
        "counts": counts_by_type,
        "total_hazards": len(hazards),
        "estimated_pci": estimated_pci,
        "pci_rating": pci_cat,
        "drivable_area": drivable_area_polygons,
        "lane_lines": lane_line_polygons,
        "vehicles": tracked_vehicles,
        "fcw_alert": fcw_active,
        "fcw_audio": trigger_audio
    }
@router.get("/health/vision")
def vision_health():
    return {
        "status": "online",
        "device": DEVICE,
        "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
        "vram_total_mb": round(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024)) if torch.cuda.is_available() else 0,
        "layers": {
            "layer_1": "uzbtrust/smart-road-pci-yolo11",
            "layer_2": "TwinLiteNet+ (nano/safetensors)",
            "layer_3": "yolo11n + Optical Kinematic TTC"
        }
    }
@router.post("/predict/tri_layer")
async def predict_tri_layer(req: Base64FrameRequest):
    img_data = req.image
    if "," in img_data:
        img_data = img_data.split(",", 1)[1]
    image_bytes = base64.b64decode(img_data)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return run_tri_layer_detection(image, req.confidence or 0.15)
@router.post("/predict/frame")
async def predict_frame(file: UploadFile = File(...), confidence: float = Form(0.15)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    return run_tri_layer_detection(image, confidence)
@router.post("/predict/base64")
async def predict_base64(req: Base64FrameRequest):
    img_data = req.image
    if "," in img_data:
        img_data = img_data.split(",", 1)[1]
    image_bytes = base64.b64decode(img_data)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return run_tri_layer_detection(image, req.confidence or 0.15)
