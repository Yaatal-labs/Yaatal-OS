FROM python:3.11-slim

WORKDIR /app

# Install deps (no build step — all pure Python)
RUN pip install --no-cache-dir fastapi uvicorn httpx websockets

# Copy the live/ layer
COPY live/ /app/live/

# Env defaults
ENV STUDIO_PORT=8484
ENV OLLAMA_BASE_URL=https://api.ollama.com
ENV OLLAMA_INTENT_MODEL=gemma3:4b
ENV ENGINE_API_URL=http://localhost:5150

EXPOSE 8484

CMD ["python", "-m", "uvicorn", "live.studio_server:app", "--host", "0.0.0.0", "--port", "8484"]