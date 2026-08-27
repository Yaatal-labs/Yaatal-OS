FROM python:3.11-slim

WORKDIR /app

ARG STUDIO_GIT_SHA=unknown

# Install the complete active-layer dependency set from one source of truth.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the live/ layer
COPY live/ /app/live/

RUN useradd --create-home --uid 10001 studio \
    && mkdir -p /app/data \
    && chown -R studio:studio /app
USER studio

# Env defaults
ENV STUDIO_PORT=8484
ENV OLLAMA_BASE_URL=https://api.ollama.com
ENV OLLAMA_INTENT_MODEL=deepseek-v4-flash
ENV ENGINE_API_URL=http://yaatal-engine:8080
ENV HARNESS_URL=http://yaatal-edge-turn:8090
ENV STUDIO_GIT_SHA=${STUDIO_GIT_SHA}
ENV STUDIO_TURN_LEDGER=/app/data/studio-turns.jsonl

EXPOSE 8484

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8484/health', timeout=3).read()"

CMD ["python", "-m", "uvicorn", "live.studio_server:app", "--host", "0.0.0.0", "--port", "8484"]
