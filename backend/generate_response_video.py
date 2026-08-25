import os
import sys
import time
import subprocess
import site
import cv2
import numpy as np
import imageio_ffmpeg

# PyTorch Windows DLL configuration
torch_lib = r'C:\Users\Shreya\AppData\Roaming\Python\Python313\site-packages\torch\lib'
if os.path.exists(torch_lib):
    try:
        os.add_dll_directory(torch_lib)
    except Exception:
        pass

site.addsitedir(r'C:\Users\Shreya\AppData\Roaming\Python\Python313\site-packages')
site.addsitedir(site.getusersitepackages())

# Import ONNX Runtime with CPU optimizations
USE_ONNX = False
ORT_SESSION = None
try:
    import onnxruntime as ort  # type: ignore
    ONNX_PATH = os.path.abspath('backend/models/wav2lip_gan.onnx')
    if os.path.exists(ONNX_PATH):
        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_opts.intra_op_num_threads = os.cpu_count() or 8
        sess_opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        ORT_SESSION = ort.InferenceSession(ONNX_PATH, sess_opts, providers=['CPUExecutionProvider'])
        USE_ONNX = True
except Exception:
    pass

try:
    import torch  # type: ignore
    torch.set_num_threads(os.cpu_count() or 8)
    import win32com.client  # type: ignore
except Exception:
    pass

# Import official Wav2Lip modules
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
    checkpoint_path = os.path.abspath('backend/models/wav2lip_gan.pth')
    MODEL = Wav2Lip()
    checkpoint = torch.load(checkpoint_path, map_location='cpu')
    s_dict = checkpoint.get('state_dict', {})
    new_s = {k.replace('module.', ''): v for k, v in s_dict.items()}
    MODEL.load_state_dict(new_s, strict=False)
    MODEL.eval()

def generate_tts_audio(text, audio_path):
    os.makedirs(os.path.dirname(audio_path), exist_ok=True)
    temp_mp3 = audio_path.replace(".wav", ".mp3")
    try:
        import asyncio
        import edge_tts
        communicate = edge_tts.Communicate(text, "en-US-GuyNeural")
        asyncio.run(communicate.save(temp_mp3))
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        subprocess.run(
            [ffmpeg_exe, "-y", "-i", temp_mp3, "-ar", "16000", "-ac", "1", audio_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except Exception as e:
        print(f"[Generate TTS] edge-tts fallback: {e}")
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

def generate_rahul_video(response_id: str, text: str) -> str:
    out_video = os.path.abspath(f'public/generated/rahul-response-{response_id}.mp4')
    if os.path.exists(out_video):
        return out_video

    t0 = time.perf_counter()
    audio_path = os.path.abspath(f'public/generated/tts-{response_id}.wav')
    os.makedirs('public/generated', exist_ok=True)

    # 1. TTS Generation
    generate_tts_audio(text, audio_path)

    # 2. Audio Processing
    wav = audio.load_wav(audio_path, 16000)
    mel = audio.melspectrogram(wav)

    # 3. Source Video & Coordinates
    source_video = os.path.abspath('public/assets/listening.mp4')
    cap = cv2.VideoCapture(source_video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    full_frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        full_frames.append(frame)
    cap.release()

    y1, y2, x1, x2 = 54, 159, 719, 799
    fw, fh = x2 - x1, y2 - y1

    mask_single = np.zeros((fh, fw, 3), dtype=np.float32)
    cv2.ellipse(mask_single, (fw // 2, int(fh * 0.65)), 
                (fw // 2 - 5, int(fh * 0.28)), 0, 0, 360, (1, 1, 1), -1)
    mask_single = cv2.GaussianBlur(mask_single, (11, 11), 0)
    inv_mask = (1.0 - mask_single).astype(np.float32)

    pre_face_crops = [cv2.resize(f[y1:y2, x1:x2], (96, 96)) for f in full_frames]
    out_buffer = np.zeros((frame_h, frame_w, 3), dtype=np.uint8)

    # 4. Mel Chunks
    mel_step_size = 16
    mel_chunks = []
    mel_idx_multiplier = 80.0 / fps
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

    # 5. FFmpeg multi-threaded pipe
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    pipe_cmd = [
        ffmpeg_exe, '-y',
        '-threads', '8',
        '-f', 'rawvideo', '-vcodec', 'rawvideo',
        '-s', f'{frame_w}x{frame_h}', '-pix_fmt', 'bgr24', '-r', str(fps),
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

    for b_start in range(0, num_frames, batch_size):
        b_end = min(b_start + batch_size, num_frames)
        b_chunks = mel_chunks[b_start:b_end]

        img_batch = np.array([pre_face_crops[idx % len(full_frames)] for idx in range(b_start, b_end)])
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

        for j, p in enumerate(pred_np):
            frame_idx = (b_start + j) % len(full_frames)
            src_frame = full_frames[frame_idx]
            np.copyto(out_buffer, src_frame)
            
            p_uint8 = np.clip(p, 0, 255).astype(np.uint8)
            p_resized = cv2.resize(p_uint8, (fw, fh)).astype(np.float32)
            orig_face = src_frame[y1:y2, x1:x2].astype(np.float32)
            
            out_buffer[y1:y2, x1:x2] = (p_resized * mask_single + orig_face * inv_mask).astype(np.uint8)
            proc.stdin.write(out_buffer.tobytes())

    proc.stdin.close()
    proc.wait()

    elapsed = time.perf_counter() - t0
    print(f"[Generate] Completed in {elapsed:.2f}s (Engine: {'ONNX' if USE_ONNX else 'PyTorch'}) -> {out_video}")
    return out_video

if __name__ == '__main__':
    if len(sys.argv) > 2:
        generate_rahul_video(sys.argv[1], sys.argv[2])
    else:
        print("Usage: python generate_response_video.py <response_id> <text>")
