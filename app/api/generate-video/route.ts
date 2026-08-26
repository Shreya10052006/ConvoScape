import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  let body: { responseId?: string; text?: string; warmup?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.warmup) {
    const modalUrl = process.env.MODAL_WAV2LIP_URL;
    if (modalUrl) {
      void fetch(modalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warmup: true }),
      }).catch(() => null);
    }
    return NextResponse.json({ warmed: true });
  }

  const { responseId, text } = body;
  if (!responseId || !text) {
    return NextResponse.json({ error: "Missing required fields: responseId, text." }, { status: 400 });
  }

  const cleanId = responseId.replace(/[^a-zA-Z0-9_-]/g, "");
  const videoFileName = `rahul-response-${cleanId}.mp4`;
  const publicVideoPath = path.join(process.cwd(), "public", "generated", videoFileName);
  const videoUrl = `/generated/${videoFileName}`;

  // 1. Check Cache
  if (fs.existsSync(publicVideoPath)) {
    return NextResponse.json({ videoUrl, cached: true });
  }

  // 2. Generate Video via Local In-Memory Daemon / Subprocess Fallback
  try {
    // Try fast in-memory daemon on port 5001 first
    const daemonRes = await fetch("http://127.0.0.1:5001", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseId: cleanId, text }),
    }).catch(() => null);

    if (daemonRes && daemonRes.ok) {
      if (fs.existsSync(publicVideoPath)) {
        return NextResponse.json({ videoUrl, cached: false, provider: "local-daemon" });
      }
    }

    // Subprocess fallback
    const cwd = process.cwd();
    await execFileAsync("python", ["backend/generate_response_video.py", cleanId, text], { cwd, timeout: 120000 });

    if (fs.existsSync(publicVideoPath)) {
      return NextResponse.json({ videoUrl, cached: false });
    } else {
      throw new Error("Generated video file not found after command execution.");
    }
  } catch (err) {
    console.error("[generate-video API] Wav2Lip generation failed:", err);
    // Graceful fallback response
    return NextResponse.json({
      error: "Wav2Lip generation failed",
      fallbackAudioUrl: `/generated/tts-${cleanId}.wav`,
    }, { status: 500 });
  }
}
