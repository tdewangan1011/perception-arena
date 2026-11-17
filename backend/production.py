"""Single-origin production app. Start from a prepared release bundle."""
from fastapi import HTTPException
from fastapi.staticfiles import StaticFiles

from .main import app, health
from .stimulus import ROOT

DIST = ROOT / "dist"
if not (DIST / "index.html").is_file():
    raise RuntimeError("Frontend build missing. Run npm run build before serving the production app.")

REQUIRED = (
    "experimentReady", "blurReady", "lightingReady", "changeReady", "depthReady",
    "gestaltReady", "colorReady", "illusionsReady", "speechReady",
)


@app.middleware("http")
async def production_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@app.get("/api/ready")
def readiness():
    status = health()
    missing = [key for key in REQUIRED if not status[key]]
    if missing:
        raise HTTPException(503, detail={"missing": missing})
    return {"ready": True}


app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
