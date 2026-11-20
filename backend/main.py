import hashlib
import json
from contextlib import asynccontextmanager, closing
from typing import Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException, Path
from fastapi.responses import FileResponse, JSONResponse
from . import color, depth, experiment, gestalt, illusions, mixed, speech
from .change_pairs import load_change_bank
from .sessions import Answer, connect, score_trial, sessions_directory, utc_now
from .stimulus import CHOICES, DATA, GROUND_TRUTH, MASK_BOX, MASK_FRACTION, MODEL_ID, PROMPT, REVISION, review_image_url


def load_prediction():
    try:
        prediction = json.loads((DATA / "pilot-prediction.json").read_text(encoding="utf-8"))
        stimulus_id = prediction["stimulus_id"]
        if len(stimulus_id) != 64 or any(c not in "0123456789abcdef" for c in stimulus_id):
            return None
        path = DATA / "stimuli" / f"{stimulus_id}.png"
        if (
            prediction["model_id"] == MODEL_ID
            and prediction["model_revision"] == REVISION
            and prediction["prompt_template"] == PROMPT
            and prediction["choices"] == CHOICES
            and prediction["model_choice"] in CHOICES
            and prediction["difficulty"] == MASK_FRACTION
            and prediction["mask_box_xyxy_exclusive"] == list(MASK_BOX)
            and hashlib.sha256(path.read_bytes()).hexdigest() == stimulus_id
        ):
            return prediction
    except (OSError, KeyError, ValueError, TypeError):
        return None
    return None


@asynccontextmanager
async def lifespan(app):
    sessions_directory().mkdir(parents=True, exist_ok=True)
    with closing(connect()) as db, db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS pilot_sessions (
                session_id TEXT PRIMARY KEY,
                trial_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                stimulus TEXT NOT NULL,
                response TEXT
            )
        """)
        experiment.initialize(db)
        mixed.initialize(db)
    app.state.prediction = load_prediction()
    app.state.experiment_banks = {topic: experiment.load_bank(topic) for topic in experiment.DESIGNS}
    app.state.experiment_banks["change"] = load_change_bank()
    app.state.depth_predictions = depth.load_predictions()
    app.state.speech_predictions = speech.load_predictions()
    app.state.diagram_predictions = {
        "gestalt": gestalt.load_predictions(),
        "color": color.load_predictions(),
        "illusions": illusions.load_predictions(),
    }
    app.state.mixed_bank = mixed.build_bank(app)
    yield


app = FastAPI(title="Perception Arena", lifespan=lifespan)
app.include_router(experiment.router)
app.include_router(depth.router)
app.include_router(mixed.router)


def get_session(db, session_id):
    row = db.execute("SELECT * FROM pilot_sessions WHERE session_id = ?", (str(session_id),)).fetchone()
    if row is None:
        raise HTTPException(404, "Session not found.")
    return row


def image_url(session_id):
    return f"/api/sessions/{session_id}/stimulus"


def trial_view(row):
    stimulus = json.loads(row["stimulus"])
    return {
        "trial_id": row["trial_id"],
        "stimulus_id": stimulus["stimulus_id"],
        "block": "Pilot",
        "position": 1,
        "total": 1,
        "imageUrl": image_url(row["session_id"]),
        "choices": stimulus["choices"],
    }


def build_result(row):
    if row["response"] is None:
        raise HTTPException(409, "Finish the trial to view results.")
    stimulus = json.loads(row["stimulus"])
    response = json.loads(row["response"])
    return {
        **score_trial(stimulus, response),
        "session_id": row["session_id"],
        "created_at": row["created_at"],
        "condition": "occlusion",
        "block": "pilot",
        "imageUrl": review_image_url(stimulus["stimulus_id"]),
    }


@app.get("/api/health")
def health():
    ready = bool(app.state.experiment_banks["occlusion"])
    blur_ready = bool(app.state.experiment_banks["blur"])
    lighting_ready = bool(app.state.experiment_banks["lighting"])
    change_ready = bool(app.state.experiment_banks["change"])
    pilot_ready = app.state.prediction is not None
    gestalt_ready = app.state.diagram_predictions["gestalt"] is not None
    color_ready = app.state.diagram_predictions["color"] is not None
    illusions_ready = app.state.diagram_predictions["illusions"] is not None
    return {"name": "CLIP ViT-B/32", "state": "ready" if any((ready, blur_ready, lighting_ready, change_ready, pilot_ready, gestalt_ready, color_ready, illusions_ready)) else "unavailable",
            "experimentReady": ready, "blurReady": blur_ready, "lightingReady": lighting_ready, "changeReady": change_ready, "pilotReady": pilot_ready,
            "depthReady": app.state.depth_predictions is not None, "gestaltReady": gestalt_ready, "colorReady": color_ready,
            "illusionsReady": illusions_ready, "speechReady": app.state.speech_predictions is not None,
            "mixedReady": bool(app.state.mixed_bank)}


@app.get("/api/review-images/{digest}.png")
def review_image(digest: str = Path(pattern=r"^[0-9a-f]{64}$")):
    path = DATA / "stimuli" / f"{digest}.png"
    if not path.is_file():
        raise HTTPException(404, "Stimulus file missing.")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/api/speech/predictions")
def speech_predictions():
    predictions = app.state.speech_predictions
    if predictions is None:
        raise HTTPException(503, "Run python -m backend.speech --score and restart the API.")
    return predictions


@app.get("/api/{topic}/predictions")
def diagram_predictions(topic: Literal["gestalt", "color", "illusions"]):
    predictions = app.state.diagram_predictions[topic]
    if predictions is None:
        raise HTTPException(503, f"Run python -m backend.{topic} --score and restart the API.")
    return predictions


@app.post("/api/sessions", status_code=201)
def create_session():
    prediction = app.state.prediction
    if prediction is None:
        raise HTTPException(503, "Pilot prediction missing. Run python -m backend.prepare and restart the API.")
    session_id, trial_id = str(uuid4()), str(uuid4())
    stimulus = {**prediction, "base_image_id": "source-001", "ground_truth": GROUND_TRUTH}
    with closing(connect()) as db, db:
        db.execute("INSERT INTO pilot_sessions VALUES (?, ?, ?, ?, NULL)",
                   (session_id, trial_id, utc_now(), json.dumps(stimulus)))
        return {"session_id": session_id, "trial": trial_view(get_session(db, session_id))}


@app.get("/api/sessions/{session_id}/stimulus")
def get_stimulus(session_id: UUID):
    with closing(connect()) as db:
        stimulus = json.loads(get_session(db, session_id)["stimulus"])
    path = DATA / "stimuli" / f'{stimulus["stimulus_id"]}.png'
    if not path.is_file():
        raise HTTPException(404, "Stimulus file missing.")
    return FileResponse(path, media_type="image/png")


@app.post("/api/sessions/{session_id}/responses")
def submit_response(session_id: UUID, answer: Answer):
    submitted = answer.model_dump(mode="json")
    with closing(connect()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        row = get_session(db, session_id)
        if row["trial_id"] != submitted["trial_id"]:
            raise HTTPException(422, "This trial does not belong to the session.")
        if answer.human_choice not in json.loads(row["stimulus"])["choices"]:
            raise HTTPException(422, "Choose one of the available answers.")
        if row["response"] is None:
            response = {**submitted, "recorded_at": utc_now()}
            db.execute("UPDATE pilot_sessions SET response = ? WHERE session_id = ?",
                       (json.dumps(response), str(session_id)))
            row = get_session(db, session_id)
        else:
            saved = json.loads(row["response"])
            if any(saved[key] != value for key, value in submitted.items()):
                raise HTTPException(409, "This trial already has a saved response.")
        return build_result(row)


@app.get("/api/sessions/{session_id}/results")
def get_results(session_id: UUID):
    with closing(connect()) as db:
        return build_result(get_session(db, session_id))


@app.get("/api/sessions/{session_id}/export")
def export_session(session_id: UUID):
    return JSONResponse(
        get_results(session_id),
        headers={"Content-Disposition": f'attachment; filename="perception-pilot-{session_id}.json"'},
    )
