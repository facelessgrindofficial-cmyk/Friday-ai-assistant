"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

interface FridayPiPProps {
  aiState: "idle" | "listening" | "speaking" | "thinking";
  isListening: boolean;
  children?: React.ReactNode;
}

// State-based color configs
const stateConfig = {
  idle: {
    gradient: "from-blue-500/30 to-blue-600/10",
    border: "border-blue-500/25",
    glow: "rgba(59,130,246,0.2)",
    dot: "bg-blue-500",
    text: "text-blue-400/70",
    core: "bg-blue-400",
    ring: "border-blue-400/30",
    label: "Standing by",
  },
  listening: {
    gradient: "from-purple-500/40 to-purple-600/10",
    border: "border-purple-400/40",
    glow: "rgba(168,85,247,0.3)",
    dot: "bg-purple-400",
    text: "text-purple-300",
    core: "bg-purple-400",
    ring: "border-purple-400/50",
    label: "Listening",
  },
  speaking: {
    gradient: "from-cyan-400/40 to-cyan-600/10",
    border: "border-cyan-400/40",
    glow: "rgba(6,182,212,0.3)",
    dot: "bg-cyan-400",
    text: "text-cyan-300",
    core: "bg-cyan-300",
    ring: "border-cyan-400/50",
    label: "Speaking",
  },
  thinking: {
    gradient: "from-amber-500/35 to-amber-600/10",
    border: "border-amber-400/35",
    glow: "rgba(245,158,11,0.25)",
    dot: "bg-amber-400",
    text: "text-amber-300",
    core: "bg-amber-400",
    ring: "border-amber-400/40",
    label: "Thinking",
  },
};

export default function FridayPiP({ aiState, isListening, children }: FridayPiPProps) {
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const pipWindowRef = useRef<any>(null);

  const cfg = stateConfig[aiState];

  // Check Document PiP support
  useEffect(() => {
    if (typeof window !== "undefined" && "documentPictureInPicture" in window) {
      setIsPiPSupported(true);
    }
  }, []);

  // Monitor focus/blur
  useEffect(() => {
    const handleFocus = () => {
      setIsWindowFocused(true);
      if (!isPinned) setIsCompactMode(false);
    };
    const handleBlur = () => {
      setIsWindowFocused(false);
      if (!isPiPActive) setIsCompactMode(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleFocus();
      } else {
        handleBlur();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isPiPActive, isPinned]);

  // Open Document PiP
  const openPiP = useCallback(async () => {
    if (!isPiPSupported) return;
    try {
      const docPiP = (window as any).documentPictureInPicture;
      const pipWin = await docPiP.requestWindow({ width: 240, height: 85 });
      pipWindowRef.current = pipWin;
      setIsPiPActive(true);
      setIsCompactMode(false);

      // Copy styles
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((s) => {
        pipWin.document.head.appendChild(s.cloneNode(true));
      });

      const style = pipWin.document.createElement("style");
      style.textContent = `
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:rgba(3,7,18,0.96);overflow:hidden;font-family:'Inter',system-ui,sans-serif;color:#fff;display:flex;align-items:center;height:100vh}
        .c{display:flex;flex-direction:row;align-items:center;gap:12px;width:100%;height:100%;padding:10px 14px;position:relative}
        .h{position:absolute;top:6px;right:6px;z-index:20}
        .h button{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.45);width:18px;height:18px;border-radius:4px;cursor:pointer;font-size:9px;display:flex;align-items:center;justify-content:center;transition:all .2s}
        .h button:hover{background:rgba(255,255,255,.15);color:#fff}
        
        .orb-wrapper{position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .orb{width:32px;height:32px;border-radius:50%;position:relative;display:flex;align-items:center;justify-content:center}
        .orb.idle{background:radial-gradient(circle,rgba(59,130,246,.25) 0%,rgba(59,130,246,.03) 70%);border:1px solid rgba(59,130,246,.25);box-shadow:0 0 15px rgba(59,130,246,.1)}
        .orb.listening{background:radial-gradient(circle,rgba(168,85,247,.35) 0%,rgba(168,85,247,.03) 70%);border:1px solid rgba(168,85,247,.4);box-shadow:0 0 20px rgba(168,85,247,.2);animation:b 2s ease-in-out infinite}
        .orb.speaking{background:radial-gradient(circle,rgba(6,182,212,.35) 0%,rgba(6,182,212,.03) 70%);border:1px solid rgba(6,182,212,.4);box-shadow:0 0 20px rgba(6,182,212,.2);animation:b 2s ease-in-out infinite}
        .orb.thinking{background:radial-gradient(circle,rgba(245,158,11,.3) 0%,rgba(245,158,11,.03) 70%);border:1px solid rgba(245,158,11,.35);box-shadow:0 0 18px rgba(245,158,11,.15);animation:b 2.5s ease-in-out infinite}
        .orb.idle{animation:b 4s ease-in-out infinite}
        
        .core{width:12px;height:12px;border-radius:50%;filter:blur(4px);animation:p 3s ease-in-out infinite}
        .orb.idle .core{background:rgba(59,130,246,.5)} .orb.listening .core{background:rgba(168,85,247,.6)} .orb.speaking .core{background:rgba(6,182,212,.6)} .orb.thinking .core{background:rgba(245,158,11,.5)}
        
        .ring{position:absolute;inset:-3px;border-radius:50%;border:1px solid transparent;animation:s 18s linear infinite}
        .orb.idle .ring{border-top-color:rgba(59,130,246,.2)} .orb.listening .ring{border-top-color:rgba(168,85,247,.35)} .orb.speaking .ring{border-top-color:rgba(6,182,212,.35)} .orb.thinking .ring{border-top-color:rgba(245,158,11,.3)}
        
        .txt{display:flex;flex-direction:column;gap:1px;font-family:monospace}
        .title-row{display:flex;align-items:center;gap:4px}
        .title{font-size:9px;font-weight:700;letter-spacing:.15em;color:rgba(255,255,255,.35)}
        .dt{width:5px;height:5px;border-radius:50%;animation:dp 2s ease-in-out infinite}
        .dt.idle{background:#3b82f6} .dt.listening{background:#a855f7} .dt.speaking{background:#06b6d4} .dt.thinking{background:#f59e0b}
        
        .st{font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
        .st.idle{color:rgba(96,165,250,.75)} .st.listening{color:rgba(192,132,252,.95)} .st.speaking{color:rgba(103,232,249,.95)} .st.thinking{color:rgba(252,211,77,.95)}
        
        @keyframes b{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
        @keyframes p{0%,100%{opacity:.5}50%{opacity:.85}}
        @keyframes s{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes dp{0%,100%{opacity:1}50%{opacity:.3}}
      `;
      pipWin.document.head.appendChild(style);

      const c = pipWin.document.createElement("div");
      c.className = "c";
      c.innerHTML = `
        <div class="h"><button id="x" title="Back">↩</button></div>
        <div class="orb-wrapper"><div class="ring"></div><div class="orb ${aiState}" id="o"><div class="core"></div></div></div>
        <div class="txt">
          <div class="title-row">
            <span class="title">FRIDAY</span>
            <span class="dt ${aiState}" id="d"></span>
          </div>
          <div class="st ${aiState}" id="s"><span id="t">${cfg.label}</span></div>
        </div>
      `;
      pipWin.document.body.appendChild(c);

      pipWin.document.getElementById("x")?.addEventListener("click", () => pipWin.close());
      pipWin.addEventListener("pagehide", () => {
        setIsPiPActive(false);
        pipWindowRef.current = null;
        window.focus();
      });
    } catch (e) {
      console.error("PiP failed:", e);
    }
  }, [isPiPSupported, aiState, cfg.label]);

  // Sync PiP state
  useEffect(() => {
    if (pipWindowRef.current && isPiPActive) {
      const d = pipWindowRef.current.document;
      const o = d.getElementById("o");
      const s = d.getElementById("s");
      const dt = d.getElementById("d");
      const t = d.getElementById("t");
      if (o) o.className = `orb ${aiState}`;
      if (s) s.className = `st ${aiState}`;
      if (dt) dt.className = `dt ${aiState}`;
      if (t) t.textContent = cfg.label;
    }
  }, [aiState, isPiPActive, cfg.label]);

  useEffect(() => {
    return () => { pipWindowRef.current?.close(); };
  }, []);

  const closePiP = useCallback(() => {
    pipWindowRef.current?.close();
    setIsPiPActive(false);
    pipWindowRef.current = null;
  }, []);

  const togglePin = () => {
    const next = !isPinned;
    setIsPinned(next);
    if (next) setIsCompactMode(true);
    else if (isWindowFocused) setIsCompactMode(false);
  };

  const shouldShowCompact = (isCompactMode || isPinned) && !isPiPActive;

  return (
    <>
      {/* Full Interface */}
      <div
        className={clsx(
          "transition-all duration-500 ease-in-out w-full h-full",
          shouldShowCompact ? "opacity-0 pointer-events-none scale-[0.98]" : "opacity-100 scale-100"
        )}
      >
        {/* Controls — top-right corner */}
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2">
          <button
            onClick={togglePin}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[9px] font-bold tracking-wider border transition-all duration-300",
              isPinned
                ? "bg-amber-500/15 text-amber-400 border-amber-500/25 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                : "bg-white/[0.03] text-white/25 border-white/[0.06] hover:text-white/50 hover:border-white/15 hover:bg-white/[0.06]"
            )}
            title={isPinned ? "Unpin" : "Pin compact mode"}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {isPinned ? (
                <><line x1="2" y1="2" x2="22" y2="22"/><path d="M12 17v5"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12"/><path d="M15 9.34V6h1a2 2 0 0 0 0-4H7.89"/></>
              ) : (
                <><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76"/></>
              )}
            </svg>
            {isPinned ? "UNPIN" : "PIN"}
          </button>

          {isPiPSupported && (
            <button
              onClick={isPiPActive ? closePiP : openPiP}
              className={clsx(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[9px] font-bold tracking-wider border transition-all duration-300",
                isPiPActive
                  ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/25 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                  : "bg-white/[0.03] text-white/25 border-white/[0.06] hover:text-white/50 hover:border-white/15 hover:bg-white/[0.06]"
              )}
              title={isPiPActive ? "Close PiP" : "Float window"}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {isPiPActive ? (
                  <><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></>
                ) : (
                  <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>
                )}
              </svg>
              {isPiPActive ? "CLOSE" : "FLOAT"}
            </button>
          )}
        </div>

        {children}
      </div>

      {/* Compact Floating Widget — bottom-right corner, small pill */}
      <AnimatePresence>
        {shouldShowCompact && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.85 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 right-6 z-[100]"
          >
            <div
              className={clsx(
                "relative flex items-center gap-3 cursor-pointer select-none rounded-2xl border transition-all duration-300",
                isHovering ? "border-white/15" : "border-white/[0.08]"
              )}
              style={{
                background: isHovering 
                  ? "rgba(3, 7, 18, 0.88)" 
                  : "rgba(3, 7, 18, 0.65)",
                backdropFilter: "blur(20px) saturate(1.4)",
                WebkitBackdropFilter: "blur(20px) saturate(1.4)",
                boxShadow: `0 4px 30px ${cfg.glow}, 0 0 60px ${cfg.glow.replace(/[\d.]+\)$/, '0.06)')}, 0 8px 32px rgba(0,0,0,0.4)`,
                padding: "10px 16px 10px 12px",
              }}
              onClick={() => {
                if (isPinned) setIsPinned(false);
                setIsCompactMode(false);
                window.focus();
              }}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              title="Click to expand Friday"
            >
              {/* Mini Orb */}
              <div className="relative flex items-center justify-center" style={{ width: 42, height: 42 }}>
                {/* Spinning ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                  className={clsx(
                    "absolute inset-0 rounded-full border-t opacity-50",
                    cfg.ring
                  )}
                />

                {/* Orb body */}
                <motion.div
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{
                    duration: aiState === "idle" ? 4 : 2.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center border bg-gradient-to-br",
                    cfg.gradient,
                    cfg.border
                  )}
                  style={{
                    boxShadow: `0 0 20px ${cfg.glow}, inset 0 0 10px ${cfg.glow.replace(/[\d.]+\)$/, '0.1)')}`,
                  }}
                >
                  {/* Core glow */}
                  <motion.div
                    animate={{ opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className={clsx("w-3.5 h-3.5 rounded-full blur-sm", cfg.core)}
                  />
                </motion.div>
              </div>

              {/* Text content */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] font-bold tracking-[0.15em] text-white/35">FRIDAY</span>
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className={clsx("w-1.5 h-1.5 rounded-full", cfg.dot)}
                  />
                </div>
                <span className={clsx("font-mono text-[10px] font-semibold tracking-wider", cfg.text)}>
                  {cfg.label}
                </span>
              </div>

              {/* Expand indicator on hover */}
              <AnimatePresence>
                {isHovering && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/25 ml-1">
                      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
