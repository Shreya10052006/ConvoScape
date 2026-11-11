"use client";

import { useEffect, useState } from "react";
import IntroHero from "@/components/intro/IntroHero";
import ProjectSetup, { type ProjectContext } from "@/components/setup/ProjectSetup";
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
  const [view, setView] = useState<"intro" | "setup" | "experience">(
    SKIP_SETUP_FOR_TESTING ? "experience" : "intro"
  );
  const [project, setProject] = useState<ProjectContext | null>(
    SKIP_SETUP_FOR_TESTING ? DEFAULT_TEST_PROJECT : null
  );
  // Bumped on restart to force a full remount of Experience — every reducer,
  // ref, and piece of session state resets cleanly.
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    document.body.dataset.scene = view === "experience" ? "immersive" : "setup";
  }, [view]);

  if (view === "intro") {
    return <IntroHero onStart={() => setView("setup")} />;
  }

  if (view === "setup" || !project) {
    return (
      <ProjectSetup
        onComplete={(p) => {
          setProject(p);
          setView("experience");
        }}
      />
    );
  }

  return (
    <Experience
      key={sessionKey}
      project={project}
      skipCameraConsentForTesting={SKIP_SETUP_FOR_TESTING}
      onRestart={() => {
        setProject(null);
        setView("intro");
        setSessionKey((k) => k + 1);
      }}
    />
  );
}
