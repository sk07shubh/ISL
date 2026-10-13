# ISL Interpreter backend + built web app, one container.
# The classifier (model_aug/), the hand tracker (model/) and the built frontend (frontend/dist/) are in the repo.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY . .

# Live-test results are stored here. Mount a persistent volume at /data so they survive restarts.
ENV ISL_DB=/data/isl.db
RUN mkdir -p /data

EXPOSE 8000
CMD ["python3", "scripts/run.py"]
