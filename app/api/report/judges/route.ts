import { NextRequest, NextResponse } from "next/server";
import { generateJudgesReport } from "@/lib/ai/reportService";
import type { CompactQuestionTurn, ProjectContext } from "@/lib/session/sessionTypes";

export async function POST(req: NextRequest) {
  let body: {
    project: ProjectContext;
    judgeTurns?: CompactQuestionTurn[];
    sessionId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.project || !body.project.name) {
    return NextResponse.json({ error: "Missing required field: project." }, { status: 400 });
  }

  try {
    const report = await generateJudgesReport({
      project: body.project,
      judgeTurns: body.judgeTurns || [],
      sessionId: body.sessionId,
    });
    return NextResponse.json(report);
  } catch (err) {
    console.error("[Judges Report API] Failed to generate judges report:", err);
    return NextResponse.json({ error: "Failed to generate judges evaluation report" }, { status: 500 });
  }
}
