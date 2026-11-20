# syntax=docker/dockerfile:1
FROM python:3.14-slim AS bundle
ARG RELEASE_TAG=v2026.11.20
ARG RELEASE_SHA256=6f0641378ed2f779d5f5e07740a703d6c64e5524653433e7c9ed3f6800229f6a
COPY deploy/fetch-release.py /fetch-release.py
RUN --mount=type=secret,id=github-token,required=true RELEASE_TAG="$RELEASE_TAG" RELEASE_SHA256="$RELEASE_SHA256" python /fetch-release.py

FROM python:3.14-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PERCEPTION_SESSIONS_DIR=/var/lib/perception-arena PORT=8000
COPY --from=bundle /bundle/backend/requirements-runtime.txt /tmp/requirements-runtime.txt
RUN pip install --no-cache-dir -r /tmp/requirements-runtime.txt \
    && useradd --system --uid 10001 arena \
    && mkdir -p /var/lib/perception-arena && chown arena /var/lib/perception-arena
COPY --from=bundle /bundle/backend ./backend
COPY --from=bundle /bundle/assets ./assets
COPY --from=bundle /bundle/data ./data
COPY --from=bundle /bundle/dist ./dist
USER arena
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ['PORT']+'/api/ready',timeout=3)"
CMD ["sh", "-c", "exec python -m uvicorn backend.production:app --host 0.0.0.0 --port \"$PORT\""]
