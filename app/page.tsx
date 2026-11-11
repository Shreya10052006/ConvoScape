"use client";

import { useEffect, useState } from "react";
import IntroHero from "@/components/intro/IntroHero";
import ProjectSetup, { type ProjectContext } from "@/components/setup/ProjectSetup";
import EnvironmentSetupModal from "@/components/setup/EnvironmentSetupModal";
import Experience from "@/components/Experience";

const SKIP_SETUP_FOR_TESTING = false;

const DEFAULT_TEST_PROJECT: ProjectContext = {
  userName: "Alex",
  college: "Tech University",
  name: "ConvoScape AI",
  domain: "AI & EdTech",
  topic: "Interactive 2.5D Conversation Platform",
  description: "An immersive real-time AI conversation and assessment environment for public speaking and hackathon pitching.",
  problem: "Students lack realistic pitch practice environments with behavioral feedback.",
  stack: "Next.js, TypeScript, Web Speech API, Gemini AI",
};

export default function Home() {
  const [view, setView] = useState<"intro" | "setup" | "permissions" | "experience">(
    SKIP_SETUP_FOR_TESTING ? "experience" : "intro"
  );
  const [project, setProject] = useState<ProjectContext | null>(
    SKIP_SETUP_FOR_TESTING ? DEFAULT_TEST_PROJECT : null
  );
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    document.body.dataset.scene = view === "experience" ? "immersive" : "setup";
  }, [view]);

  // Stage 1: Intro Hero
  if (view === "intro") {
    return <IntroHero onStart={() => setView("setup")} />;
  }

  // Stage 2: Questionnaire Setup
  if (view === "setup" || !project) {
    return (
      <ProjectSetup
        onComplete={(p) => {
          setProject(p);
          setView("permissions");
        }}
      />
    );
  }

  // Stage 3: Permissions (Microphone & Fullscreen / Landscape check)
  if (view === "permissions") {
    return (
      <EnvironmentSetupModal
        onProceed={(stream) => {
          setMicStream(stream);
          setView("experience");
        }}
        onBack={() => setView("setup")}
      />
    );
  }

  // Stage 4: Hackathon Hall Experience
  return (
    <Experience
      key={sessionKey}
      project={project}
      mediaStream={micStream}
      onRestart={() => {
        setProject(null);
        setMicStream(null);
        setView("intro");
        setSessionKey((k) => k + 1);
      }}
    />
  );
}
