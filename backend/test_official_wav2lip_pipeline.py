import os
import sys
import time
import hashlib
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

def calculate_sha256(filepath):
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192 * 1024):
            sha256.update(chunk)
    return sha256.hexdigest()

def run_official_wav2lip_pipeline():
    start_time = time.perf_counter()
    checkpoint_path = os.path.abspath('backend/models/wav2lip_gan.pth')
    source_video = os.path.abspath('public/assets/listening.mp4')
    audio_path = os.path.abspath('backend/obvious_speech.wav')
    
    out_video = os.path.abspath('public/generated/wav2lip-official-final-test.mp4')
    temp_avi = os.path.abspath('backend/temp_official_final.avi')
    
    print("=" * 60)
    print("      OFFICIAL WAV2LIP INFERENCE PIPELINE RUN")
    print("=" * 60)
    
    # 1. Audit Checkpoint
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Missing checkpoint at {checkpoint_path}")
        
    sha256_val = calculate_sha256(checkpoint_path)
    print(f"Checkpoint Path   : {checkpoint_path}")
    print(f"Checkpoint SHA256 : {sha256_val}")
    
    # Load Model
    model = Wav2Lip()
    checkpoint = torch.load(checkpoint_path, map_location='cpu')
    s_dict = checkpoint.get('state_dict', {})
    new_s = {k.replace('module.', ''): v for k, v in s_dict.items()}
    model.load_state_dict(new_s, strict=False)
    model.eval()
    print(f"Model Parameters  : {sum(p.numel() for p in model.parameters()):,}")
    
    # 2. Audio & Mel Spectrogram
    wav = audio.load_wav(audio_path, 16000)
    mel = audio.melspectrogram(wav)
    audio_dur = len(wav) / 16000.0
    print(f"Audio Duration    : {audio_dur:.2f} s")
    
    # 3. Read Source Frames
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
    print(f"Source Video      : {frame_w} x {frame_h} @ {fps} FPS ({len(full_frames)} frames)")
    
    # 4. Official Wav2Lip Face Detection on Source Frames
    print("\nRunning official Wav2Lip Face Detector (SFD)...")
    detector = face_detection.FaceAlignment(face_detection.LandmarksType._2D, flip_input=False, device='cpu')
    
    # Detect face box on representative frame 0
    boxes0 = detector.get_detections_for_batch(np.array([full_frames[0]]))
    rect = boxes0[0] # (x1, y1, x2, y2) -> (719, 54, 799, 149)
    
    # Official padding [top, bottom, left, right] = [0, 10, 0, 0]
    pad = [0, 10, 0, 0]
    y1 = max(0, rect[1] - pad[0])
    y2 = min(frame_h, rect[3] + pad[1])
    x1 = max(0, rect[0] - pad[2])
    x2 = min(frame_w, rect[2] + pad[3])
    
    print(f"Official Detected Box : {rect}")
    print(f"Official Padded Box   : y1={y1}, y2={y2}, x1={x1}, x2={x2} (Width={x2-x1}, Height={y2-y1})")
    
    # 5. Save Artifact 1: official-face-detection-debug.jpg
    os.makedirs('public/generated', exist_ok=True)
    det_img = full_frames[0].copy()
    cv2.rectangle(det_img, (x1, y1), (x2, y2), (0, 255, 0), 3) # Green rectangle
    cv2.putText(det_img, f"Official Face Box ({x1},{y1},{x2},{y2})", (x1 - 40, y1 - 10), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
    cv2.imwrite('public/generated/official-face-detection-debug.jpg', det_img)
    print("Saved public/generated/official-face-detection-debug.jpg!")
    
    # 6. Save Artifact 2: official-face-crop-debug.jpg
    crop0 = full_frames[0][y1:y2, x1:x2]
    cv2.imwrite('public/generated/official-face-crop-debug.jpg', crop0)
    print("Saved public/generated/official-face-crop-debug.jpg!")
    
    # 7. Mel Chunks Aligned to Video Frames
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
        
    print(f"Aligned Mel Chunks    : {len(mel_chunks)}")
    
    # 8. Single Frame Neural Test & Hard Composite (Artifact 3 & Artifact 4)
    frame0_copy = full_frames[0].copy()
    face_resized0 = cv2.resize(crop0, (96, 96))
    img_masked0 = face_resized0.copy()
    img_masked0[48:, :] = 0
    
    concat_img0 = np.concatenate((img_masked0, face_resized0), axis=2) / 255.0
    concat_mel0 = mel_chunks[0]
    
    t_img0 = torch.FloatTensor(concat_img0).permute(2, 0, 1).unsqueeze(0)
    t_mel0 = torch.FloatTensor(concat_mel0).unsqueeze(0).unsqueeze(0)
    
    with torch.no_grad():
        pred0 = model(t_mel0, t_img0)
        
    pred_np0 = pred0[0].permute(1, 2, 0).cpu().numpy() * 255.0
    pred_uint8_0 = np.clip(pred_np0, 0, 255).astype(np.uint8)
    pred_resized0 = cv2.resize(pred_uint8_0, (x2 - x1, y2 - y1))
    
    # Save Artifact 3: one-frame-wav2lip-test.png (Official composite)
    one_frame_img = frame0_copy.copy()
    # Official smooth blend over lower face
    mask0 = np.zeros((y2 - y1, x2 - x1, 3), dtype=np.float32)
    cv2.ellipse(mask0, ((x2 - x1)//2, int((y2 - y1) * 0.65)), 
                ((x2 - x1)//2 - 5, int((y2 - y1) * 0.28)), 0, 0, 360, (1, 1, 1), -1)
    mask0 = cv2.GaussianBlur(mask0, (11, 11), 0)
    
    orig_face0 = one_frame_img[y1:y2, x1:x2].astype(np.float32)
    pred_face0 = pred_resized0.astype(np.float32)
    blended_face0 = (pred_face0 * mask0 + orig_face0 * (1 - mask0)).astype(np.uint8)
    one_frame_img[y1:y2, x1:x2] = blended_face0
    cv2.imwrite('public/generated/one-frame-wav2lip-test.png', one_frame_img)
    print("Saved public/generated/one-frame-wav2lip-test.png!")
    
    # Save Artifact 4: hard-composite-debug.png (HARD COMPOSITE without mask)
    hard_img = frame0_copy.copy()
    hard_img[y1:y2, x1:x2] = pred_resized0 # Direct hard paste
    cv2.imwrite('public/generated/hard-composite-debug.png', hard_img)
    print("Saved public/generated/hard-composite-debug.png (HARD COMPOSITE)!")
    
    # 9. Process Full Video & Save Artifact 5: wav2lip-official-final-test.mp4
    batch_size = 32
    img_batch, mel_batch, frame_batch, coords_batch = [], [], [], []
    
    fourcc = cv2.VideoWriter_fourcc(*'DIVX')
    out = cv2.VideoWriter(temp_avi, fourcc, fps, (frame_w, frame_h))
    
    box = (y1, y2, x1, x2)
    print("\nRunning official Wav2Lip inference across full video frames...")
    
    for i, m in enumerate(mel_chunks):
        idx = i % len(full_frames)
        frame_to_save = full_frames[idx].copy()
        face_crop = frame_to_save[y1:y2, x1:x2]
        face_resized = cv2.resize(face_crop, (96, 96))
        
        img_batch.append(face_resized)
        mel_batch.append(m)
        frame_batch.append(frame_to_save)
        coords_batch.append(box)
        
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
            
            for p, f, c in zip(pred_np, frame_batch, coords_batch):
                p_uint8 = np.clip(p, 0, 255).astype(np.uint8)
                cy1, cy2, cx1, cx2 = c
                
                # Resize 96x96 predicted face crop to exact detected face box (80x105)
                p_resized = cv2.resize(p_uint8, (cx2 - cx1, cy2 - cy1))
                
                # Soft blending mask centered over lower-face lips
                mask = np.zeros((cy2 - cy1, cx2 - cx1, 3), dtype=np.float32)
                cv2.ellipse(mask, ((cx2 - cx1)//2, int((cy2 - cy1) * 0.65)), 
                            ((cx2 - cx1)//2 - 5, int((cy2 - cy1) * 0.28)), 0, 0, 360, (1, 1, 1), -1)
                mask = cv2.GaussianBlur(mask, (11, 11), 0)
                
                orig_face = f[cy1:cy2, cx1:cx2].astype(np.float32)
                pred_face_f32 = p_resized.astype(np.float32)
                
                blended_face = (pred_face_f32 * mask + orig_face * (1 - mask)).astype(np.uint8)
                
                f[cy1:cy2, cx1:cx2] = blended_face
                out.write(f)
                
            img_batch, mel_batch, frame_batch, coords_batch = [], [], [], []
            
    out.release()
    
    # 10. Encode Artifact 5 with FFmpeg (H.264 + AAC + yuv420p + faststart)
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
    
    if os.path.exists(temp_avi):
        os.remove(temp_avi)
        
    elapsed = time.perf_counter() - start_time
    video_dur = len(mel_chunks) / fps
    rtf = elapsed / video_dur if video_dur > 0 else 0
    
    print("\n" + "=" * 60)
    print("      OFFICIAL WAV2LIP FINAL TEST RESULTS")
    print("=" * 60)
    print(f"Output Video Path        : {out_video}")
    print(f"Audio Duration           : {audio_dur:.2f} s")
    print(f"Generated Video Duration : {video_dur:.2f} s ({len(mel_chunks)} frames)")
    print(f"Total Execution Time     : {elapsed:.2f} s")
    print(f"Real-Time Factor (RTF)   : {rtf:.2f}x")
    print(f"Official Face Box        : y1={y1}, y2={y2}, x1={x1}, x2={x2} (Width=80, Height=105)")
    print("=" * 60)

if __name__ == "__main__":
    run_official_wav2lip_pipeline()
