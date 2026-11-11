import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  let body: {
    responseId?: string;
    text?: string;
    character?: string;
    warmup?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const modalUrl = process.env.MODAL_WAV2LIP_URL;

  // Background Warmup Ping: wake up Modal GPU container early
  if (body.warmup) {
    if (modalUrl) {
      void fetch(modalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warmup: true }),
      }).catch(() => null);
    }
    return NextResponse.json({ warmed: true });
  }

  const { responseId, text, character = "rahul" } = body;
  if (!responseId || !text) {
    return NextResponse.json({ error: "Missing required fields: responseId, text." }, { status: 400 });
  }

  const cleanId = responseId.replace(/[^a-zA-Z0-9_-]/g, "");
  const videoFileName = `rahul-response-${cleanId}.mp4`;
  const publicVideoPath = path.join(process.cwd(), "public", "generated", videoFileName);
  const videoUrl = `/generated/${videoFileName}`;

  // 1. Check Static Cache
  if (fs.existsSync(publicVideoPath)) {
    return NextResponse.json({ videoUrl, cached: true });
  }

  // 2. Try Modal Cloud GPU (Fastest ~1.5s - 2.0s)
  if (modalUrl) {
    try {
      const modalRes = await fetch(modalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: cleanId, text, character }),
      });

      if (modalRes && modalRes.ok) {
        const arrayBuffer = await modalRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Try local file cache (if filesystem writable)
        try {
          fs.mkdirSync(path.dirname(publicVideoPath), { recursive: true });
          fs.writeFileSync(publicVideoPath, buffer);
          return NextResponse.json({ videoUrl, cached: false, provider: "modal-gpu" });
        } catch {
          // On Vercel (read-only filesystem), stream base64 Data URL
          const base64Video = buffer.toString("base64");
          return NextResponse.json({
            videoUrl: `data:video/mp4;base64,${base64Video}`,
            cached: false,
            provider: "modal-gpu-data-stream",
          });
        }
      } else {
        console.warn("[generate-video API] Modal returned non-ok status:", modalRes?.status);
      }
    } catch (err) {
      console.warn("[generate-video API] Modal GPU request failed, falling back to local:", (err as Error).message);
    }
  }

  // 3. Fallback: Local In-Memory Daemon / Subprocess Fallback
  try {
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

    // Subprocess fallback (local development)
    const cwd = process.cwd();
    await execFileAsync("python", ["backend/generate_response_video.py", cleanId, text, character], { cwd, timeout: 120000 });

    if (fs.existsSync(publicVideoPath)) {
      return NextResponse.json({ videoUrl, cached: false });
    }
  } catch (err) {
    console.warn("[generate-video API] Local execution unavailable (using audio fallback):", (err as Error).message);
  }

  // 4. Graceful Degradation: Audio synthesis over listening.mp4
  return NextResponse.json({
    videoUrl: null,
    fallback: true,
    message: "Serverless fallback active: speech synthesized via client audio",
  }, { status: 200 });
}
