import os
import sys
import time

sys.path.insert(0, os.path.abspath('backend'))
from generate_response_video import generate_rahul_video

# 5 Fixed Pre-Generated Questions (Exact wording from architecture spec)
FIXED_PRESET_TURNS = [
    (
        "q1",
        "So, what are you guys working on? I’ve been seeing so many different projects around here, so I’m curious — what’s yours about, and what made you guys decide to build it?"
    ),
    (
        "q3",
        "Yeah, I get what you mean. One thing I always find interesting with hackathon projects is how different the idea sounds compared to actually using it. If you had to show this to someone who knew nothing about it, what would you want them to understand first?"
    ),
    (
        "q5",
        "By the way, I always get curious about the tech side of these projects. When you guys were actually building this, what part ended up being more difficult than you expected?"
    ),
    (
        "q7",
        "Okay, random question — if you guys actually got another month to keep working on this after the hackathon, what would you change or add first?"
    ),
    (
        "q9",
        "Honestly, after working on it and talking about it this much, what’s the one part of your project you’re most excited to show someone?"
    ),
    (
        "filler-1",
        "Ah, got it."
    ),
    (
        "filler-2",
        "Hmm, okay, makes sense."
    ),
    (
        "filler-3",
        "Right, that's interesting."
    ),
]

def main():
    print("=" * 70)
    print("   PRE-GENERATING RAHUL 5 FIXED ANCHOR QUESTIONS (Q1, Q3, Q5, Q7, Q9)")
    print("=" * 70)
    
    t0 = time.perf_counter()
    for response_id, text in FIXED_PRESET_TURNS:
        target_id = f"rahul-{response_id}"
        print(f"\n[Pregenerate] Processing '{target_id}'...")
        video_file = generate_rahul_video(target_id, text)
        print(f" -> Ready: {video_file} ({os.path.getsize(video_file):,} bytes)")
        
    total_time = time.perf_counter() - t0
    print("\n" + "=" * 70)
    print(f" ALL 5 FIXED ANCHOR VIDEOS PRE-GENERATED IN {total_time:.2f}s!")
    print("=" * 70)

if __name__ == "__main__":
    main()
