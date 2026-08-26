/**
 * POST /api/report/student
 * ---------------------------------------------------------------------------
 * Dedicated server endpoint for the Student Communication Report (Rahul conversation).
 * Converts session data into a compact input, executes exactly ONE Gemini call
 * (cached by sessionId), and returns the structured StudentCommunicationReport.
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
    return NextResponse.json({ error: "Missing required fields (project, transcript)." }, { status: 400 });
  }

  try {
    const finalReport = await generateReport({
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

    return NextResponse.json(finalReport);
  } catch (err) {
    console.error("[POST /api/report/student] Error generating student report:", err);
    const fallback = buildFallbackReport(
      body.project,
      body.transcript,
      body.speechMetrics || ({} as any),
      body.webcam || { enabled: false }
    );
    return NextResponse.json({ ...fallback, sessionId: body.sessionId });
  }
}
