#!/usr/bin/env python3
"""Records the 5-minute demo against the live portal and cuts it into one video (local only).

1. If narration files exist (tests/e2e/demo/audio/scene-<n>.wav or .mp3), their lengths
   become the scenes' target lengths (tests/e2e/demo/durations.json), so every scene lasts
   as long as its narration.
2. Runs the recording (tests/e2e/src/demo.spec.ts with DEMO_VIDEO=1): test users, a clean
   migration demo, one browser context per persona, 1920 x 1080; the test users are removed
   at the end like after every E2E run.
3. Cuts each scene out of its recording, lays its narration under it (or silence) and joins
   them into demo-output/demo.mp4, plus a short demo-output/demo.gif.

Nothing is published: the output stays in demo-output/ for review.

    LEGACY_DEMO_PASSWORD=… scripts/demo-video.py               # record and cut
    scripts/demo-video.py --skip-record                        # cut the last recording again

Needs ffmpeg/ffprobe, pnpm and AWS access (the kundenportal profile unless the environment
names another one or carries credentials).
"""
import argparse
import json
import math
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "demo-output"
DEMO = ROOT / "tests" / "e2e" / "demo"
SCENES = 9
FPS = 30


def run(*cmd, **kwargs):
    subprocess.run(cmd, check=True, **kwargs)


def length(file):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(file)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return float(out)


def narration(scene):
    for ext in ("wav", "mp3"):
        file = DEMO / "audio" / f"scene-{scene}.{ext}"
        if file.exists():
            return file
    return None


def write_durations():
    """Scene lengths from the narration (plus a breath), where there is one."""
    files = [narration(n) for n in range(1, SCENES + 1)]
    if not any(files):
        return False
    durations = [math.ceil(length(f) + 1.0) if f else None for f in files]
    (DEMO / "durations.json").write_text(json.dumps(durations) + "\n")
    print("scene lengths from narration:", durations)
    return True


def record():
    env = dict(os.environ, DEMO_VIDEO="1")
    if not env.get("AWS_PROFILE") and not env.get("AWS_ACCESS_KEY_ID"):
        env["AWS_PROFILE"] = "kundenportal"
    if not env.get("LEGACY_DEMO_PASSWORD"):
        sys.exit("LEGACY_DEMO_PASSWORD is not set (Anna's password in the legacy systems)")
    run("pnpm", "--filter", "@kundenportal/e2e", "exec", "playwright", "test",
        "src/demo.spec.ts", "--reporter=list", cwd=ROOT, env=env)


def cut():
    marks = sorted(json.loads((OUT / "scenes.json").read_text()), key=lambda m: m["scene"])
    if len(marks) != SCENES or any(not m["video"] for m in marks):
        sys.exit(f"demo-output/scenes.json is incomplete ({len(marks)} of {SCENES} scenes)")
    parts = OUT / "parts"
    parts.mkdir(exist_ok=True)
    listing = []
    for m in marks:
        source = OUT / "videos" / m["video"]
        duration = m["end"] - m["start"]
        part = parts / f"scene-{m['scene']}.mp4"
        audio = narration(m["scene"])
        sound = ["-i", str(audio)] if audio else ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        run(
            "ffmpeg", "-y", "-loglevel", "error",
            "-ss", f"{m['start']:.3f}", "-t", f"{duration:.3f}", "-i", str(source), *sound,
            "-map", "0:v", "-map", "1:a",
            "-vf", f"fps={FPS},format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "18",
            "-af", "apad", "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k",
            "-t", f"{duration:.3f}", str(part),
        )
        listing.append(f"file '{part.name}'")
        print(f"scene {m['scene']} ({m['title']}): {duration:.1f} s" + (" with narration" if audio else ""))
    (parts / "list.txt").write_text("\n".join(listing) + "\n")
    video = OUT / "demo.mp4"
    run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
        "-i", str(parts / "list.txt"), "-c", "copy", "-movflags", "+faststart", str(video))
    # A short loop for the report page: the order in scene 4, 12 s, 960 px wide.
    gif = OUT / "demo.gif"
    run("ffmpeg", "-y", "-loglevel", "error", "-ss", "8", "-t", "12", "-i", str(parts / "scene-4.mp4"),
        "-vf", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse",
        str(gif))
    print(f"\n{video} ({length(video) / 60:.1f} min)\n{gif}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--skip-record", action="store_true", help="only cut the last recording")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    write_durations()
    if not args.skip_record:
        record()
    cut()


if __name__ == "__main__":
    main()
