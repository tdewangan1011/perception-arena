"""Adaptive mixed sessions, deterministic retries, and an equal-topic comparison score."""
import json
import random
from contextlib import closing
from secrets import randbits
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from .prepare_mixed import VERSION, load_predictions
from .sessions import Answer, connect, utc_now
from .stimulus import ASSETS, DATA, review_image_url

TOPICS = ("occlusion", "blur", "lighting", "change", "depth", "gestalt", "color", "illusions")
ADAPTIVE = ("occlusion", "blur", "lighting", "color")
TRIALS = 32
router = APIRouter(prefix="/api/mixed")


def build_bank(app):
    bank = load_predictions()
    if not bank:
        return []
    for topic, directory in (("gestalt", "gestalt"), ("illusions", "illusions")):
        predictions = app.state.diagram_predictions[topic]
        if predictions is None:
            return []
        definitions = json.loads((ASSETS / directory / "scenes.json").read_text(encoding="utf-8"))
        for s in definitions:
            bank.append(dict(id=f'{topic}:{s["id"]}', source_id=f'{topic}:{s["id"]}', topic=topic,
                tier=None, condition=s["principle"], answer=s["options"][s["answer"]], choices=s["options"],
                prompt=s["prompt"], model_choice=s["options"][predictions[s["id"]]], model_id="openai/clip-vit-base-patch32",
                asset=s["id"], explanation=s["explanation"]))
    depth = app.state.depth_predictions
    if depth is None:
        return []
    for s in json.loads((ASSETS / "depth-scenes.json").read_text(encoding="utf-8")):
        bank.append(dict(id=f'depth:{s["id"]}', source_id=f'depth:{s["id"]}', topic="depth",
            tier=None, condition="Depth ordering", answer=s["answer"], choices=["A", "B"], points=s["points"],
            prompt=s["prompt"], asset=s["id"], model_choice=depth["scenes"][s["id"]]["model_choice"],
            model_id="depth-anything/Depth-Anything-V2-Small-hf", explanation=s["explanation"]))
    for s in app.state.experiment_banks["change"]:
        bank.append(dict(id=f'change:{s["base_image_id"]}', source_id=f'change:{s["base_image_id"]}',
            topic="change", tier=None, condition=("Small", "Medium", "Large")[s["level"]-1],
            answer=s["ground_truth"], choices=s["choices"], stimulus_id=s["stimulus_id"],
            comparison_stimulus_id=s["comparison_stimulus_id"], prompt="Where did the scene change?",
            model_choice=s["model_choice"], model_id=s["model_id"], explanation=s["change_description"], source=s.get("source")))
    return bank if len(bank) == 845 else []


def initialize(db):
    db.execute("""CREATE TABLE IF NOT EXISTS mixed_sessions (
        session_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, state TEXT NOT NULL
    )""")


class StartMixed(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recent_sources: list[str] = Field(default_factory=list, max_length=256)


def image_url(trial):
    if "stimulus_id" in trial:
        return review_image_url(trial["stimulus_id"])
    return f'/api/mixed/assets/{trial["topic"]}/{trial["asset"]}'


@router.get("/assets/{topic}/{asset}")
def fixed_image(topic: str, asset: str):
    if topic not in ("depth", "gestalt", "illusions") or not asset.replace("-", "").isalnum():
        raise HTTPException(404, "Image unavailable.")
    extension = "jpg" if topic == "depth" else "png"
    path = ASSETS / topic / f"{asset}.{extension}"
    if not path.is_file():
        raise HTTPException(404, "Image unavailable.")
    return FileResponse(path)


def select_next(state):
    position = len(state["responses"])
    if position == TRIALS:
        state["current"] = None
        return
    topic = state["schedule"][position]
    tier = state["tiers"].get(topic)
    seen = {trial["source_id"] for trial in state["shown"]}
    candidates = [trial for trial in state["bank"] if trial["topic"] == topic and trial["tier"] == tier and trial["source_id"] not in seen]
    if topic in ("occlusion", "blur", "lighting"):
        # Four appearances per topic use four different labels.
        used_labels = {t["answer"] for t in state["shown"] if t["topic"] == topic}
        candidates = [trial for trial in candidates if trial["answer"] not in used_labels]
    if not candidates:
        raise HTTPException(503, "No unused trial available.")
    recent = set(state["recent_sources"])
    fresh = [trial for trial in candidates if trial["source_id"] not in recent]
    rng = random.Random(state["seed"] + position)
    trial = dict(rng.choice(fresh or candidates), trial_id=str(uuid4()))
    trial["choices"] = rng.sample(trial["choices"], len(trial["choices"]))
    state["shown"].append(trial)
    state["current"] = trial


def public_state(session_id, state):
    current = state["current"]
    trial = None
    if current:
        trial = {key: current[key] for key in ("trial_id", "topic", "tier", "prompt", "choices")}
        trial.update(imageUrl=image_url(current), position=len(state["responses"])+1, total=TRIALS)
        if "comparison_stimulus_id" in current:
            trial["comparisonUrl"] = review_image_url(current["comparison_stimulus_id"])
        if "points" in current:
            trial["points"] = current["points"]
    return dict(session_id=str(session_id), trial=trial)


def get_row(db, session_id):
    row = db.execute("SELECT * FROM mixed_sessions WHERE session_id=?", (str(session_id),)).fetchone()
    if row is None:
        raise HTTPException(404, "Mixed session not found.")
    return row


@router.post("/sessions", status_code=201)
def create_session(request: Request, body: StartMixed):
    bank = request.app.state.mixed_bank
    if not bank:
        raise HTTPException(503, "Mixed challenge needs prepared predictions.")
    seed = randbits(48)
    rng = random.Random(seed)
    schedule = []
    for _ in range(4):
        schedule += rng.sample(list(TOPICS), len(TOPICS))
    state = dict(version=VERSION, seed=seed, schedule=schedule, bank=bank, recent_sources=body.recent_sources,
                 tiers=dict.fromkeys(ADAPTIVE, 1), responses=[], shown=[], current=None)
    select_next(state)
    sid = uuid4()
    with closing(connect()) as db, db:
        db.execute("INSERT INTO mixed_sessions VALUES (?,?,?)", (str(sid), utc_now(), json.dumps(state)))
    return public_state(sid, state)


@router.get("/sessions/{session_id}")
def get_session(session_id: UUID):
    with closing(connect()) as db:
        return public_state(session_id, json.loads(get_row(db, session_id)["state"]))


@router.post("/sessions/{session_id}/responses")
def submit_response(session_id: UUID, answer: Answer):
    payload = answer.model_dump(mode="json")
    with closing(connect()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        row = get_row(db, session_id)
        state = json.loads(row["state"])
        previous = next((r for r in state["responses"] if r["trial_id"] == str(answer.trial_id)), None)
        if previous:
            if any(previous[key] != value for key, value in payload.items()):
                raise HTTPException(409, "This trial has a different saved response.")
            return public_state(session_id, state)
        current = state["current"]
        if not current or current["trial_id"] != str(answer.trial_id):
            raise HTTPException(409, "Answer the current trial.")
        if answer.human_choice not in current["choices"]:
            raise HTTPException(422, "Choose one of the available answers.")
        state["responses"].append(payload)
        if current["topic"] in ADAPTIVE:
            correct = answer.human_choice == current["answer"]
            state["tiers"][current["topic"]] = max(0, min(4, current["tier"] + (1 if correct else -1)))
        select_next(state)
        db.execute("UPDATE mixed_sessions SET state=? WHERE session_id=?", (json.dumps(state), str(session_id)))
    return public_state(session_id, state)


def score_result(state):
    scored = []
    for trial, response in zip(state["shown"], state["responses"], strict=True):
        correct = response["human_choice"] == trial["answer"]
        model_correct = trial["model_choice"] == trial["answer"]
        scored.append({**trial, **response, "imageUrl": image_url(trial),
            "human_correct": correct, "model_correct": model_correct,
            "weight": 1 + (trial["tier"] or 0),
            **({"comparisonUrl": review_image_url(trial["comparison_stimulus_id"])} if "comparison_stimulus_id" in trial else {})})
    groups = []
    for topic in TOPICS:
        trials = [t for t in scored if t["topic"] == topic]
        weight = sum(t["weight"] for t in trials)
        human = sum(t["weight"] * t["human_correct"] for t in trials) / weight
        model = sum(t["weight"] * t["model_correct"] for t in trials) / weight
        groups.append(dict(topic=topic, total=len(trials), human_correct=sum(t["human_correct"] for t in trials),
            model_correct=sum(t["model_correct"] for t in trials), comparison_score=round(50 + 50*(human-model), 1),
            highest_tier=max((t["tier"] for t in trials if t["tier"] is not None), default=None)))
    return dict(version=state["version"], total=len(scored),
        composite_score=round(sum(g["comparison_score"] for g in groups)/len(groups), 1),
        human_correct=sum(t["human_correct"] for t in scored), model_correct=sum(t["model_correct"] for t in scored),
        groups=groups, trials=scored, source_ids=[t["source_id"] for t in scored])


@router.get("/sessions/{session_id}/results")
def results(session_id: UUID):
    with closing(connect()) as db:
        row = get_row(db, session_id)
    state = json.loads(row["state"])
    if len(state["responses"]) != TRIALS:
        raise HTTPException(409, "Finish the mixed challenge to see results.")
    return dict(session_id=str(session_id), created_at=row["created_at"], **score_result(state))
