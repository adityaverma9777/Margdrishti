# StreetIQ Gov — Disciplined Step-by-Step Implementation Plan

---

## Architecture & Hosting Model

- **Frontend Application**: Hosted on **Vercel** (React + Vite, fast, globally distributed edge CDN).
- **Backend Service**: Hosted on **Render** (Node/Express API for dispatch sync, reporting endpoints, and lightweight relays).
- **Database & Storage**: Hosted on **Supabase** (PostGIS spatial queries, Row Level Security, Auth, and Defect Photo Buckets).
- **Vision Inference (AI Pipeline — Plan A: 100% In-Browser Zero-Install)**: 
  - Powered by **ONNX Runtime Web (`ort-web`) with WebGPU acceleration**.
  - Modern browsers (Chrome, Edge) talk directly to the surveyor laptop's GPU (DirectX 12 / Metal / Vulkan) with zero installation, zero Python, and zero local server commands.
  - **Dedicated Web Worker Architecture**: AI runs on a background worker thread using `OffscreenCanvas`, ensuring the live camera feed and UI stay locked at 60 FPS without stutter or frame drops.
  - **IndexedDB Model Caching**: ONNX weights are downloaded once on first launch and cached in browser storage for instant offline loading during field surveys in low-connectivity areas.
  - Zero video streaming to cloud; zero cloud GPU bills. Only compressed evidence photos, coordinates, and survey metrics sync to Supabase.
- **UI/UX Standard**: Official Government / PWD portal aesthetic. High contrast, clean slate/navy palette, standard typography, clear badges, zero jargon, zero decorative animations. Fast, reliable, and straightforward.

---

## Milestone 1: Project Setup & Government UI System

### Task 1.1: Project Scaffolding
- Initialize clean Vite + React app inside `street iq gov`.
- Configure `lucide-react` for clean official icons.
- Configure Leaflet and React-Leaflet for mapping.
- Set up environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RENDER_BACKEND_URL`, `VITE_LOCAL_INFERENCE_URL`).

### Task 1.2: Government Design System & Navigation Shell
- Establish clean enterprise color palette:
  - Background: Off-white `#F8FAFC` and crisp card white `#FFFFFF` for office portal; high-contrast deep slate `#0F172A` for surveyor vehicle cockpit.
  - Primary: Highway Navy `#1E3A8A` / State Blue `#0284C7`.
  - Status Indicators: Compliant Green `#16A34A`, Attention Amber `#D97706`, Hazard Red `#DC2626`.
- Typography: Clean Inter / System UI with clear hierarchical headings (`text-sm`, `text-base`, `text-lg`, `text-xl`).
- Global Header featuring national/state emblem placeholder, department title, active user role badge, and region selector.

---

## Milestone 2: Authentication & Role Gateway

### Task 2.1: Unified Government Login Screen
- Simple, single-screen login interface with clear role options:
  - **Field Surveyor (Survey Vehicle Crew)**
  - **Desk Official (Executive Engineer / Admin)**
- Plain language fields: Official Email ID, Password, and Vehicle Registration (if logging in as surveyor).
- Fast error handling: "Invalid credentials", "Account pending approval", "Network unavailable".

### Task 2.2: Role Guards & Session Management
- Store session securely in browser local storage.
- Auto-redirect:
  - Surveyor $\rightarrow$ `/surveyor/dashboard`
  - Official $\rightarrow$ `/official/dashboard`
- Strict access control preventing surveyors from altering records and desk officers from triggering vehicle hardware checks.

---

## Milestone 3: Database & PostGIS Foundation (Supabase)

### Task 3.1: Database Migration Setup
- Create tables:
  - `gov_profiles` (Official users & surveyor crews)
  - `survey_vehicles` (Registered vehicles, equipment, driver name, crew members)
  - `survey_tasks` (Dispatched road survey stretches, notes, priority, response)
  - `survey_trips` (Completed and active inspection runs, distance, PCI score)
  - `survey_detections` (Potholes, cracks, patches, coordinates, status)
  - `vehicle_telemetry_logs` (Speed vs. Distance chronological tracking)

### Task 3.2: Spatial Capabilities & Storage Bucket
- Enable PostGIS extension for boundary polygon matching (`ST_Contains`) and route line geometries (`ST_MakeLine`).
- Set up Supabase Storage Bucket `survey-evidence` for auto-compressed hazard photos.
- Implement Row Level Security (RLS) ensuring field crews can append records but cannot delete or edit audited logs.

---

## Milestone 4: 100% In-Browser WebGPU Multi-Model Pipeline (Plan A)

### Task 4.1: Web Worker & WebGPU Hardware Pipeline (`visionWorker.js`)
- Implement background Web Worker using `onnxruntime-web` with `executionProviders: ['webgpu']`.
- Enable FP16 shader acceleration on modern Chromium browsers.
- Utilize zero-copy `ImageBitmap` transfers from the video element to the worker, ensuring the camera view and UI thread never drop below 60 FPS.
- Plain language sensor status badge: "Optical Sensor & GPU Ready" vs "GPU Initializing".

### Task 4.2: IndexedDB Model Caching & Offline Field Execution
- Automatically cache ONNX model weights (`yolo11l.onnx`, `twinlitenet.onnx`) into browser IndexedDB on first load.
- Allows surveyors to perform road audits seamlessly even in rural or zero-cellular highway stretches with zero Internet dependency.

### Task 4.3: Tri-Layer Vision Perception Pipeline
- **Layer 1 (Road Defect ASTM D6433)**: YOLO11-L ONNX parsing (Potholes, Cracks, Patches, Manholes with ASTM codes and PCI deduction weights).
- **Layer 2 (Road Surface Segmentation)**: TwinLiteNet+ ONNX producing binary drivable mask rendered in semi-transparent light blue (`rgba(10, 132, 255, 0.28)`) and lane lines.
- **Layer 3 (Traffic Safety & Collision Warning)**: Lightweight vehicle bounding + optical expansion Time-to-Collision (TTC) algorithm with anti-spam alert chimes.

---

## Milestone 5: Surveyor Portal & Pre-Survey Workflow

### Task 5.1: Surveyor Home Dashboard
- Assigned Territory selector (e.g. State: *Assam*, City: *Guwahati*).
- Interactive Map showing:
  - National Highways (NH - Red)
  - State Highways (SH - Orange)
  - Major District Roads (MDR - Blue)
  - Survey Status: Solid line = Recently Surveyed; Dashed line = Needs Survey.
- Quick summary cards: Assigned Tasks, Completed KM, Pending Stretches.

### Task 5.2: Stretch Definition & Start Navigation
- Surveyor inputs Start Point & End Point (or selects an assigned task).
- System computes:
  - Total road distance (km).
  - Recommended survey speed (e.g., 25 km/h for clear video capture).
- If surveyor is away from the start location, turn-by-turn route directions navigate them to the starting pin.
- Scan initiation locks until vehicle is within 25 meters of the start point.

### Task 5.3: 5-Point Pre-Flight Diagnostic Check
Automated non-technical verification modal before launch:
1. **Camera Sensor**: Video feed clear and responsive.
2. **Local AI Engine**: Computer hardware acceleration active.
3. **GPS Precision**: Satellite lock verified ($\le 5\text{ m}$ accuracy).
4. **Speed Sensor**: Motion gate calibrated.
5. **Data Sync**: Connection to official database verified.

---

## Milestone 6: Live Survey Cockpit & Telemetry Graphs

### Task 6.1: Fullscreen Cockpit HUD
- **Canvas Overlay**:
  - Live camera feed.
  - Light blue drivable road overlay.
  - Cyan lane boundaries.
  - Color-coded hazard boxes (Potholes in red, Cracks in blue/orange).
  - Leading vehicle tracking brackets with distance and safety tags.
- **Top Telemetry Bar**: Vehicle Speed, Target Speed, Live PCI score (0–100), GPS Lock.
- **Auditory Alerts**: Clean warning chime if vehicle exceeds 35 km/h or if Time-to-Collision drops below 2.0s.

### Task 6.2: Dual Synchronized Telemetry Graphs
- Rendered live underneath the camera viewport on identical time/distance axes:
  - **Graph 1 (Speed Timeline)**: Vehicle speed (km/h) recorded at every second.
  - **Graph 2 (Hazards Timeline)**: Defect count and severity plotted along the exact same road distance.
- Allows immediate verification of survey speed compliance at every defect location.

### Task 6.3: Auto-Compression & Cloud Sync
- Captured hazard frames compressed on-device (JPEG 80%, $\sim 45\text{ KB}$) before upload.
- Automatically records to Supabase: Trip ID, Timestamp, Latitude, Longitude, Speed, Defect Type, Confidence, and Photo URL.
- Zero manual input required from the driver/crew.

---

## Milestone 7: Official Desk — Fleet Monitoring & Dispatch

### Task 7.1: Fleet Management & Geofence Guard
- Live map of all detection vehicles in the jurisdiction.
- Status badges: *Surveying*, *In Transit*, *Idle*, *Offline*.
- Vehicle inspection cards: Vehicle Number, Driver, Crew Members, Total KM Surveyed.
- **Geofence Deviation System**: Automatic alert banner and red flag if a vehicle drives or scans outside its assigned municipal boundary.

### Task 7.2: Task Dispatch & Waypoint Routing
- Official clicks **Assign Task** on any vehicle.
- Interactive map tool to pick Start Point and End Point.
- Simple fields: Road Stretch Name, Highway Classification (NH/SH/MDR/City), Target Speed, Due Date, and Official Instructions.
- Immediate dispatch: Surveyor dashboard displays *"New Task Assigned"*.
- Surveyor can click **Accept** (auto-navigates to start point) or **Send Reply** (e.g., "Road closed for pipeline work").
- Surveyor replies immediately display a **Red Notification Dot** on that vehicle's card on the official desk.

---

## Milestone 8: Trip Audit, Defect Action Matrix & Reports

### Task 8.1: Trip Drill-Down & Route Review
- Select Vehicle $\rightarrow$ Select Trip Date/ID.
- Loads complete route polyline, total km covered, average speed, and ASTM D6433 Pavement Condition Index (PCI) score.
- Playback view of synchronized speed graph and hazard frequency curve.

### Task 8.2: Defect Action Matrix
- Interactive table of all hazards found on the trip.
- Shows timestamp, exact speed at capture, location map pin, and high-res evidence photo.
- Official Action buttons:
  - **Mark as Fit** (Minor surface blemish, no action needed)
  - **Not Properly Detected** (False positive flag for model retraining)
  - **Scan Again** (Speed was too high or camera was obscured)
  - **Validation Required** (Send junior engineer for physical measurement)
  - **Fixed / Repaired** (Maintenance work completed)
- Changes logged with reviewer name and timestamp.

### Task 8.3: Official PDF & Print Compliance Reports
- One-click **Generate Survey Report**:
  - Official government department header (PWD / NHAI format).
  - Survey metadata (Trip ID, Vehicle Number, Crew, Highway, Date, Total KM).
  - Pavement Condition Index (PCI) breakdown with official rating (*Good*, *Satisfactory*, *Fair*, *Poor*, *Serious*).
  - Photo evidence grid with GPS coordinates and repair status.
  - Official sign-off and approval block for executive engineers.
