import hashlib
import io
import os
import tempfile
import time
import threading
import unittest
from pathlib import Path

from PIL import Image

os.environ.setdefault("WORK_DIR", tempfile.mkdtemp(prefix="erasebackround-test-"))
import app
from fastapi import HTTPException
from fastapi.testclient import TestClient


class PipelineTests(unittest.TestCase):
    def test_green_detection_requires_all_edges(self):
        green = Image.new("RGBA", (100, 100), (20, 220, 20, 255))
        self.assertTrue(app.likely_green_screen(green))
        green.paste((210, 30, 30, 255), (0, 0, 100, 20))
        self.assertFalse(app.likely_green_screen(green))

    def test_green_key_keeps_disconnected_green_and_original_alpha(self):
        image = Image.new("RGBA", (40, 40), (15, 220, 15, 255))
        image.paste((210, 30, 30, 128), (10, 10, 30, 30))
        image.paste((15, 220, 15, 255), (15, 15, 25, 25))
        result = app.chroma_key(image)
        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertEqual(result.getpixel((12, 12))[3], 128)
        self.assertEqual(result.getpixel((20, 20))[3], 255)

    def test_formats_and_invalid_images(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "image"
            for fmt in ("JPEG", "PNG", "WEBP", "AVIF"):
                Image.new("RGB", (12, 12), (100, 80, 60)).save(path, fmt)
                self.assertEqual(app.image_open(path).size, (12, 12), fmt)
            path.write_bytes(b"not an image")
            with self.assertRaises(ValueError):
                app.image_open(path)

    def test_animated_image_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "animated.png"
            first = Image.new("RGB", (12, 12), "red")
            first.save(path, save_all=True, append_images=[Image.new("RGB", (12, 12), "blue")], duration=100, loop=0)
            with self.assertRaisesRegex(ValueError, "Animated"):
                app.image_open(path)

    def test_output_is_png_without_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder) / "input", Path(folder) / "out.png"
            Image.new("RGBA", (30, 30), (10, 230, 10, 255)).save(source, "PNG")
            self.assertEqual(app.process(source, output, "auto"), "green")
            with Image.open(output) as result:
                self.assertEqual(result.mode, "RGBA")
                self.assertEqual(result.size, (30, 30))
                self.assertEqual(result.getpixel((0, 0))[3], 0)

    def test_job_capability_is_required(self):
        key, token = "test", "secret"
        app.jobs[key] = app.Job(hashlib.sha256(token.encode()).hexdigest(), 1)
        try:
            with self.assertRaises(HTTPException):
                app.authorize(key, "Bearer wrong")
            self.assertIs(app.authorize(key, "Bearer secret"), app.jobs[key])
        finally:
            del app.jobs[key]


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.WORK.mkdir(parents=True, exist_ok=True)
        app.worker_ready = True
        cls.thread = threading.Thread(target=app.worker, daemon=True)
        cls.thread.start()
        cls.client = TestClient(app.app)

    @classmethod
    def tearDownClass(cls):
        app.job_queue.put(None)
        cls.thread.join(timeout=5)
        app.worker_ready = False
        cls.client.close()

    def test_green_job_roundtrip_and_capability(self):
        image = io.BytesIO()
        Image.new('RGB', (32, 32), (15, 220, 15)).save(image, 'PNG')
        response = self.client.post('/v1/jobs?mode=green', files={'file': ('input.png', image.getvalue(), 'image/png')})
        self.assertEqual(response.status_code, 202, response.text)
        job = response.json()
        path = '/v1/jobs/' + job['id']
        self.assertEqual(self.client.get(path, headers={'Authorization': 'Bearer wrong'}).status_code, 404)
        headers = {'Authorization': 'Bearer ' + job['token']}
        for _ in range(50):
            response = self.client.get(path, headers=headers)
            if response.json()['status'] == 'complete':
                break
            time.sleep(.05)
        self.assertEqual(response.json()['status'], 'complete')
        result = self.client.get(path + '/result', headers=headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.headers['content-type'], 'image/png')
        self.assertEqual(Image.open(io.BytesIO(result.content)).getpixel((0, 0))[3], 0)
        self.assertEqual(self.client.delete(path, headers=headers).status_code, 200)
        self.assertEqual(self.client.get(path + '/result', headers=headers).status_code, 404)

    def test_invalid_and_oversized(self):
        response = self.client.post('/v1/jobs', files={'file': ('x.png', b'not an image', 'image/png')})
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/v1/jobs', content=b'x', headers={'content-length': str(app.MAX_BYTES + 100000)})
        self.assertEqual(response.status_code, 413)


if __name__ == "__main__":
    unittest.main()
