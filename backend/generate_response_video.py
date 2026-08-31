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

# Import ONNX Runtime with DirectML and CPU fallback
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
    model_path = onnx_int8 if os.path.exists(onnx_int8) else onnx_fp32
    
    if os.path.exists(model_path):
        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_opts.intra_op_num_threads = os.cpu_count() or 8
        sess_opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        ORT_SESSION = ort.InferenceSession(model_path, sess_opts, providers=chosen_providers)
        USE_ONNX = True
        PROVIDER_NAME = f"ONNX ({ORT_SESSION.get_providers()[0]})"
except Exception:
    pass

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
    checkpoint_path = os.path.abspath('backend/models/wav2lip_gan.pth')
    if os.path.exists(checkpoint_path):
        MODEL = Wav2Lip()
        checkpoint = torch.load(checkpoint_path, map_location='cpu')
        s_dict = checkpoint.get('state_dict', {})
        new_s = {k.replace('module.', ''): v for k, v in s_dict.items()}
        MODEL.load_state_dict(new_s, strict=False)
        MODEL.eval()

# Character Configurations: Voice and Video coordinates
CHARACTER_CONFIGS = {
    "rahul": {
        "voice": "en-US-GuyNeural",
        "source_video": "public/assets/listening.mp4",
        "out_prefix": "rahul-response-",
        "crop": (54, 159, 719, 799),  # y1, y2, x1, x2 in 1920x1080
    },
    "judge1": {
        "voice": "en-GB-SoniaNeural",
        "source_video": "public/assets/judge_listening.mp4",
        "out_prefix": "judge-female-",
        "crop": (187, 387, 869, 1069),  # Left Judge (Female) in 2560x1440 judge_listening.mp4
    },
    "female_judge": {
        "voice": "en-GB-SoniaNeural",
        "source_video": "public/assets/judge_listening.mp4",
        "out_prefix": "judge-female-",
        "crop": (187, 387, 869, 1069),
    },
    "judge2": {
        "voice": "en-US-ChristopherNeural",
        "source_video": "public/assets/judge_listening.mp4",
        "out_prefix": "judge-male-",
        "crop": (133, 333, 1393, 1593),  # Right Judge (Male) in 2560x1440 judge_listening.mp4
    },
    "male_judge": {
        "voice": "en-US-ChristopherNeural",
        "source_video": "public/assets/judge_listening.mp4",
        "out_prefix": "judge-male-",
        "crop": (133, 333, 1393, 1593),
    },
}

def generate_tts_audio(text: str, audio_path: str, voice: str = "en-US-GuyNeural"):
    try:
        import asyncio
        import edge_tts
        temp_mp3 = audio_path.replace('.wav', '.mp3')
        communicate = edge_tts.Communicate(text, voice)
        asyncio.run(communicate.save(temp_mp3))
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        subprocess.run(
            [ffmpeg_exe, "-y", "-i", temp_mp3, "-ar", "16000", "-ac", "1", audio_path],
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

def compute_frame_crops(full_frames, character: str, cfg: dict):
    if len(full_frames) <= 1 or character.lower() == "rahul":
        y1, y2, x1, x2 = cfg["crop"]
        return [(y1, y2, x1, x2)] * len(full_frames)

    char_key = character.lower()
    if char_key in ["judge1", "female_judge"]:
        init_mx, init_my = 969, 323
        search_x1, search_x2, search_y1, search_y2 = 900, 1040, 270, 370
        tmpl_hw, tmpl_hh = 35, 25
        fh, fw = 200, 200
        offset_y = 136
    elif char_key in ["judge2", "male_judge"]:
        init_mx, init_my = 1493, 269
        search_x1, search_x2, search_y1, search_y2 = 1420, 1560, 220, 320
        tmpl_hw, tmpl_hh = 35, 25
        fh, fw = 200, 200
        offset_y = 136
    else:
        y1, y2, x1, x2 = cfg["crop"]
        return [(y1, y2, x1, x2)] * len(full_frames)

    frame0 = full_frames[0]
    tmpl = frame0[init_my - tmpl_hh : init_my + tmpl_hh, init_mx - tmpl_hw : init_mx + tmpl_hw]

    crops = []
    prev_mx, prev_my = init_mx, init_my
    for f in full_frames:
        roi = f[search_y1:search_y2, search_x1:search_x2]
        res = cv2.matchTemplate(roi, tmpl, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(res)
        if max_val > 0.4:
            cur_mx = search_x1 + max_loc[0] + tmpl_hw
            cur_my = search_y1 + max_loc[1] + tmpl_hh
            prev_mx, prev_my = cur_mx, cur_my
        else:
            cur_mx, cur_my = prev_mx, prev_my

        y1 = max(0, cur_my - offset_y)
        y2 = y1 + fh
        x1 = max(0, cur_mx - fw // 2)
        x2 = x1 + fw
        crops.append((y1, y2, x1, x2))

    return crops

def generate_character_video(response_id: str, text: str, character: str = "rahul") -> str:
    cfg = CHARACTER_CONFIGS.get(character.lower(), CHARACTER_CONFIGS["rahul"])
    prefix = cfg["out_prefix"]
    out_video = os.path.abspath(f'public/generated/{prefix}{response_id}.mp4')
    if os.path.exists(out_video):
        return out_video

    t0 = time.perf_counter()
    audio_path = os.path.abspath(f'public/generated/tts-{character}-{response_id}.wav')
    os.makedirs('public/generated', exist_ok=True)

    # 1. TTS Generation with character voice
    generate_tts_audio(text, audio_path, cfg["voice"])

    # 2. Audio Processing
    wav = audio.load_wav(audio_path, 16000)
    mel = audio.melspectrogram(wav)

    # 3. Source Video / Image & Coordinates
    source_file = os.path.abspath(cfg["source_video"])
    full_frames = []

    if source_file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
        img = cv2.imread(source_file)
        if img is not None:
            full_frames = [img]
            frame_h, frame_w = img.shape[:2]
            fps = 25.0
    
    if not full_frames:
        cap = cv2.VideoCapture(source_file)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            full_frames.append(frame)
        cap.release()

    if not full_frames:
        raise ValueError(f"Could not read frames from source: {source_file}")

    # Per-frame mouth tracking to lock lip-sync onto natural head movements
    frame_crops = compute_frame_crops(full_frames, character, cfg)
    y1_0, y2_0, x1_0, x2_0 = frame_crops[0]
    fw, fh = x2_0 - x1_0, y2_0 - y1_0

    mask_single = np.zeros((fh, fw, 3), dtype=np.float32)
    cv2.ellipse(mask_single, (fw // 2, int(fh * 0.65)), 
                (fw // 2 - 5, int(fh * 0.28)), 0, 0, 360, (1, 1, 1), -1)
    mask_single = cv2.GaussianBlur(mask_single, (11, 11), 0)
    inv_mask = (1.0 - mask_single).astype(np.float32)

    pre_face_crops = [
        cv2.resize(full_frames[t % len(full_frames)][frame_crops[t % len(frame_crops)][0]:frame_crops[t % len(frame_crops)][1], frame_crops[t % len(frame_crops)][2]:frame_crops[t % len(frame_crops)][3]], (96, 96))
        for t in range(len(full_frames))
    ]

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
    
    # 8.33 FPS Subsampling (Step = 3 for 67% inference reduction)
    step = 3
    sample_indices = list(range(0, num_frames, step))
    if sample_indices[-1] != num_frames - 1:
        sample_indices.append(num_frames - 1)
        
    sampled_mel = [mel_chunks[idx] for idx in sample_indices]
    sampled_face = [pre_face_crops[idx % len(full_frames)] for idx in sample_indices]
    num_sampled = len(sample_indices)
    
    batch_size = 256
    sampled_preds = []

    # 5. Inference
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
        elif MODEL is not None:
            t_img = torch.FloatTensor(np_img)
            t_mel = torch.FloatTensor(np_mel)
            with torch.inference_mode():
                pred = MODEL(t_mel, t_img)
            pred_np = pred.numpy().transpose(0, 2, 3, 1) * 255.0
        else:
            raise RuntimeError("No inference engine available")

        for p in pred_np:
            p_uint8 = np.clip(p, 0, 255).astype(np.uint8)
            sampled_preds.append(cv2.resize(p_uint8, (fw, fh), interpolation=cv2.INTER_LINEAR).astype(np.float32))

    # 6. Smooth Hermite Curve Interpolation
    preds_25fps = []
    for full_idx in range(num_frames):
        k = full_idx // step
        if k >= len(sampled_preds) - 1:
            preds_25fps.append(sampled_preds[-1])
        else:
            t = (full_idx % step) / float(step)
            t_smooth = t * t * (3.0 - 2.0 * t)
            p_interp = (1.0 - t_smooth) * sampled_preds[k] + t_smooth * sampled_preds[k + 1]
            preds_25fps.append(p_interp)

    # 7. Chunked FFmpeg Streaming Pipe
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

    chunk_size = 32
    for c_start in range(0, num_frames, chunk_size):
        c_end = min(c_start + chunk_size, num_frames)
        chunk_buf = np.zeros((c_end - c_start, frame_h, frame_w, 3), dtype=np.uint8)
        for i, full_idx in enumerate(range(c_start, c_end)):
            src_frame = full_frames[full_idx % len(full_frames)]
            np.copyto(chunk_buf[i], src_frame)
            cy1, cy2, cx1, cx2 = frame_crops[full_idx % len(frame_crops)]
            orig_face = src_frame[cy1:cy2, cx1:cx2].astype(np.float32)
            p_face = preds_25fps[full_idx]
            chunk_buf[i, cy1:cy2, cx1:cx2] = (p_face * mask_single + orig_face * inv_mask).astype(np.uint8)
        proc.stdin.write(chunk_buf.tobytes())

    proc.stdin.close()
    proc.wait()

    elapsed = time.perf_counter() - t0
    print(f"[Generate] Completed in {elapsed:.2f}s ({character}, Engine: {PROVIDER_NAME}) -> {out_video}")
    return out_video

def generate_rahul_video(response_id: str, text: str) -> str:
    return generate_character_video(response_id, text, "rahul")

if __name__ == '__main__':
    if len(sys.argv) > 3:
        generate_character_video(sys.argv[1], sys.argv[2], sys.argv[3])
    elif len(sys.argv) > 2:
        generate_character_video(sys.argv[1], sys.argv[2], "rahul")
    else:
        print("Usage: python generate_response_video.py <response_id> <text> [character]")
