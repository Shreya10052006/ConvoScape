import { NextRequest, NextResponse } from "next/server";
import { requestJudgeTailoredTurn, type RequestJudgeTailoredTurnInput } from "@/lib/ai/conversationService";

export async function POST(req: NextRequest) {
  let body: RequestJudgeTailoredTurnInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.project || !body?.questionNumber) {
    return NextResponse.json({ error: "Missing required fields: project, questionNumber." }, { status: 400 });
  }

  try {
    const result = await requestJudgeTailoredTurn(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Judge Tailored Turn API] Gemini error:", err);
    // Deterministic fallback question if Gemini fails
    const fallbackQuestion =
      body.questionNumber === 2
        ? `Looking at your project description for ${body.project.name}, what were the technical factors that led you to choose your current architecture over existing alternatives?`
        : body.questionNumber === 4
        ? `You explained your core approach for ${body.project.name}. If a sudden 10x surge in user traffic or data occurs, which part of your design is most vulnerable to breaking?`
        : body.questionNumber === 6
        ? `How does ${body.project.name} handle edge cases where user data is malformed, partial, or conflicting, without causing unhandled exceptions?`
        : `Looking back at your implementation of ${body.project.name}, what is the single biggest technical compromise you had to make due to hackathon time constraints?`;

    return NextResponse.json({
      speaker: "judge2",
      question: fallbackQuestion,
      reasoningTarget: "technical evaluation",
      sourceContext: ["questionnaire.fallback"],
      degraded: true,
    });
  }
}
