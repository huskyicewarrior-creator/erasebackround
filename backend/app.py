"""A small, single-worker image service for a memory-constrained Raspberry Pi."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import queue
import secrets
import shutil
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("erasebackround")
MAX_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "12000000"))
MAX_QUEUE = int(os.getenv("MAX_QUEUE", "3"))
TTL = int(os.getenv("RESULT_TTL_SECONDS", "900"))
DAILY_LIMIT = int(os.getenv("DAILY_LIMIT", "200"))
IP_HOURLY_LIMIT = int(os.getenv("IP_HOURLY_LIMIT", "20"))
WORK = Path(os.getenv("WORK_DIR", str(Path(__file__).parent / "work"))).resolve()
ORIGINS = [value.strip() for value in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if value.strip()]
TRUST_CF_IP = os.getenv("TRUST_CLOUDFLARE_IP", "false").lower() == "true"
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


@dataclass
class Job:
    token_hash: str
    created: float
    status: str = "queued"
    method: str = "auto"
    selected_method: str | None = None
    error: str | None = None
    completed: float | None = None
    cancelled: bool = False


jobs: dict[str, Job] = {}
lock = threading.RLock()
job_queue: queue.Queue[str | None] = queue.Queue(maxsize=MAX_QUEUE)
requests_by_ip: dict[str, deque[float]] = {}
daily_requests: deque[float] = deque()
model_session = None
worker_ready = False


def image_open(path: Path, validate_only: bool = False) -> Image.Image | None:
    try:
        with Image.open(path) as source:
            if source.format not in {"JPEG", "PNG", "WEBP", "AVIF"}:
                raise ValueError("Supported formats are JPEG, PNG, WebP and AVIF.")
            if getattr(source, "n_frames", 1) != 1:
                raise ValueError("Animated images are not supported. Please choose a still image.")
            if source.width * source.height > MAX_PIXELS:
                raise ValueError("The image exceeds the pixel limit.")
            if validate_only:
                source.verify()
                return None
            source.load()
            return ImageOps.exif_transpose(source).convert("RGBA")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Could not decode this image, or its dimensions are too large.") from exc


def likely_green_screen(image: Image.Image) -> bool:
    """Only auto-key when green dominates all four border regions."""
    sample = image.copy()
    sample.thumbnail((256, 256))
    a = np.asarray(sample, dtype=np.int16)
    rgb = a[:, :, :3]
    green = (rgb[:, :, 1] > 80) & (rgb[:, :, 1] > rgb[:, :, 0] * 1.4) & (rgb[:, :, 1] > rgb[:, :, 2] * 1.3) & (a[:, :, 3] > 200)
    h, w = green.shape
    border = max(1, min(h, w) // 12)
    regions = (green[:border, :], green[-border:, :], green[:, :border], green[:, -border:])
    return all(float(region.mean()) > 0.8 for region in regions)


def chroma_key(image: Image.Image) -> Image.Image:
    """Remove green connected to an image edge; retain disconnected green details."""
    import cv2
    rgba = np.asarray(image, dtype=np.uint8).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    excess = rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    candidates = ((excess > 18) & (rgb[:, :, 1] > 65)).astype(np.uint8)
    # Connected components prevents erasing green regions enclosed by the subject.
    count, labels = cv2.connectedComponents(candidates, connectivity=8)
    edge_labels = np.unique(np.concatenate((labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1])))
    edge_labels = edge_labels[edge_labels != 0]
    if count <= 1 or edge_labels.size == 0:
        return image
    connected = np.isin(labels, edge_labels)
    coverage = np.clip((excess - 12) / 45, 0, 1)
    alpha = rgba[:, :, 3].astype(np.float32)
    alpha[connected] *= (1 - coverage[connected])
    rgba[:, :, 3] = alpha.astype(np.uint8)
    return Image.fromarray(rgba)


def process(path: Path, output: Path, method: str) -> str:
    image = image_open(path)
    assert image is not None
    selected = "green" if method == "green" or (method == "auto" and likely_green_screen(image)) else "model"
    if selected == "green":
        result = chroma_key(image)
    else:
        from rembg import remove
        result = remove(image, session=model_session).convert("RGBA")
        # rembg's output may already include source alpha; preserve it without multiplying twice.
        original_alpha = np.asarray(image.getchannel("A"))
        result_alpha = np.asarray(result.getchannel("A"))
        result.putalpha(Image.fromarray(np.minimum(original_alpha, result_alpha)))
    # A fresh image prevents input metadata from being carried into the output.
    clean = Image.frombytes("RGBA", result.size, result.tobytes())
    clean.save(output, format="PNG", optimize=False)
    return selected


def cleanup() -> None:
    now = time.time()
    with lock:
        expired = [key for key, job in jobs.items() if job.completed is not None and now - job.completed > TTL]
        for key in expired:
            del jobs[key]
            shutil.rmtree(WORK / key, ignore_errors=True)
        for key in list(requests_by_ip):
            q = requests_by_ip[key]
            while q and q[0] <= now - 3600:
                q.popleft()
            if not q:
                del requests_by_ip[key]
        while daily_requests and daily_requests[0] <= now - 86400:
            daily_requests.popleft()


def worker() -> None:
    while True:
        try:
            key = job_queue.get(timeout=30)
        except queue.Empty:
            cleanup()
            continue
        if key is None:
            job_queue.task_done()
            break
        try:
            with lock:
                job = jobs.get(key)
                if job is None or job.cancelled:
                    if job:
                        job.status, job.completed = "cancelled", time.time()
                    continue
                job.status = "processing"
            directory = WORK / key
            try:
                selected = process(directory / "input", directory / "result.png", job.method)
                with lock:
                    if job.cancelled:
                        (directory / "result.png").unlink(missing_ok=True)
                        job.status = "cancelled"
                    else:
                        job.selected_method = selected
                        job.status = "complete"
            except Exception:
                log.exception("Image processing failed")
                with lock:
                    job.status = "failed"
                    job.error = "Could not process this image. Try another image or mode."
            finally:
                (directory / "input").unlink(missing_ok=True)
                with lock:
                    job.completed = time.time()
        finally:
            job_queue.task_done()
            cleanup()


def authorize(key: str, authorization: str | None) -> Job:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(404, "Job not found.")
    digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
    with lock:
        job = jobs.get(key)
        if not job or not hmac.compare_digest(job.token_hash, digest):
            raise HTTPException(404, "Job not found.")
        if job.completed is not None and time.time() - job.completed > TTL:
            raise HTTPException(404, "Job not found.")
        return job


def take_quota(ip: str) -> None:
    now = time.time()
    with lock:
        cleanup()
        history = requests_by_ip.setdefault(ip, deque())
        if len(history) >= IP_HOURLY_LIMIT or len(daily_requests) >= DAILY_LIMIT:
            raise HTTPException(429, "Capacity limit reached. Please try again later.")
        history.append(now)
        daily_requests.append(now)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global model_session, worker_ready
    WORK.mkdir(parents=True, exist_ok=True)
    for child in WORK.iterdir():
        if child.is_dir() and len(child.name) == 32 and all(c in "0123456789abcdef" for c in child.name):
            shutil.rmtree(child, ignore_errors=True)
    from rembg import new_session
    model_session = await asyncio.to_thread(new_session, "u2netp")
    thread = threading.Thread(target=worker, daemon=True, name="inference-worker")
    thread.start()
    worker_ready = True
    yield
    worker_ready = False
    try:
        job_queue.put_nowait(None)
    except queue.Full:
        pass


app = FastAPI(title="erasebackround API", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization", "Content-Type"], max_age=600)


@app.middleware("http")
async def limit_body(request: Request, call_next):
    if request.method == "POST":
        length = request.headers.get("content-length")
        if length:
            try:
                if int(length) > MAX_BYTES + 65536 or int(length) < 0:
                    return JSONResponse({"detail": "Image exceeds the upload limit."}, status_code=413)
            except ValueError:
                return JSONResponse({"detail": "Invalid content length."}, status_code=400)
        # Reject chunked requests: the reverse proxy must supply a bounded Content-Length.
        else:
            return JSONResponse({"detail": "Content-Length is required."}, status_code=411)
        actual = 0
        original_receive = request._receive
        async def bounded_receive():
            nonlocal actual
            message = await original_receive()
            if message["type"] == "http.request":
                actual += len(message.get("body", b""))
                if actual > MAX_BYTES + 65536:
                    raise HTTPException(413, "Image exceeds the upload limit.")
            return message
        request._receive = bounded_receive
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/health")
def health():
    return {"ready": worker_ready}


@app.post("/v1/jobs", status_code=202)
async def create_job(request: Request, file: UploadFile = File(...), mode: str = "auto"):
    if not worker_ready:
        raise HTTPException(503, "The image service is starting. Please try again shortly.")
    if mode not in {"auto", "model", "green"}:
        raise HTTPException(400, "Mode must be auto, model or green.")
    ip = request.headers.get("CF-Connecting-IP", "") if TRUST_CF_IP else (request.client.host if request.client else "unknown")
    take_quota(ip or "unknown")
    key, token = secrets.token_hex(16), secrets.token_urlsafe(32)
    directory = WORK / key
    directory.mkdir(mode=0o700)
    path = directory / "input"
    try:
        size = 0
        with path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "Image exceeds the upload limit.")
                output.write(chunk)
        if not size:
            raise HTTPException(400, "Choose a non-empty image.")
        try:
            await asyncio.to_thread(image_open, path, True)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        job = Job(hashlib.sha256(token.encode()).hexdigest(), time.time(), method=mode)
        with lock:
            jobs[key] = job
            try:
                job_queue.put_nowait(key)
            except queue.Full:
                del jobs[key]
                raise HTTPException(503, "The queue is full. Please try again shortly.")
        return {"id": key, "token": token, "status": "queued", "expires_in": TTL}
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    finally:
        await file.close()


@app.get("/v1/jobs/{key}")
def get_job(key: str, authorization: str | None = Header(default=None)):
    job = authorize(key, authorization)
    return {"status": job.status, "method": job.selected_method, "error": job.error}


@app.get("/v1/jobs/{key}/result")
def get_result(key: str, authorization: str | None = Header(default=None)):
    job = authorize(key, authorization)
    if job.status != "complete":
        raise HTTPException(409, "The result is not ready.")
    return FileResponse(WORK / key / "result.png", media_type="image/png", filename="erasebackround.png", headers={"Cache-Control": "no-store"})


@app.delete("/v1/jobs/{key}")
def cancel_job(key: str, authorization: str | None = Header(default=None)):
    job = authorize(key, authorization)
    with lock:
        job.cancelled = True
        if job.status in {"complete", "failed", "queued"}:
            # Remove finished or not-yet-started jobs completely. The worker skips
            # a queued job whose record has gone away.
            jobs.pop(key, None)
            shutil.rmtree(WORK / key, ignore_errors=True)
            return {"status": "cancelled"}
        job.status = "cancelling"
        status = job.status
    return {"status": status, "message": "Active processing may finish before the result is discarded."}
