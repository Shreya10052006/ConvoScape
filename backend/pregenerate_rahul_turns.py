
import os
import sys
import time

sys.path.insert(0, os.path.abspath('backend'))
from generate_response_video import generate_rahul_video

PRESET_TURNS = [
    ("turn1-opening", "Hey! I was just walking around checking out other tables. I'm Rahul, 3rd year CS from RV College. What's your name, and where are you guys from?"),
    ("turn-farewell", "That sounds seriously awesome! Best of luck with the demo — I heard the judges are starting their rounds in a few hours, so make sure you're ready. I gotta run back to my table to finish our deployment. Catch you later!"),
]

def main():
    print("=" * 60)
    print("   PRE-GENERATING RAHUL OPENING & FAREWELL VIDEOS (1280x720)")
    print("=" * 60)
    
    t0 = time.perf_counter()
    for response_id, text in PRESET_TURNS:
        print(f"\n[Pregenerate] Processing '{response_id}'...")
        video_file = generate_rahul_video(response_id, text)
        print(f" -> Ready: {video_file} ({os.path.getsize(video_file):,} bytes)")
        
    total_time = time.perf_counter() - t0
    print("\n" + "=" * 60)
    print(f" OPENING & FAREWELL PRE-GENERATED IN {total_time:.2f}s!")
    print("=" * 60)

if __name__ == "__main__":
    main()
