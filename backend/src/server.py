import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import fleet, tasks, defects, trips, reports
from .database import get_db

app = FastAPI(
    title="StreetIQ Gov Official API",
    description="Government Road Survey, Fleet Oversight & Quality Audit API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(fleet.router)
app.include_router(tasks.router)
app.include_router(defects.router)
app.include_router(trips.router)
app.include_router(reports.router)

@app.get("/health")
def health_check():
    db_ok = False
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1;")
                db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "online",
        "service": "StreetIQ Gov Official API",
        "database_connected": db_ok,
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run("src.server:app", host="0.0.0.0", port=port, reload=True)
