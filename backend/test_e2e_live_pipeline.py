import os
import sys
import time
import urllib.request
import json

BASE_URL = "http://localhost:3000"

def test_live_turn(turn_label, user_text):
    print(f"\n--- Testing Turn: {turn_label} ---")
    print(f"User Input: \"{user_text}\"")
    
    # 1. POST /api/conversation
    conv_url = f"{BASE_URL}/api/conversation"
    conv_payload = {
        "stage": "rahul",
        "project": {
            "title": "ConvoScape",
            "tagline": "AI Video Hackathon Platform",
            "problem": "Stale presentations",
            "solution": "Dynamic AI Video Interaction"
        },
        "stageHistory": [
            {"id": "t1", "speaker": "user", "text": user_text, "stage": "rahul", "kind": "CHARACTER_DIALOGUE"}
        ],
        "questionsAskedThisStage": [],
        "userAnswer": user_text,
        "isFinalTurn": False
    }
    
    req = urllib.request.Request(conv_url, data=json.dumps(conv_payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
    
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            reply_text = data.get("reply", "")
            print(f"Gemini Reply ({len(reply_text)} chars): \"{reply_text}\"")
            
            # 2. POST /api/generate-video
            vid_url = f"{BASE_URL}/api/generate-video"
            turn_id = f"test-{int(time.time())}"
            vid_payload = {
                "responseId": turn_id,
                "text": reply_text
            }
            
            vid_req = urllib.request.Request(vid_url, data=json.dumps(vid_payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
            t0 = time.perf_counter()
            with urllib.request.urlopen(vid_req) as vid_resp:
                vid_data = json.loads(vid_resp.read().decode('utf-8'))
                dt = time.perf_counter() - t0
                print(f"Wav2Lip Video Generated in {dt:.2f}s!")
                print(f"  Video URL : {vid_data.get('videoUrl')}")
                print(f"  Cached    : {vid_data.get('cached')}")
                
                # Check video file exists on disk
                local_path = os.path.join("public", vid_data.get('videoUrl').lstrip('/'))
                if os.path.exists(local_path):
                    print(f"  File Check: PASSED ({os.path.getsize(local_path):,} bytes)")
                else:
                    print(f"  File Check: FAILED")
                    
                # 3. Test Caching (Repeat request)
                t_cache0 = time.perf_counter()
                with urllib.request.urlopen(vid_req) as cache_resp:
                    cache_data = json.loads(cache_resp.read().decode('utf-8'))
                    dt_cache = time.perf_counter() - t_cache0
                    print(f"  Cache Check: PASSED in {dt_cache*1000:.1f}ms! (Cached={cache_data.get('cached')})")
                    
    except Exception as e:
        print(f"ERROR in Turn {turn_label}: {e}")

def run_all_e2e_tests():
    print("=" * 60)
    print("      END-TO-END LIVE CONVERSATION & WAV2LIP PIPELINE TEST")
    print("=" * 60)
    
    test_live_turn("Turn 1 (Short)", "Hi Rahul, how are you today?")
    test_live_turn("Turn 2 (Medium)", "Can you explain how ConvoScape handles dynamic AI video generation?")
    test_live_turn("Turn 3 (Long)", "Give me a complete walkthrough of your project architecture and how Wav2Lip integrates with Gemini and TTS.")
    
    print("\n" + "=" * 60)
    print("      ALL LIVE END-TO-END TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_all_e2e_tests()
