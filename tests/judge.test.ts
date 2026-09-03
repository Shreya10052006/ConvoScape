import { describe, it, expect } from "vitest";
import { classifyTeamConfirmation } from "@/components/conversation/JudgeConversationController";
import {
  buildJudgeQ2Context,
  buildJudgeQ4Context,
  buildJudgeQ6Context,
  buildJudgeQ8Context,
} from "@/lib/ai/conversationService";
import {
  judgeTailoredTurnResponseSchema,
  judgesEvaluationReportSchema,
} from "@/lib/ai/schemas";
import { buildFallbackJudgesReport } from "@/lib/ai/fallbackReport";
import type { ProjectContext } from "@/lib/session/sessionTypes";

const mockProject: ProjectContext = {
  userName: "Shreya",
  college: "CEG",
  name: "CareVista",
  domain: "HealthTech",
  topic: "rural telemedicine",
  description: "A consent-first telemedicine platform for rural clinics",
  problem: "Rural patients lack direct specialist access and consent control",
  stack: "Next.js, Postgres, WebRTC",
};

describe("Team Confirmation Intent Classification", () => {
  it("classifies affirmative answers as CONFIRMED", () => {
    expect(classifyTeamConfirmation("Yes")).toBe("CONFIRMED");
    expect(classifyTeamConfirmation("Yeah")).toBe("CONFIRMED");
    expect(classifyTeamConfirmation("Yes, that's us")).toBe("CONFIRMED");
    expect(classifyTeamConfirmation("Yep")).toBe("CONFIRMED");
    expect(classifyTeamConfirmation("That's right")).toBe("CONFIRMED");
    expect(classifyTeamConfirmation("Correct")).toBe("CONFIRMED");
    expect(classifyTeamConfirmation("Yes, we're Team CareVista")).toBe("CONFIRMED");
  });

  it("classifies denials as DENIED", () => {
    expect(classifyTeamConfirmation("No")).toBe("DENIED");
    expect(classifyTeamConfirmation("No, we're Team Beta")).toBe("DENIED");
    expect(classifyTeamConfirmation("Actually, we're Team Gamma")).toBe("DENIED");
    expect(classifyTeamConfirmation("That's not our team")).toBe("DENIED");
    expect(classifyTeamConfirmation("No, you got the wrong team")).toBe("DENIED");
  });

  it("classifies ambiguous responses as UNCLEAR", () => {
    expect(classifyTeamConfirmation("")).toBe("UNCLEAR");
    expect(classifyTeamConfirmation("Hello?")).toBe("UNCLEAR");
    expect(classifyTeamConfirmation("Wait, what did you ask?")).toBe("UNCLEAR");
    expect(classifyTeamConfirmation("Can you repeat that?")).toBe("UNCLEAR");
  });
});

describe("Strict Judge Context Filtering", () => {
  const mockAnswers: Record<number, string> = {
    1: "In Q1 we built a consent-first WebRTC video consultation system.",
    2: "In Q2 we picked Postgres because relational schemas suit medical records.",
    3: "In Q3 we decided against GraphQL because REST was simpler.",
    4: "In Q4 under high load our socket gateway handles queuing.",
    5: "In Q5 user adoption is tricky because rural clinics have spotty 3G.",
    6: "In Q6 we cache consultations locally when offline.",
    7: "In Q7 we would add offline encrypted sync if given another month.",
    8: "In Q8 our biggest compromise was deferring multi-region replication.",
  };

  it("enforces Q2 contains ONLY questionnaire data and NO conversation answers", () => {
    const context = buildJudgeQ2Context(mockProject);
    expect(context).toContain("CareVista");
    expect(context).toContain("HealthTech");
    expect(context).not.toContain("In Q1");
    expect(context).not.toContain("In Q2");
    expect(context).not.toContain("In Q3");
  });

  it("enforces Q4 contains Questionnaire + Q1 + Q2 and deliberately excludes Q3", () => {
    const context = buildJudgeQ4Context(mockProject, mockAnswers);
    expect(context).toContain("In Q1");
    expect(context).toContain("In Q2");
    expect(context).not.toContain("In Q3");
    expect(context).not.toContain("In Q4");
  });

  it("enforces Q6 contains Questionnaire + Q1..Q4 and deliberately excludes Q5", () => {
    const context = buildJudgeQ6Context(mockProject, mockAnswers);
    expect(context).toContain("In Q1");
    expect(context).toContain("In Q2");
    expect(context).toContain("In Q3");
    expect(context).toContain("In Q4");
    expect(context).not.toContain("In Q5");
    expect(context).not.toContain("In Q6");
  });

  it("enforces Q8 contains Questionnaire + Q1..Q6 and deliberately excludes Q7", () => {
    const context = buildJudgeQ8Context(mockProject, mockAnswers);
    expect(context).toContain("In Q1");
    expect(context).toContain("In Q2");
    expect(context).toContain("In Q3");
    expect(context).toContain("In Q4");
    expect(context).toContain("In Q5");
    expect(context).toContain("In Q6");
    expect(context).not.toContain("In Q7");
    expect(context).not.toContain("In Q8");
  });
});

describe("Judge Schemas & Fallback Report Generation", () => {
  it("validates tailored judge turn responses correctly", () => {
    const valid = {
      question: "You mentioned using WebRTC for telemedicine. How do you maintain video quality over spotty rural cellular connections?",
      reasoningTarget: "scalability and network resilience",
      sourceContext: ["questionnaire.stack", "q1.answer"],
    };
    const parsed = judgeTailoredTurnResponseSchema.parse(valid);
    expect(parsed.question).toBe(valid.question);
    expect(parsed.reasoningTarget).toBe(valid.reasoningTarget);
  });

  it("generates and validates a complete Fallback Judges Evaluation Report", () => {
    const fallback = buildFallbackJudgesReport(mockProject, [
      {
        questionNumber: 1,
        stage: "judgeQA",
        speaker: "judge1",
        questionText: "Alright, tell us about your project.",
        userAnswer: "We built CareVista for rural telemedicine.",
        rawTranscript: "We built CareVista for rural telemedicine.",
      },
    ]);

    expect(fallback.reportType).toBe("judges_evaluation");
    expect(fallback.overallHackathonScore).toBeGreaterThanOrEqual(70);
    expect(fallback.categoryScores.technicalDepth).toBeGreaterThanOrEqual(70);
    expect(fallback.questionAnalysis.length).toBeGreaterThanOrEqual(1);
    expect(fallback.judgesRecommendations.length).toBeGreaterThanOrEqual(2);

    const schemaValidated = judgesEvaluationReportSchema.parse(fallback);
    expect(schemaValidated.overallHackathonScore).toBe(fallback.overallHackathonScore);
  });
});
