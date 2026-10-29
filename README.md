# erasebackround.com

A no-account still-image background remover with a React/Vite frontend and a small Python API intended for a Raspberry Pi 5 with 4 GB RAM. The backend has been installed and tested on a Raspberry Pi 5 (4 GB) running 64-bit Raspberry Pi OS 13 (Trixie); no public deployment has been performed yet. Supported inputs are JPEG, PNG, WebP and AVIF still images; output is PNG with transparency. Automatic mode conservatively chooses a green-screen key when all image borders are predominantly green, and otherwise uses the u2netp model. Choose General image when green-screen detection is wrong, or Green screen to override it. Chroma keying can remove foreground greens connected to the backdrop and is not equivalent to CorridorKey.

## Run the frontend

Requirements: Node.js and npm. Install and run:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to the HTTPS URL of the Pi API (for local development use `http://127.0.0.1:8000`). Restart Vite when changing it. Vite environment variables are public, so never put secrets there. Without an API URL, the UI displays an explicit setup error rather than pretending to process an image.

Build with `npm run build`. The build generates static HTML for the guide index and each guide, plus page-specific titles, descriptions, canonical URLs, `sitemap.xml`, and `robots.txt`. Canonicals default to `https://erasebackround.com`; once the final public domain is confirmed, set `SITE_ORIGIN` at build time if it differs. Add or edit guides in `src/guides.tsx` and rebuild to regenerate the sitemap. The Vercel configuration falls back to the client-rendered custom 404 page for unknown paths, but this SPA rewrite returns HTTP 200. For search-engine-correct 404 status codes, switch to a host/routing setup that supports a genuine 404 response.

## Raspberry Pi setup

The tested setup is a Raspberry Pi 5 (4 GB) with 64-bit Raspberry Pi OS 13 (Trixie) and Python 3.13. The dependency file selects the appropriate NumPy version for Python 3.11–3.12 or 3.13. If `python3-venv` is unavailable, install the OS package for it first. On the Pi, copy this repository's `backend` directory to a permanent location such as `~/erasebackround/backend`, then from that directory:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
U2NET_HOME="$PWD/models" python -c "from rembg import new_session; new_session('u2netp')"
```

The first model load downloads the checkpoint. Verify the exact checkpoint's license and redistribution terms before deploying. rembg's MIT license is not a substitute for the model weights' license. CorridorKey/EZ-CorridorKey is intentionally not bundled; their documented hardware and licensing constraints are described at https://github.com/edenaion/EZ-CorridorKey and https://github.com/nikopueringer/CorridorKey/blob/main/LICENSE.

Configure the service with `cp pi.env.example pi.env` and edit `ALLOWED_ORIGINS` to include the exact deployed frontend origin. Then start it once:

```sh
./start-pi.sh
curl http://127.0.0.1:8000/health
```

`start-pi.sh` loads `pi.env`, keeps the API bound to loopback on port 8000, writes `server.pid` and appends to `server.log`, and refuses to start a second copy. Re-running it is safe. The script uses one Uvicorn worker because the queue, quotas and job state are in memory; a restart intentionally loses in-flight jobs and clears their temporary files. Do not use multiple workers.

For reboot startup without administrator access, the tested option is the user's own crontab (cron is enabled on Raspberry Pi OS):

```sh
(crontab -l 2>/dev/null | grep -vF '# erasebackround image service'; \
 echo '# erasebackround image service'; \
 echo "@reboot $HOME/erasebackround/backend/start-pi.sh") | crontab -
crontab -l
```

A system-wide systemd unit is an alternative when an administrator is available; it is not required for the user-level setup above. A reboot was not performed during setup, so verify `@reboot` behavior at a convenient time with `crontab -l` and `curl http://127.0.0.1:8000/health` after restarting.

Change the default account password and review SSH access before exposing the Pi beyond your local network. The API intentionally listens only on `127.0.0.1`; do not bind it to `0.0.0.0` as a shortcut for public access.

### Connect the local frontend to the Pi

The API is loopback-only, so forward it over SSH while developing on another computer:

```sh
ssh -N -L 127.0.0.1:8000:127.0.0.1:8000 piadmin@erasebackround.local
```

With `.env.local` set to `VITE_API_BASE_URL=http://127.0.0.1:8000`, the frontend uses the Pi for processing. This SSH tunnel is only for local testing. A deployed Vercel frontend cannot reach the Pi this way: it needs the Cloudflare Tunnel below and an exact Vercel origin in `ALLOWED_ORIGINS` on the Pi.

### Measured on the test Pi

These are single-run measurements on one Raspberry Pi 5 (4 GB), not universal guarantees. Synthetic images were a plain background with a simple subject, processed with the `u2netp` model after warm-up:

| Image | Processing time | Peak process memory |
| --- | --- | --- |
| 512 × 512 | 0.56 s | 437 MB |
| 1280 × 720 | 0.57 s | 647 MB |
| 1920 × 1080 | 0.58 s | 677 MB |
| 3000 × 4000 (12 MP) | 0.83 s | 885 MB |

The running service used roughly 710 MB of RAM after repeated jobs, remained around 38 °C with no throttling, and logged no errors. A real 1600 × 1201 JPEG produced a valid transparent cutout in 1.41 s end to end through the HTTP API. Model loading cold start took about 52 s including first download. Benchmark again with representative images and sustained traffic before opening the service publicly; automatic quality on hair, glass, and low-contrast edges still needs human review.

## Tunnel and limits

Create a Cloudflare Tunnel routed to `http://127.0.0.1:8000` and an HTTPS API hostname; avoid router port forwarding. Only configure `TRUST_CLOUDFLARE_IP=true` if all traffic to the loopback origin is trusted to come from a correctly configured Cloudflare Tunnel: the API then uses `CF-Connecting-IP` for the per-IP limiter. Never expose the origin directly while trusting this header. Restrict approved origins exactly; CORS is not authentication. The API is deliberately public and job results require an unguessable, short-lived bearer capability. Add Cloudflare WAF rate limiting and request size limits at the edge before public use; application counters are in-memory, reset on restart and are not a complete DDoS defense.

Configuration (environment variables, optional unless noted):

| Name | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | localhost:5173 and 127.0.0.1:5173 | Comma-separated exact frontend origins, including approved preview origin(s). |
| `TRUST_CLOUDFLARE_IP` | `false` | Trust the tunnel-provided client IP only when the origin is inaccessible to untrusted callers. |
| `MAX_UPLOAD_BYTES` | `10485760` | Upload limit, excluding small multipart overhead. |
| `MAX_IMAGE_PIXELS` | `12000000` | Max decoded dimensions in pixels. |
| `MAX_QUEUE` | `3` | Waiting jobs, excluding the one active job. |
| `RESULT_TTL_SECONDS` | `900` | Retention after completion or cancellation. |
| `IP_HOURLY_LIMIT` | `20` | Accepted submissions per IP per rolling hour. |
| `DAILY_LIMIT` | `200` | Submissions across all clients per rolling day. |
| `WORK_DIR` | `backend/work` | Dedicated temporary work directory, never shared with unrelated files. |

The measured 12 MP workload stayed well below the 4 GB limit, but these defaults are still conservative operating limits, not a promise of capacity. The frontend advertises the default 10 MB and 12 megapixel limits: update its copy if changing server limits. Processing large files and chroma key buffers can still exceed a 4 GB Pi's safe memory under concurrency: keep one worker, measure peak RSS, and reduce limits if needed. Timeouts should be enforced in the tunnel/proxy and service supervisor; active native inference cannot necessarily be interrupted. The cleanup loop removes expired completed jobs within roughly 30 seconds of their retention period when idle. Cancelled queued jobs remain in the queue until the worker reaches them; active cancellation discards the result after processing. Deleting a completed, failed or queued job removes its record and files immediately; deleting an active job marks it for cancellation and discards its result after processing. Inputs are temporary, and image metadata is stripped from the PNG. The frontend sends a best-effort job deletion when an image is cleared or the page closes, and results otherwise expire after the configured TTL.

Run tests after installing the test requirements:

```sh
cd backend
pip install -r requirements-test.txt
python -m unittest discover -s tests -v
```

## API

The frontend's `/api` page documents the asynchronous API and a curl workflow. `POST /v1/jobs?mode=auto` takes multipart `file` and returns a job ID and token. Use `Authorization: Bearer <token>` for `GET /v1/jobs/{id}`, `GET /v1/jobs/{id}/result`, and `DELETE /v1/jobs/{id}`. Tokens are never to be committed or put in URLs. `GET /health` reports worker readiness.

## Vercel and GitHub

Create a GitHub repository under the desired account, review files, and push after authorization. Import that repository into Vercel; set `VITE_API_BASE_URL` for the intended environment to the HTTPS tunnel URL, and set `ALLOWED_ORIGINS` on the Pi to the exact frontend origin. Vercel's first deployment of a new project is classified as production; use deployment protection or obtain explicit production approval before making it publicly available. Preview origins are public unless separately protected. Vercel Hobby is limited to personal, non-commercial use: https://vercel.com/docs/plans/hobby. Domain ownership, DNS, accounts, Pi access and hosting configuration have not been verified.

Before any public launch, complete the privacy notice with the real operator identity and contact, provider log retention settings, and actual data practices, and arrange appropriate legal review. The current privacy page is explicitly marked pre-launch.

## Search visibility

After the public domain is live and its final canonical origin is configured, verify the domain in [Google Search Console](https://search.google.com/search-console), submit `https://erasebackround.com/sitemap.xml` (or the equivalent on the confirmed domain), and use URL Inspection to test the homepage and a guide. Do not submit a protected preview or a domain you do not control. A sitemap helps discovery but does not guarantee indexing or rankings; crawling can take days or longer. See [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) and [Search Console guidance](https://developers.google.com/search/docs/monitor-debug/search-console-start).
