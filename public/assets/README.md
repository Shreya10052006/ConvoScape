# ConvoScape Video Assets (`public/assets/`) 🎬

This directory contains the foundational video footage used by ConvoScape to render characters within the hall.

---

## 📽️ Asset Directory Manifest

| Asset File | Resolution | FPS | Duration | Purpose / Stage |
|---|---|---|---|---|
| `walking.mp4` | 1920×1080 | 25 fps | ~8.1s | **Stage 1 Arrival**: Rahul walks down the hackathon aisle to your table. |
| `listening.mp4` | 1920×1080 | 25 fps | ~2.5s | **Stage 1 Listening**: Rahul loops seamlessly in the background while the user speaks. |
| `judge_arrival.mp4` | 1920×1080 | 30 fps | ~25.5s | **Stage 2 Entry**: The two hackathon judges enter the room and take their seats. |
| `judge_listening.mp4` | 2560×1440 | 24 fps | ~4.9s | **Stage 3 Listening**: High-resolution continuous loop of the two seated judges. |
| `judges_leaving.mp4` | 1280×720 | 24 fps | ~10.0s | **Stage 3 Exit**: The judges wrap up the evaluation, stand, and leave the hall. |

---

## 🎭 Multi-Layer Video Controller Architecture

* **Zero Black Screens**: Background listening loops (`listening.mp4`, `judge_listening.mp4`) run continuously in muted state.
* **Seamless Lip-Sync Overlays**: Active speaking videos fade in on top with unmuted audio and fade back to the listening loop upon completion.
* **Per-Frame Tracking**: `judge_listening.mp4` coordinates are dynamically tracked frame-by-frame (`compute_frame_crops`) in `backend/generate_response_video.py` to lock lip-sync to the judges' natural head movements.
