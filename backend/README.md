# ConvoScape Neural Lip-Sync & Video Generation Backend 🧠⚡

This directory contains the Python-based video synthesis engine, neural lip-sync model, and pregeneration scripts powering ConvoScape's realistic character interactions.

---

## 🏗️ Architecture & Key Components

```text
backend/
├── generate_response_video.py   # Core video generator with per-frame tracking & DirectML
├── pregenerate_judge_turns.py   # Batch script for permanent judge video turns
├── pregenerate_rahul_turns.py   # Batch script for permanent Rahul video turns
├── wav2lip_server.py            # Standalone Wav2Lip daemon service
└── Wav2Lip/                     # Wav2Lip ONNX/PyTorch model weights & utilities
```

---

## 🌟 Technical Highlights

### 1. Dynamic Per-Frame Mouth Tracking
* **Function**: `compute_frame_crops(full_frames, character, cfg)` in `generate_response_video.py`.
* In `judge_listening.mp4` (2560×1440), judges shift and tilt their heads naturally.
* Real-time normalized template matching tracks the exact mouth coordinates for every single video frame $t \in [0..117]$:
  * **Female Judge (Left)**: Mouth center tracked around $(969, 323)$.
  * **Male Judge (Right)**: Mouth center tracked around $(1493, 269)$.
* The synthesized face is cropped from and blended back into the exact tracked coordinates for that frame, preventing any lip detachment or slipping.

### 2. DirectML-Accelerated Wav2Lip Inference
* Runs on Windows GPUs using ONNX Runtime with `DmlExecutionProvider`.
* Utilizes **8.33 FPS subsampling (Step = 3)** with smooth Hermite curve interpolation.
* Reduces neural network compute by **67%** while delivering fluid 25fps video.

### 3. Edge-TTS Audio Generation
* Generates clean character audio with natural speech prosody:
  * **Rahul**: `en-US-GuyNeural`
  * **Female Judge (Judge 1)**: `en-GB-SoniaNeural`
  * **Male Judge (Judge 2)**: `en-US-ChristopherNeural`

---

## 🛠️ CLI Usage & Pregeneration Scripts

### Pre-Generate All Fixed Rahul Turns
```bash
python backend/pregenerate_rahul_turns.py
```
Generates anchor questions Q1, Q3, Q5, Q7, Q9, filler clips, and farewell video into `public/generated/`.

### Pre-Generate All Fixed Judge Turns
```bash
python backend/pregenerate_judge_turns.py
```
Generates Judge Q1, Q3, Q5, Q7, team name clarification, and farewell video into `public/generated/`.

### Generate Custom Dynamic Turn via CLI
```bash
python backend/generate_response_video.py "custom-id" "Hello! Tell us about your project architecture." "judge2"
```
