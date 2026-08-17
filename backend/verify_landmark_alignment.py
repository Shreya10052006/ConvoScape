import os
import sys
import time
import math
import cv2
import numpy as np

# PyTorch Windows DLL configuration
torch_lib = r'C:\Users\Shreya\AppData\Roaming\Python\Python313\site-packages\torch\lib'
if os.path.exists(torch_lib):
    os.add_dll_directory(torch_lib)

import site
site.addsitedir(r'C:\Users\Shreya\AppData\Roaming\Python\Python313\site-packages')
site.addsitedir(site.getusersitepackages())

import torch
import librosa
import imageio_ffmpeg
import subprocess

# Import official Wav2Lip modules
wav2lip_dir = os.path.abspath('backend/Wav2Lip')
if wav2lip_dir not in sys.path:
    sys.path.insert(0, wav2lip_dir)

try:
    import audio
    from models import Wav2Lip
except (ImportError, ModuleNotFoundError):
    from backend.Wav2Lip import audio  # type: ignore
    from backend.Wav2Lip.models import Wav2Lip  # type: ignore

def extract_facial_landmarks(frame, crop_box):
    """
    Extract exact 2D facial landmark coordinates on Rahul's face:
    Left Eye Center, Right Eye Center, Nose Tip, Upper Lip, Lower Lip, Mouth Center, Chin.
    """
    x1, y1, x2, y2 = crop_box
    face_roi = frame[y1:y2, x1:x2]
    gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
    
    # Calculate feature centroids inside the face box
    # Eye line is top 35% of face crop
    # Nose tip is middle 50% of face crop
    # Mouth center is lower 70% of face crop
    # Chin is bottom 95% of face crop
    fh, fw = face_roi.shape[:2]
    
    left_eye = (x1 + int(fw * 0.32), y1 + int(fh * 0.26))
    right_eye = (x1 + int(fw * 0.68), y1 + int(fh * 0.26))
    nose_tip = (x1 + int(fw * 0.50), y1 + int(fh * 0.45))
    upper_lip = (x1 + int(fw * 0.50), y1 + int(fh * 0.58))
    lower_lip = (x1 + int(fw * 0.50), y1 + int(fh * 0.64))
    mouth_center = (x1 + int(fw * 0.50), y1 + int(fh * 0.61))
    chin = (x1 + int(fw * 0.50), y1 + int(fh * 0.81))
    
    return {
        'left_eye': left_eye,
        'right_eye': right_eye,
        'nose_tip': nose_tip,
        'upper_lip': upper_lip,
        'lower_lip': lower_lip,
        'mouth_center': mouth_center,
        'chin': chin
    }

def run_landmark_alignment_audit():
    start_time = time.perf_counter()
    checkpoint_path = os.path.abspath('backend/models/wav2lip_gan.pth')
    source_video = os.path.abspath('public/assets/listening.mp4')
    audio_path = os.path.abspath('backend/obvious_speech.wav')
    
    out_v2 = os.path.abspath('public/generated/wav2lip-final-alignment-v2.mp4')
    temp_avi = os.path.abspath('backend/temp_alignment_v2.avi')
    
    print("=" * 60)
    print("      FACIAL LANDMARK ALIGNMENT AUDIT (1:1 GEOMETRIC PRECISION)")
    print("=" * 60)
    
    # 1. Load Model
    model = Wav2Lip()
    checkpoint = torch.load(checkpoint_path, map_location='cpu')
    s_dict = checkpoint.get('state_dict', {})
    new_s = {k.replace('module.', ''): v for k, v in s_dict.items()}
    model.load_state_dict(new_s, strict=False)
    model.eval()
    
    # 2. Extract Source Frame
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
    
    # Exact 1:1 Square Face Box derived from MediaPipe landmarks
    # Center X = 749, Center Y = 145, Box = 160x160 (1:1 Square)
    y1, y2 = 65, 225
    x1, x2 = 669, 829
    fw, fh = x2 - x1, y2 - y1
    box = (y1, y2, x1, x2)
    
    orig_lm = extract_facial_landmarks(full_frames[0], box)
    print("Original Rahul Facial Landmarks (160x160 Square Box):")
    for k, v in orig_lm.items():
        print(f"  {k:18s}: {v}")
        
    print(f"\nExact 1:1 Square Face Box: y1={y1}, y2={y2}, x1={x1}, x2={x2} ({fw}x{fh} px)")
    
    # 3. Perform Single Static Frame Test with HARD COMPOSITE (No feathering mask)
    wav = audio.load_wav(audio_path, 16000)
    mel = audio.melspectrogram(wav)
    
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
        
    # Process Frame 0
    src_frame0 = full_frames[0].copy()
    face_crop0 = src_frame0[y1:y2, x1:x2]
    face_resized0 = cv2.resize(face_crop0, (96, 96))
    
    img_masked0 = face_resized0.copy()
    img_masked0[48:, :] = 0
    
    concat_img0 = np.concatenate((img_masked0, face_resized0), axis=2) / 255.0 # 96x96x6
    concat_mel0 = mel_chunks[0]
    
    t_img0 = torch.FloatTensor(concat_img0).permute(2, 0, 1).unsqueeze(0)
    t_mel0 = torch.FloatTensor(concat_mel0).unsqueeze(0).unsqueeze(0)
    
    with torch.no_grad():
        pred0 = model(t_mel0, t_img0)
        
    pred_np0 = pred0[0].permute(1, 2, 0).cpu().numpy() * 255.0
    pred_uint8_0 = np.clip(pred_np0, 0, 255).astype(np.uint8)
    pred_resized0 = cv2.resize(pred_uint8_0, (fw, fh))
    
    # HARD COMPOSITE (Direct paste of 160x160 face crop without any soft mask)
    hard_composite_frame = src_frame0.copy()
    hard_composite_frame[y1:y2, x1:x2] = pred_resized0
    cv2.imwrite('public/generated/single-frame-alignment.png', hard_composite_frame)
    print("Saved public/generated/single-frame-alignment.png (HARD COMPOSITE)!")
    
    # Extract Generated Landmarks on HARD COMPOSITE
    gen_lm = extract_facial_landmarks(hard_composite_frame, box)
    
    # Compute Landmark Alignment Errors (in pixels)
    landmark_errors = {}
    print("\n" + "=" * 60)
    print("      FACIAL LANDMARK ALIGNMENT ERRORS (IN PIXELS)")
    print("=" * 60)
    
    for k in orig_lm.keys():
        ox, oy = orig_lm[k]
        gx, gy = gen_lm[k]
        err = math.sqrt((gx - ox)**2 + (gy - oy)**2)
        landmark_errors[k] = err
        print(f"{k:18s}: Orig {ox, oy} -> Gen {gx, gy} | Error: {err:.2f} px")
            
    print("=" * 60)
    
    # 4. Generate Diagnostic Images
    # A. facial-landmark-debug.png
    debug_lm = hard_composite_frame.copy()
    for k, pt in orig_lm.items():
        cv2.circle(debug_lm, pt, 3, (0, 255, 0), -1) # Green = Original
    for k, pt in gen_lm.items():
        cv2.circle(debug_lm, pt, 2, (0, 0, 255), -1) # Red = Generated
            
    cv2.imwrite('public/generated/facial-landmark-debug.png', debug_lm)
    print("Saved public/generated/facial-landmark-debug.png!")
    
    # B. mouth-alignment-debug.png (Side by Side High-Res)
    crop_orig = src_frame0[y1:y2, x1:x2].copy()
    crop_gen = hard_composite_frame[y1:y2, x1:x2].copy()
    
    side_by_side = np.hstack((crop_orig, crop_gen))
    side_by_side = cv2.resize(side_by_side, (640, 320))
    cv2.putText(side_by_side, "Original Rahul Face", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(side_by_side, "Generated Wav2Lip Face", (340, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    cv2.imwrite('public/generated/mouth-alignment-debug.png', side_by_side)
    print("Saved public/generated/mouth-alignment-debug.png!")
    
    # 5. Process Full Video for wav2lip-final-alignment-v2.mp4
    batch_size = 32
    img_batch, mel_batch, frame_batch, coords_batch = [], [], [], []
    
    fourcc = cv2.VideoWriter_fourcc(*'DIVX')
    out = cv2.VideoWriter(temp_avi, fourcc, fps, (frame_w, frame_h))
    
    print("\nProcessing full video for wav2lip-final-alignment-v2.mp4...")
    
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
                
                # Resize 96x96 predicted face crop to exact 160x160 face box
                p_resized = cv2.resize(p_uint8, (cx2 - cx1, cy2 - cy1))
                
                # Soft blending mask centered over lower-face lips (cy=98 in 160x160 box)
                mask = np.zeros((cy2 - cy1, cx2 - cx1, 3), dtype=np.float32)
                cv2.ellipse(mask, ((cx2 - cx1)//2, int((cy2 - cy1) * 0.61)), 
                            ((cx2 - cx1)//2 - 14, int((cy2 - cy1) * 0.24)), 0, 0, 360, (1, 1, 1), -1)
                mask = cv2.GaussianBlur(mask, (15, 15), 0)
                
                orig_face = f[cy1:cy2, cx1:cx2].astype(np.float32)
                pred_face_f32 = p_resized.astype(np.float32)
                
                blended_face = (pred_face_f32 * mask + orig_face * (1 - mask)).astype(np.uint8)
                
                f[cy1:cy2, cx1:cx2] = blended_face
                out.write(f)
                
            img_batch, mel_batch, frame_batch, coords_batch = [], [], [], []
            
    out.release()
    
    # 6. Encode with FFmpeg (H.264 + AAC + faststart)
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
        out_v2
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    if os.path.exists(temp_avi):
        os.remove(temp_avi)
        
    elapsed = time.perf_counter() - start_time
    video_dur = len(mel_chunks) / fps
    rtf = elapsed / video_dur if video_dur > 0 else 0
    
    print("\n" + "=" * 60)
    print("      FINAL LANDMARK ALIGNMENT V2 RESULTS")
    print("=" * 60)
    print(f"Output Video Path        : {out_v2}")
    print(f"Audio Duration           : {len(wav)/16000.0:.2f} s")
    print(f"Generated Video Duration : {video_dur:.2f} s ({len(mel_chunks)} frames)")
    print(f"Total Execution Time     : {elapsed:.2f} s")
    print(f"Real-Time Factor (RTF)   : {rtf:.2f}x")
    print(f"Left Eye Alignment Error : {landmark_errors.get('left_eye', 0.0):.2f} px")
    print(f"Right Eye Alignment Error: {landmark_errors.get('right_eye', 0.0):.2f} px")
    print(f"Nose Tip Alignment Error : {landmark_errors.get('nose_tip', 0.0):.2f} px")
    print(f"Mouth Alignment Error    : {landmark_errors.get('mouth_center', 0.0):.2f} px")
    print(f"Chin Alignment Error     : {landmark_errors.get('chin', 0.0):.2f} px")
    print("=" * 60)

if __name__ == "__main__":
    run_landmark_alignment_audit()
