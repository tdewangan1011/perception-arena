import hashlib
import json
import random
from collections import Counter
from contextlib import closing
from secrets import randbits
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from .change_pairs import CHANGE_VERSION
from .design import DESIGNS, LABELS, Topic, assign_trials, level_metadata
from .sessions import Answer, OUTCOMES, connect, score_trial, utc_now
from .stimulus import DATA, MODEL_ID, PROMPT, REVISION

router = APIRouter(prefix="/api/experiment")


class FlickerTiming(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visible_ms: int = Field(gt=0)
    blank_ms: int = Field(gt=0)


class ExperimentAnswer(Answer):
    flicker_timing: FlickerTiming | None = None


def load_bank(topic="occlusion"):
    design = DESIGNS[topic]
    levels = design.levels
    try:
        sources = json.loads((design.sources / "manifest.json").read_text(encoding="utf-8"))
        source_hashes = {
            source["id"]: hashlib.sha256((design.sources / source["file"]).read_bytes()).hexdigest()
            for source in sources
        }
        bank = json.loads(design.predictions.read_text(encoding="utf-8"))
        for trial in bank:
            stimulus_id = trial["stimulus_id"]
            base_id = trial["base_image_id"]
            level = trial["level"]
            if (
                len(stimulus_id) != 64 or any(c not in "0123456789abcdef" for c in stimulus_id)
                or trial["model_id"] != MODEL_ID or trial["model_revision"] != REVISION
                or trial["prompt_template"] != PROMPT or trial["design_version"] != design.version
                or trial["choices"] != list(LABELS) or trial["model_choice"] not in LABELS
                or trial["ground_truth"] not in LABELS or level not in levels
                or trial.get("condition", "occlusion") != topic
                or trial["source_sha256"] != source_hashes[base_id]
                or any(trial[key] != value for key, value in level_metadata(topic, base_id, level).items())
                or hashlib.sha256((DATA / "stimuli" / f"{stimulus_id}.png").read_bytes()).hexdigest() != stimulus_id
            ):
                return []
        if (
            len({trial["base_image_id"] for trial in bank}) != len(LABELS) * len(levels)
            or len({trial["stimulus_id"] for trial in bank}) != len(bank)
            or len(bank) != len(LABELS) * len(levels) ** 2
        ):
            return []
        by_base = {}
        for trial in bank:
            by_base.setdefault(trial["base_image_id"], []).append(trial)
        for variants in by_base.values():
            if (sorted(t["level"] for t in variants) != list(levels)
                    or len({t["ground_truth"] for t in variants}) != 1):
                return []
        if any(sum(trial["ground_truth"] == label for trial in bank) != len(levels) ** 2 for label in LABELS):
            return []
        return bank
    except (OSError, ValueError, KeyError, TypeError):
        return []


def initialize(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS experiment_sessions (
            session_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            seed INTEGER NOT NULL,
            trials TEXT NOT NULL,
            responses TEXT NOT NULL DEFAULT '[]'
        )
    """)


def session_row(db, session_id):
    row = db.execute("SELECT * FROM experiment_sessions WHERE session_id = ?", (str(session_id),)).fetchone()
    if row is None:
        raise HTTPException(404, "Session not found.")
    return row


def stimulus_url(session_id, trial_id):
    return f"/api/experiment/sessions/{session_id}/stimuli/{trial_id}"


def pair_url(session_id, trial):
    if "comparison_stimulus_id" not in trial:
        return {}
    return {"comparisonUrl": stimulus_url(session_id, trial["trial_id"]) + "?frame=second"}


def session_view(session_id, trials, responses):
    position = len(responses)
    topic = trials[0].get("condition", "occlusion")
    view = {"session_id": str(session_id), "condition": topic, "trial": None}
    if position < len(trials):
        trial = trials[position]
        view["trial"] = {
            "trial_id": trial["trial_id"],
            "stimulus_id": trial["stimulus_id"],
            "block": "Change detection" if topic == "change" else topic.capitalize(),
            "position": position + 1,
            "total": len(trials),
            "imageUrl": stimulus_url(session_id, trial["trial_id"]),
            "choices": trial["choices"],
            **pair_url(session_id, trial),
        }
    return view


@router.post("/sessions", status_code=201)
def create_experiment(request: Request, topic: Topic = "occlusion"):
    bank = request.app.state.experiment_banks[topic]
    if not bank:
        command = "backend.change_pairs" if topic == "change" else f"backend.prepare_experiment --topic {topic}"
        raise HTTPException(503, f"Run python -m {command} and restart the API.")
    seed = randbits(48)
    session_id = uuid4()
    assigned = random.Random(seed).sample(bank, k=len(bank)) if topic == "change" else assign_trials(bank, seed, DESIGNS[topic].levels)
    trials = [
        {**trial, "condition": topic, "trial_id": str(uuid4())}
        for trial in assigned
    ]
    with closing(connect()) as db, db:
        db.execute("INSERT INTO experiment_sessions (session_id, created_at, seed, trials) VALUES (?, ?, ?, ?)",
                   (str(session_id), utc_now(), seed, json.dumps(trials)))
    return session_view(session_id, trials, [])


@router.get("/sessions/{session_id}")
def get_experiment(session_id: UUID):
    with closing(connect()) as db:
        row = session_row(db, session_id)
        return session_view(session_id, json.loads(row["trials"]), json.loads(row["responses"]))


@router.get("/sessions/{session_id}/stimuli/{trial_id}")
def get_stimulus(session_id: UUID, trial_id: UUID, frame: Literal["first", "second"] = "first"):
    with closing(connect()) as db:
        row = session_row(db, session_id)
        available = json.loads(row["trials"])[:len(json.loads(row["responses"])) + 1]
    trial = next((trial for trial in available if trial["trial_id"] == str(trial_id)), None)
    if trial is None:
        raise HTTPException(404, "Stimulus unavailable.")
    digest = trial.get("comparison_stimulus_id") if frame == "second" else trial["stimulus_id"]
    if not digest:
        raise HTTPException(404, "Stimulus unavailable.")
    path = DATA / "stimuli" / f"{digest}.png"
    if not path.is_file():
        raise HTTPException(404, "Stimulus file missing.")
    return FileResponse(path, media_type="image/png")


@router.post("/sessions/{session_id}/responses")
def submit_experiment_response(session_id: UUID, answer: ExperimentAnswer):
    submitted = answer.model_dump(mode="json")
    if submitted.get("flicker_timing") is None:
        submitted.pop("flicker_timing", None)
    with closing(connect()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        row = session_row(db, session_id)
        trials, responses = json.loads(row["trials"]), json.loads(row["responses"])
        previous = next((response for response in responses if response["trial_id"] == submitted["trial_id"]), None)
        if previous is not None:
            if any(previous.get(key) != value for key, value in submitted.items()):
                raise HTTPException(409, "This trial already has a saved response.")
        else:
            position = len(responses)
            if position == len(trials) or trials[position]["trial_id"] != submitted["trial_id"]:
                raise HTTPException(409, "Submit the current trial.")
            if answer.human_choice not in trials[position]["choices"]:
                raise HTTPException(422, "Choose one of the available answers.")
            if "flicker_timing" in submitted and "comparison_stimulus_id" not in trials[position]:
                raise HTTPException(422, "Flicker timing applies to image-pair trials only.")
            responses.append({**submitted, "recorded_at": utc_now()})
            db.execute("UPDATE experiment_sessions SET responses = ? WHERE session_id = ?",
                       (json.dumps(responses), str(session_id)))
    return session_view(session_id, trials, responses)


@router.get("/sessions/{session_id}/results")
def experiment_results(session_id: UUID):
    with closing(connect()) as db:
        row = session_row(db, session_id)
    trials, responses = json.loads(row["trials"]), json.loads(row["responses"])
    if len(responses) < len(trials):
        raise HTTPException(409, "Finish the challenge to view results.")
    scored = [
        {**score_trial(trial, response), "imageUrl": stimulus_url(session_id, trial["trial_id"]), **pair_url(session_id, trial)}
        for trial, response in zip(trials, responses, strict=True)
    ]
    outcomes = Counter(trial["outcome"] for trial in scored)
    by_level = []
    topic = trials[0].get("condition", "occlusion")
    default_design = CHANGE_VERSION if topic == "change" else DESIGNS[topic].version
    for level in sorted({trial["level"] for trial in trials}):
        group = [trial for trial in scored if trial["level"] == level]
        by_level.append({
            "level": level,
            "total": len(group),
            "human_correct": sum(trial["human_correct"] for trial in group),
            "model_correct": sum(trial["model_correct"] for trial in group),
        })
    return {
        "session_id": str(session_id), "created_at": row["created_at"], "seed": row["seed"],
        "condition": topic, "design_version": trials[0].get("design_version", default_design), "participants": 1,
        "model_id": scored[0]["model_id"], "model_revision": scored[0]["model_revision"],
        "total": len(scored),
        "human_correct": sum(trial["human_correct"] for trial in scored),
        "model_correct": sum(trial["model_correct"] for trial in scored),
        "outcomes": {key: outcomes[key] for key in OUTCOMES.values()},
        "by_level": by_level, "trials": scored,
    }


@router.get("/sessions/{session_id}/export")
def experiment_export(session_id: UUID):
    result = experiment_results(session_id)
    return JSONResponse(
        result,
        headers={"Content-Disposition": f'attachment; filename="perception-{result["condition"]}-{session_id}.json"'},
    )
