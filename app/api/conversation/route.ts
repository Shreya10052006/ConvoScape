/**
 * POST /api/conversation
 * ---------------------------------------------------------------------------
 * One turn in, one turn out. Handles Rahul's turns and both judges' turns —
 * same shape, different persona, selected by `stage`. The Gemini API key never
 * leaves this route; the client only ever sees the reply text and scores.
 */

import { NextRequest, NextResponse } from "next/server";
import { requestTurn, type RequestTurnInput } from "@/lib/ai/conversationService";
import { fallbackRahulTurn, fallbackTurn } from "@/lib/ai/fallbackQuestions";

export async function POST(req: NextRequest) {
  let body: RequestTurnInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.project || !body?.stage) {
    return NextResponse.json({ error: "Missing required fields: project, stage." }, { status: 400 });
  }

  try {
    const result = await requestTurn(body);
    return NextResponse.json(result);
  } catch {
    // A conversation turn must never dead-end the session. If Gemini is
    // unreachable, misconfigured, or returns something unusable even after the
    // retry, we serve a deterministic turn built from the project metadata so
    // the user still reaches a complete transcript and a real report.
    //
    // These are honestly worse — they can't follow up on what was just said —
    // so `degraded` is set and the client shows a one-line notice rather than
    // pretending nothing happened.
    const answersSoFar = (body.stageHistory ?? []).filter((t) => t.speaker === "user").length;
    const turn =
      body.stage === "rahul"
        ? fallbackRahulTurn(body.project, answersSoFar, Boolean(body.isFinalTurn))
        : fallbackTurn(body.project, answersSoFar, Boolean(body.isFinalTurn));

    return NextResponse.json({ ...turn, evaluation: null, degraded: true });
  }
}
