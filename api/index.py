"""Vercel Python entry point for the ISL FastAPI application.

Keep this file at the repository root so model/, model_aug/, model_digits_v3/,
model_phrases/, mediapipe/, and backend/ remain available together at build time.
"""
from backend.app.main import app

