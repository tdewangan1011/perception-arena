# syntax=docker/dockerfile:1
FROM python:3.14-slim AS bundle
ARG RELEASE_TAG=v2026.11.24
ARG RELEASE_SHA256=eae3daf6925c8f44411d0b84274fae8e6279df540ad9d6af14db48e5015e5858
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
