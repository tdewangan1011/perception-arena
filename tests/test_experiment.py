import json
import tempfile
import unittest
from collections import Counter
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID, uuid4

from fastapi import HTTPException

from backend import experiment, sessions
from backend.design import DESIGNS, LABELS, LEVELS, SIZE, assign_trials, level_metadata, mask_box
from backend.exposure import exposure_lut


def fixture_bank(topic="occlusion"):
    return [
        {
            "base_image_id": f"{label}-{image}",
            "stimulus_id": f"{label}-{image}-{level}",
            "ground_truth": label,
            "model_choice": LABELS[0],
            "model_id": "test-only",
            "model_revision": "test-only",
            "level": level,
            **level_metadata(topic, f"{label}-{image}", level),
            "choices": list(LABELS),
        }
        for label in LABELS for image in range(4) for level in DESIGNS[topic].levels
    ]


class ExperimentTests(unittest.TestCase):
    def test_exposure_darkens_or_brightens_encoded_srgb(self):
        self.assertEqual(exposure_lut(0), list(range(256)))
        dark, bright = exposure_lut(-4), exposure_lut(2)
        self.assertEqual(dark[0], 0)
        self.assertLess(dark[-1], 255)
        self.assertLess(dark[128], 128)
        self.assertGreater(bright[128], 128)
        self.assertEqual(bright[150], 255)
        self.assertEqual(bright, sorted(bright))

    def test_mask_has_exact_area_and_is_reproducible(self):
        for base in ("source-002", "source-003", "source-004"):
            self.assertIsNone(mask_box(base, 0))
            previous = None
            for level in LEVELS[1:]:
                left, top, right, bottom = mask_box(base, level)
                self.assertEqual((right - left) * (bottom - top) * 100, SIZE * SIZE * level)
                self.assertTrue(0 <= left < right <= SIZE and 0 <= top < bottom <= SIZE)
                self.assertEqual(mask_box(base, level), (left, top, right, bottom))
                if previous:
                    self.assertTrue(left <= previous[0] and top <= previous[1])
                    self.assertTrue(right >= previous[2] and bottom >= previous[3])
                previous = (left, top, right, bottom)

    def test_assignment_balances_categories_and_never_repeats_a_source(self):
        bank = fixture_bank()
        expected = Counter({(label, level): 1 for label in LABELS for level in LEVELS})
        for seed in range(10):
            trials = assign_trials(bank, seed)
            self.assertEqual(len({trial["base_image_id"] for trial in trials}), 16)
            self.assertEqual(Counter((trial["ground_truth"], trial["level"]) for trial in trials), expected)
            self.assertEqual(trials, assign_trials(bank, seed))
            for trial in trials:
                self.assertCountEqual(trial["choices"], LABELS)
        self.assertNotEqual(assign_trials(bank, 0), assign_trials(bank, 1))

    def test_session_reveal_requires_all_responses_and_export_matches_results(self):
        for topic in DESIGNS:
            with self.subTest(topic=topic):
                self.check_session(topic)

    def check_session(self, topic):
        with tempfile.TemporaryDirectory() as directory, patch.object(sessions, "DATA", Path(directory)):
            (Path(directory) / "sessions").mkdir()
            with closing(sessions.connect()) as db, db:
                experiment.initialize(db)
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(experiment_banks={topic: fixture_bank(topic)})))
            state = experiment.create_experiment(request, topic)
            self.assertEqual(state["condition"], topic)
            session_id = UUID(state["session_id"])
            with self.assertRaises(HTTPException) as early_export:
                experiment.experiment_export(session_id)
            self.assertEqual(early_export.exception.status_code, 409)
            first = state["trial"]
            with self.assertRaises(HTTPException) as skipped:
                experiment.submit_experiment_response(session_id, sessions.Answer(
                    trial_id=uuid4(), human_choice=first["choices"][0], human_response_ms=500,
                ))
            self.assertEqual(skipped.exception.status_code, 409)

            for position in range(1, 17):
                trial = state["trial"]
                self.assertEqual(trial["position"], position)
                self.assertNotIn("ground_truth", trial)
                self.assertNotIn("model_choice", trial)
                answer = sessions.Answer(
                    trial_id=UUID(trial["trial_id"]), human_choice=trial["choices"][0], human_response_ms=500,
                )
                state = experiment.submit_experiment_response(session_id, answer)
                self.assertEqual(state, experiment.get_experiment(session_id))
                self.assertEqual(state, experiment.submit_experiment_response(session_id, answer))

            self.assertIsNone(state["trial"])
            result = experiment.experiment_results(session_id)
            self.assertEqual(result, json.loads(experiment.experiment_export(session_id).body))
            self.assertEqual(result["condition"], topic)
            self.assertEqual(sum(result["outcomes"].values()), 16)
            self.assertEqual([level["level"] for level in result["by_level"]], list(DESIGNS[topic].levels))
            self.assertEqual([level["total"] for level in result["by_level"]], [4, 4, 4, 4])
            self.assertEqual(len({trial["base_image_id"] for trial in result["trials"]}), 16)
            if topic == "blur":
                self.assertTrue(all(trial["blur_radius_px"] == trial["level"] for trial in result["trials"]))
            if topic == "lighting":
                self.assertTrue(all(trial["linear_rgb_multiplier"] == 2.0 ** trial["level"] for trial in result["trials"]))

