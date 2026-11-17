# Launch Perception Arena

The release bundles the built frontend, FastAPI runtime, media, and verified precomputed model predictions for one origin. The readiness endpoint checks every scored challenge other than the optional pilot. No model weights or inference packages are needed at runtime.

## Prepare the release

From the checkout, after running the model preparation commands in README.md:

```powershell
npm ci
npm run build
.\.venv\Scripts\python.exe -m backend.release
```

Use `release/perception-arena.zip` as the deployment input. The packager rejects stale or missing predictions. The zip excludes local sessions, checkpoint weights, design previews, and scratch files. Keep generated hash-named PNGs from past launches available when rolling forward so saved reviews can still use them.

## Run the release locally

Extract the archive and run these from its root. Use Python 3.14 and a clean virtual environment, or build the included Dockerfile.

```text
python -m pip install -r backend/requirements-runtime.txt
python -m uvicorn backend.production:app --host 127.0.0.1 --port 8000
```

```text
docker build -t perception-arena .
docker run --rm -p 8000:8000 perception-arena
```

Check `http://127.0.0.1:8000/api/ready` and load the home page. The container listens on the `PORT` environment variable (default 8000). The app serves its frontend and API on the same origin, and uses browser hash routes.

## Publish and verify

1. Choose a container host and deploy the image built from the extracted bundle as a single service. Set the health check path to `/api/ready`, enable HTTPS, and use the final hostname before sharing the link. Configure request limits at the host or proxy for public API traffic.
2. The app creates a SQLite file in the container for server-scored rounds. Mount a writable volume at `/var/lib/perception-arena` if in-progress sessions should survive container replacement. The image runs as UID 10001. For a non-container launch, set `PERCEPTION_SESSIONS_DIR` to a writable directory as needed. Use a single instance while using a local SQLite file.
3. From a fresh browser profile, complete a score-backed visual round and Speech in Noise. Check comparisons, replays, JSON export for the visual round, and the Data & credits page. Close and reopen the browser and verify saved results at the same HTTPS address. Restart the service and check readiness again.
4. Share the HTTPS address after the staging checks pass.

## Result lifetime

Completed results are saved in localStorage with no app expiration. The latest completed round per topic replaces the previous one. Legacy results can migrate from an open app tab on the same origin. A different browser profile, device, or hostname has separate storage. Clearing browser data removes those local results. A completed recognition or change-detection score and its JSON export can be recovered from the local snapshot without the server session record. Review images still need their release files.
