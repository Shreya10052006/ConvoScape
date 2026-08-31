import os
import re
import glob

def main():
    print("=" * 70)
    print("   CHECKING FOR MISSING VIDEOS IN CONVOSCAPE")
    print("=" * 70)

    # 1. Inspect all physical video files
    video_files = glob.glob("public/assets/*.mp4") + glob.glob("public/generated/*.mp4") + glob.glob("public/*.mp4")
    disk_files = {os.path.normpath(f).replace("\\", "/"): os.path.getsize(f) for f in video_files}

    print(f"\nFound {len(disk_files)} video files on disk:")
    for f, sz in sorted(disk_files.items()):
        print(f"  [DISK] {f} ({sz:,} bytes)")

    # 2. Inspect all code references
    code_refs = set()
    for root, _, files in os.walk("."):
        if any(x in root for x in ["node_modules", ".next", ".git", ".gemini", ".system_generated"]):
            continue
        for file in files:
            if file.endswith((".ts", ".tsx", ".js", ".py")):
                p = os.path.normpath(os.path.join(root, file)).replace("\\", "/")
                with open(p, "r", encoding="utf-8", errors="ignore") as src:
                    content = src.read()
                    matches = re.findall(r'[\'"]([^\'"]+?\.mp4)[\'"]', content)
                    for m in matches:
                        # Exclude remote urls or variable patterns
                        if not m.startswith("http") and not "${" in m:
                            code_refs.add((m, p))

    print(f"\nChecking {len(code_refs)} code references to .mp4 videos:")
    missing = []
    for ref, src_file in sorted(code_refs):
        clean = ref.lstrip("/")
        candidates = [
            os.path.normpath(clean).replace("\\", "/"),
            os.path.normpath(os.path.join("public", clean)).replace("\\", "/"),
            os.path.normpath(os.path.join("public/assets", clean)).replace("\\", "/"),
            os.path.normpath(os.path.join("public/generated", clean)).replace("\\", "/"),
        ]
        found = any(c in disk_files or os.path.exists(c) for c in candidates)
        status = "OK" if found else "MISSING"
        if not found:
            missing.append((ref, src_file))
        print(f"  [{status:7s}] {ref:45s} (in {src_file})")

    print("\n" + "=" * 70)
    if missing:
        print(f" WARNING: {len(missing)} MISSING VIDEO REFERENCES FOUND:")
        for ref, src_file in missing:
            print(f"  -> {ref} referenced in {src_file}")
    else:
        print(" ALL VIDEO ASSETS ARE PRESENT AND ACCOUNTED FOR! (0 MISSING)")
    print("=" * 70)

if __name__ == "__main__":
    main()
