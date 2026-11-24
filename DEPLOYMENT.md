# Launch Perception Arena

The release bundles the built frontend, FastAPI runtime, media, and verified precomputed model predictions for one origin. The readiness endpoint checks every scored challenge other than the optional pilot. No model weights or inference packages are needed at runtime.

Prepare the Mixed Visual Challenge bank with `python -m backend.prepare_mixed` before packaging. Its expanded image variants and model predictions are included in the release. Completed mixed rounds are stored in the browser, and a round in progress uses the same SQLite session store as the other server-scored challenges.

## Prepare the release

From the checkout, after running the model preparation commands in the [technical guide](docs/TECHNICAL_GUIDE.md):

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

### Render deployment from this private repository

The root `Dockerfile` downloads the checksum-pinned `v2026.11.24` GitHub release bundle. It does not attempt model inference during deployment. This is separate from `Dockerfile.release`, which builds an already extracted archive.

1. Create an account at https://dashboard.render.com and connect GitHub. Grant access to `tdewangan1011/perception-arena`.
2. In GitHub, open Settings → Developer settings → Personal access tokens → Fine-grained tokens. Create a token limited to this repository with **Contents: Read-only** permission. Set an expiration that covers deployment/rebuilds. Do not put it into Git or chat.
3. In Render, choose **New → Web Service**, select this repository, branch `main`, language **Docker**, root directory blank, Dockerfile path `./Dockerfile`, and Docker build context `.`. Leave Docker Command blank.
4. Under Advanced, add a **Secret File** named exactly `github-token`, with the token as its contents. The Dockerfile uses a BuildKit secret mount so the token is not included in the image. Set health check path `/api/ready`.
5. Choose the Free instance for an initial preview, or a paid instance for an always-on site. Free instances sleep after 15 idle minutes and lose in-progress server sessions on restart or sleep. Completed browser results remain stored on the same origin. On a paid instance, add a persistent disk at `/var/lib/perception-arena` to preserve in-progress sessions; keep one instance.
6. Click **Deploy Web Service**. When live, open its HTTPS URL and `/api/ready`, then perform the checks below. Do not share your token with anyone. You can revoke it after a successful build, but another image build will require a valid token.

Each hosted image is pinned to a verified release archive. Future app updates require publishing a new prepared bundle and updating the release tag and checksum in the root Dockerfile before redeploying. A source-only push does not update the bundled runtime.

Render references: https://render.com/docs/docker, https://render.com/docs/docker-secrets, https://render.com/docs/free.

### Verification

1. Choose a container host and deploy the image built from the extracted bundle as a single service. Set the health check path to `/api/ready`, enable HTTPS, and use the final hostname before sharing the link. Configure request limits at the host or proxy for public API traffic.
2. The app creates a SQLite file in the container for server-scored rounds. Mount a writable volume at `/var/lib/perception-arena` if in-progress sessions should survive container replacement. The image runs as UID 10001. For a non-container launch, set `PERCEPTION_SESSIONS_DIR` to a writable directory as needed. Use a single instance while using a local SQLite file.
3. From a fresh browser profile, complete a score-backed visual round and Speech in Noise. Check comparisons, replays, JSON export for the visual round, and the Data & credits page. Close and reopen the browser and verify saved results at the same HTTPS address. Restart the service and check readiness again.
4. Share the HTTPS address after the staging checks pass.

## Result lifetime

Completed results are saved in localStorage with no app expiration. The latest completed round per topic replaces the previous one. Legacy results can migrate from an open app tab on the same origin. A different browser profile, device, or hostname has separate storage. Clearing browser data removes those local results. A completed recognition or change-detection score and its JSON export can be recovered from the local snapshot without the server session record. Review images still need their release files.
