"""Regression checks for the adaptive round and its score contract."""
import json
import tempfile
import unittest
from collections import Counter
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID

from fastapi import HTTPException

from backend import mixed, sessions
from backend.prepare_mixed import LABELS


def bank():
    entries = []
    for topic in mixed.TOPICS:
        adaptive = topic in mixed.ADAPTIVE
        for index in range(48 if topic in mixed.ADAPTIVE[:3] else 12):
            for tier in range(5) if adaptive else (None,):
                entries.append(dict(id=f"{topic}-{index}-{tier}", source_id=f"photo-{index}" if topic in mixed.ADAPTIVE[:3] else f"{topic}-{index}",
                    topic=topic, tier=tier, stimulus_id="0"*64, prompt="Choose", choices=list(LABELS),
                    answer=LABELS[index % 4], model_choice=LABELS[index % 4], condition="test"))
    return entries


class MixedTests(unittest.TestCase):
    def test_schedule_adapts_without_repeats_and_retries_are_idempotent(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(sessions, "DATA", Path(folder)):
            (Path(folder)/"sessions").mkdir()
            with closing(sessions.connect()) as db, db:
                mixed.initialize(db)
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(mixed_bank=bank())))
            state = mixed.create_session(request, mixed.StartMixed())
            sid = UUID(state["session_id"])
            with self.assertRaises(HTTPException):
                mixed.results(sid)
            shown = []
            for position in range(32):
                trial = state["trial"]
                self.assertNotIn("answer", trial)
                self.assertNotIn("model_choice", trial)
                self.assertEqual(position + 1, trial["position"])
                with closing(sessions.connect()) as db:
                    snapshot = json.loads(mixed.get_row(db, sid)["state"])
                internal = snapshot["current"]
                shown.append(internal)
                answer = sessions.Answer(trial_id=UUID(trial["trial_id"]),
                    human_choice=internal["answer"], human_response_ms=100)
                state = mixed.submit_response(sid, answer)
                self.assertEqual(state, mixed.submit_response(sid, answer))
                wrong = next(c for c in internal["choices"] if c != internal["answer"])
                with self.assertRaises(HTTPException) as caught:
                    mixed.submit_response(sid, answer.model_copy(update={"human_choice": wrong}))
                self.assertEqual(caught.exception.status_code, 409)
            self.assertIsNone(state["trial"])
            self.assertEqual(len({s["source_id"] for s in shown}), 32)
            self.assertEqual(Counter(t["topic"] for t in shown), dict.fromkeys(mixed.TOPICS, 4))
            for topic in mixed.ADAPTIVE:
                self.assertEqual([t["tier"] for t in shown if t["topic"] == topic], [1, 2, 3, 4])
            report = mixed.results(sid)
            self.assertEqual(report["composite_score"], 50)
            self.assertEqual(report["human_correct"],32)
            self.assertEqual(report["model_correct"],32)

    def test_wrong_answers_step_down_and_score_is_bounded(self):
        state = dict(version=mixed.VERSION, seed=19, bank=bank(), schedule=list(mixed.TOPICS)*4, recent_sources=[],
            tiers=dict.fromkeys(mixed.ADAPTIVE,1), shown=[], responses=[])
        mixed.select_next(state)
        first = state["current"]
        state["tiers"][first["topic"]] = max(0, first["tier"] - 1)
        self.assertEqual(state["tiers"][first["topic"]], 0)
        for i in range(32):
            if i:
                mixed.select_next(state)
            trial=state["current"]
            trial["model_choice"]=next(c for c in trial["choices"] if c != trial["answer"])
            state["responses"].append(dict(human_choice=trial["answer"]))
        self.assertEqual(mixed.score_result(state)["composite_score"],100)
        for trial, answer in zip(state["shown"],state["responses"]):
            answer["human_choice"]=trial["model_choice"]
            trial["model_choice"]=trial["answer"]
        self.assertEqual(mixed.score_result(state)["composite_score"],0)

    def test_recent_photos_are_avoided_when_fresh_ones_exist(self):
        state = dict(seed=1, bank=bank(), schedule=list(mixed.TOPICS)*4,
            recent_sources=["photo-0"], tiers=dict.fromkeys(mixed.ADAPTIVE,1), shown=[], responses=[])
        mixed.select_next(state)
        self.assertNotEqual(state["current"]["source_id"],"photo-0")
