"""
Unit tests for SessionRecorder — consent gating, JSONL shape, pseudonymization,
manifest counts. No network, local tmp dirs only.

Run:
  python -m unittest live.data_faucet.test_recorder -v
(from the repo root, per CLAUDE.md's "run from repo root" convention).
"""

import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from live.agent_loop.orchestrator import CommentMonitor
from live.data_faucet.recorder import SessionRecorder


class SessionRecorderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def test_disabled_without_consent_is_a_noop(self):
        rec = SessionRecorder("s1", data_dir=str(self.tmp), consent=False)
        self.assertFalse(rec.enabled)

        rec.record_comment(_fake_event(user="+221771234567", text="Combien?"))
        rec.record_utterance("s1", "jeex na")
        manifest = rec.session_manifest()

        self.assertEqual(manifest, {})
        self.assertEqual(list(self.tmp.iterdir()), [])  # nothing written at all

    def test_disabled_when_data_dir_cannot_be_created(self):
        # A plain file sitting where the data dir should be: mkdir(exist_ok=True)
        # only tolerates an existing *directory*, so this can never become a
        # writable dir — a permission-bit test would be unreliable running as
        # root (root bypasses W_OK checks), so use a type conflict instead.
        blocker = self.tmp / "blocker"
        blocker.write_text("not a directory")
        rec = SessionRecorder("s1", data_dir=str(blocker), consent=True)
        self.assertFalse(rec.enabled)

    def test_enabled_writes_valid_jsonl_with_pseudonymized_author(self):
        rec = SessionRecorder("s1", data_dir=str(self.tmp), consent=True)
        raw_handle = "+221771234567"
        event = _fake_event(user=raw_handle, text="Combien le sac?",
                             is_question=True, platform="whatsapp")

        rec.record_comment(event)

        path = self.tmp / "s1.jsonl"
        self.assertTrue(path.exists())
        lines = path.read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 1)
        row = json.loads(lines[0])

        self.assertEqual(row["session_id"], "s1")
        self.assertEqual(row["source"], "live_comment")
        self.assertEqual(row["platform"], "whatsapp")
        self.assertEqual(row["text"], "Combien le sac?")
        self.assertTrue(row["is_question"])
        self.assertIn("ts", row)

        # Raw handle must never appear anywhere in the file.
        raw_text = path.read_text(encoding="utf-8")
        self.assertNotIn(raw_handle, raw_text)

        # Pseudonym is the documented 8-hex-char sha256 prefix.
        expected = hashlib.sha256(raw_handle.encode("utf-8")).hexdigest()[:8]
        self.assertEqual(row["author"], expected)
        self.assertEqual(len(row["author"]), 8)
        int(row["author"], 16)  # must be valid hex

    def test_pseudonym_is_stable_across_calls(self):
        rec = SessionRecorder("s1", data_dir=str(self.tmp), consent=True)
        rec.record_comment(_fake_event(user="+221771234567", text="one"))
        rec.record_comment(_fake_event(user="+221771234567", text="two"))
        rec.record_comment(_fake_event(user="+221779876543", text="three"))

        rows = [json.loads(line) for line in
                (self.tmp / "s1.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(rows[0]["author"], rows[1]["author"])
        self.assertNotEqual(rows[0]["author"], rows[2]["author"])

    def test_record_utterance_writes_same_session_file(self):
        rec = SessionRecorder("s1", data_dir=str(self.tmp), consent=True)
        rec.record_comment(_fake_event(user="a", text="hi"))
        rec.record_utterance("s1", "jeex na", lang="wolof", speaker="seller")

        lines = (self.tmp / "s1.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 2)
        utterance = json.loads(lines[1])
        self.assertEqual(utterance["source"], "utterance")
        self.assertEqual(utterance["session_id"], "s1")
        self.assertEqual(utterance["text"], "jeex na")
        self.assertEqual(utterance["lang"], "wolof")
        self.assertEqual(utterance["speaker"], "seller")

    def test_session_manifest_tracks_counts(self):
        rec = SessionRecorder("s1", data_dir=str(self.tmp), consent=True)
        rec.record_comment(_fake_event(user="a", text="hi"))
        rec.record_comment(_fake_event(user="b", text="yo"))
        rec.record_utterance("s1", "jeex na")

        manifest = rec.session_manifest()
        self.assertEqual(manifest["session_id"], "s1")
        self.assertEqual(manifest["consent"], True)
        self.assertEqual(manifest["counts"],
                          {"live_comment": 2, "utterance": 1})
        self.assertIn("started_at", manifest)

        on_disk = json.loads((self.tmp / "s1.meta.json").read_text(encoding="utf-8"))
        self.assertEqual(on_disk, manifest)

    def test_comment_monitor_wiring_feeds_recorder(self):
        """The lightest honest integration: CommentMonitor.add_comment calls
        recorder.record_comment alongside the existing on_comment callback."""
        rec = SessionRecorder("s1", data_dir=str(self.tmp), consent=True)
        monitor = CommentMonitor(recorder=rec)

        monitor.add_comment("whatsapp", "+221771234567", "Combien?")

        lines = (self.tmp / "s1.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 1)
        row = json.loads(lines[0])
        self.assertEqual(row["text"], "Combien?")
        self.assertNotIn("+221771234567", lines[0])


def _fake_event(user, text, is_question=False, platform="whatsapp", timestamp=0.0):
    from live.agent_loop.orchestrator import CommentEvent
    return CommentEvent(platform=platform, user=user, text=text,
                         timestamp=timestamp or 1.0, is_question=is_question)


if __name__ == "__main__":
    unittest.main()
