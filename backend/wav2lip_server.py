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

# Import ONNX Runtime with DirectML (Local GPU) and CPU fallback
USE_ONNX = False
ORT_SESSION = None
PROVIDER_NAME = "PyTorch"

try:
    import onnxruntime as ort  # type: ignore
    available_providers = ort.get_available_providers()
    
    chosen_providers = []
    if 'DmlExecutionProvider' in available_providers:
        chosen_providers.append('DmlExecutionProvider')
    chosen_providers.append('CPUExecutionProvider')
    
    onnx_fp32 = os.path.abspath('backend/models/wav2lip_gan.onnx')
    onnx_int8 = os.path.abspath('backend/models/wav2lip_gan_int8.onnx')
    
    model_path = onnx_fp32 if 'DmlExecutionProvider' in chosen_providers else (onnx_int8 if os.path.exists(onnx_int8) else onnx_fp32)
    
    if os.path.exists(model_path):
        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_opts.intra_op_num_threads = os.cpu_count() or 8
        sess_opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        ORT_SESSION = ort.InferenceSession(model_path, sess_opts, providers=chosen_providers)
        USE_ONNX = True
        active_provider = ORT_SESSION.get_providers()[0]
        PROVIDER_NAME = f"ONNX ({active_provider})"
        print(f"[Wav2Lip Daemon] Successfully loaded {PROVIDER_NAME} from {os.path.basename(model_path)}!")
except Exception as e:
    print(f"[Wav2Lip Daemon] ONNX initialization notice: {e}")

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

MODEL = None
if not USE_ONNX:
    print("[Wav2Lip Daemon] Loading PyTorch Wav2Lip GAN model...")
    CHECKPOINT_PATH = os.path.abspath('backend/models/wav2lip_gan.pth')
    MODEL = Wav2Lip()
    checkpoint = torch.load(CHECKPOINT_PATH, map_location='cpu')
    s_dict = checkpoint.get('state_dict', {})
    new_s = {k.replace('module.', ''): v for k, v in s_dict.items()}
    MODEL.load_state_dict(new_s, strict=False)
    MODEL.eval()

SOURCE_VIDEO = os.path.abspath('public/assets/listening.mp4')
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

# Pre-compute face coordinates and feathering blend masks ONCE
Y1, Y2, X1, X2 = 54, 159, 719, 799
FW, FH = X2 - X1, Y2 - Y1

MASK_SINGLE = np.zeros((FH, FW, 3), dtype=np.float32)
cv2.ellipse(MASK_SINGLE, (FW // 2, int(FH * 0.65)), 
            (FW // 2 - 5, int(FH * 0.28)), 0, 0, 360, (1, 1, 1), -1)
MASK_SINGLE = cv2.GaussianBlur(MASK_SINGLE, (11, 11), 0)
INVERSE_MASK = (1.0 - MASK_SINGLE).astype(np.float32)

PRE_FACE_CROPS = [cv2.resize(f[Y1:Y2, X1:X2], (96, 96)) for f in FULL_FRAMES]

print(f"[Wav2Lip Daemon] READY! Engine: {PROVIDER_NAME} & {len(FULL_FRAMES)} video frames. Standing by on port 5001...")

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()

def generate_tts_audio(text, audio_path):
    os.makedirs(os.path.dirname(audio_path), exist_ok=True)
    temp_mp3 = audio_path.replace(".wav", ".mp3")
    try:
        import asyncio
        import edge_tts
        communicate = edge_tts.Communicate(text, "en-US-GuyNeural")
        asyncio.run(communicate.save(temp_mp3))
        subprocess.run(
            [FFMPEG_EXE, "-y", "-i", temp_mp3, "-ar", "16000", "-ac", "1", audio_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        if os.path.exists(temp_mp3):
            try:
                os.remove(temp_mp3)
            except Exception:
                pass
    except Exception as e:
        print(f"[Daemon TTS] edge-tts fallback: {e}")
        import pythoncom
        pythoncom.CoInitialize()
        try:
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
    tts_time = time.perf_counter() - start_time

    # 2. Process Mel Spectrogram
    wav = audio.load_wav(audio_path, 16000)
    mel = audio.melspectrogram(wav)

    # 3. Align Mel Chunks for all video frames
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
    
    # 4. Ultra-Fast 8.33 FPS Subsampling (Step = 3 for 67% compute reduction)
    step = 3
    sample_indices = list(range(0, num_frames, step))
    if sample_indices[-1] != num_frames - 1:
        sample_indices.append(num_frames - 1)
        
    sampled_mel = [mel_chunks[idx] for idx in sample_indices]
    sampled_face = [PRE_FACE_CROPS[idx % len(FULL_FRAMES)] for idx in sample_indices]
    num_sampled = len(sample_indices)
    
    batch_size = 256
    sampled_preds = []

    infer_start = time.perf_counter()

    # 5. Batch Inference on Keyframes
    for b_start in range(0, num_sampled, batch_size):
        b_end = min(b_start + batch_size, num_sampled)
        b_chunks = sampled_mel[b_start:b_end]

        img_batch = np.array(sampled_face[b_start:b_end])
        img_masked = img_batch.copy()
        img_masked[:, 48:] = 0

        concat_img = (np.concatenate((img_masked, img_batch), axis=3) / 255.0).astype(np.float32)
        concat_mel = np.reshape(b_chunks, [len(b_chunks), 80, 16, 1]).astype(np.float32)

        np_img = np.transpose(concat_img, (0, 3, 1, 2))
        np_mel = np.transpose(concat_mel, (0, 3, 1, 2))

        if USE_ONNX and ORT_SESSION is not None:
            ort_inputs = {'audio_mel': np_mel, 'face_img': np_img}
            ort_out = ORT_SESSION.run(None, ort_inputs)
            pred_np = np.transpose(ort_out[0], (0, 2, 3, 1)) * 255.0
        else:
            t_img = torch.FloatTensor(np_img)
            t_mel = torch.FloatTensor(np_mel)
            with torch.inference_mode():
                pred = MODEL(t_mel, t_img)
            pred_np = pred.numpy().transpose(0, 2, 3, 1) * 255.0

        for p in pred_np:
            p_uint8 = np.clip(p, 0, 255).astype(np.uint8)
            sampled_preds.append(cv2.resize(p_uint8, (FW, FH), interpolation=cv2.INTER_LINEAR).astype(np.float32))

    infer_time = time.perf_counter() - infer_start

    # 6. Smooth Hermite Curve Interpolation to 25 FPS
    preds_25fps = []
    for full_idx in range(num_frames):
        k = full_idx // step
        if k >= len(sampled_preds) - 1:
            preds_25fps.append(sampled_preds[-1])
        else:
            t = (full_idx % step) / float(step)
            t_smooth = t * t * (3.0 - 2.0 * t)  # Hermite smoothstep curve
            p_interp = (1.0 - t_smooth) * sampled_preds[k] + t_smooth * sampled_preds[k + 1]
            preds_25fps.append(p_interp)

    # 7. High-Throughput Chunked FFmpeg Pipe Write
    pipe_cmd = [
        FFMPEG_EXE, '-y',
        '-threads', '8',
        '-f', 'rawvideo', '-vcodec', 'rawvideo',
        '-s', f'{FRAME_W}x{FRAME_H}', '-pix_fmt', 'bgr24', '-r', str(FPS),
        '-i', '-',
        '-i', audio_path,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-threads', '8',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
        out_video
    ]
    proc = subprocess.Popen(pipe_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    chunk_size = 32
    for c_start in range(0, num_frames, chunk_size):
        c_end = min(c_start + chunk_size, num_frames)
        chunk_buf = np.zeros((c_end - c_start, FRAME_H, FRAME_W, 3), dtype=np.uint8)
        for i, full_idx in enumerate(range(c_start, c_end)):
            src_frame = FULL_FRAMES[full_idx % len(FULL_FRAMES)]
            np.copyto(chunk_buf[i], src_frame)
            orig_face = src_frame[Y1:Y2, X1:X2].astype(np.float32)
            p_face = preds_25fps[full_idx]
            chunk_buf[i, Y1:Y2, X1:X2] = (p_face * MASK_SINGLE + orig_face * INVERSE_MASK).astype(np.uint8)
        proc.stdin.write(chunk_buf.tobytes())

    proc.stdin.close()
    proc.wait()

    total_time = time.perf_counter() - start_time
    print(f"[Wav2Lip Server] Generated {num_frames} frames ({num_frames/FPS:.1f}s speech) in {total_time:.2f}s (TTS: {tts_time:.2f}s, Infer: {infer_time:.2f}s, Engine: {PROVIDER_NAME})")
    return out_video

class RequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body_bytes = self.rfile.read(content_length)
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
