"use client";

import { motion } from "framer-motion";
import clsx from "clsx";

interface FridayOrbProps {
  state: "idle" | "listening" | "speaking" | "thinking";
}

export default function FridayOrb({ state }: FridayOrbProps) {
  // Vivid, unmistakable colors per state
  const colors = {
    idle: "from-blue-500/20 via-blue-400/10 to-transparent border-blue-500/30",
    listening: "from-purple-600/50 via-purple-500/30 to-purple-400/10 border-purple-400/60",
    speaking: "from-cyan-400/50 via-cyan-500/30 to-blue-400/10 border-cyan-400/60",
    thinking: "from-amber-500/40 via-yellow-500/20 to-transparent border-amber-400/50",
  };

  const glows = {
    idle: "shadow-[0_0_30px_rgba(59,130,246,0.15)]",
    listening: "shadow-[0_0_60px_rgba(168,85,247,0.4),0_0_100px_rgba(168,85,247,0.15)]",
    speaking: "shadow-[0_0_60px_rgba(6,182,212,0.4),0_0_100px_rgba(6,182,212,0.15)]",
    thinking: "shadow-[0_0_50px_rgba(245,158,11,0.35),0_0_80px_rgba(245,158,11,0.1)]",
  };

  const stateLabel = {
    idle: "FRIDAY",
    listening: "LISTENING",
    speaking: "SPEAKING",
    thinking: "THINKING",
  };

  const labelColor = {
    idle: "text-blue-300/50",
    listening: "text-purple-200/80",
    speaking: "text-cyan-200/80",
    thinking: "text-amber-200/80",
  };

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Ambient background glow — soft, smooth, no blinking */}
      <motion.div
        animate={
          state === "idle"
            ? { scale: [1, 1.03, 1], opacity: 0.06 }
            : { scale: [1, 1.08, 1], opacity: [0.1, 0.2, 0.1] }
        }
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className={clsx(
          "absolute w-72 h-72 rounded-full blur-3xl",
          state === "listening" && "bg-purple-500",
          state === "speaking" && "bg-cyan-500",
          state === "thinking" && "bg-amber-500",
          state === "idle" && "bg-blue-500"
        )}
      />

      <div className="relative flex items-center justify-center w-64 h-64">
        {/* Outer Ring 1 — slow, elegant rotation */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className={clsx(
            "absolute inset-0 rounded-full border-t border-r opacity-40",
            state === "listening" ? "border-purple-400" : state === "speaking" ? "border-cyan-400" : state === "thinking" ? "border-amber-400/60" : "border-blue-400/40"
          )}
        />

        {/* Outer Ring 2 — counter-rotate */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className={clsx(
            "absolute inset-4 rounded-full border-b border-l opacity-30",
            state === "listening" ? "border-purple-500/50" : state === "speaking" ? "border-cyan-500/50" : state === "thinking" ? "border-amber-500/40" : "border-blue-500/20"
          )}
        />

        {/* Third ring — only visible during active states, dashed, very subtle */}
        {(state === "listening" || state === "speaking") && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            className={clsx(
              "absolute inset-8 rounded-full border border-dashed opacity-20",
              state === "listening" ? "border-purple-300" : "border-cyan-300"
            )}
          />
        )}

        {/* Main glowing orb — smooth breathing, NO fast blinking */}
        <motion.div
          animate={
            state === "speaking"
              ? { scale: [1, 1.06, 1] }
              : state === "listening"
              ? { scale: [1, 1.04, 1] }
              : state === "thinking"
              ? { scale: [0.98, 1.02, 0.98] }
              : { scale: [1, 1.01, 1] }
          }
          transition={{
            duration: state === "speaking" ? 2 : state === "listening" ? 3 : 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={clsx(
            "relative w-36 h-36 rounded-full flex items-center justify-center overflow-hidden",
            "bg-gradient-to-br backdrop-blur-md border",
            colors[state],
            glows[state]
          )}
        >
          {/* Inner core — gentle glow */}
          <motion.div
            animate={{ opacity: [0.6, 0.9, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className={clsx(
              "w-20 h-20 rounded-full blur-xl",
              state === "listening" && "bg-purple-400",
              state === "speaking" && "bg-cyan-300",
              state === "thinking" && "bg-amber-400",
              state === "idle" && "bg-blue-400"
            )}
          />

          {/* Core highlight */}
          <div
            className={clsx(
              "absolute w-8 h-8 rounded-full blur-md",
              state === "listening" ? "bg-purple-200/70" : state === "speaking" ? "bg-cyan-100/70" : state === "thinking" ? "bg-amber-200/60" : "bg-white/60"
            )}
          />

          {/* State label inside orb */}
          <motion.span
            key={state}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ duration: 0.5 }}
            className={clsx(
              "absolute bottom-4 font-mono text-[8px] font-semibold tracking-[0.2em]",
              labelColor[state]
            )}
          >
            {stateLabel[state]}
          </motion.span>
        </motion.div>
      </div>
    </div>
  );
}
