import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  let body: { responseId?: string; text?: string; character?: "rahul" | "judge1" | "judge2" | "female_judge" | "male_judge"; warmup?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.warmup) {
    return NextResponse.json({ warmed: true });
  }

  const { responseId, text, character = "rahul" } = body;
  if (!responseId || !text) {
    return NextResponse.json({ error: "Missing required fields: responseId, text." }, { status: 400 });
  }

  const cleanId = responseId.replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix =
    character === "judge1" || character === "female_judge"
      ? "judge-female-"
      : character === "judge2" || character === "male_judge"
      ? "judge-male-"
      : "rahul-response-";

  const videoFileName = `${prefix}${cleanId}.mp4`;
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
      body: JSON.stringify({ responseId: cleanId, text, character }),
    }).catch(() => null);

    if (daemonRes && daemonRes.ok) {
      if (fs.existsSync(publicVideoPath)) {
        return NextResponse.json({ videoUrl, cached: false, provider: "local-daemon" });
      }
    }

    // Subprocess fallback
    const cwd = process.cwd();
    await execFileAsync("python", ["backend/generate_response_video.py", cleanId, text, character], { cwd, timeout: 120000 });

    if (fs.existsSync(publicVideoPath)) {
      return NextResponse.json({ videoUrl, cached: false });
    } else {
      throw new Error("Generated video file not found after command execution.");
    }
  } catch (err) {
    console.warn("[generate-video API] Subprocess execution unavailable in serverless environment (using audio fallback):", (err as Error).message);
    return NextResponse.json({
      videoUrl: null,
      fallback: true,
      message: "Serverless fallback active: speech synthesized via client audio",
    }, { status: 200 });
  }
}
