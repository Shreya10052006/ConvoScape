import os
import sys
import time
import subprocess
import site

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
    import cv2  # type: ignore # pyright: ignore
    import numpy as np  # type: ignore # pyright: ignore
    import imageio_ffmpeg  # type: ignore # pyright: ignore
    import torch  # type: ignore # pyright: ignore
    torch.set_num_threads(4)
    import win32com.client  # type: ignore # pyright: ignore
except Exception:
    pass

# Import official Wav2Lip modules
wav2lip_dir = os.path.abspath('backend/Wav2Lip')
if wav2lip_dir not in sys.path:
    sys.path.insert(0, wav2lip_dir)

try:
    import audio  # type: ignore # pyright: ignore
    import face_detection  # type: ignore # pyright: ignore
    from models import Wav2Lip  # type: ignore # pyright: ignore
except Exception:
    try:
        from backend.Wav2Lip import audio  # type: ignore # pyright: ignore
        from backend.Wav2Lip import face_detection  # type: ignore # pyright: ignore
        from backend.Wav2Lip.models import Wav2Lip  # type: ignore # pyright: ignore
    except Exception:
        pass

def generate_tts_audio(text, audio_path):
    os.makedirs(os.path.dirname(audio_path), exist_ok=True)
    speaker = win32com.client.Dispatch("SAPI.SpVoice")
    stream = win32com.client.Dispatch("SAPI.SpFileStream")
    stream.Open(audio_path, 3, False)
    speaker.AudioOutputStream = stream
    speaker.Speak(text)
    stream.Close()

def generate_rahul_video(response_id, text):
    out_video = os.path.abspath(f'public/generated/rahul-response-{response_id}.mp4')
    if os.path.exists(out_video):
        print(f"EXISTS: {out_video}")
        return out_video

    start_time = time.perf_counter()
    checkpoint_path = os.path.abspath('backend/models/wav2lip_gan.pth')
    source_video = os.path.abspath('public/assets/listening.mp4')
    audio_path = os.path.abspath(f'public/generated/tts-{response_id}.wav')
    temp_avi = os.path.abspath(f'backend/temp_{response_id}.avi')

    os.makedirs('public/generated', exist_ok=True)

    # 1. Generate Audio
    generate_tts_audio(text, audio_path)

    # 2. Load Model
    model = Wav2Lip()
    checkpoint = torch.load(checkpoint_path, map_location='cpu')
    s_dict = checkpoint.get('state_dict', {})
    new_s = {k.replace('module.', ''): v for k, v in s_dict.items()}
    model.load_state_dict(new_s, strict=False)
    model.eval()

    # 3. Process Mel Spectrogram
    wav = audio.load_wav(audio_path, 16000)
    mel = audio.melspectrogram(wav)

    # 4. Read Source Frames (Cached in memory/disk)
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

    # 5. Verified Official Bounding Box: (x1=719, y1=54, x2=799, y2=159)
    y1, y2, x1, x2 = 54, 159, 719, 799
    fw, fh = x2 - x1, y2 - y1
    box = (y1, y2, x1, x2)

    # Pre-compute Gaussian blur mask once
    mask_single = np.zeros((fh, fw, 3), dtype=np.float32)
    cv2.ellipse(mask_single, (fw // 2, int(fh * 0.65)), 
                (fw // 2 - 5, int(fh * 0.28)), 0, 0, 360, (1, 1, 1), -1)
    mask_single = cv2.GaussianBlur(mask_single, (11, 11), 0)

    # Pre-extract face crops for source frames
    pre_face_crops = [cv2.resize(f[y1:y2, x1:x2], (96, 96)) for f in full_frames]

    # 6. Align Mel Chunks
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

    # 7. Batch Inference
    batch_size = 64
    img_batch, mel_batch, frame_batch = [], [], []

    fourcc = cv2.VideoWriter_fourcc(*'DIVX')
    out = cv2.VideoWriter(temp_avi, fourcc, fps, (frame_w, frame_h))

    for i, m in enumerate(mel_chunks):
        idx = i % len(full_frames)
        frame_to_save = full_frames[idx].copy()
        face_resized = pre_face_crops[idx]

        img_batch.append(face_resized)
        mel_batch.append(m)
        frame_batch.append(frame_to_save)

        if len(img_batch) >= batch_size or i == len(mel_chunks) - 1:
            arr_img = np.asarray(img_batch)
            arr_mel = np.asarray(mel_batch)

            img_masked = arr_img.copy()
            img_masked[:, 48:] = 0

            concat_img = np.concatenate((img_masked, arr_img), axis=3) / 255.0
            concat_mel = np.reshape(arr_mel, [len(arr_mel), arr_mel.shape[1], arr_mel.shape[2], 1])

            t_img = torch.FloatTensor(np.transpose(concat_img, (0, 3, 1, 2)))
            t_mel = torch.FloatTensor(np.transpose(concat_mel, (0, 3, 1, 2)))

            with torch.no_grad():
                pred = model(t_mel, t_img)

            pred_np = pred.cpu().numpy().transpose(0, 2, 3, 1) * 255.0

            for p, f in zip(pred_np, frame_batch):
                p_uint8 = np.clip(p, 0, 255).astype(np.uint8)
                p_resized = cv2.resize(p_uint8, (fw, fh)).astype(np.float32)
                orig_face = f[y1:y2, x1:x2].astype(np.float32)

                blended_face = (p_resized * mask_single + orig_face * (1.0 - mask_single)).astype(np.uint8)
                f[y1:y2, x1:x2] = blended_face
                out.write(f)

            img_batch, mel_batch, frame_batch = [], [], []

    out.release()

    try:
        # 8. Encode with FFmpeg (H.264 + AAC + yuv420p + faststart)
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        cmd = [
            ffmpeg_exe, '-y',
            '-i', temp_avi,
            '-i', audio_path,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-shortest',
            '-movflags', '+faststart',
            out_video
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        elapsed = time.perf_counter() - start_time
        print(f"SUCCESS: {out_video} (Time: {elapsed:.2f}s)")
        return out_video
    finally:
        if os.path.exists(temp_avi):
            try:
                os.remove(temp_avi)
            except Exception:
                pass

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        resp_id = sys.argv[1]
        txt = " ".join(sys.argv[2:])
        generate_rahul_video(resp_id, txt)
    else:
        generate_rahul_video("test-init", "Hello! I am Rahul and welcome to ConvoScape.")
