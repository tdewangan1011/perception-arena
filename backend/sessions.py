import sqlite3
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .stimulus import DATA

OUTCOMES = {
    (True, True): "both_correct",
    (True, False): "human_only_correct",
    (False, True): "ai_only_correct",
    (False, False): "both_wrong",
}


class Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    trial_id: UUID
    human_choice: str
    human_response_ms: int = Field(ge=0)
    human_confidence_pct: Literal[25, 50, 75, 100] | None = None


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def connect():
    db = sqlite3.connect(DATA / "sessions" / "pilot.sqlite3")
    db.row_factory = sqlite3.Row
    return db


def score_trial(stimulus, response):
    human_correct = response["human_choice"] == stimulus["ground_truth"]
    model_correct = stimulus["model_choice"] == stimulus["ground_truth"]
    return {
        **stimulus, **response,
        "human_correct": human_correct,
        "model_correct": model_correct,
        "outcome": OUTCOMES[human_correct, model_correct],
    }
