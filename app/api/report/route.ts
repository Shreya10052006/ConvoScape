/**
 * POST /api/report
 * ---------------------------------------------------------------------------
 * Main report router (calls student communication report service).
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

  if (!body?.project || !body?.transcript) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    const report = await generateReport({
      project: body.project,
      transcript: body.transcript,
      speechMetrics: body.speechMetrics || {
        totalSpeakingMs: 0,
        totalResponses: 0,
        avgResponseTimeMs: 0,
        avgWordsPerResponse: 0,
        wordsPerMinute: null,
        fillerWordCounts: {},
        totalFillerWords: 0,
        longPauseCount: 0,
        shortAnswerCount: 0,
        longAnswerCount: 0,
        repetition: {
          repeatedWordCount: 0,
          repeatedPhraseCount: 0,
          topRepeatedWords: [],
          topRepeatedPhrases: [],
          domainTermRepeats: [],
        },
      },
      webcam: body.webcam || { enabled: false },
      sessionId: body.sessionId,
      timestamps: body.timestamps,
      interruptions: body.interruptions,
    });
    return NextResponse.json(report);
  } catch (err) {
    console.error("[POST /api/report] Error:", err);
    const fallback = buildFallbackReport(
      body.project,
      body.transcript,
      body.speechMetrics || ({} as any),
      body.webcam || { enabled: false }
    );
    return NextResponse.json({ ...fallback, sessionId: body.sessionId });
  }
}
