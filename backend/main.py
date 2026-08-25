from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine
import models

from routers.bin_router    import router as bin_router
from routers.route_router  import router as route_router
from routers.sensor_router import router as sensor_router
from routers.feedback      import router as feedback_router

# ── App factory ─────────────────────────────────────────────────────────────

app = FastAPI(
    title       = "SwachSetu API",
    description = (
        "Smart waste management backend. "
        "Receives IoT bin readings, stores them in PostgreSQL, "
        "and optimises collection routes with OR-Tools."
    ),
    version     = "1.0.0",
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# In production restrict allow_origins to your frontend domain.
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ALLOWED_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Database bootstrap ───────────────────────────────────────────────────────
models.Base.metadata.create_all(bind=engine)
# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(bin_router)
app.include_router(route_router)
app.include_router(sensor_router)
app.include_router(feedback_router)

# ── Health / root ─────────────────────────────────────────────────────────────
from fastapi.staticfiles import StaticFiles
import os

@app.get("/health", tags=["Meta"])
def health():
    """Lightweight liveness probe used by uptime monitors."""
    return {"status": "ok"}

@app.get("/ping")
def ping():
    return {"status": "ok", "message": "SafaiChakra is awake!"}

# Serve the compiled React frontend statically from the backend
frontend_dir = os.path.join(os.path.dirname(__file__), "../frontend/build")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    print(f"WARNING: Frontend build directory not found at {frontend_dir}. Run 'npm run build' in the frontend directory.")