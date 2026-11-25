# StreetIQ Gov

An end-to-end **AI Road Survey, Pavement Condition Index (PCI) Analytics & Municipal Fleet Oversight Platform** built for government highway departments and field survey teams.

StreetIQ Gov combines real-time multi-layer road perception, live GPS fleet telemetry, mobile camera pairing, automated ASTM D6433 distress scoring, and official audit report generation in a unified web platform.

---

## Key Features

### 1. Multi-Layer Real-Time Road Perception Engine
- **Road Surface Defect Detection (ASTM D6433):** Automatically detects and classifies 10 pavement distress types—longitudinal/transverse cracks, alligator cracks, block cracks, patching, potholes, weathering/raveling, lane/shoulder drop-off, marking/manhole defects, edge cracks, and bumps/sags—with severity ratings (`1–5`) and confidence scores.
- **Automated PCI Scoring:** Computes live Pavement Condition Index (`0–100`) and condition ratings (`Good`, `Satisfactory`, `Fair`, `Poor`, `Serious`).
- **Drivable Area & Lane Segmentation:** Highlights drivable road corridors and lane boundaries directly on the live video canvas.
- **Vehicle Tracking & Forward Collision Warning (TTC):** Tracks pedestrians, bicycles, cars, motorcycles, buses, and trucks with monocular distance estimation, Time-to-Collision (TTC) calculation, and tiered safety alerts (`Safe`, `APPROACHING`, `COLLISION WARNING`).
- **Interactive Layer Controls:** Toggle **Road Defects**, **Vehicle Hazard**, and **Road & Lanes** overlays independently in real time.

### 2. Government Official Dashboard
- **Fleet Oversight Map:** Live interactive Leaflet map tracking active survey vehicles, patrol status, and route coverage.
- **Road Stretch Planner & Distance Checker:** Plan road inspection stretches on the map, measure corridor distances, and assign stretches to specific fleet vehicles and surveyors.
- **Task Management:** Create, assign, monitor, and manage road survey tasks across districts and stretches.
- **Trip & Defect Inspection:** Drill into completed survey trips, inspect geo-tagged defect snapshots, review severity breakdowns, and verify road health metrics.
- **Printable Audit Reports:** Generate structured, print-ready government road condition and PCI compliance reports.

### 3. Field Surveyor Dashboard & Live Cockpit
- **Pre-Flight Readiness Check:** Verifies camera/video source, GPS lock, and backend connectivity before starting a patrol.
- **Turn-by-Turn Route Navigation:** Guides surveyors along their assigned road stretch during active patrols.
- **Live Survey Cockpit:** Streams video through the perception engine, captures timestamped defect snapshots, tracks live GPS coordinates and speed, and persists survey trips and defects to the database.
- **Remote Mobile Camera Pairing:** Add a mobile device in the Surveyor portal to generate a unique pairing link (`?cam=<id>&name=<device>`). Opening the link on a phone turns it into a wireless camera + GPS + speed source for the laptop/PC dashboard.

### 4. Interactive Demo Mode
- Built-in **Demo Detections on Footage** modal with multiple pre-loaded dashcam footages, live PCI & hazard HUD, toggleable detection layers, and a timestamped live snapshot feed.
- Automatically connects to the local Python inference backend when running, with browser-side WebAssembly fallback if the backend is offline.

---

## Project Structure

```text
street iq gov/
├── backend/
│   ├── scripts/
│   │   ├── migrate_db.py
│   │   └── supabase_complete_schema.sql
│   ├── src/
│   │   ├── database.py          # PostgreSQL connection pool helper
│   │   ├── server.py            # FastAPI app & CORS configuration
│   │   └── routers/
│   │       ├── defects.py       # Defect logging & retrieval endpoints
│   │       ├── fleet.py         # Fleet & device management endpoints
│   │       ├── reports.py       # Official report generation endpoints
│   │       ├── tasks.py         # Survey task assignment endpoints
│   │       ├── trips.py         # Survey trip & telemetry endpoints
│   │       └── vision.py        # Multi-layer perception & health endpoints
│   └── requirements.txt
└── frontend/
    ├── public/
    │   └── demo_scans/          # Pre-loaded dashcam demo videos
    ├── src/
    │   ├── components/          # Cockpit, maps, planners, modals, reports
    │   ├── context/             # Role-based authentication context
    │   ├── pages/               # Login, Official, Surveyor & Mobile Camera views
    │   ├── services/            # Official REST API client
    │   └── utils/               # Vision API client & local browser fallback
    ├── package.json
    └── vite.config.js
```

---

## Running Locally

### Prerequisites
- **Python 3.10+** (CUDA GPU optional; runs on CPU or GPU automatically)
- **Node.js 18+** and **npm**
- **PostgreSQL** or **Supabase** database

### 1. Database Setup
1. Create a PostgreSQL / Supabase database.
2. Apply the schema from `backend/scripts/supabase_complete_schema.sql` (or run `python backend/scripts/migrate_db.py` after configuring `.env`).

### 2. Backend Setup
1. Open a terminal in `backend/`:
   ```powershell
   cd "d:\Street Iq\street iq gov\backend"
   ```
2. Create and activate a virtual environment (recommended):
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Install Python dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Create `backend/.env` with your database connection string:
   ```env
   DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
   ```
5. Start the FastAPI backend server on port `8000`:
   ```powershell
   python -m uvicorn src.server:app --host 0.0.0.0 --port 8000
   ```
6. Verify the backend is running by opening `http://127.0.0.1:8000/health` in your browser.

### 3. Frontend Setup
1. Open a second terminal in `frontend/`:
   ```powershell
   cd "d:\Street Iq\street iq gov\frontend"
   ```
2. Install Node dependencies:
   ```powershell
   npm install
   ```
3. *(Optional)* Create `frontend/.env` if your backend runs on a non-default host/port (in dev mode it automatically defaults to `http://127.0.0.1:8000`):
   ```env
   VITE_GPU_SERVER_URL=http://127.0.0.1:8000
   VITE_OFFICIAL_API_URL=http://127.0.0.1:8000/api
   ```
4. Start the Vite development server:
   ```powershell
   npm run dev
   ```
5. Open `http://localhost:5174` in your browser.

---

## Using the App Locally
1. **Demo Detections:** Click **Demo** from the login screen to run live tri-layer road, vehicle, and defect scanning on the included dashcam footages.
2. **Official Portal:** Sign in with an Official account to plan road stretches, assign tasks to vehicles, monitor the live fleet map, inspect trip defects, and print PCI reports.
3. **Surveyor Portal:** Sign in with a Surveyor account to run pre-flight checks, pair a mobile camera via its unique link, follow turn-by-turn navigation, and record live road surveys.
