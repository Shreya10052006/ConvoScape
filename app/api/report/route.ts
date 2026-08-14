/**
 * POST /api/report
 * ---------------------------------------------------------------------------
 * Single call at session end: transcript + pre-computed speech metrics +
 * optional webcam metrics in, structured CoachingReport out.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateReport, type ReportInput } from "@/lib/ai/reportService";
import { buildFallbackReport } from "@/lib/ai/fallbackReport";

export async function POST(req: NextRequest) {
  let body: ReportInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.project || !body?.transcript || !body?.speechMetrics || !body?.webcam) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // generateReport() is contractually non-throwing: it degrades to a metrics-only
  // report rather than failing. The try/catch here is a belt-and-braces guard for
  // genuinely unexpected faults (e.g. a missing API key throws before the
  // fallback path is reached), and even then we return a usable report rather
  // than an error the UI would have to render as a dead end.
  try {
    const report = await generateReport(body);
    return NextResponse.json(report);
  } catch {
    const fallback = buildFallbackReport(
      body.project,
      body.transcript,
      body.speechMetrics,
      body.webcam
    );
    return NextResponse.json({ ...fallback, sessionId: body.sessionId });
  }
}
