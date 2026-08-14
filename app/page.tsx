"use client";

import { useEffect, useState } from "react";
import ProjectSetup, { type ProjectContext } from "@/components/setup/ProjectSetup";
import Experience from "@/components/Experience";

export default function Home() {
  const [project, setProject] = useState<ProjectContext | null>(null);
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
      onRestart={() => {
        setProject(null);
        setSessionKey((k) => k + 1);
      }}
    />
  );
}
