"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";

interface Props {
  onStart: () => void;
}

export default function IntroHero({ onStart }: Props) {
  const [isEntering, setIsEntering] = useState(false);

  const handleStart = () => {
    setIsEntering(true);
    setTimeout(() => {
      onStart();
    }, 550);
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#030306] text-white flex flex-col justify-between selection:bg-sky-500/30">
      {/* 1. Ambient Background Atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Dynamic top radial glowing orb */}
        <motion.div
          animate={{
            scale: [1, 1.12, 1],
            opacity: [0.3, 0.45, 0.3],
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -top-[25%] left-1/2 h-[500px] w-[500px] sm:h-[700px] sm:w-[700px] md:h-[900px] md:w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.22)_0%,rgba(99,102,241,0.12)_45%,transparent_70%)] blur-[80px] sm:blur-[100px]"
        />

        {/* Secondary lower violet glow */}
        <div className="absolute -bottom-[20%] left-1/2 h-[450px] w-[600px] sm:h-[600px] sm:w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(129,140,248,0.08)_0%,transparent_65%)] blur-[90px]" />

        {/* Perspective grid overlay */}
        <div className="absolute inset-x-0 bottom-0 h-48 sm:h-64 bg-[linear-gradient(to_bottom,transparent_0%,rgba(14,165,233,0.03)_100%)] [mask-image:radial-gradient(ellipse_at_bottom,black_40%,transparent_80%)] border-b border-sky-500/10" />

        {/* Floating particles (hidden on small mobile to maximize performance) */}
        {[...Array(10)].map((_, i) => (
          <motion.div
            key={i}
            className="hidden sm:block absolute rounded-full bg-sky-400/40"
            style={{
              width: (i % 3) + 2,
              height: (i % 3) + 2,
              left: `${(i * 19) % 94}%`,
              top: `${(i * 23) % 88}%`,
            }}
            animate={{
              y: [0, -35, 0],
              opacity: [0.1, 0.5, 0.1],
            }}
            transition={{
              duration: 5 + (i % 4) * 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.4,
            }}
          />
        ))}
      </div>

      {/* 2. Top Header Navigation Bar */}
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6 md:px-12 md:py-8 max-w-7xl mx-auto w-full">
        {/* Brand Logo & Name */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex items-center gap-2.5 sm:gap-3"
        >
          <div className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-400/30 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
            <span className="font-mono text-xs sm:text-sm font-bold text-sky-400">⚡</span>
            <span className="absolute -inset-0.5 rounded-xl bg-sky-400/20 blur-[2px] -z-10" />
          </div>
          <div className="flex items-center">
            <span className="font-bold tracking-tight text-white text-sm sm:text-base">ConvoScape</span>
            <span className="ml-2 font-mono text-[9px] sm:text-[10px] text-sky-400 uppercase tracking-widest bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded-full">v1.0</span>
          </div>
        </motion.div>

        {/* Live Engine Status */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="flex items-center gap-2 font-mono text-[10px] sm:text-[11px] text-neutral-400 bg-black/40 border border-white/5 sm:border-transparent px-2.5 py-1 sm:px-0 rounded-full"
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-neutral-400 hidden xs:inline">System:</span>
          <span className="text-emerald-400 font-semibold truncate max-w-[140px] sm:max-w-none">Live Audio & AI Ready</span>
        </motion.div>
      </header>

      {/* 3. Hero Content Center Section */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 py-4 sm:px-6 md:px-8 text-center max-w-4xl mx-auto w-full flex-grow my-auto">
        <motion.div
          animate={isEntering ? { scale: 1.04, opacity: 0, filter: "blur(10px)" } : { scale: 1, opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center w-full"
        >
          {/* Top Pill Status Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4 sm:mb-6 inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/[0.07] px-3.5 py-1 sm:px-4 sm:py-1.5 backdrop-blur-md shadow-[0_0_20px_rgba(56,189,248,0.15)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
            <span className="font-mono text-[9px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] sm:tracking-[0.2em] text-sky-300">
              AI Hackathon Pitch Simulator
            </span>
          </motion.div>

          {/* AI Equalizer Emblem */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mb-4 sm:mb-6 relative flex items-center justify-center"
          >
            {/* Concentric pulsing wave rings */}
            <motion.div
              animate={{
                scale: [1, 1.35, 1],
                opacity: [0.3, 0.05, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute h-20 w-20 sm:h-24 sm:w-24 rounded-full border border-sky-400/30"
            />
            <motion.div
              animate={{
                scale: [1.2, 1.55, 1.2],
                opacity: [0.15, 0, 0.15],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.5,
              }}
              className="absolute h-20 w-20 sm:h-24 sm:w-24 rounded-full border border-indigo-400/20"
            />

            {/* Equalizer bars representing active audio detection */}
            <div className="flex items-center gap-1 sm:gap-1.5 h-11 sm:h-14 px-4 sm:px-5 rounded-2xl bg-black/60 border border-white/10 backdrop-blur-md shadow-inner">
              {[14, 28, 42, 22, 36, 18, 32].map((height, idx) => (
                <motion.span
                  key={idx}
                  className="w-0.5 sm:w-1 rounded-full bg-gradient-to-t from-sky-500 to-indigo-400"
                  animate={{
                    height: [height * 0.4, height, height * 0.5],
                  }}
                  transition={{
                    duration: 1.2 + (idx % 3) * 0.3,
                    repeat: Infinity,
                    repeatType: "mirror",
                    ease: "easeInOut",
                    delay: idx * 0.12,
                  }}
                />
              ))}
            </div>
          </motion.div>

          {/* Title: ConvoScape — Perfectly sized for small phones up to large monitors */}
          <motion.h1
            initial={{ opacity: 0, y: 25, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white mb-3 sm:mb-4 px-2"
          >
            <span className="bg-gradient-to-b from-white via-neutral-100 to-neutral-400 bg-clip-text text-transparent drop-shadow-[0_4px_30px_rgba(255,255,255,0.15)]">
              ConvoScape
            </span>
          </motion.h1>

          {/* Primary Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="text-base xs:text-lg sm:text-xl md:text-2xl font-light text-neutral-200 max-w-2xl leading-relaxed mb-3 sm:mb-4 px-2"
          >
            Master your pitch <span className="font-semibold text-white underline decoration-sky-500/50 decoration-2 underline-offset-4">before</span> you step on stage.
          </motion.p>

          {/* Subtitle description */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="text-xs sm:text-sm text-neutral-400 max-w-lg mb-8 sm:mb-10 leading-normal px-4"
          >
            Rehearse live with an interactive AI peer in a virtual hackathon hall. Receive instant acoustic feedback, pacing metrics, and communication diagnostics.
          </motion.p>

          {/* Main Action Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-2.5 sm:gap-3 w-full sm:w-auto px-4"
          >
            <button
              type="button"
              onClick={handleStart}
              className="group relative inline-flex items-center justify-center gap-3 w-full sm:w-auto rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-7 py-3.5 sm:px-9 sm:py-4 text-xs sm:text-sm font-bold uppercase tracking-wider text-white shadow-[0_0_35px_rgba(56,189,248,0.4)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_50px_rgba(56,189,248,0.65)] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 cursor-pointer"
            >
              <span className="relative z-10 flex items-center gap-2">
                <span>Enter Simulation</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
              <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 opacity-0 blur-sm transition-opacity duration-300 group-hover:opacity-60" />
            </button>

            <span className="font-mono text-[10px] sm:text-[11px] text-neutral-500">
              Microphone optional • 100% Privacy-Preserved • Instant Report
            </span>
          </motion.div>
        </motion.div>

        {/* 4. Responsive Feature Cards Matrix */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 sm:mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 w-full text-left"
        >
          {/* Card 1 */}
          <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 backdrop-blur-md transition-all duration-300 hover:border-sky-500/30 hover:bg-white/[0.05]">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
              <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs sm:text-sm">
                🎙️
              </span>
              <h3 className="text-xs sm:text-sm font-semibold text-white">Acoustic Voice VAD</h3>
            </div>
            <p className="text-[11px] sm:text-xs text-neutral-400 leading-relaxed">
              Detects speech pauses, words-per-minute tempo, and filler-word frequencies directly in your browser.
            </p>
          </div>

          {/* Card 2 */}
          <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 backdrop-blur-md transition-all duration-300 hover:border-indigo-500/30 hover:bg-white/[0.05]">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
              <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs sm:text-sm">
                🤖
              </span>
              <h3 className="text-xs sm:text-sm font-semibold text-white">Interactive Peer AI</h3>
            </div>
            <p className="text-[11px] sm:text-xs text-neutral-400 leading-relaxed">
              Engages in realistic 10-turn dialogue with Rahul, asking tailored questions tailored to your project.
            </p>
          </div>

          {/* Card 3 (full width on tablet grid, 1 col on 3-col desktop) */}
          <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 backdrop-blur-md transition-all duration-300 hover:border-emerald-500/30 hover:bg-white/[0.05] sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
              <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs sm:text-sm">
                📊
              </span>
              <h3 className="text-xs sm:text-sm font-semibold text-white">Instant Report</h3>
            </div>
            <p className="text-[11px] sm:text-xs text-neutral-400 leading-relaxed">
              Dual-scored feedback on clarity, technical defense, and communication strengths with JSON/PDF export.
            </p>
          </div>
        </motion.div>
      </main>

      {/* 5. Minimalist Bottom Footer */}
      <footer className="relative z-10 px-4 py-4 sm:px-8 sm:py-6 md:px-12 max-w-7xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] sm:text-[11px] font-mono text-neutral-500 border-t border-white/5 text-center sm:text-left">
        <p>Built for Student Hackathon Teams • Practice Before It Counts</p>
        <p>Powered by Next.js 15, Gemini 2.5 Flash & Web Speech API</p>
      </footer>
    </div>
  );
}
