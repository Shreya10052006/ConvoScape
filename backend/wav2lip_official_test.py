import os
import sys
import time
import hashlib
import cv2
import numpy as np
import imageio_ffmpeg
import subprocess

# PyTorch Windows DLL configuration
torch_lib = r'C:\Users\Shreya\AppData\Roaming\Python\Python313\site-packages\torch\lib'
if os.path.exists(torch_lib):
    os.add_dll_directory(torch_lib)

import site
site.addsitedir(site.getusersitepackages())
import torch

# Import official Wav2Lip modules
wav2lip_dir = os.path.abspath('backend/Wav2Lip')
if wav2lip_dir not in sys.path:
    sys.path.insert(0, wav2lip_dir)

import audio
from models import Wav2Lip

def calculate_sha256(filepath):
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192 * 1024):
            sha256.update(chunk)
    return sha256.hexdigest()

def run_wav2lip_perfect_alignment():
    start_time = time.perf_counter()
    
    checkpoint_path = os.path.abspath('backend/models/wav2lip_gan.pth')
    source_video = os.path.abspath('public/assets/listening.mp4')
    audio_path = os.path.abspath('backend/obvious_speech.wav')
    
    output_video = os.path.abspath('public/generated/wav2lip-final-alignment.mp4')
    temp_avi = os.path.abspath('backend/temp_perfect_alignment.avi')
    
    print("=" * 60)
    print("      PERFECT VERTICAL ALIGNMENT WAV2LIP INFERENCE RUN")
    print("=" * 60)
    
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Missing checkpoint at {checkpoint_path}")
        
    sha256_val = calculate_sha256(checkpoint_path)
    print(f"Checkpoint Path   : {checkpoint_path}")
    print(f"Checkpoint Size   : {os.path.getsize(checkpoint_path)/(1024*1024):.2f} MB")
    print(f"Checkpoint SHA256 : {sha256_val}")
    
    # Load Model
    model = Wav2Lip()
    checkpoint = torch.load(checkpoint_path, map_location='cpu')
    s_dict = checkpoint.get('state_dict', {})
    
    new_s_dict = {}
    for k, v in s_dict.items():
        new_s_dict[k.replace('module.', '')] = v
        
    model.load_state_dict(new_s_dict, strict=False)
    model.eval()
    print(f"Model Parameters  : {sum(p.numel() for p in model.parameters()):,}")
    
    # 2. Audio & Mel Spectrogram
    wav = audio.load_wav(audio_path, 16000)
    mel = audio.melspectrogram(wav)
    audio_dur = len(wav) / 16000.0
    print(f"Audio Duration    : {audio_dur:.2f} s")
    
    # 3. Video Frames & Frame Bounds
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
    
    # 4. Mel Chunks Aligned to Video Frames
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
        
    print(f"Aligned Mel Chunks: {len(mel_chunks)}")
    
    # 5. PERFECTLY ALIGNED RAHUL FACE BOUNDING BOX:
    # Shifted +12px down to match Rahul's actual chin & mouth level:
    # y1=52, y2=222 (h=170), x1=675, x2=845 (w=170) -> Exact 1:1 Square
    y1, y2, x1, x2 = 52, 222, 675, 845
    fw, fh = x2 - x1, y2 - y1
    box = (y1, y2, x1, x2)
    
    print(f"Rahul Face Box    : y1={y1}, y2={y2}, x1={x1}, x2={x2} ({fw}x{fh} px, Aspect Ratio={fw/fh:.3f})")
    
    # Save Final Alignment Debug Frame
    debug_frame = full_frames[0].copy()
    cv2.rectangle(debug_frame, (x1, y1), (x2, y2), (0, 255, 0), 2) # Green box
    orig_mouth_y = y1 + int(fh * 0.68) # y = 167 (exact lip center)
    cv2.line(debug_frame, (x1 - 25, orig_mouth_y), (x2 + 25, orig_mouth_y), (0, 0, 255), 2) # Red line
    cv2.putText(debug_frame, f"Rahul Face 170x170 (Lips Y={orig_mouth_y})", (x1 - 50, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
    
    os.makedirs('public/generated', exist_ok=True)
    cv2.imwrite('public/generated/final-alignment-debug.png', debug_frame)
    print("Saved public/generated/final-alignment-debug.png!")
    
    # 6. Wav2Lip Batch Generator Loop
    batch_size = 32
    img_batch, mel_batch, frame_batch, coords_batch = [], [], [], []
    
    fourcc = cv2.VideoWriter_fourcc(*'DIVX')
    out = cv2.VideoWriter(temp_avi, fourcc, fps, (frame_w, frame_h))
    
    print("\nRunning official Wav2Lip inference with perfectly aligned face coordinates...")
    
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
            img_masked[:, 48:] = 0 # Mask lower face
            
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
                
                # Resize 96x96 predicted face crop to exact 170x170 face box
                p_resized = cv2.resize(p_uint8, (cx2 - cx1, cy2 - cy1))
                
                # Lower-face mouth mask (centered directly on Rahul's lips)
                mask = np.zeros((cy2 - cy1, cx2 - cx1, 3), dtype=np.float32)
                
                # Center ellipse directly over lower lips (cx=85, cy=116)
                cv2.ellipse(mask, ((cx2 - cx1)//2, int((cy2 - cy1) * 0.68)), 
                            ((cx2 - cx1)//2 - 12, int((cy2 - cy1) * 0.22)), 0, 0, 360, (1, 1, 1), -1)
                mask = cv2.GaussianBlur(mask, (15, 15), 0)
                
                orig_face = f[cy1:cy2, cx1:cx2].astype(np.float32)
                pred_face_f32 = p_resized.astype(np.float32)
                
                blended_face = (pred_face_f32 * mask + orig_face * (1 - mask)).astype(np.uint8)
                
                # Paste directly over Rahul's face
                f[cy1:cy2, cx1:cx2] = blended_face
                out.write(f)
                
            img_batch, mel_batch, frame_batch, coords_batch = [], [], [], []
            
    out.release()
    
    # 7. Encode final output with FFmpeg (H.264 + AAC + faststart)
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
        output_video
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    if os.path.exists(temp_avi):
        os.remove(temp_avi)
        
    elapsed = time.perf_counter() - start_time
    video_dur = len(mel_chunks) / fps
    rtf = elapsed / video_dur if video_dur > 0 else 0
    
    print("\n" + "=" * 60)
    print("      PERFECT ALIGNMENT INFERENCE RESULTS")
    print("=" * 60)
    print(f"Output Video Path        : {output_video}")
    print(f"Audio Duration           : {audio_dur:.2f} s")
    print(f"Generated Video Duration : {video_dur:.2f} s ({len(mel_chunks)} frames)")
    print(f"Total Execution Time     : {elapsed:.2f} s")
    print(f"Real-Time Factor (RTF)   : {rtf:.2f}x")
    print(f"Face Box Coordinates     : (x1=675, y1=52, x2=845, y2=222)")
    print(f"Lip Center Y Position    : Y = 167 (Matches Rahul's real lips & chin)")
    print("=" * 60)

if __name__ == "__main__":
    run_wav2lip_perfect_alignment()
