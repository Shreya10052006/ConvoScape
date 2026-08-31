import os
import sys
import time

sys.path.insert(0, os.path.abspath('backend'))
from generate_response_video import generate_character_video

# Fixed Pre-Generated Judge Turns (Exact wording from specification)
FIXED_JUDGE_PRESETS = [
    (
        "q1",
        "Alright. You’ll have about three minutes to present your project. Give us a clear idea of the problem you’re solving, how your solution works, and what you’ve actually built so far.",
        "judge1",
    ),
    (
        "q3",
        "Now that I understand the basic idea, I'm curious — what made you choose this particular approach instead of the other ways you could have solved the problem?",
        "judge1",
    ),
    (
        "q5",
        "Thinking about the actual users of your project, what do you think would be the biggest challenge in getting people to really use it?",
        "judge1",
    ),
    (
        "q7",
        "One last thing I'm curious about — if you had a little more time to improve this project, what would you change first, and why?",
        "judge1",
    ),
    (
        "team-name-clarification",
        "Oh, sorry about the confusion. Could you tell us your team name?",
        "judge1",
    ),
    (
        "farewell",
        "Alright, I think we’ve got everything we need. Thanks for explaining your project, and all the best!",
        "judge1",
    ),
]

def main():
    print("=" * 70)
    print("   PRE-GENERATING FIXED JUDGE ASSETS (Q1, Q3, Q5, Q7, CLARIFICATION, FAREWELL)")
    print("=" * 70)

    t0 = time.perf_counter()
    for response_id, text, char in FIXED_JUDGE_PRESETS:
        print(f"\n[Pregenerate Judges] Processing '{response_id}' ({char})...")
        video_file = generate_character_video(response_id, text, char)
        print(f" -> Ready: {video_file} ({os.path.getsize(video_file):,} bytes)")

    total_time = time.perf_counter() - t0
    print("\n" + "=" * 70)
    print(f" ALL FIXED JUDGE VIDEOS PRE-GENERATED IN {total_time:.2f}s!")
    print("=" * 70)

if __name__ == "__main__":
    main()
