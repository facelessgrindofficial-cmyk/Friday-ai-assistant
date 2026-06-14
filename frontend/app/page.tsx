"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Settings, Terminal, Activity, Volume2, VolumeX, MessageSquare, Trash2, Edit2, Plus, ChevronDown, Monitor, Hand } from "lucide-react";
import FridayOrb from "@/components/FridayOrb";
import GestureControl from "@/components/GestureControl";
import { motion } from "framer-motion";
import clsx from "clsx";

type AIState = "idle" | "listening" | "speaking" | "thinking";

interface Message {
  role: string;
  content: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5001";

export default function Home() {
  const [aiState, setAiState] = useState<AIState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [autoListen, setAutoListen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoListenRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const silenceCountRef = useRef(0);  // tracks consecutive no-speech events for backoff

  // Refs to always have latest function references (fixes stale closure in speech recognition)
  const handleSendMessageRef = useRef<(text: string) => void>(() => {});
  const addSystemMessageRef = useRef<(text: string) => void>(() => {});
  const speakTextRef = useRef<(text: string, onEnded: () => void) => void>(() => {});

  // Mic management
  const [micPermission, setMicPermission] = useState<"prompt" | "granted" | "denied">("prompt");
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [micLevel, setMicLevel] = useState(0);
  const [showMicSettings, setShowMicSettings] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("en-IN");
  const speechLanguageRef = useRef("en-IN");
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const handleLanguageChange = (lang: string) => {
    setSpeechLanguage(lang);
    speechLanguageRef.current = lang;
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang;
    }
  };

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const [showGesturePreview, setShowGesturePreview] = useState(false);

  // NEET Study Pomodoro States
  const [activeTab, setActiveTab] = useState<"chat" | "neet" | "gesture">("chat");
  const [timerState, setTimerState] = useState<"study" | "short_break" | "long_break">("study");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [totalTime, setTotalTime] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [pomodoroStreak, setPomodoroStreak] = useState(0);
  const [neetSubject, setNeetSubject] = useState("Physics");
  const [subjectInputText, setSubjectInputText] = useState("");
  const [settingsStudy, setSettingsStudy] = useState(25);
  const [settingsShort, setSettingsShort] = useState(5);
  const [settingsLong, setSettingsLong] = useState(15);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [lofiActive, setLofiActive] = useState(false);
  const [motivationalQuote, setMotivationalQuote] = useState("");

  const CIRCUMFERENCE = 553; // 2 * PI * r (r=88)

  // Refs for Web Audio API Lofi engine
  const lofiAudioCtxRef = useRef<AudioContext | null>(null);
  const mainGainRef = useRef<GainNode | null>(null);
  const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const droneOsc1Ref = useRef<OscillatorNode | null>(null);
  const droneOsc2Ref = useRef<OscillatorNode | null>(null);

  // Enumerate available audio input devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(d => d.kind === "audioinput" && d.deviceId)
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.substring(0, 6)}`
        }));
      setAudioDevices(audioInputs);
      
      // Auto-select first available device if none selected
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
      return audioInputs;
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
      return [];
    }
  }, [selectedDeviceId]);

  // Start monitoring mic audio levels
  const startMicMonitor = useCallback(async (deviceId?: string) => {
    // Stop any existing stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;
      setMicPermission("granted");
      
      // After getting permission, re-enumerate to get proper labels
      await enumerateDevices();

      // Setup audio analyser for level monitoring
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
      return true;
    } catch (err: any) {
      console.error("Mic access failed:", err);
      setMicPermission("denied");
      setMicLevel(0);
      return false;
    }
  }, [enumerateDevices]);

  // Stop mic monitoring
  const stopMicMonitor = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    analyserRef.current = null;
    setMicLevel(0);
  }, []);

  // ==========================================
  // NEET STUDY SYSTEM ENGINE (React Hooks & Web Audio)
  // ==========================================
  
  // Load NEET configuration from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSettings = localStorage.getItem("neet_pomodoro_settings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setSettingsStudy(parsed.study || 25);
        setSettingsShort(parsed.short || 5);
        setSettingsLong(parsed.long || 15);
        setTimeLeft((parsed.study || 25) * 60);
        setTotalTime((parsed.study || 25) * 60);
      }
      
      const savedSubject = localStorage.getItem("neet_pomodoro_subject");
      if (savedSubject) setNeetSubject(savedSubject);

      const savedStreak = localStorage.getItem("neet_pomodoro_streak");
      if (savedStreak) setPomodoroStreak(parseInt(savedStreak) || 0);

      const savedHistory = localStorage.getItem("neet_pomodoro_history");
      if (savedHistory) setHistoryLogs(JSON.parse(savedHistory));
    }
  }, []);

  // Timer Countdown Effect
  useEffect(() => {
    let intervalId: any = null;
    if (timerRunning && timeLeft > 0) {
      intervalId = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerRunning) {
      handleSessionCompleted();
    }
    return () => clearInterval(intervalId);
  }, [timerRunning, timeLeft]);

  // Synthesize soft arpeggio chime on session completion
  const playAlertChime = () => {
    try {
      const alarmCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = alarmCtx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4 -> E4 -> G4 -> C5
      notes.forEach((freq, idx) => {
        const osc = alarmCtx.createOscillator();
        const gainNode = alarmCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);
        gainNode.gain.setValueAtTime(0.08, now + idx * 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.6);
        osc.connect(gainNode);
        gainNode.connect(alarmCtx.destination);
        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.65);
      });
    } catch (e) {
      console.error("Audio Alarm chime failed:", e);
    }
  };

  // Start Lofi synthesizer engine
  const startLofiSound = () => {
    try {
      if (!lofiAudioCtxRef.current) {
        lofiAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioCtx = lofiAudioCtxRef.current;
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }

      // Master Gain
      mainGainRef.current = audioCtx.createGain();
      mainGainRef.current.gain.setValueAtTime(0.05, audioCtx.currentTime);

      // Pink Noise for Muffled Rain
      const bufferSize = 2 * audioCtx.sampleRate;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        let white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11;
        b6 = white * 0.115926;
      }
      noiseNodeRef.current = audioCtx.createBufferSource();
      noiseNodeRef.current.buffer = noiseBuffer;
      noiseNodeRef.current.loop = true;

      const rainFilter = audioCtx.createBiquadFilter();
      rainFilter.type = "lowpass";
      rainFilter.frequency.setValueAtTime(420, audioCtx.currentTime);

      noiseNodeRef.current.connect(rainFilter);
      rainFilter.connect(mainGainRef.current);
      noiseNodeRef.current.start();

      // Deep Meditative focus drone (A1 Sawyer + Detuned Sine A2)
      droneOsc1Ref.current = audioCtx.createOscillator();
      droneOsc2Ref.current = audioCtx.createOscillator();
      const droneGain = audioCtx.createGain();
      droneGain.gain.setValueAtTime(0.015, audioCtx.currentTime);

      droneOsc1Ref.current.type = "sawtooth";
      droneOsc1Ref.current.frequency.setValueAtTime(55, audioCtx.currentTime);

      droneOsc2Ref.current.type = "sine";
      droneOsc2Ref.current.frequency.setValueAtTime(110.4, audioCtx.currentTime);

      const droneFilter = audioCtx.createBiquadFilter();
      droneFilter.type = "lowpass";
      droneFilter.frequency.setValueAtTime(100, audioCtx.currentTime);

      droneOsc1Ref.current.connect(droneFilter);
      droneOsc2Ref.current.connect(droneFilter);
      droneFilter.connect(droneGain);
      droneGain.connect(mainGainRef.current);

      droneOsc1Ref.current.start();
      droneOsc2Ref.current.start();

      mainGainRef.current.connect(audioCtx.destination);
    } catch (err) {
      console.error("Failed to start lofi engine:", err);
    }
  };

  // Stop Lofi sound engine
  const stopLofiSound = () => {
    try {
      if (noiseNodeRef.current) {
        noiseNodeRef.current.stop();
        noiseNodeRef.current.disconnect();
        noiseNodeRef.current = null;
      }
      if (droneOsc1Ref.current) {
        droneOsc1Ref.current.stop();
        droneOsc1Ref.current.disconnect();
        droneOsc1Ref.current = null;
      }
      if (droneOsc2Ref.current) {
        droneOsc2Ref.current.stop();
        droneOsc2Ref.current.disconnect();
        droneOsc2Ref.current = null;
      }
      if (mainGainRef.current) {
        mainGainRef.current.disconnect();
        mainGainRef.current = null;
      }
    } catch (e) {
      console.error("Failed to stop lofi audio context:", e);
    }
  };

  const toggleLofiActive = () => {
    if (lofiActive) {
      stopLofiSound();
      setLofiActive(false);
    } else {
      startLofiSound();
      setLofiActive(true);
    }
  };

  // Clean up lofi on unmount
  useEffect(() => {
    return () => {
      stopLofiSound();
    };
  }, []);

  // Log start session with backend
  const logSessionStartBackend = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: neetSubject,
          duration: settingsStudy
        })
      });
    } catch (e) {
      console.error("Backend error during start log:", e);
    }
  };

  // Log session completed with backend
  const handleSessionCompleted = async () => {
    setTimerRunning(false);
    playAlertChime();

    const completedType = timerState;
    const completedSubject = completedType === "study" ? neetSubject : "Break";
    const completedDuration = completedType === "study" ? settingsStudy : (completedType === "short_break" ? settingsShort : settingsLong);

    // Save to localStorage
    const savedHistory = JSON.parse(localStorage.getItem("neet_pomodoro_history") || "[]");
    const newSession = {
      id: Date.now(),
      type: completedType,
      subject: completedSubject,
      duration: completedDuration,
      timestamp: new Date().toISOString()
    };
    const updatedHistory = [newSession, ...savedHistory];
    setHistoryLogs(updatedHistory);
    localStorage.setItem("neet_pomodoro_history", JSON.stringify(updatedHistory));

    // Handle next session state switching
    let nextState: "study" | "short_break" | "long_break" = "study";
    let nextStreak = pomodoroStreak;

    if (completedType === "study") {
      nextStreak = pomodoroStreak + 1;
      setPomodoroStreak(nextStreak);
      localStorage.setItem("neet_pomodoro_streak", String(nextStreak));

      if (nextStreak >= 4) {
        nextState = "long_break";
        setPomodoroStreak(0);
        localStorage.setItem("neet_pomodoro_streak", "0");
      } else {
        nextState = "short_break";
      }
    } else {
      nextState = "study";
    }

    setTimerState(nextState);

    // Fetch quote from unified backend
    let quote = "";
    try {
      const res = await fetch(`${BACKEND_URL}/api/session/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: completedSubject,
          type: completedType,
          duration: completedDuration
        })
      });
      if (res.ok) {
        const data = await res.json();
        quote = data.quote;
      }
    } catch (e) {
      console.error("Backend log session complete failed:", e);
    }

    if (!quote) {
      const quotes = [
        "Abhi nahi toh kabhi nahi! Keep pushing, AIR 1 is waiting for you, Rohit! 🩺",
        "Physics equations can be solved, biology diagrams can be mastered. Stay focused!",
        "Hard work beats talent when talent doesn't work hard. Put in the hours!",
        "NEET is not just an exam; it's a test of your patience and consistency.",
        "Organic Chemistry reactions will click if you repeat them. Keep practicing! 🧪"
      ];
      quote = quotes[Math.floor(Math.random() * quotes.length)];
    }

    setMotivationalQuote(quote);

    // Reset timer for the next state
    const nextMinutes = nextState === "study" ? settingsStudy : (nextState === "short_break" ? settingsShort : settingsLong);
    setTimeLeft(nextMinutes * 60);
    setTotalTime(nextMinutes * 60);
  };

  const handleStartPause = () => {
    if (!timerRunning && timerState === "study") {
      logSessionStartBackend();
    }
    setTimerRunning(!timerRunning);
  };

  const skipSession = () => {
    setTimerRunning(false);
    if (confirm("Skip this session? No stats will be recorded.")) {
      const nextState = timerState === "study" ? "short_break" : "study";
      setTimerState(nextState);
      const nextMinutes = nextState === "study" ? settingsStudy : (nextState === "short_break" ? settingsShort : settingsLong);
      setTimeLeft(nextMinutes * 60);
      setTotalTime(nextMinutes * 60);
    }
  };

  // Load conversations on mount
  useEffect(() => {
    setMounted(true);

    if (typeof window !== "undefined") {
      audioRef.current = new Audio();

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recog = new SpeechRecognition();
        recog.continuous = false;
        recog.interimResults = true;
        recog.lang = speechLanguageRef.current;

        recog.onstart = () => {
          setIsListening(true);
          setAiState("listening");
        };

        recog.onresult = (event: any) => {
          let finalTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          
          if (finalTranscript.trim()) {
            silenceCountRef.current = 0;
            handleSendMessageRef.current(finalTranscript);
          }
        };

        recog.onerror = (event: any) => {
          setIsListening(false);
          setAiState("idle");
          
          if (event.error === 'aborted') return;
          
          if (event.error === 'no-speech') {
            // Auto listen backoff
            if (autoListenRef.current) {
              silenceCountRef.current++;
              const count = silenceCountRef.current;
              if (count >= 6) {
                autoListenRef.current = false;
                addSystemMessageRef.current("💤 Auto-listen paused (silence detected). Click AUTO to resume.");
              }
            }
            return;
          }
          
          console.warn("Speech recognition error:", event.error);
          
          let errMsg = "";
          switch (event.error) {
            case 'network':
              // Self-healing network fallback: if Hindi fails, fallback to English / Hinglish (en-IN)
              if (speechLanguageRef.current === "hi-IN") {
                errMsg = "⚠️ Hinglish voice servers down. Auto-switching to English/Hinglish (en-IN) mode for stability...";
                handleLanguageChange("en-IN");
                if (autoListenRef.current) {
                  setTimeout(() => {
                    try { recog.start(); } catch (e) {}
                  }, 1000);
                }
              } else {
                errMsg = "⚠️ Network error: Speech servers unreachable. Retrying in 4 seconds...";
                if (autoListenRef.current) {
                  setTimeout(() => {
                    try { recog.start(); } catch (e) {}
                  }, 4000);
                }
              }
              break;
            case 'not-allowed':
              errMsg = "Mic permission blocked. Click the mic icon in browser address bar to allow.";
              break;
            case 'audio-capture':
              errMsg = "No microphone found. Connect a mic or select one from mic settings (⚙).";
              break;
            default:
              errMsg = `Voice Error: ${event.error}`;
          }
          
          if (errMsg) {
            addSystemMessageRef.current(errMsg);
          }
        };

        recog.onend = () => {
          setIsListening(false);
          setAiState((prev) => {
            const nextState = prev === "listening" ? "idle" : prev;
            
            // Auto-restart with backoff based on silence count
            if (autoListenRef.current && (nextState === "idle")) {
              const count = silenceCountRef.current;
              const delay = count < 2 ? 1000 : count < 4 ? 5000 : 15000;
              setTimeout(() => {
                if (!autoListenRef.current) return; // might have been turned off
                try {
                  recog.start();
                } catch (e) {}
              }, delay);
            }
            return nextState;
          });
        };

        setRecognition(recog);
        recognitionRef.current = recog;
      }
    }

    loadConversations();
    
    // Cleanup on unmount
    return () => {
      stopMicMonitor();
    };
  }, []);

  // Request mic permission on first load (to populate device list)
  useEffect(() => {
    if (mounted) {
      enumerateDevices();
    }
  }, [mounted, enumerateDevices]);

  // ... (rest of conversation management functions stay the same)

  const loadConversations = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/conversations`);
      const data = await res.json();
      if (data && data.length > 0) {
        setConversations(data);
        setActiveConvId(data[0].id);
      } else {
        createNewConversation();
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  const createNewConversation = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Session ${new Date().toLocaleDateString()}` })
      });
      const newConv = await res.json();
      setConversations(prev => [...prev, newConv]);
      setActiveConvId(newConv.id);
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/conversations/${id}`, {
        method: "DELETE"
      });
      setConversations(prev => {
        const filtered = prev.filter(c => c.id !== id);
        if (activeConvId === id) {
          if (filtered.length > 0) {
            setActiveConvId(filtered[0].id);
          } else {
            setTimeout(() => createNewConversation(), 100);
          }
        }
        return filtered;
      });
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const renameConversation = async (id: string, newTitle: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/conversations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle })
      });
      const updated = await res.json();
      setConversations(prev => prev.map(c => c.id === id ? updated : c));
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  };

  const activeConv = conversations.find(c => c.id === activeConvId);
  const currentMessages = activeConv ? activeConv.messages : [];

  const addSystemMessage = (text: string) => {
    const sysMsg = { role: 'system', content: text, timestamp: new Date().toLocaleTimeString([], { hour12: false }) };
    if (activeConvId) {
      const updatedMessages = [...currentMessages, sysMsg];
      setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, messages: updatedMessages } : c));
      syncMessages(activeConvId, updatedMessages);
    }
  };
  addSystemMessageRef.current = addSystemMessage;

  const syncMessages = async (id: string, msgs: Message[]) => {
    try {
      await fetch(`${BACKEND_URL}/api/conversations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs })
      });
    } catch (err) {
      console.error("Failed to sync messages:", err);
    }
  };

  const unlockAudio = () => {
    if (audioRef.current) {
      audioRef.current.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA";
      audioRef.current.play().catch(() => {});
    }
  };

  const speakText = async (text: string, onEnded: () => void) => {
    if (isMuted) {
      onEnded();
      return;
    }
    setAiState('speaking');
    try {
      const ttsRes = await fetch(`${BACKEND_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!ttsRes.ok) throw new Error("TTS request failed");
      const audioBlob = await ttsRes.blob();
      const blobWithMime = new Blob([audioBlob], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blobWithMime);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl);
          onEnded();
        };
        audioRef.current.onerror = () => {
          console.error("Audio playback error");
          URL.revokeObjectURL(audioUrl);
          onEnded();
        };
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error("Audio playback blocked or failed:", error);
            URL.revokeObjectURL(audioUrl);
            addSystemMessage("Audio autoplay blocked. Please click the page to enable voice replies.");
            onEnded();
          });
        }
      } else {
        onEnded();
      }
    } catch (e) {
      console.error(e);
      onEnded();
    }
  };
  speakTextRef.current = speakText;

  const handleTTSFinished = () => {
    if (autoListenRef.current) {
      setAiState('listening');
      setIsListening(true);
      setTimeout(() => {
        try { recognitionRef.current.start(); } catch(e) {}
      }, 500);
    } else {
      setAiState('idle');
      setIsListening(false);
      stopMicMonitor();
    }
  };

  const toggleSpeech = async () => {
    if (!recognition) {
      addSystemMessage("Speech recognition not supported. Use Chrome or Edge.");
      return;
    }

    if (isListening) {
      recognition.stop();
      stopMicMonitor();
    } else {
      const micReady = await startMicMonitor(selectedDeviceId || undefined);
      if (!micReady) {
        addSystemMessage("Could not access microphone. Check permissions or select a different mic.");
        setShowMicSettings(true);
        return;
      }
      
      unlockAudio();
      setIsListening(true);
      
      try {
        recognition.start();
      } catch (err) {
        console.warn("Recognition start error:", err);
        setIsListening(false);
        setAiState("idle");
      }
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !activeConvId) return;
    
    if (isListening && recognition) {
      try { recognition.stop(); } catch(e) {}
    }
    
    const userMsg = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString([], { hour12: false }) };
    const updatedMessages = [...currentMessages, userMsg];
    
    setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, messages: updatedMessages } : c));
    setInput("");
    setAiState('thinking');

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: updatedMessages.slice(-5) })
      });
      
      const data = await res.json();
      
      if (data.reply) {
        const finalMessages = [...updatedMessages, { role: 'assistant', content: data.reply, timestamp: new Date().toLocaleTimeString([], { hour12: false }) }];
        
        setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, messages: finalMessages } : c));
        syncMessages(activeConvId, finalMessages);
        
        await speakText(data.reply, () => {
          handleTTSFinished();
        });
      } else {
        handleTTSFinished();
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      addSystemMessage("ERROR: Connection to backend failed.");
      setAiState('idle');
      if (autoListenRef.current) {
        setTimeout(() => {
          handleTTSFinished();
        }, 1500);
      } else {
        setIsListening(false);
        stopMicMonitor();
      }
    }
  };
  handleSendMessageRef.current = handleSendMessage;

  return (
    <div className="flex h-screen w-screen bg-black text-white relative overflow-hidden font-sans">
      
      {/* Sleek Futuristic Sidebar for Multi-Tab Chats */}
      <div className="w-64 h-full bg-black/60 border-r border-white/5 flex flex-col p-4 z-20 backdrop-blur-md relative">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none"></div>
        
        {/* Tab Switcher */}
        <div className="flex gap-1 mb-6 border-b border-white/5 pb-4">
          <button
            onClick={() => setActiveTab("chat")}
            className={clsx(
              "flex-1 py-1.5 px-1 rounded-lg font-mono text-[8px] font-bold tracking-wider border transition-all flex items-center justify-center gap-0.5",
              activeTab === "chat"
                ? "bg-primary/20 text-primary border-primary/30"
                : "bg-white/5 text-white/40 border-transparent hover:text-white/60"
            )}
          >
            <MessageSquare className="w-2.5 h-2.5" />
            AI_CHAT
          </button>
          <button
            onClick={() => setActiveTab("neet")}
            className={clsx(
              "flex-1 py-1.5 px-1 rounded-lg font-mono text-[8px] font-bold tracking-wider border transition-all flex items-center justify-center gap-0.5",
              activeTab === "neet"
                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                : "bg-white/5 text-white/40 border-transparent hover:text-white/60"
            )}
          >
            🩺 NEET
          </button>
          <button
            onClick={() => setActiveTab("gesture")}
            className={clsx(
              "flex-1 py-1.5 px-1 rounded-lg font-mono text-[8px] font-bold tracking-wider border transition-all flex items-center justify-center gap-0.5",
              activeTab === "gesture"
                ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                : "bg-white/5 text-white/40 border-transparent hover:text-white/60"
            )}
          >
            🖐️ GESTURE
          </button>
        </div>

        {activeTab === "chat" ? (
          <>
            {/* Title */}
            <div className="flex items-center gap-2 mb-6 px-1">
              <MessageSquare className="text-primary w-5 h-5 text-glow" />
              <h2 className="font-mono text-sm font-bold tracking-widest text-white/90">CHAT_SESSIONS</h2>
            </div>

            {/* New Session Button */}
            <button 
              onClick={createNewConversation}
              className="w-full py-2 px-4 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all font-mono text-xs flex items-center justify-center gap-2 mb-4 hover:shadow-[0_0_15px_rgba(30,144,255,0.2)]"
            >
              <Plus className="w-4 h-4" />
              NEW SESSION
            </button>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {conversations.map(conv => (
                <div 
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex justify-between items-center group relative overflow-hidden ${conv.id === activeConvId ? 'bg-primary/10 border-primary/40 text-white shadow-[inset_0_0_10px_rgba(30,144,255,0.15)]' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:border-white/10 hover:text-white'}`}
                >
                  <span className="font-mono text-xs truncate max-w-[140px] z-10">{conv.title}</span>
                  
                  {/* Controls */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        const newTitle = prompt("Rename session:", conv.title);
                        if (newTitle) renameConversation(conv.id, newTitle);
                      }}
                      className="p-1 text-white/50 hover:text-white transition-colors"
                      title="Rename session"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this session?")) deleteConversation(conv.id);
                      }}
                      className="p-1 text-white/50 hover:text-red-400 transition-colors"
                      title="Delete session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : activeTab === "neet" ? (
          /* NEET Sidebar Panels */
          <div className="flex-1 flex flex-col gap-5 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {/* Subject Selector */}
            <div className="border border-white/5 bg-black/20 rounded-xl p-3 flex flex-col gap-3">
              <span className="text-[10px] font-mono text-cyan-400 tracking-wider font-bold">SUBJECT_SELECTOR</span>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={subjectInputText}
                  onChange={(e) => setSubjectInputText(e.target.value)}
                  placeholder="Subject name..."
                  className="flex-1 bg-black/40 border border-white/5 text-[11px] text-white rounded p-1.5 outline-none font-mono focus:border-cyan-500/50 min-w-0"
                />
                <button 
                  onClick={() => {
                    if (subjectInputText.trim()) {
                      setNeetSubject(subjectInputText.trim());
                      localStorage.setItem("neet_pomodoro_subject", subjectInputText.trim());
                      setSubjectInputText("");
                    }
                  }}
                  className="bg-cyan-500 text-black font-bold text-[10px] px-2 rounded hover:bg-cyan-400 transition-colors font-mono"
                >
                  SET
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {["Physics", "Chemistry", "Botany", "Zoology"].map(sub => (
                  <button
                    key={sub}
                    onClick={() => {
                      setNeetSubject(sub);
                      localStorage.setItem("neet_pomodoro_subject", sub);
                    }}
                    className={clsx(
                      "py-1 px-1 rounded text-[9px] font-mono border transition-all text-center truncate",
                      neetSubject === sub 
                        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-bold" 
                        : "bg-white/5 text-white/50 border-transparent hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            {/* Timer Settings */}
            <div className="border border-white/5 bg-black/20 rounded-xl p-3 flex flex-col gap-3">
              <span className="text-[10px] font-mono text-purple-400 tracking-wider font-bold">TIMER_SETTINGS</span>
              <div className="grid grid-cols-3 gap-1">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-mono text-white/40 text-center">Study(m)</span>
                  <input 
                    type="number" 
                    value={settingsStudy}
                    onChange={(e) => setSettingsStudy(parseInt(e.target.value) || 25)}
                    className="bg-black/40 border border-white/5 text-[10px] text-white rounded p-1 text-center outline-none font-mono min-w-0"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-mono text-white/40 text-center">Short(m)</span>
                  <input 
                    type="number" 
                    value={settingsShort}
                    onChange={(e) => setSettingsShort(parseInt(e.target.value) || 5)}
                    className="bg-black/40 border border-white/5 text-[10px] text-white rounded p-1 text-center outline-none font-mono min-w-0"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-mono text-white/40 text-center">Long(m)</span>
                  <input 
                    type="number" 
                    value={settingsLong}
                    onChange={(e) => setSettingsLong(parseInt(e.target.value) || 15)}
                    className="bg-black/40 border border-white/5 text-[10px] text-white rounded p-1 text-center outline-none font-mono min-w-0"
                  />
                </div>
              </div>
              <button 
                onClick={() => {
                  const s = { study: settingsStudy, short: settingsShort, long: settingsLong };
                  localStorage.setItem("neet_pomodoro_settings", JSON.stringify(s));
                  if (!timerRunning) {
                    setTimeLeft((timerState === "study" ? settingsStudy : (timerState === "short_break" ? settingsShort : settingsLong)) * 60);
                    setTotalTime((timerState === "study" ? settingsStudy : (timerState === "short_break" ? settingsShort : settingsLong)) * 60);
                  }
                  alert("Timer configuration saved!");
                }}
                className="w-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 text-[9px] font-mono py-1.5 rounded transition-all mt-1"
              >
                APPLY_CONFIG
              </button>
            </div>

            {/* History Logs */}
            <div className="border border-white/5 bg-black/20 rounded-xl p-3 flex-1 flex flex-col gap-3 overflow-hidden min-h-[140px]">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-white/40 tracking-wider font-bold">LOG_HISTORY</span>
                {historyLogs.length > 0 && (
                  <button 
                    onClick={() => {
                      if (confirm("Clear all logs?")) {
                        setHistoryLogs([]);
                        localStorage.removeItem("neet_pomodoro_history");
                      }
                    }}
                    className="text-[8px] font-mono text-red-400 hover:underline"
                  >
                    CLEAR
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                {historyLogs.length === 0 ? (
                  <span className="text-[9px] font-mono text-white/25 text-center italic mt-4 block">Log is empty.</span>
                ) : (
                  historyLogs.slice(0, 8).map(log => (
                    <div 
                      key={log.id} 
                      className={clsx(
                        "p-1.5 rounded bg-black/30 border-l-2 flex justify-between items-center text-[9px] font-mono",
                        log.type === "study" ? "border-l-primary" : "border-l-green-500"
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-white font-bold truncate">{log.type === "study" ? log.subject : (log.type === "short_break" ? "Short Break" : "Long Break")}</span>
                        <span className="text-white/30 text-[7px]">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <span className="text-white/60 ml-2">{log.duration}m</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Gesture Sidebar Panels */
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Monitor className="text-purple-400 w-5 h-5 text-glow animate-pulse" />
              <h2 className="font-mono text-sm font-bold tracking-widest text-white/90">PC_GESTURE</h2>
            </div>
            <div className="border border-white/5 bg-black/20 rounded-xl p-3 flex flex-col gap-2 font-mono text-[10px] text-white/60 leading-relaxed">
              <span className="text-white/35 tracking-wider font-bold">SYSTEM STATUS:</span>
              <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5 border-dashed">
                <span>WS CONNECTIONS</span>
                <span className="text-green-400">ONLINE</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5 border-dashed">
                <span>REACTION TIME</span>
                <span className="text-cyan-400">~15ms</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5 border-dashed">
                <span>WEBCAM RESOLUTION</span>
                <span className="text-purple-400">640x480</span>
              </div>
              <div className="flex items-center justify-between">
                <span>SMOOTH FILTER</span>
                <span className="text-purple-400">EXPONENTIAL</span>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar Footer - Memory Status */}
        <div className="mt-4 pt-4 border-t border-white/5 font-mono text-[9px] text-white/30 flex flex-col gap-1 z-10 bg-black/40 p-2 rounded">
          <div className="flex justify-between">
            <span>MEM_STATUS:</span>
            <span className="text-green-500 text-glow">SYNCED</span>
          </div>
          <div className="flex justify-between">
            <span>ACTIVE_TABS:</span>
            <span>{conversations.length}</span>
          </div>
          <div className="flex justify-between">
            <span>CORE_VERSION:</span>
            <span>OS_v2.2</span>
          </div>
        </div>
      </div>

      {/* Main Center - Friday Interface */}
      <main className="flex-1 flex flex-col items-center justify-between p-8 relative overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-black to-black min-h-screen z-10">
        
        {/* Background Grid - Futuristic */}
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        {/* Header */}
        <header className="w-full flex justify-between items-center z-10 glass-panel px-6 py-4">
          <div className="flex items-center gap-3">
            <Activity className="text-primary animate-pulse w-5 h-5" />
            <h1 className="font-mono text-xl font-bold tracking-widest text-white text-glow">FRIDAY</h1>
          </div>
          
          <div className="flex items-center gap-4 text-xs font-mono text-white/50">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              SYS_ONLINE
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              MEM_LINKED
            </div>
          </div>
          
          <button className="text-white/70 hover:text-white transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </header>

        {activeTab === "chat" ? (
          <>
            {/* Main Center - Orb */}
            <div className="flex-1 flex flex-col items-center justify-center z-10 w-full relative">
              <FridayOrb state={aiState} />
              
              {/* Status Text — prominent, color-coded */}
              <motion.div 
                key={aiState}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex items-center gap-3"
              >
                {/* Animated dot */}
                 <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className={clsx(
                    "w-2.5 h-2.5 rounded-full",
                    aiState === 'idle' && "bg-blue-500",
                    aiState === 'listening' && "bg-purple-400",
                    aiState === 'speaking' && "bg-cyan-400",
                    aiState === 'thinking' && "bg-amber-400"
                  )}
                />
                
                <span className={clsx(
                  "font-mono text-base font-bold tracking-[0.25em] uppercase",
                  aiState === 'idle' && "text-blue-400/60",
                  aiState === 'listening' && "text-purple-300",
                  aiState === 'speaking' && "text-cyan-300",
                  aiState === 'thinking' && "text-amber-300"
                )}>
                  {aiState === 'idle' && "Standing by..."}
                  {aiState === 'listening' && "Listening..."}
                  {aiState === 'thinking' && "Processing..."}
                  {aiState === 'speaking' && "Responding..."}
                </span>
              </motion.div>
            </div>

            {/* Bottom Terminal / Chat Area */}
            <div className="w-full max-w-3xl z-10 glass-panel p-4 flex flex-col gap-4">
              {/* Logs */}
              <div className="h-32 overflow-y-auto font-mono text-xs flex flex-col gap-1 pr-2 scrollbar-thin scrollbar-thumb-white/10">
                {currentMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'text-blue-300' : msg.role === 'system' ? 'text-gray-500' : 'text-primary'}`}>
                    <span className="opacity-50">[{mounted ? msg.timestamp : "--:--:--"}]</span>
                    <span>
                      {msg.role === 'user' ? '> ' : msg.role === 'assistant' ? 'FRIDAY: ' : 'SYS: '}
                      {msg.content}
                    </span>
                  </div>
                ))}
              </div>

              {/* Input Bar */}
              <div className="flex flex-col gap-2">
                {/* Mic Level Indicator - shows when listening */}
                {isListening && (
                  <div className="flex items-center gap-2 px-2">
                    <span className="text-[10px] font-mono text-red-400 animate-pulse">● REC</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-full"
                        animate={{ width: `${Math.max(5, micLevel)}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-white/30">{micLevel}%</span>
                  </div>
                )}

                {/* Mic Settings Dropdown */}
                {showMicSettings && (
                  <div className="bg-black/80 border border-primary/20 rounded-lg p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono text-primary tracking-widest">MIC_SELECT</span>
                      <button onClick={() => setShowMicSettings(false)} className="text-white/30 hover:text-white text-xs">✕</button>
                    </div>
                    
                    {audioDevices.length === 0 ? (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-mono text-red-400">No microphones detected.</span>
                        <button 
                          onClick={async () => {
                            await startMicMonitor();
                          }}
                          className="text-[10px] font-mono bg-primary/20 text-primary px-3 py-1.5 rounded hover:bg-primary/30 transition-colors"
                        >
                          🔍 DETECT MICROPHONES
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {audioDevices.map((device, idx) => (
                          <button
                            key={device.deviceId}
                            onClick={async () => {
                              setSelectedDeviceId(device.deviceId);
                              await startMicMonitor(device.deviceId);
                            }}
                            className={`text-left text-[11px] font-mono px-3 py-2 rounded transition-all ${
                              selectedDeviceId === device.deviceId 
                                ? 'bg-primary/20 text-primary border border-primary/30' 
                                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-transparent'
                            }`}
                          >
                            {selectedDeviceId === device.deviceId && "✓ "}{device.label}
                          </button>
                        ))}
                        
                        {/* Language Selector */}
                        <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-1.5">
                          <span className="text-[9px] font-mono text-primary tracking-widest">SPEECH_LANGUAGE</span>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => handleLanguageChange("hi-IN")}
                              className={`py-1 px-1 rounded text-[9px] font-mono border transition-all truncate ${
                                speechLanguage === "hi-IN"
                                  ? 'bg-primary/20 text-primary border-primary/30'
                                  : 'bg-white/5 text-white/40 border-transparent hover:text-white/70'
                              }`}
                              title="Hinglish (Hindi written in Devanagari script)"
                            >
                              Hinglish (hi-IN)
                            </button>
                            <button
                              onClick={() => handleLanguageChange("en-US")}
                              className={`py-1 px-1 rounded text-[9px] font-mono border transition-all truncate ${
                                speechLanguage === "en-US"
                                  ? 'bg-primary/20 text-primary border-primary/30'
                                  : 'bg-white/5 text-white/40 border-transparent hover:text-white/70'
                              }`}
                              title="English (US Standard)"
                            >
                              English (en-US)
                            </button>
                            <button
                              onClick={() => handleLanguageChange("en-IN")}
                              className={`py-1 px-1 rounded text-[9px] font-mono border transition-all truncate ${
                                speechLanguage === "en-IN"
                                  ? 'bg-primary/20 text-primary border-primary/30'
                                  : 'bg-white/5 text-white/40 border-transparent hover:text-white/70'
                              }`}
                              title="Indian English & transliterated Hinglish (highly stable)"
                            >
                              Mixed (en-IN)
                            </button>
                          </div>
                        </div>

                        {/* Live mic test */}
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-[10px] font-mono text-white/30">LEVEL:</span>
                          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              className={`h-full rounded-full ${micLevel > 5 ? 'bg-green-500' : 'bg-white/10'}`}
                              animate={{ width: `${Math.max(2, micLevel)}%` }}
                              transition={{ duration: 0.1 }}
                            />
                          </div>
                          <span className={`text-[10px] font-mono ${micLevel > 5 ? 'text-green-400' : 'text-red-400'}`}>
                            {micLevel > 5 ? '● ACTIVE' : '○ SILENT'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 bg-black/50 rounded-lg p-2 border border-white/5 focus-within:border-primary/50 transition-colors">
                  {/* Voice Input (Speech to Text) */}
                  <button 
                    onClick={toggleSpeech}
                    className={`p-2 rounded-full transition-colors ${isListening ? 'bg-red-500 animate-pulse text-white' : 'bg-primary/20 text-primary hover:bg-primary/30'}`}
                    title={isListening ? "Stop Listening" : "Talk to Friday"}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  {/* Auto-Listen (Hands-Free) Toggle */}
                  <button 
                    onClick={() => {
                      const next = !autoListen;
                      setAutoListen(next);
                      autoListenRef.current = next;
                      silenceCountRef.current = 0; // fresh start
                      
                      if (next && !isListening) {
                        toggleSpeech();
                      }
                      if (!next && isListening && recognition) {
                        recognition.stop();
                        stopMicMonitor();
                      }
                    }}
                    className={`px-2 py-1 rounded-full transition-all text-[9px] font-mono font-bold tracking-wider border ${
                      autoListen 
                        ? 'bg-green-500/20 text-green-400 border-green-500/40' 
                        : 'bg-white/5 text-white/25 border-white/10 hover:text-white/50'
                    }`}
                    title={autoListen ? "Disable Hands-Free Mode" : "Enable Hands-Free Mode (auto-listen)"}
                  >
                    {autoListen ? '🟢 AUTO' : 'AUTO'}
                  </button>

                  {/* Mic Settings */}
                  <button 
                    onClick={() => {
                      setShowMicSettings(!showMicSettings);
                      if (!showMicSettings) enumerateDevices();
                    }}
                    className={`p-2 rounded-full transition-colors ${showMicSettings ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/30 hover:text-white/60'}`}
                    title="Mic Settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>

                  {/* Gesture Toggle Button */}
                  <button 
                    onClick={() => setShowGesturePreview(!showGesturePreview)}
                    className={`p-2 rounded-full transition-colors ${showGesturePreview ? 'bg-purple-500/30 text-purple-400 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.2)] animate-pulse' : 'bg-white/5 text-white/30 hover:text-white/60'}`}
                    title="Toggle Gesture Control"
                  >
                    <Hand className="w-3.5 h-3.5" />
                  </button>

                  {/* Output Mute/Unmute */}
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-2 rounded-full transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}
                    title={isMuted ? "Unmute Voice" : "Mute Voice"}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  
                  <Terminal className="w-4 h-4 text-white/30" />
                  
                  <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && input.trim()) {
                        unlockAudio();
                        handleSendMessage(input);
                      }
                    }}
                    placeholder="Type a command or speak..."
                    className="flex-1 bg-transparent border-none outline-none text-white font-mono text-sm placeholder:text-white/20"
                  />
                </div>
              </div>
            </div>
          </>
        ) : activeTab === "neet" ? (
          /* NEET POMODORO MAIN CENTER VIEW */
          <div className="flex-grow w-full max-w-3xl flex flex-col items-center justify-center z-10 relative py-2 animate-fade-in">
            
            {/* Lofi Sound & Status Badge Header */}
            <div className="w-full flex justify-between items-center mb-6 px-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(6,182,212,0.05)]">
                  ACTIVE_SUBJECT: {neetSubject}
                </span>
              </div>
              
              <button 
                onClick={toggleLofiActive}
                className={clsx(
                  "py-1.5 px-3 rounded-lg font-mono text-[10px] font-bold border transition-all flex items-center gap-1.5",
                  lofiActive 
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]" 
                    : "bg-white/5 text-white/50 border-white/5 hover:text-white"
                )}
              >
                {lofiActive ? (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                    className="inline-block"
                  >
                    🎵
                  </motion.span>
                ) : "🔈"}
                LOFI_AMBIENT: {lofiActive ? "ON" : "OFF"}
              </button>
            </div>

            {/* Circular Timer SVG Area */}
            <div className="relative w-64 h-64 mb-8 flex justify-center items-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                <circle 
                  cx="100" 
                  cy="100" 
                  r="88" 
                  className="fill-none stroke-white/5 stroke-[4]"
                />
                <motion.circle 
                  cx="100" 
                  cy="100" 
                  r="88" 
                  className="fill-none stroke-[4] stroke-linecap-round"
                  style={{
                    stroke: timerState === "study" ? "var(--color-primary, #1e90ff)" : "#10b981",
                    strokeDasharray: CIRCUMFERENCE,
                    strokeDashoffset: CIRCUMFERENCE - (timeLeft / totalTime) * CIRCUMFERENCE
                  }}
                  transition={{ ease: "linear", duration: 0.1 }}
                />
              </svg>
              
              {/* Inner Details */}
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className={clsx(
                  "font-mono text-[10px] font-bold tracking-[0.2em] uppercase mb-1",
                  timerState === "study" ? "text-primary text-glow" : "text-green-400"
                )}>
                  {timerState === "study" ? "STUDY" : (timerState === "short_break" ? "SHORT BREAK" : "LONG BREAK")}
                </span>
                <span className="font-mono text-5xl font-light text-white leading-none mb-2">
                  {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
                </span>
                <span className="font-mono text-[9px] text-white/40 tracking-wider">
                  Session {pomodoroStreak + 1} of 4
                </span>
              </div>
            </div>

            {/* Timer Controls */}
            <div className="flex gap-3 justify-center w-full max-w-sm mb-6">
              <button 
                onClick={handleStartPause}
                className={clsx(
                  "flex-1 font-mono text-xs font-bold tracking-widest border py-2.5 rounded-lg transition-all",
                  timerRunning 
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30" 
                    : "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30"
                )}
              >
                {timerRunning ? "PAUSE" : "START"}
              </button>
              <button 
                onClick={() => {
                  setTimerRunning(false);
                  setTimeLeft((timerState === "study" ? settingsStudy : (timerState === "short_break" ? settingsShort : settingsLong)) * 60);
                }}
                className="px-4 font-mono text-xs font-bold border bg-white/5 border-white/10 text-white/70 hover:text-white rounded-lg transition-all"
              >
                RESET
              </button>
              <button 
                onClick={skipSession}
                className="px-4 font-mono text-xs font-bold border bg-white/5 border-white/10 text-white/70 hover:text-white rounded-lg transition-all"
              >
                SKIP
              </button>
            </div>

            {/* Stats Summary Panel */}
            <div className="w-full grid grid-cols-2 gap-4 mb-6 px-4">
              <div className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col justify-center items-center text-center">
                <span className="font-mono text-2xl font-bold text-cyan-400 text-glow">
                  {historyLogs.filter(log => log.type === "study" && new Date(log.timestamp).toDateString() === new Date().toDateString()).length}
                </span>
                <span className="font-mono text-[8px] text-white/30 tracking-widest uppercase mt-1">Sessions Completed Today</span>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col justify-center items-center text-center">
                <span className="font-mono text-2xl font-bold text-purple-400 text-glow">
                  {historyLogs.filter(log => log.type === "study" && new Date(log.timestamp).toDateString() === new Date().toDateString()).reduce((sum, l) => sum + l.duration, 0)}m
                </span>
                <span className="font-mono text-[8px] text-white/30 tracking-widest uppercase mt-1">Total Focus Time Today</span>
              </div>
            </div>

            {/* Motivational Quote Container */}
            {motivationalQuote && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full border-t border-dashed border-white/10 pt-4 text-center mt-2 px-6"
              >
                <p className="font-sans text-xs italic text-cyan-300/80 leading-relaxed">"{motivationalQuote}"</p>
                <span className="font-mono text-[8px] text-primary tracking-widest uppercase mt-1 block">FRIDAY_MOTIVATION</span>
              </motion.div>
            )}

          </div>
        ) : (
          <GestureControl backendUrl={BACKEND_URL} />
        )}
        
        {showGesturePreview && activeTab !== "gesture" && (
          <div className="fixed bottom-24 right-8 z-50 w-80 bg-black/90 border border-purple-500/30 rounded-2xl p-4 shadow-[0_0_30px_rgba(168,85,247,0.25)] backdrop-blur-md flex flex-col gap-2">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <span className="font-mono text-[10px] font-bold text-purple-400 flex items-center gap-1.5">
                <Hand className="w-3.5 h-3.5" />
                GESTURE_LIVE_FEED
              </span>
              <button 
                onClick={() => setShowGesturePreview(false)} 
                className="text-white/40 hover:text-white font-mono text-[9px] uppercase font-bold py-0.5 px-2 rounded hover:bg-white/5 transition-all"
              >
                CLOSE
              </button>
            </div>
            <div className="w-full max-h-[360px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
              <GestureControl backendUrl={BACKEND_URL} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
