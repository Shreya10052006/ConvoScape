import { NextRequest, NextResponse } from "next/server";
import { requestTailoredTurn, type RequestTailoredTurnInput } from "@/lib/ai/conversationService";

export async function POST(req: NextRequest) {
  let body: RequestTailoredTurnInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.project || !body?.questionNumber) {
    return NextResponse.json({ error: "Missing required fields: project, questionNumber." }, { status: 400 });
  }

  try {
    const result = await requestTailoredTurn(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Tailored Turn API] Gemini error:", err);
    // Fallback question if Gemini fails
    const fallbackReply =
      body.questionNumber === 2
        ? `Hey, ${body.project.name} in ${body.project.domain} sounds super interesting! What made you choose this problem to work on today?`
        : body.questionNumber === 4
        ? `That architecture makes sense. If you had to scale ${body.project.name} under high traffic, which component would bottleneck first?`
        : body.questionNumber === 6
        ? `When handling edge cases or unexpected user inputs, how does ${body.project.name} stay resilient without failing?`
        : body.questionNumber === 8
        ? `What trade-off did you have to make during the build that you'd want to revisit with more time?`
        : `If you were pitching this to users tomorrow, what's the key differentiator that makes ${body.project.name} stand out?`;

    return NextResponse.json({
      speaker: "rahul",
      reply: fallbackReply,
      topicCovered: "project deep-dive",
      degraded: true,
    });
  }
}
