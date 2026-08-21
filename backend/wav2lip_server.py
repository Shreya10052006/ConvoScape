import os
import sys
import time
import json
import cv2
import numpy as np
import imageio_ffmpeg
import subprocess
import site
from http.server import HTTPServer, BaseHTTPRequestHandler

# PyTorch Windows DLL configuration
torch_lib = r'C:\Users\Shreya\AppData\Roaming\Python\Python313\site-packages\torch\lib'
if os.path.exists(torch_lib):
    try:
        os.add_dll_directory(torch_lib)
    except Exception:
        pass

site.addsitedir(r'C:\Users\Shreya\AppData\Roaming\Python\Python313\site-packages')
site.addsitedir(site.getusersitepackages())

try:
    import torch  # type: ignore
    torch.set_num_threads(os.cpu_count() or 8)
    import win32com.client  # type: ignore
except Exception:
    pass

wav2lip_dir = os.path.abspath('backend/Wav2Lip')
if wav2lip_dir not in sys.path:
    sys.path.insert(0, wav2lip_dir)

try:
    import audio  # type: ignore
    from models import Wav2Lip  # type: ignore
except Exception:
    try:
        from backend.Wav2Lip import audio  # type: ignore
        from backend.Wav2Lip.models import Wav2Lip  # type: ignore
    except Exception:
        pass

print("[Wav2Lip Daemon] Pre-loading PyTorch Wav2Lip GAN model into memory...")
CHECKPOINT_PATH = os.path.abspath('backend/models/wav2lip_gan.pth')
SOURCE_VIDEO = os.path.abspath('public/assets/listening.mp4')

MODEL = Wav2Lip()
checkpoint = torch.load(CHECKPOINT_PATH, map_location='cpu')
s_dict = checkpoint.get('state_dict', {})
new_s = {k.replace('module.', ''): v for k, v in s_dict.items()}
MODEL.load_state_dict(new_s, strict=False)
MODEL.eval()

# Pre-load source frames & face crops ONCE in memory
CAP = cv2.VideoCapture(SOURCE_VIDEO)
FPS = CAP.get(cv2.CAP_PROP_FPS) or 25.0
FRAME_W = int(CAP.get(cv2.CAP_PROP_FRAME_WIDTH))
FRAME_H = int(CAP.get(cv2.CAP_PROP_FRAME_HEIGHT))

FULL_FRAMES = []
while True:
    ret, frame = CAP.read()
    if not ret:
        break
    FULL_FRAMES.append(frame)
CAP.release()

Y1, Y2, X1, X2 = 54, 159, 719, 799
FW, FH = X2 - X1, Y2 - Y1

MASK_SINGLE = np.zeros((FH, FW, 3), dtype=np.float32)
cv2.ellipse(MASK_SINGLE, (FW // 2, int(FH * 0.65)), 
            (FW // 2 - 5, int(FH * 0.28)), 0, 0, 360, (1, 1, 1), -1)
MASK_SINGLE = cv2.GaussianBlur(MASK_SINGLE, (11, 11), 0)

PRE_FACE_CROPS = [cv2.resize(f[Y1:Y2, X1:X2], (96, 96)) for f in FULL_FRAMES]

print(f"[Wav2Lip Daemon] READY! Loaded model & {len(FULL_FRAMES)} video frames. Standing by on port 5001...")

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()

def generate_tts_audio(text, audio_path):
    import pythoncom
    pythoncom.CoInitialize()
    try:
        os.makedirs(os.path.dirname(audio_path), exist_ok=True)
        speaker = win32com.client.Dispatch("SAPI.SpVoice")
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        stream.Open(audio_path, 3, False)
        speaker.AudioOutputStream = stream
        speaker.Speak(text, 0)
        stream.Close()
    finally:
        pythoncom.CoUninitialize()

def process_video_generation(response_id, text):
    out_video = os.path.abspath(f'public/generated/rahul-response-{response_id}.mp4')
    if os.path.exists(out_video):
        return out_video

    start_time = time.perf_counter()
    audio_path = os.path.abspath(f'public/generated/tts-{response_id}.wav')
    os.makedirs('public/generated', exist_ok=True)

    # 1. Fast TTS Audio Generation
    generate_tts_audio(text, audio_path)

    # 2. Process Mel Spectrogram
    wav = audio.load_wav(audio_path, 16000)
    mel = audio.melspectrogram(wav)

    # 3. Align Mel Chunks
    mel_step_size = 16
    mel_chunks = []
    mel_idx_multiplier = 80.0 / FPS
    i = 0
    while True:
        start_idx = int(i * mel_idx_multiplier)
        if start_idx + mel_step_size > mel.shape[1]:
            mel_chunks.append(mel[:, mel.shape[1] - mel_step_size:])
            break
        mel_chunks.append(mel[:, start_idx : start_idx + mel_step_size])
        i += 1

    num_frames = len(mel_chunks)
    batch_size = 64

    # 4. Direct Fast Single-Pass FFmpeg Streaming Pipe (No temporary AVI disk I/O)
    pipe_cmd = [
        FFMPEG_EXE, '-y',
        '-f', 'rawvideo', '-vcodec', 'rawvideo',
        '-s', f'{FRAME_W}x{FRAME_H}', '-pix_fmt', 'bgr24', '-r', str(FPS),
        '-i', '-',
        '-i', audio_path,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
        out_video
    ]
    proc = subprocess.Popen(pipe_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 5. Batch Inference with torch.inference_mode()
    for b_start in range(0, num_frames, batch_size):
        b_end = min(b_start + batch_size, num_frames)
        b_chunks = mel_chunks[b_start:b_end]

        img_batch = np.array([PRE_FACE_CROPS[idx % len(FULL_FRAMES)] for idx in range(b_start, b_end)])
        img_masked = img_batch.copy()
        img_masked[:, 48:] = 0

        concat_img = np.concatenate((img_masked, img_batch), axis=3) / 255.0
        concat_mel = np.reshape(b_chunks, [len(b_chunks), 80, 16, 1])

        t_img = torch.FloatTensor(np.transpose(concat_img, (0, 3, 1, 2)))
        t_mel = torch.FloatTensor(np.transpose(concat_mel, (0, 3, 1, 2)))

        with torch.inference_mode():
            pred = MODEL(t_mel, t_img)

        pred_np = pred.numpy().transpose(0, 2, 3, 1) * 255.0

        for j, p in enumerate(pred_np):
            frame_idx = (b_start + j) % len(FULL_FRAMES)
            f = FULL_FRAMES[frame_idx].copy()
            p_uint8 = np.clip(p, 0, 255).astype(np.uint8)
            p_resized = cv2.resize(p_uint8, (FW, FH)).astype(np.float32)
            orig_face = f[Y1:Y2, X1:X2].astype(np.float32)
            f[Y1:Y2, X1:X2] = (p_resized * MASK_SINGLE + orig_face * (1.0 - MASK_SINGLE)).astype(np.uint8)
            proc.stdin.write(f.tobytes())

    proc.stdin.close()
    proc.wait()

    elapsed = time.perf_counter() - start_time
    print(f"[Wav2Lip Daemon] ULTRA-FAST GENERATION SUCCESS: {num_frames} frames -> {out_video} in {elapsed:.2f}s!")
    return out_video

class RequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length)
        try:
            req_data = json.loads(body_bytes.decode('utf-8'))
            response_id = req_data.get('responseId')
            text = req_data.get('text')
            
            if not response_id or not text:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "Missing responseId or text"}')
                return

            out_path = process_video_generation(response_id, text)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            resp = json.dumps({"status": "ok", "videoPath": out_path})
            self.wfile.write(resp.encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            resp = json.dumps({"error": str(e)})
            self.wfile.write(resp.encode('utf-8'))

    def log_message(self, format, *args):
        pass

def run_server(port=5001):
    server_address = ('', port)
    httpd = HTTPServer(server_address, RequestHandler)
    httpd.serve_forever()

if __name__ == '__main__':
    run_server(5001)
