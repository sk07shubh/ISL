"""Run:  python3 -m unittest backend/tests/test_analytics.py"""
import sys, pathlib, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from backend.app import analytics as A


def row(target, label, conf, test=1, tester="T01", lighting="bright", distance="near", ms=800, hs=0.2, br=150):
    return {"test_id": test, "tester": tester, "lighting": lighting, "distance": distance,
            "target": target, "predicted": label, "confidence": conf, "margin": None, "top_label": label, "top_conf": conf,
            "elapsed_ms": ms, "hand_size": hs, "brightness": br}


class Metrics(unittest.TestCase):
    def setUp(self):
        self.rows = [
            row("A", "A", 0.95),          # correct
            row("B", "B", 0.85),          # correct
            row("C", "A", 0.90),          # confidently wrong
            row("D", None, 0.40),         # uncertain (top_conf below threshold)
            row("A", "A", 0.70),          # below 0.8: not shown, counts as uncertain
        ]

    def test_summary_at_threshold_080(self):
        s = A.summary(self.rows, 0.8)
        self.assertEqual((s["attempts"], s["shown"], s["correct"], s["wrong_shown"], s["uncertain"]), (5, 3, 2, 1, 2))
        self.assertAlmostEqual(s["accuracy_all"], 2 / 5)
        self.assertAlmostEqual(s["coverage"], 3 / 5)
        self.assertAlmostEqual(s["precision_shown"], 2 / 3)
        self.assertAlmostEqual(s["wrong_shown_rate"], 1 / 5)

    def test_threshold_changes_what_is_shown(self):
        self.assertEqual(A.summary(self.rows, 0.5)["shown"], 4)
        self.assertEqual(A.summary(self.rows, 0.96)["shown"], 0)

    def test_coverage_falls_as_threshold_rises(self):
        cov = [c["coverage"] for c in A.risk_coverage(self.rows)]
        self.assertEqual(cov, sorted(cov, reverse=True))

    def test_per_sign_precision_recall_f1(self):
        ps = {p["key"]: p for p in A.per_sign(self.rows, 0.8, ["A", "B", "C", "D"])}
        self.assertEqual(ps["A"]["support"], 2)
        self.assertAlmostEqual(ps["A"]["precision"], 1 / 2)   # predicted A twice (rows 1 and 3? only row 1 shown), one correct
        self.assertAlmostEqual(ps["A"]["recall"], 1 / 2)
        self.assertAlmostEqual(ps["B"]["f1"], 1.0)
        self.assertIsNone(ps["D"]["precision"])               # never shown
        self.assertEqual(ps["D"]["uncertain"], 1)

    def test_confusion_has_uncertain_column(self):
        c = A.confusion(self.rows, 0.8, ["A", "B", "C", "D"])
        self.assertEqual(c["matrix"][2][0], 1)                # asked C, read A
        self.assertEqual(c["uncertain"][3], 1)                # asked D, uncertain

    def test_legacy_rows_fall_back_to_predicted_confidence(self):
        legacy = [{"target": "A", "predicted": "A", "confidence": 0.9, "elapsed_ms": None, "tester": "T", "test_id": 1,
                   }]
        self.assertEqual(A.summary(legacy, 0.8)["correct"], 1)

    def test_recommendation_needs_enough_attempts(self):
        curve = A.risk_coverage(self.rows)
        self.assertIsNone(A.recommend_threshold(curve, len(self.rows)))

    def test_recommendation_respects_wrong_shown_target(self):
        many = [row("A", "A", 0.97) for _ in range(60)] + [row("B", "A", 0.85) for _ in range(2)]
        t = A.recommend_threshold(A.risk_coverage(many), len(many))
        self.assertIsNotNone(t)
        self.assertLessEqual(A.summary(many, t)["wrong_shown_rate"], A.WRONG_SHOWN_TARGET)

    def test_calibration_ece_zero_when_perfect(self):
        perfect = [row("A", "A", 0.97) for _ in range(20)] + [row("B", "A", 0.97) for _ in range(0)]
        cal = A.calibration(perfect)
        self.assertAlmostEqual(cal["ece"], 0.03, places=2)     # 97% stated, 100% right
        self.assertEqual(cal["n"], 20)

    def test_conditions_split(self):
        rows = [row("A", "A", 0.95, lighting="dim", hs=0.05, br=40),
                row("A", "B", 0.95, lighting="bright", hs=0.25, br=200)]
        out = A.analytics(rows, 0.8, ["A", "B"], {})
        self.assertIn("dim", out["by_condition"]["lighting"])
        self.assertIn("far (<0.10)", out["by_condition"]["hand_size"])
        self.assertIn("dark (<70)", out["by_condition"]["brightness"])
        self.assertNotIn("unseen_signer", out)


if __name__ == "__main__":
    unittest.main()
