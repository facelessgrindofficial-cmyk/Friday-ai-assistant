"use client";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, Volume2, VolumeX, Plus, Edit2, Trash2, Headphones, ChevronDown, Check } from "lucide-react";
import clsx from "clsx";

interface Props {
  open: boolean; onClose: () => void;
  activeTab: "chat" | "neet" | "gesture"; onModeSwitch: (m: "chat" | "neet" | "gesture") => void;
  conversations: any[]; activeConvId: string | null;
  onSelectConv: (id: string) => void; onNewConv: () => void;
  onDeleteConv: (id: string) => void; onRenameConv: (id: string, t: string) => void;
  isMuted: boolean; onToggleMute: () => void;
  audioDevices: any[]; selectedDeviceId: string;
  onSelectDevice: (id: string) => void; micLevel: number;
  speechLanguage: string; onLanguageChange: (l: string) => void;
  onStartMicMonitor: (id?: string) => void;
  neetSubject: string; onSetSubject: (s: string) => void;
  settingsStudy: number; settingsShort: number; settingsLong: number;
  onSetStudy: (n: number) => void; onSetShort: (n: number) => void; onSetLong: (n: number) => void;
  onApplyTimerConfig: () => void;
  lofiActive: boolean; onToggleLofi: () => void;
  historyLogs: any[]; onClearHistory: () => void;
}

export default function SettingsPanel(props: Props) {
  const { open, onClose, activeTab, onModeSwitch } = props;
  const [showSessions, setShowSessions] = useState(false);
  const [showMics, setShowMics] = useState(false);
  const [subjectInput, setSubjectInput] = useState("");

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-[320px] z-50 flex flex-col border-l border-white/[0.06]"
            style={{ background: "rgba(3,7,18,0.94)", backdropFilter: "blur(24px)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-white/30" />
                <span className="font-mono text-xs font-bold tracking-[0.2em] text-white/50">SETTINGS</span>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {/* MODE TOGGLE */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/30">MODE</span>
                <div className="relative flex bg-white/[0.03] rounded-xl border border-white/[0.06] p-1">
                  <motion.div className="absolute top-1 bottom-1 rounded-lg" style={{ width: "calc(33.333% - 4px)" }}
                    animate={{ left: activeTab === "chat" ? 4 : activeTab === "neet" ? "calc(33.333% + 2px)" : "calc(66.666% + 2px)" }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}>
                    <div className={clsx("w-full h-full rounded-lg border",
                      activeTab === "chat" ? "bg-blue-500/15 border-blue-500/25 shadow-[0_0_12px_rgba(59,130,246,0.1)]"
                        : activeTab === "neet" ? "bg-cyan-500/15 border-cyan-500/25 shadow-[0_0_12px_rgba(6,182,212,0.1)]"
                        : "bg-purple-500/15 border-purple-500/25 shadow-[0_0_12px_rgba(168,85,247,0.1)]")} />
                  </motion.div>
                  <button onClick={() => onModeSwitch("chat")}
                    className={clsx("relative z-10 flex-1 py-2 rounded-lg font-mono text-[9px] font-bold tracking-wider transition-colors flex items-center justify-center gap-1",
                      activeTab === "chat" ? "text-blue-400" : "text-white/30 hover:text-white/50")}>
                    🤖 AI
                  </button>
                  <button onClick={() => onModeSwitch("neet")}
                    className={clsx("relative z-10 flex-1 py-2 rounded-lg font-mono text-[9px] font-bold tracking-wider transition-colors flex items-center justify-center gap-1",
                      activeTab === "neet" ? "text-cyan-400" : "text-white/30 hover:text-white/50")}>
                    🩺 NEET
                  </button>
                  <button onClick={() => onModeSwitch("gesture")}
                    className={clsx("relative z-10 flex-1 py-2 rounded-lg font-mono text-[9px] font-bold tracking-wider transition-colors flex items-center justify-center gap-1",
                      activeTab === "gesture" ? "text-purple-400" : "text-white/30 hover:text-white/50")}>
                    🖐️ GESTURE
                  </button>
                </div>
              </div>

              {/* CHAT HISTORY */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/30">CHAT_HISTORY</span>
                <div className="flex flex-col w-full relative">
                  {/* Collapsible trigger with ChevronDown */}
                  <button
                    type="button"
                    onClick={() => setShowSessions(!showSessions)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.03] text-white/70 hover:bg-white/[0.06] transition-all text-[10px] font-mono"
                  >
                    <span className="truncate pr-4 text-left">
                      {props.conversations.find(c => c.id === props.activeConvId)?.title || "Select Session..."}
                    </span>
                    <motion.div
                      animate={{ rotate: showSessions ? 180 : 0 }}
                      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                      className="flex items-center shrink-0"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-white/40" />
                    </motion.div>
                  </button>

                  <AnimatePresence>
                    {showSessions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden flex flex-col gap-1.5 mt-1 bg-black/60 border border-white/[0.08] rounded-lg p-1 max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 z-10 w-full"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            props.onNewConv();
                            setShowSessions(false);
                          }}
                          className="w-full py-1.5 px-3 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/15 transition-all font-mono text-[9px] flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> NEW SESSION
                        </button>
                        <div className="flex flex-col gap-0.5">
                          {props.conversations.map(conv => (
                            <div
                              key={conv.id}
                              onClick={() => {
                                props.onSelectConv(conv.id);
                                setShowSessions(false);
                              }}
                              className={clsx(
                                "px-2.5 py-2 rounded border cursor-pointer flex justify-between items-center group transition-all text-[10px] font-mono",
                                conv.id === props.activeConvId
                                  ? "bg-blue-500/10 border-blue-500/25 text-white font-bold"
                                  : "bg-transparent border-transparent text-white/50 hover:bg-white/[0.03] hover:text-white/80"
                              )}
                            >
                              <span className="truncate max-w-[150px]">{conv.title}</span>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    const t = prompt("Rename Session:", conv.title);
                                    if (t) props.onRenameConv(conv.id, t);
                                  }}
                                  className="p-0.5 text-white/30 hover:text-white"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (confirm("Delete this Session?")) props.onDeleteConv(conv.id);
                                  }}
                                  className="p-0.5 text-white/30 hover:text-red-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* AUDIO */}
              <div className="flex flex-col gap-2.5">
                <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/30">AUDIO</span>
                <button onClick={props.onToggleMute}
                  className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-[10px] transition-all",
                    props.isMuted ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:text-white/70")}>
                  {props.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  {props.isMuted ? "VOICE_MUTED" : "VOICE_ON"}
                </button>
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[8px] text-white/25">MICROPHONE</span>
                  {props.audioDevices.length === 0 ? (
                    <button onClick={() => props.onStartMicMonitor()} className="text-[9px] font-mono bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/20 w-full text-center">🔍 DETECT</button>
                  ) : (
                    <div className="flex flex-col w-full relative">
                      {/* Collapsible trigger with ChevronDown */}
                      <button
                        type="button"
                        onClick={() => setShowMics(!showMics)}
                        className="flex items-center justify-between w-full px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.03] text-white/70 hover:bg-white/[0.06] transition-all text-[10px] font-mono"
                      >
                        <span className="truncate pr-4 text-left">
                          {props.audioDevices.find((d: any) => d.deviceId === props.selectedDeviceId)?.label || "Select Microphone..."}
                        </span>
                        <motion.div
                          animate={{ rotate: showMics ? 180 : 0 }}
                          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                          className="flex items-center shrink-0"
                        >
                          <ChevronDown className="w-3.5 h-3.5 text-white/40" />
                        </motion.div>
                      </button>

                      {/* Options list, animates open for 0.45 seconds */}
                      <AnimatePresence>
                        {showMics && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden flex flex-col gap-1 mt-1 bg-black/60 border border-white/[0.08] rounded-lg p-1 max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 z-10 w-full"
                          >
                            {props.audioDevices.map((d: any) => (
                              <button
                                type="button"
                                key={d.deviceId}
                                onClick={() => {
                                  props.onSelectDevice(d.deviceId);
                                  props.onStartMicMonitor(d.deviceId);
                                  setShowMics(false);
                                }}
                                className={clsx(
                                  "flex items-center justify-between text-left text-[10px] font-mono px-3 py-2.5 rounded transition-all truncate w-full border border-transparent",
                                  props.selectedDeviceId === d.deviceId
                                    ? "bg-blue-500/15 text-blue-400 border-blue-500/25 font-bold"
                                    : "bg-transparent text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                                )}
                              >
                                <span className="truncate pr-3">{d.label}</span>
                                {props.selectedDeviceId === d.deviceId && (
                                  <Check className="w-3 h-3 text-blue-400 shrink-0" />
                                )}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${props.micLevel > 5 ? 'bg-green-500' : 'bg-white/10'}`}
                        style={{ width: `${Math.max(2, props.micLevel)}%` }} />
                    </div>
                    <span className={`text-[8px] font-mono ${props.micLevel > 5 ? 'text-green-400' : 'text-white/20'}`}>
                      {props.micLevel > 5 ? '●' : '○'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[8px] text-white/25">SPEECH_LANG</span>
                  <div className="grid grid-cols-3 gap-1">
                    {[["hi-IN","Hindi"],["en-US","English"],["en-IN","Mixed"]].map(([code,label]) => (
                      <button key={code} onClick={() => props.onLanguageChange(code)}
                        className={clsx("py-1 rounded-lg text-[8px] font-mono border transition-all",
                          props.speechLanguage === code ? "bg-blue-500/15 text-blue-400 border-blue-500/25" : "bg-white/[0.02] text-white/30 border-transparent hover:text-white/50")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* NEET CONFIG */}
              {activeTab === "neet" && (
                <div className="flex flex-col gap-2.5">
                  <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-cyan-400/50">NEET_CONFIG</span>
                  <div className="grid grid-cols-2 gap-1">
                    {["Physics","Chemistry","Botany","Zoology"].map(sub => (
                      <button key={sub} onClick={() => { props.onSetSubject(sub); localStorage.setItem("neet_pomodoro_subject", sub); }}
                        className={clsx("py-1 rounded-lg text-[9px] font-mono border transition-all",
                          props.neetSubject === sub ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-white/[0.02] text-white/35 border-transparent hover:text-white/55")}>
                        {sub}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input type="text" value={subjectInput} onChange={e => setSubjectInput(e.target.value)}
                      placeholder="Custom..." className="flex-1 bg-black/30 border border-white/[0.06] text-[9px] text-white rounded-lg px-2 py-1 outline-none font-mono focus:border-cyan-500/30 min-w-0" />
                    <button onClick={() => { if(subjectInput.trim()) { props.onSetSubject(subjectInput.trim()); localStorage.setItem("neet_pomodoro_subject", subjectInput.trim()); setSubjectInput(""); } }}
                      className="bg-cyan-500/80 text-black font-bold text-[9px] px-2 rounded-lg hover:bg-cyan-400 transition font-mono">SET</button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="flex flex-col gap-0.5"><span className="text-[7px] font-mono text-white/25 text-center">Study(m)</span>
                      <input type="number" value={props.settingsStudy} onChange={e => props.onSetStudy(parseInt(e.target.value)||25)} className="bg-black/30 border border-white/[0.06] text-[9px] text-white rounded-lg p-1 text-center outline-none font-mono min-w-0" /></div>
                    <div className="flex flex-col gap-0.5"><span className="text-[7px] font-mono text-white/25 text-center">Short(m)</span>
                      <input type="number" value={props.settingsShort} onChange={e => props.onSetShort(parseInt(e.target.value)||5)} className="bg-black/30 border border-white/[0.06] text-[9px] text-white rounded-lg p-1 text-center outline-none font-mono min-w-0" /></div>
                    <div className="flex flex-col gap-0.5"><span className="text-[7px] font-mono text-white/25 text-center">Long(m)</span>
                      <input type="number" value={props.settingsLong} onChange={e => props.onSetLong(parseInt(e.target.value)||15)} className="bg-black/30 border border-white/[0.06] text-[9px] text-white rounded-lg p-1 text-center outline-none font-mono min-w-0" /></div>
                  </div>
                  <button onClick={props.onApplyTimerConfig} className="w-full bg-white/[0.04] hover:bg-white/[0.08] text-white/60 border border-white/[0.06] text-[9px] font-mono py-1.5 rounded-lg transition-all">APPLY_CONFIG</button>
                  <button onClick={props.onToggleLofi}
                    className={clsx("flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-[9px] transition-all",
                      props.lofiActive ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-white/[0.03] border-white/[0.06] text-white/40")}>
                    <Headphones className="w-3 h-3" /> LOFI: {props.lofiActive ? "ON" : "OFF"}
                  </button>
                  {props.historyLogs.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between"><span className="text-[8px] font-mono text-white/25">LOGS</span>
                        <button onClick={props.onClearHistory} className="text-[7px] font-mono text-red-400/60 hover:text-red-400">CLEAR</button></div>
                      {props.historyLogs.slice(0,4).map((log: any) => (
                        <div key={log.id} className={clsx("px-2 py-1 rounded-lg bg-black/20 border-l-2 flex justify-between text-[8px] font-mono",
                          log.type === "study" ? "border-l-blue-500" : "border-l-green-500")}>
                          <span className="text-white/60 truncate">{log.type === "study" ? log.subject : "Break"}</span>
                          <span className="text-white/30">{log.duration}m</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-white/[0.06] font-mono text-[8px] text-white/20 flex justify-between">
              <span>FRIDAY_OS v2.2</span><span className="text-green-500/60">● SYNCED</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
