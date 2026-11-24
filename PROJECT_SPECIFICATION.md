# StreetIQ Gov — Government Road Survey & Pavement Quality Audit Platform
## Complete Technical Architecture, System Specification & Implementation Blueprint

---

## 1. Executive Overview

**StreetIQ Gov** is an enterprise-grade government survey and road quality intelligence platform engineered for public works departments (PWD), national/state highway authorities (e.g., NHAI, State PWDs), and municipal corporations. 

The platform bridges real-time vehicle-mounted automated vision surveys with government oversight desks:
- **Survey Crews (Detection Vehicles)** execute standardized, automated camera inspections along defined road stretches with live telemetry, speed governance, pre-flight hardware audits, and dual-axis telemetry graphs.
- **Government Officials (Supervisors & Engineers)** manage vehicle fleets, assign jurisdictional boundaries, monitor geofence adherence, review trip timelines, audit detected hazards, advance repair workflows, dispatch new road survey tasks, and generate formal compliance reports.
- **Unified Tri-Layer Vision Perception**: During live survey drives, the vehicle viewport renders a synchronized composite of:
  1. **Road Defect Intelligence (ASTM D6433)**: Potholes, cracks, and distresses detected by `uzbtrust/smart-road-pci-yolo11`.
  2. **Drivable Road Surface & Lane Markings**: Clean semi-transparent light blue road overlay and lane boundaries via **TwinLiteNet+**.
  3. **Traffic Perception & Forward Collision Warning (FCW)**: Vehicle tracking with optical expansion Time-to-Collision (TTC) alerts and anti-spam audio chimes.

---

## 2. Personas & Access Control

| Feature / Capability | Surveyor (Crew / Vehicle) | Desk Official (Engineer / Admin) |
|---|:---:|:---:|
| Unified Authentication | Yes (`surveyor` role) | Yes (`official` role) |
| Jurisdictional Region Filtering | View Assigned State/City/Stretches | Define & Reassign All Regions |
| Start & Navigate Road Surveys | Yes (Assigned / Custom stretch) | No (Review & Monitor only) |
| Pre-Flight Hardware & Camera Check | Mandatory before survey start | View Telemetry & Health Logs |
| Live Tri-Layer Vision HUD (Road, Lanes, Hazards, Vehicles) | View Real-Time Full Screen HUD | View Recorded Audit Playback |
| Live Speed & Detection Telemetry Graphs | View Real-Time (Read-Only) | View Historical Archive |
| Alter Raw Hazard & Telemetry Data | **Strictly Forbidden** (Immutable) | **Strictly Forbidden** (Audit Integrity) |
| Defect Workflow Actions | Read-Only Status | Edit (*Mark Fit*, *Scan Again*, *Fixed*) |
| Fleet & Vehicle Account Creation | No | Yes (Full CRUD) |
| Geofence Deviation Alerts | Real-time warning notification | Real-time alert ping & fleet log |
| Task Dispatch & Waypoint Routing | Receive, Accept, Reply | Create, Assign, Edit, Revoke |
| Formal Government PDF Reports | View Summary | Generate, Configure & Print |

---

## 3. Core Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               StreetIQ Gov Web Platform                                │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│              Surveyor Portal              │              Official Portal               │
│  - 5-Point Pre-flight hardware audit      │  - Fleet jurisdiction & geofence manager   │
│  - Tri-Layer Vision HUD (Road, FCW, PCI)  │  - Trip defect validation board            │
│  - Turn-by-turn route guidance            │  - Interactive task dispatcher             │
│  - Speed & hazard timeline graphs         │  - Formal PDF compliance generator         │
│  - Auto-compressed snapshot sync          │  - Surveyor reply notification centre      │
└─────────────────────┬─────────────────────┴──────────────────────┬─────────────────────┘
                      │                                            │
                      ▼                                            ▼
┌───────────────────────────────────────────┐ ┌──────────────────────────────────────────┐
│      Edge Vision & Telemetry Engine       │ │             Supabase Backend             │
│  - Layer 1: YOLO11-L ASTM D6433 Model     │ │  - PostGIS Spatial Database              │
│  - Layer 2: TwinLiteNet+ Drivable Area    │ │  - Realtime WebSockets                   │
│  - Layer 3: Vehicle Tracker & TTC Engine  │ │  - Edge Storage (Compressed JPEG)        │
│  - HTML5 Geolocation (<5m lock)           │ │  - Row Level Security (RLS)              │
│  - Web Audio alert chime                  │ │  - Fleet Audit Logging                   │
└───────────────────────────────────────────┘ └──────────────────────────────────────────┘
```

- **Frontend**: React 18, Vite, React Router 6, Lucide Icons, Canvas API for 60 FPS segmentation blending, Chart.js for real-time telemetry curves.
- **Mapping & Spatial Engine**: Leaflet with OpenStreetMap vector/raster base layers, OSRM routing engine, and OpenStreetMap Overpass API for Highway classifications (NH, SH, MDR, Urban).
- **Inference & Acceleration**:
  - Local NVIDIA CUDA GPU Server (`backend/gpu_server.py`) running FP16 inference on RTX 3050 (6GB VRAM) @ 25–30 FPS combined.
  - Fallback: In-browser WebGPU / ONNX Runtime Web.
- **Database & Storage**: Supabase (PostgreSQL with PostGIS extension for spatial queries, GeoJSON boundary matching, and edge snapshot buckets).

---

## 4. The Tri-Layer Multi-Model Vision Pipeline

### 4.1. Comparative Evaluation & Model Selection

To achieve robust real-time survey execution without GPU bottlenecking, the perception stack is decomposed into three specialized, high-efficiency models running in a pipeline:

| Perception Goal | Candidate Models Evaluated | Selected Architecture | Key Reason for Selection |
|---|---|---|---|
| **1. Road Distress & PCI Rating** | YOLOv8m vs. YOLO11-Large | **`uzbtrust/smart-road-pci-yolo11`** (YOLO11-L @ 640) | Specifically trained on 40,994 road damage images across ASTM D6433 classes. Superior mAP50 (0.657) and direct PCI deduct scoring. |
| **2. Road Surface & Lane Segmentation** | YOLOP vs. YOLOPv2 vs. TwinLiteNet+ | **`TwinLiteNet+` (Small/Medium ONNX)** | Ultra-lightweight (0.4M–1.9M params, 92.9% mIoU drivable area). Runs in ~4 ms on GPU. Outputs distinct binary drivable-area mask (`da`) and lane lines (`ll`) without stealing compute from YOLO11. |
| **3. Traffic Vehicles & Collision Alerts** | RF-DETR vs. YOLOX vs. YOLO11n | **YOLO11n / DriveIndia Class Adapter + Optical Kinematic TTC** | Depth Anything V2 only outputs unitless relative depth (cannot measure actual meters). Optical expansion kinematic rate ($h / \dot{h}$) provides instantaneous, rock-solid Time-To-Collision (TTC) regardless of camera calibration. |

---

### 4.2. Layer 1: Road Distress & ASTM D6433 PCI Intelligence
- **Model**: `yolo11l_640_best.pt`
- **Resolution**: 640×640 px
- **Taxonomy (8 Classes)**:
  - `0`: Longitudinal & Transverse Crack (ASTM 10)
  - `1`: Alligator Crack (ASTM 1)
  - `2`: Block Crack (ASTM 3)
  - `3`: Road Patching (ASTM 11)
  - `4`: Pothole (ASTM 13)
  - `5`: Weathering / Raveling (ASTM 19)
  - `6`: Lane / Shoulder Drop-off (ASTM 9)
  - `7`: Marking / Manhole
- **Output**: Bounding box coordinates, confidence scores, severity rating (1–5), and live ASTM D6433 Pavement Condition Index (PCI) score deduction.

---

### 4.3. Layer 2: Road Surface & Lane Line Segmentation (Light Blue Overlay)
- **Model**: `TwinLiteNet+`
- **Input**: 640×360 or 640×640 RGB frame
- **Latency**: $\approx 4\text{ ms}$ on CUDA
- **Outputs**:
  - `da` (Drivable Area): Binary mask indicating valid navigable asphalt.
  - `ll` (Lane Lines): Continuous delineation of lane boundaries and highway dividers.
- **Canvas Rendering Specification**:
  - Drivable surface rendered as a smooth semi-transparent **Light Blue Mask**: `rgba(10, 132, 255, 0.28)`.
  - Lane edges delineated with crisp **Cyan / White Contours**: `rgba(100, 210, 255, 0.85)` with a 3px stroke width.
  - Off-road / shoulder areas left unshaded to provide clear visual contrast.

---

### 4.4. Layer 3: ADAS Vehicle Detection, Kinematic TTC & Collision Warnings
- **Target Objects**: Cars, commercial trucks, buses, auto-rickshaws, two-wheelers, pedestrians.
- **Metric Distance & Time-to-Collision (TTC) Mathematics**:
  Monocular relative depth models cannot provide reliable physical distances without intensive lidar ground-truth calibration. Instead, the system applies the proven **optical expansion kinematic equation**:
  $$\text{TTC} = \frac{h_t}{\left( \frac{h_t - h_{t-\Delta t}}{\Delta t} \right)}$$
  Where $h_t$ is the vertical pixel height of the vehicle's bounding box at time $t$.
  Estimated physical distance $D$ is calculated using pinhole projection:
  $$D \approx \frac{f \cdot H_{\text{real}}}{h_t}$$
  Where $f$ is camera focal length and $H_{\text{real}}$ is nominal vehicle class height.

- **Collision State Machine**:
  - **Level 1: Safe Following Distance** ($\text{TTC} > 3.5\text{ s}$ or trailing steady): Target vehicle bracketed in subtle **Green** (`#30D158`). Distance readout displayed (e.g., `24m · Safe`).
  - **Level 2: Closing / Caution** ($2.0\text{ s} \le \text{TTC} \le 3.5\text{ s}$): Target vehicle bracketed in **Amber** (`#FF9F0A`). HUD warns `APPROACHING · 18m`.
  - **Level 3: Forward Collision Warning (FCW)** ($\text{TTC} < 2.0\text{ s}$): Target vehicle bracketed in pulsing **Red** (`#FF453A`). Top banner flashes **COLLISION WARNING — BRAKE**. Web Audio synthesizer emits an 880Hz alert chime.
- **Anti-Spam Alert Logic**:
  To prevent driver fatigue during slow-moving traffic, collision audio chimes fire at most once every 4 seconds for the same vehicle ID unless the closing rate $\frac{\Delta h}{\Delta t}$ surges by $\ge 40\%$.

---

### 4.5. Unified Detector Vehicle HUD Viewport

The detector vehicle crew views a unified, zero-clutter canvas viewport composite:

```
┌────────────────────────────────────────────────────────────────────────┐
│  [● LIVE SURVEY]  SPEED: 26 km/h (TARGET: 25)  PCI: 84  GPS: 0.9m ACC  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                       [ ▲ 28m · 3.8s · Safe ]                          │
│                          ┌─────────────┐                               │
│                          │ Leading Car │                               │
│                          └─────────────┘                               │
│         /                                             \                │
│        /   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   \               │
│       /    ░░ LIGHT BLUE DRIVABLE AREA OVERLAY ░░░   \              │
│      /     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    \             │
│     /                                                    \            │
│    /          ┌──────────────────────┐                    \           │
│   /           │ 🕳️ POTHOLE (88%)     │                     \          │
│  /            │ Sev: 5 · ASTM 13     │                      \         │
│ /             └──────────────────────┘                       \        │
│/══════════════════════════════════════════════════════════════\       │
├────────────────────────────────────────────────────────────────────────┤
│  [SPEED TIMELINE GRAPH] ━━━━━━━━━━━━━━━━━━━━━━━━━ (26 km/h)           │
│  [HAZARDS TIMELINE]     ───●──────●──●─────────── (3 Detections)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Complete Database Schema (PostGIS & Supabase)

### 5.1. Tables

#### `gov_profiles`
- `id` (UUID, PK, references `auth.users`)
- `role` (`'surveyor'` | `'official'`)
- `full_name` (Text)
- `department` (Text)
- `phone` (Text)
- `assigned_state` (Text)
- `assigned_city` (Text)
- `created_at` (TIMESTAMPTZ)

#### `survey_vehicles`
- `id` (UUID, PK)
- `vehicle_number` (Text, e.g., "AS-01-BX-4021")
- `model_name` (Text)
- `driver_name` (Text)
- `crew_members` (Text[])
- `jurisdiction_name` (Text)
- `jurisdiction_polygon` (GEOMETRY(POLYGON, 4326))
- `status` (`'idle'` | `'in_survey'` | `'transit'` | `'offline'`)
- `last_heartbeat` (TIMESTAMPTZ)
- `last_location` (GEOMETRY(POINT, 4326))
- `created_at` (TIMESTAMPTZ)

#### `survey_tasks`
- `id` (UUID, PK)
- `title` (Text)
- `assigned_vehicle_id` (UUID, FK -> `survey_vehicles.id`)
- `created_by` (UUID, FK -> `gov_profiles.id`)
- `road_name` (Text)
- `highway_type` (`'NH'` | `'SH'` | `'MDR'` | `'Urban'`)
- `start_location` (GEOMETRY(POINT, 4326))
- `end_location` (GEOMETRY(POINT, 4326))
- `start_address` (Text)
- `end_address` (Text)
- `target_speed_kmh` (NUMERIC, default 25.0)
- `distance_km` (NUMERIC)
- `official_notes` (Text)
- `status` (`'pending'` | `'accepted'` | `'in_progress'` | `'completed'` | `'declined'`)
- `surveyor_reply` (Text)
- `reply_unread_by_official` (BOOLEAN, default false)
- `created_at` (TIMESTAMPTZ)

#### `survey_trips`
- `id` (UUID, PK)
- `task_id` (UUID, Nullable, FK -> `survey_tasks.id`)
- `vehicle_id` (UUID, FK -> `survey_vehicles.id`)
- `surveyor_id` (UUID, FK -> `gov_profiles.id`)
- `state` (Text)
- `city` (Text)
- `start_time` (TIMESTAMPTZ)
- `end_time` (TIMESTAMPTZ)
- `total_distance_km` (NUMERIC)
- `avg_speed_kmh` (NUMERIC)
- `max_speed_kmh` (NUMERIC)
- `total_hazards_count` (INTEGER, default 0)
- `calculated_pci` (INTEGER)
- `pci_category` (`'Good'` | `'Satisfactory'` | `'Fair'` | `'Poor'` | `'Serious'`)
- `trip_route_geojson` (GEOMETRY(LINESTRING, 4326))
- `status` (`'in_progress'` | `'completed'` | `'aborted'`)

#### `survey_detections`
- `id` (UUID, PK)
- `trip_id` (UUID, FK -> `survey_trips.id`)
- `vehicle_id` (UUID, FK -> `survey_vehicles.id`)
- `timestamp` (TIMESTAMPTZ)
- `location` (GEOMETRY(POINT, 4326))
- `lat` (DOUBLE PRECISION)
- `lon` (DOUBLE PRECISION)
- `speed_kmh` (NUMERIC)
- `defect_type` (Text)
- `display_label` (Text)
- `astm_code` (INTEGER)
- `confidence` (NUMERIC)
- `severity` (INTEGER, 1-5 scale)
- `image_url` (Text, Supabase Storage)
- `action_status` (`'pending_review'` | `'fit'` | `'not_proper'` | `'rescan_required'` | `'in_validation'` | `'fixed'`)
- `official_remarks` (Text)
- `reviewed_by` (UUID, Nullable, FK -> `gov_profiles.id`)
- `reviewed_at` (TIMESTAMPTZ)

#### `vehicle_telemetry_logs`
- `id` (BIGSERIAL, PK)
- `trip_id` (UUID, FK -> `survey_trips.id`)
- `elapsed_seconds` (NUMERIC)
- `distance_m` (NUMERIC)
- `speed_kmh` (NUMERIC)
- `detections_in_window` (INTEGER, default 0)
- `location` (GEOMETRY(POINT, 4326))

---

## 6. Detailed Module Specifications

### 6.1. Surveyor Portal & Survey Execution

#### A. Region & Stretch Explorer
- State and City selector.
- Highway Classification Layers on Map:
  - **National Highways (NH)**: Red color code (`highway=trunk|motorway`).
  - **State Highways (SH)**: Orange color code (`highway=primary`).
  - **Major District Roads (MDR)**: Blue color code (`highway=secondary`).
  - **Survey Status**: Solid vibrant glow for recently surveyed stretches, dashed gray for uninspected sections.

#### B. 5-Point Pre-Flight Diagnostic Check
Mandatory modal check before survey launch:
1. **GPU Inference Engine**: Confirms connection to `http://127.0.0.1:8000/health` (CUDA RTX 3050). Verifies all 3 vision models (YOLO11, TwinLiteNet, Vehicle Detector) are loaded into VRAM.
2. **Camera Sensor Stream**: Verifies video aspect, minimum 720p resolution, exposure stability, and autofocus lock.
3. **GPS Precision**: Verifies accuracy radius $\le 5$ meters. If $> 8$m, alerts surveyor to reposition antenna.
4. **Motion Gate Calibration**: Ensures speed readings are synchronized.
5. **Storage & Cloud Handshake**: Validates Supabase write permissions.

#### C. Navigation to Stretch Start
- Surveyor enters start/end road coordinates or accepts assigned task.
- If current vehicle location is $> 100$ meters from the starting point:
  - The map displays turn-by-turn routing to reach the designated start pin.
  - Scan controls remain locked until the vehicle arrives within 25 meters of the start point.

#### D. Live Survey Mode
- Target speed guidance (typically 20–30 km/h).
- Real-time Tri-Layer HUD: Light blue road surface, lane markings, ASTM defect bounding boxes, leading vehicle brackets with TTC, and forward collision audio chimes.
- Dual Synchronized Telemetry Graphs:
  - Speed vs. Time
  - Distress frequency vs. Time
- Auto-compression of defect snapshots (JPEG 80%) before cloud upload.
- Surveyor screen is strictly read-only for recorded telemetry.

---

### 6.2. Government Official Portal & Fleet Management

#### A. Fleet Overview & Geofence Guard
- Live map tracking all registered inspection vehicles.
- Vehicle cards showing crew names, registration, and assigned municipal polygon.
- **Geofence Monitor**: Automated alerts if a vehicle exits its zone or scans an unauthorized stretch.

#### B. Trip Review & Defect Action Matrix
- Selection of any vehicle surfaces its historical survey trips.
- Selection of a trip loads:
  - Route polyline with defect pins.
  - ASTM D6433 Pavement Condition Index (PCI) score card.
  - Synchronized Speed & Detection Timeline graphs.
  - Defect Ledger with photo evidence, GPS coordinates, and speed.
- **Defect Workflow Actions**:
  - `Mark as Fit`: Minor surface mark dismissed.
  - `Not Properly Detected`: False positive flagged for model retraining.
  - `Scan Again`: Required re-inspection.
  - `Gone for Validation`: Physical field verification required.
  - `Fixed`: Road work completed by maintenance contractor.

#### C. Interactive Task Dispatcher
- Select vehicle -> Click **Assign New Task**.
- Choose road stretch on interactive map (start/end waypoints).
- Set target inspection speed, due date, priority (*Urgent*, *Routine*, *Post-Monsoon*), and custom field notes.
- Dispatched task appears immediately on the vehicle's dashboard.
- Surveyor accepts or replies with notes.
- Surveyor replies immediately display a **Red Notification Dot** on that vehicle's card in the official panel.

#### D. Formal Government Compliance Reports
- One-click PDF report generation:
  - Official PWD/NHAI header block.
  - Survey metadata (Vehicle ID, Crew Names, Inspection Date, Total KM).
  - Pavement Condition Index (PCI) summary and defect severity breakdown.
  - Tabular defect ledger with geo-coordinates, ASTM classification, and photo evidence.

---

## 7. Implementation Phasing Roadmap

```
Phase 1: Project Setup & Authentication Gateway
   ├── Vite + React project scaffolding in 'street iq gov'
   ├── Supabase Auth integration & role router (Surveyor vs. Official)
   └── Reusable design tokens & responsive layout shell

Phase 2: Database Migrations & PostGIS Geofencing
   ├── Tables: gov_profiles, survey_vehicles, survey_tasks, survey_trips, survey_detections
   ├── PostGIS spatial indexes and ST_Contains triggers
   └── Supabase Storage bucket for compressed defect snapshots

Phase 3: Multi-Model Inference Service Expansion
   ├── Integrate TwinLiteNet+ drivable area & lane segmentation into Python GPU server
   ├── Integrate Vehicle Detector with optical expansion Time-to-Collision (TTC) math
   └── Unified /predict/tri_layer API endpoint returning masks, hazards, and vehicle brackets

Phase 4: Surveyor Module — Diagnostic, Navigation & Tri-Layer HUD
   ├── 5-Point Pre-Flight Hardware Diagnostic modal
   ├── OSRM Route Selector & Transit Navigation to start point
   ├── Road Classification overlay (NH, SH, MDR) via Overpass API
   ├── Canvas composite HUD: Light blue drivable road mask, lane lines, defect boxes, FCW alerts
   ├── Dual-axis synchronized telemetry graphs (Speed vs. Distress timeline)
   └── Edge image compression & Supabase upload pipeline

Phase 5: Official Panel — Fleet Management & Task Dispatch
   ├── Live fleet map with real-time heartbeat and geofence deviation alerts
   ├── Task assignment interface with map-based waypoint creation
   └── Surveyor reply messaging loop with unread notification indicators

Phase 6: Trip Audit, Defect Action Matrix & Formal Reports
   ├── Detailed trip drilldown with synchronized route playback
   ├── Defect review actions (Mark Fit, Scan Again, Validation, Fixed)
   └── Print-ready government audit report generator (PDF / Print layout)
```
