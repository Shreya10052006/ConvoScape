"use client";

import { useEffect, useState } from "react";
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
  const [project, setProject] = useState<ProjectContext | null>(
    SKIP_SETUP_FOR_TESTING ? DEFAULT_TEST_PROJECT : null
  );
  // Bumped on restart to force a full remount of Experience — every reducer,
  // ref, and piece of session state resets cleanly rather than needing a
  // hand-written reset path for each one.
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    document.body.dataset.scene = project ? "immersive" : "setup";
  }, [project]);

  if (!project) {
    return <ProjectSetup onComplete={setProject} />;
  }

  return (
    <Experience
      key={sessionKey}
      project={project}
      skipCameraConsentForTesting={SKIP_SETUP_FOR_TESTING}
      onRestart={() => {
        setProject(SKIP_SETUP_FOR_TESTING ? DEFAULT_TEST_PROJECT : null);
        setSessionKey((k) => k + 1);
      }}
    />
  );
}
