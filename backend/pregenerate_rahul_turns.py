import os
import sys
import time

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath('backend'))
from generate_response_video import generate_rahul_video

PRESET_TURNS = [
    ("turn1-opening", "Hey there! I'm Rahul, from Metro State University. Your table setup looked really cool from over here! What's your name and where are you from or which college are you with?"),
    ("turn2", "That's awesome! It's great to meet you. I was really curious when I saw your table setup — what's your project called and what problem are you solving?"),
    ("turn3", "Got it! That sounds super useful. How much of the implementation have you actually built so far today versus what's still planned?"),
    ("turn4", "Nice! What tech stack and frameworks did you choose to build it with, and how are you handling the AI integration?"),
    ("turn5", "That's really cool! What has been the hardest technical bug or roadblock your team ran into while building this today?"),
    ("turn6", "Makes total sense! Who are your target users, and how do you envision scaling this up beyond the hackathon?"),
    ("turn7", "That is super impressive work! Best of luck with the judges later today — I'm sure you're going to kill it!"),
]

def main():
    print("=" * 60)
    print("   PRE-GENERATING RAHUL 7-TURN CONVERSATION WAV2LIP VIDEOS")
    print("=" * 60)
    
    t0 = time.perf_counter()
    for response_id, text in PRESET_TURNS:
        print(f"\n[Pregenerate] Processing Turn '{response_id}' ({len(text)} chars)...")
        video_file = generate_rahul_video(response_id, text)
        print(f" -> Ready: {video_file} ({os.path.getsize(video_file):,} bytes)")
        
    total_time = time.perf_counter() - t0
    print("\n" + "=" * 60)
    print(f" ALL 7 TURNS PRE-GENERATED IN {total_time:.2f}s!")
    print(" Every turn will now play with ZERO DELAY (15 ms cache hit)!")
    print("=" * 60)

if __name__ == "__main__":
    main()
