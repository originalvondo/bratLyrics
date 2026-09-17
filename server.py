import base64
import json
import os
import shutil
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FFMPEG = shutil.which("ffmpeg") or r"C:\Users\tanim\Desktop\ffmpeg\bin\ffmpeg.exe"


class BratHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/export-prores":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            frames = payload["frames"]
            frame_rate = int(payload["frameRate"])
            if not frames or frame_rate <= 0:
                raise ValueError("No frames or invalid frame rate")

            with tempfile.TemporaryDirectory(prefix="brat-prores-") as temp_dir:
                temp_path = Path(temp_dir)
                for index, encoded in enumerate(frames):
                    (temp_path / f"frame_{index:06d}.png").write_bytes(base64.b64decode(encoded))
                output_path = temp_path / "lyrics.mov"
                command = [
                    FFMPEG,
                    "-hide_banner",
                    "-loglevel", "error",
                    "-framerate", str(frame_rate),
                    "-i", str(temp_path / "frame_%06d.png"),
                    "-c:v", "prores_ks",
                    "-profile:v", "4",
                    "-pix_fmt", "yuva444p10le",
                    "-alpha_bits", "16",
                    "-an",
                    "-y",
                    str(output_path),
                ]
                result = subprocess.run(command, capture_output=True, text=True, check=False)
                if result.returncode != 0:
                    raise RuntimeError(result.stderr.strip() or "FFmpeg failed")
                data = output_path.read_bytes()

            self.send_response(200)
            self.send_header("Content-Type", "video/quicktime")
            self.send_header("Content-Disposition", "attachment; filename=lyrics.mov")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as error:
            message = json.dumps({"error": str(error)}).encode()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)

    def log_message(self, format_string, *args):
        if self.path.startswith("/api/"):
            super().log_message(format_string, *args)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "4173"))
    print(f"Serving Brat Lyrics at http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), BratHandler).serve_forever()
