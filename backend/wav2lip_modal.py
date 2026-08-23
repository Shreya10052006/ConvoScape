"""
wav2lip_modal.py
-----------------------------------------------------------------------------
Modal Serverless GPU Deployment for Real-Time Wav2Lip Lip-Sync Generation.
Locked to exact 1280x720 resolution @ 24.0 FPS and verified bounding box (54, 159, 719, 799).

Deploy command:
    python -X utf8 -m modal deploy backend/wav2lip_modal.py
"""

import os
import sys
import time
from typing import Any, List

_local_wav2lip = os.path.abspath(os.path.join(os.path.dirname(__file__), "Wav2Lip"))
if os.path.exists(_local_wav2lip) and _local_wav2lip not in sys.path:
    sys.path.insert(0, _local_wav2lip)

if "/root/Wav2Lip" not in sys.path:
    sys.path.insert(0, "/root/Wav2Lip")

import numpy as np  # type: ignore
import modal  # type: ignore
from fastapi import Response  # type: ignore

app = modal.App("convoscape-wav2lip")

wav2lip_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "git", "libsndfile1")
    .pip_install(
        "torch==2.1.2",
        "torchvision==0.16.2",
        "torchaudio==2.1.2",
        "numpy==1.23.5",
        "scipy==1.11.4",
        "opencv-python-headless==4.8.1.78",
        "librosa==0.10.1",
        "soundfile==0.12.1",
        "edge-tts==7.2.8",
        "gTTS==2.5.1",
        "pydantic==2.5.3",
        "fastapi==0.109.0",
        "uvicorn==0.27.0",
    )
    .add_local_dir("backend/Wav2Lip", remote_path="/root/Wav2Lip")
    .add_local_file("backend/models/wav2lip_gan.pth", remote_path="/root/models/wav2lip_gan.pth")
    .add_local_file("public/assets/listening.mp4", remote_path="/root/assets/listening.mp4")
)

@app.cls(
    gpu="T4",
    image=wav2lip_image,
    timeout=120,
    scaledown_window=1800,
)
class Wav2LipEngine:
    model: Any
    device: str
    audio: Any
    fps: float
    frame_w: int
    frame_h: int
    full_frames: List[Any]
    pre_face_crops: List[Any]
    mask_single: Any
    y1: int
    y2: int
    x1: int
    x2: int
    fw: int
    fh: int

    @modal.enter()
    def setup(self):
        import cv2  # type: ignore
        import torch  # type: ignore

        if "/root/Wav2Lip" not in sys.path:
            sys.path.insert(0, "/root/Wav2Lip")

        try:
            from models import Wav2Lip  # type: ignore
            import audio  # type: ignore
        except Exception:
            try:
                from backend.Wav2Lip.models import Wav2Lip  # type: ignore
                from backend.Wav2Lip import audio  # type: ignore
            except Exception:
                Wav2Lip = None  # type: ignore
                audio = None  # type: ignore

        self.audio = audio
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[Modal] Loading Wav2Lip GAN model onto {self.device}...")

        if Wav2Lip is not None:
            self.model = Wav2Lip()
            checkpoint = torch.load("/root/models/wav2lip_gan.pth", map_location=self.device)
            s_dict = checkpoint.get("state_dict", {})
            new_s = {k.replace("module.", ""): v for k, v in s_dict.items()}
            self.model.load_state_dict(new_s, strict=False)
            self.model.to(self.device)
            self.model.eval()

        cap = cv2.VideoCapture("/root/assets/listening.mp4")
        self.fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
        self.frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
        self.frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720

        self.full_frames = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            self.full_frames.append(frame)
        cap.release()

        # Exact verified bounding box: (y1=54, y2=159, x1=719, x2=799)
        self.y1, self.y2, self.x1, self.x2 = 54, 159, 719, 799
        self.fw, self.fh = self.x2 - self.x1, self.y2 - self.y1

        # Exact verified Gaussian blend mask
        mask = np.zeros((self.fh, self.fw, 3), dtype=np.float32)
        cv2.ellipse(mask, (self.fw // 2, int(self.fh * 0.65)),
                    (self.fw // 2 - 5, int(self.fh * 0.28)), 0, 0, 360, (1, 1, 1), -1)
        self.mask_single = cv2.GaussianBlur(mask, (11, 11), 0)

        self.pre_face_crops = [cv2.resize(f[self.y1:self.y2, self.x1:self.x2], (96, 96)) for f in self.full_frames]
        print(f"[Modal] Model & {len(self.full_frames)} source frames ready on GPU ({self.frame_w}x{self.frame_h} @ {self.fps} FPS)!")

    @modal.method()
    def process_video(self, text: str, response_id: str) -> bytes:
        import subprocess
        import cv2  # type: ignore
        import torch  # type: ignore
        from gtts import gTTS  # type: ignore

        t0 = time.perf_counter()
        audio_path = f"/tmp/tts_{response_id}.mp3"
        wav_path = f"/tmp/tts_{response_id}.wav"
        out_video = f"/tmp/out_{response_id}.mp4"

        # 1. High-Speed 16kHz Audio Synthesis via edge-tts (en-IN-PrabhatNeural)
        try:
            import asyncio
            import edge_tts
            asyncio.run(edge_tts.Communicate(text, "en-IN-PrabhatNeural").save(audio_path))
        except Exception as e:
            print(f"[Modal TTS] edge-tts error, fallback to gTTS: {e}")
            tts = gTTS(text=text, lang="en", tld="us", slow=False)
            tts.save(audio_path)

        subprocess.run(
            ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", wav_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )

        # 2. Process Mel Spectrogram
        wav = self.audio.load_wav(wav_path, 16000)
        mel = self.audio.melspectrogram(wav)

        # 3. Align Mel Chunks
        mel_step_size = 16
        mel_chunks = []
        mel_idx_multiplier = 80.0 / self.fps
        i = 0
        while True:
            start_idx = int(i * mel_idx_multiplier)
            if start_idx + mel_step_size > mel.shape[1]:
                mel_chunks.append(mel[:, mel.shape[1] - mel_step_size:])
                break
            mel_chunks.append(mel[:, start_idx : start_idx + mel_step_size])
            i += 1

        num_frames = len(mel_chunks)
        batch_size = 128

        # 4. Direct Single-Pass FFmpeg Streaming Pipe (Exact 1280x720 @ 24fps)
        pipe_cmd = [
            "ffmpeg", "-y",
            "-f", "rawvideo", "-vcodec", "rawvideo",
            "-s", f"{self.frame_w}x{self.frame_h}", "-pix_fmt", "bgr24", "-r", str(self.fps),
            "-i", "-",
            "-i", wav_path,
            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            "-movflags", "+faststart",
            out_video,
        ]
        proc = subprocess.Popen(pipe_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 5. Parallel Batch Inference on GPU
        for b_start in range(0, num_frames, batch_size):
            b_end = min(b_start + batch_size, num_frames)
            b_chunks = mel_chunks[b_start:b_end]

            img_batch = np.array([self.pre_face_crops[idx % len(self.full_frames)] for idx in range(b_start, b_end)])
            img_masked = img_batch.copy()
            img_masked[:, 48:] = 0

            concat_img = np.concatenate((img_masked, img_batch), axis=3) / 255.0
            concat_mel = np.reshape(b_chunks, [len(b_chunks), 80, 16, 1])

            t_img = torch.FloatTensor(np.transpose(concat_img, (0, 3, 1, 2))).to(self.device)
            t_mel = torch.FloatTensor(np.transpose(concat_mel, (0, 3, 1, 2))).to(self.device)

            with torch.inference_mode():
                pred = self.model(t_mel, t_img)

            pred_np = pred.cpu().numpy().transpose(0, 2, 3, 1) * 255.0

            for j, p in enumerate(pred_np):
                frame_idx = (b_start + j) % len(self.full_frames)
                f = self.full_frames[frame_idx].copy()
                p_uint8 = np.clip(p, 0, 255).astype(np.uint8)
                p_resized = cv2.resize(p_uint8, (self.fw, self.fh)).astype(np.float32)
                orig_face = f[self.y1:self.y2, self.x1:self.x2].astype(np.float32)
                f[self.y1:self.y2, self.x1:self.x2] = (p_resized * self.mask_single + orig_face * (1.0 - self.mask_single)).astype(np.uint8)
                proc.stdin.write(f.tobytes())

        proc.stdin.close()
        proc.wait()

        with open(out_video, "rb") as f:
            video_bytes = f.read()

        elapsed = time.perf_counter() - t0
        print(f"[Modal GPU] Generated {num_frames} frames in {elapsed:.2f}s! ({len(video_bytes)} bytes)")
        return video_bytes

@app.function(image=wav2lip_image)
@modal.fastapi_endpoint(method="POST")
def generate(data: dict):
    text = data.get("text", "")
    response_id = data.get("responseId", "turn")

    if data.get("warmup") or text == "ping" or response_id == "warmup":
        engine = Wav2LipEngine()
        engine.process_video.remote("Hi", "ping_warmup")
        return Response(content='{"status": "warm", "message": "GPU container is pre-warmed"}', media_type="application/json")

    if not text:
        return Response(content='{"error": "Missing text"}', status_code=400, media_type="application/json")

    engine = Wav2LipEngine()
    video_bytes = engine.process_video.remote(text, response_id)
    return Response(content=video_bytes, media_type="video/mp4")
