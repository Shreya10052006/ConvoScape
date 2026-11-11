"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onProceed: (stream: MediaStream | null) => void;
  onBack: () => void;
}

export default function EnvironmentSetupModal({ onProceed, onBack }: Props) {
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micStatus, setMicStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const [fullscreenError, setFullscreenError] = useState<string | null>(null);

  // Check orientation and device type
  useEffect(() => {
    const checkOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth;
      const mobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth < 900;
      setIsPortrait(portrait);
      setIsMobileDevice(mobile);
      const fs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(fs);
      if (fs) {
        setFullscreenError(null);
      }
    };

    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);
    document.addEventListener("fullscreenchange", checkOrientation);
    document.addEventListener("webkitfullscreenchange", checkOrientation);
    document.addEventListener("mozfullscreenchange", checkOrientation);
    document.addEventListener("MSFullscreenChange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
      document.removeEventListener("fullscreenchange", checkOrientation);
      document.removeEventListener("webkitfullscreenchange", checkOrientation);
      document.removeEventListener("mozfullscreenchange", checkOrientation);
      document.removeEventListener("MSFullscreenChange", checkOrientation);
    };
  }, []);

  // Request Microphone permission (AUDIO ONLY — ZERO CAMERA)
  const handleRequestMic = useCallback(async () => {
    setMicStatus("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone API not supported");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false, // Explicitly no video/camera
      });
      setMicStream(stream);
      setMicStatus("granted");
    } catch (err) {
      console.warn("[EnvironmentSetup] Mic permission denied or unavailable:", err);
      setMicStatus("denied");
    }
  }, []);

  // Enter / Exit Fullscreen
  const handleToggleFullscreen = useCallback(async () => {
    try {
      const docEl = document.documentElement as any;
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (!isFs) {
        const reqFs =
          docEl.requestFullscreen ||
          docEl.webkitRequestFullscreen ||
          docEl.mozRequestFullScreen ||
          docEl.msRequestFullscreen;
        if (reqFs) {
          await reqFs.call(docEl);
          setIsFullscreen(true);
          setFullscreenError(null);
        } else {
          setFullscreenError("Full screen is not supported on this browser.");
        }
      } else {
        const exitFs =
          document.exitFullscreen ||
          (document as any).webkitExitFullscreen ||
          (document as any).mozCancelFullScreen ||
          (document as any).msExitFullscreen;
        if (exitFs) {
          await exitFs.call(document);
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.warn("[EnvironmentSetup] Fullscreen error:", err);
      setFullscreenError("Please enable full screen mode to enter the Hackathon Hall.");
    }
  }, []);

  const handleStart = async () => {
    const isFs = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (!isFs) {
      try {
        const docEl = document.documentElement as any;
        const reqFs =
          docEl.requestFullscreen ||
          docEl.webkitRequestFullscreen ||
          docEl.mozRequestFullScreen ||
          docEl.msRequestFullscreen;

        if (reqFs) {
          await reqFs.call(docEl);
          setIsFullscreen(true);
          setFullscreenError(null);
          // Allow full screen transition to complete before starting hall scene
          setTimeout(() => {
            onProceed(micStream);
          }, 150);
          return;
        } else {
          setFullscreenError("Full screen is not supported. Please maximize your window to proceed.");
          return;
        }
      } catch (err) {
        console.warn("[EnvironmentSetup] Fullscreen required error:", err);
        setFullscreenError("Please enter full screen mode before entering the Hackathon Arena.");
        return;
      }
    }

    onProceed(micStream);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030306] px-4 py-6 text-white overflow-y-auto">
      {/* Background Ambient Glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.15)_0%,rgba(99,102,241,0.08)_50%,transparent_70%)] blur-[90px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-xl rounded-3xl border border-white/10 bg-neutral-900/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3.5 py-1 text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-sky-400">
            <span>●</span> Setup & Audio Configuration
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Prepare Your Pitch Arena
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto">
            Enable microphone for interactive voice conversation and configure your screen before Rahul approaches your table.
          </p>
        </div>

        {/* Setting 1: Microphone Permission */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-lg">
                🎙️
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">Microphone Input</h3>
                <p className="text-xs text-neutral-400">Required for live voice conversation</p>
              </div>
            </div>

            {/* Status indicator */}
            {micStatus === "granted" ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-mono font-semibold text-emerald-300">
                <span>✓</span> Active
              </span>
            ) : micStatus === "denied" ? (
              <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-xs font-mono font-semibold text-amber-300">
                Type Mode
              </span>
            ) : null}
          </div>

          {micStatus !== "granted" && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleRequestMic}
                disabled={micStatus === "requesting"}
                className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white hover:bg-sky-400 active:scale-95 transition-all shadow-md shadow-sky-500/20"
              >
                {micStatus === "requesting" ? "Requesting..." : "Enable Microphone"}
              </button>
              <button
                type="button"
                onClick={() => setMicStatus("denied")}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-400 hover:text-white hover:bg-white/5 transition-all"
              >
                Skip (Type Answers)
              </button>
            </div>
          )}
        </div>

        {/* Setting 2: Screen & Display (Fullscreen REQUIRED + Phone Landscape Notice) */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-lg">
                🖥️
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Full-Screen Mode</h3>
                  <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-sky-300 border border-sky-500/30">
                    Required
                  </span>
                </div>
                <p className="text-xs text-neutral-400">Cinematic hackathon hall requires full screen</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              className={`rounded-full px-4 py-1.5 text-xs font-mono font-semibold transition-all ${
                isFullscreen
                  ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-300"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30"
              }`}
            >
              {isFullscreen ? "✓ Fullscreen Active" : "⛶ Go Fullscreen"}
            </button>
          </div>

          {/* Fullscreen Requirement Notice */}
          <AnimatePresence>
            {fullscreenError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"
              >
                <div className="flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{fullscreenError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onProceed(micStream)}
                  className="font-mono text-[11px] underline text-amber-300 hover:text-white shrink-0"
                >
                  Continue anyway
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Phone Landscape Alert if in Portrait on Mobile */}
          <AnimatePresence>
            {isMobileDevice && isPortrait && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200"
              >
                <motion.span
                  animate={{ rotate: [0, -90, -90, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  className="text-2xl shrink-0"
                >
                  📱
                </motion.span>
                <div className="text-xs">
                  <p className="font-bold">Rotate to Landscape</p>
                  <p className="text-amber-300/80">Turn your phone sideways for the full cinematic hall view.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto rounded-full border border-white/15 px-5 py-2.5 text-xs font-mono text-neutral-400 hover:text-white hover:bg-white/5 transition-all text-center"
          >
            ← Back to Setup
          </button>

          <button
            type="button"
            onClick={handleStart}
            className="w-full sm:w-auto rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-8 py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-[0_0_30px_rgba(56,189,248,0.4)] hover:shadow-[0_0_40px_rgba(56,189,248,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            {isFullscreen ? "Enter Hackathon Hall →" : "⛶ Enter Full Screen to Continue →"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

