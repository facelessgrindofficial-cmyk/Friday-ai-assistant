// Config and Constants
const BACKEND_URL = "http://localhost:5002";
const CIRCUMFERENCE = 553; // 2 * PI * 88 (radius 88)

// Local fallback quotes in case backend is offline
const LOCAL_QUOTES = [
  "Abhi nahi toh kabhi nahi! Keep pushing, AIR 1 is waiting for you, Rohit! 🩺",
  "Physics equations can be solved, biology diagrams can be mastered. Stay focused!",
  "Hard work beats talent when talent doesn't work hard. Put in the hours!",
  "NEET is not just an exam; it's a test of your patience and consistency.",
  "Organic Chemistry reactions will click if you repeat them. Keep practicing! 🧪",
  "Every MCQ you practice today gets you closer to Government Medical College.",
  "Chupchaap mehnat karo, success ko shore machane do! 🤫",
  "Procrastination is the enemy. Focus on one Pomodoro at a time.",
  "Think of the white coat and the stethoscope. It's all worth it! 🥼🩺",
  "AIR 1 isn't born; they are made in silent hours of studying."
];

// App State
let timerInterval = null;
let timeLeft = 0;
let totalTime = 0;
let currentState = "study"; // "study", "short_break", "long_break"
let activeSubject = "Physics"; // Default subject
let pomodoroStreak = 0; // completed pomodoros in current streak (up to 4)
let isPaused = true;
let isBackendOnline = false;

// Custom Settings (loaded from localStorage or defaults)
let settings = {
  study: 25,
  short: 5,
  long: 15
};

// Web Audio API State
let audioCtx = null;
let isLofiPlaying = false;
let rainFilter = null;
let droneOsc1 = null, droneOsc2 = null;
let noiseNode = null;
let mainGainNode = null;

// DOM Elements
const timeDisplay = document.getElementById("time-display");
const timerStateLabel = document.getElementById("timer-state-label");
const pomodoroCountLabel = document.getElementById("pomodoro-count-label");
const activeSubjectBadge = document.getElementById("active-subject-badge");
const progressCircle = document.querySelector(".timer-progress");

const btnStart = document.getElementById("btn-start");
const btnPause = document.getElementById("btn-pause");
const btnReset = document.getElementById("btn-reset");
const btnSkip = document.getElementById("btn-skip");

const lofiToggle = document.getElementById("lofi-toggle");
const backendStatus = document.getElementById("backend-status");

const subjectInput = document.getElementById("subject-input");
const btnSetSubject = document.getElementById("btn-set-subject");
const quickSubBtns = document.querySelectorAll(".quick-sub-btn");

const inputStudy = document.getElementById("study-duration");
const inputShort = document.getElementById("short-break");
const inputLong = document.getElementById("long-break");
const btnSaveSettings = document.getElementById("btn-save-settings");

const statsTotalToday = document.getElementById("stats-total-today");
const statsTotalTime = document.getElementById("stats-total-time");
const subjectStatsList = document.getElementById("subject-stats-list");
const historyLogList = document.getElementById("history-log-list");
const btnClearHistory = document.getElementById("btn-clear-history");

const quotePanel = document.getElementById("quote-panel");
const quoteText = document.getElementById("quote-text");

// Initialize application
window.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  loadState();
  initEventListeners();
  checkBackendStatus();
  setInterval(checkBackendStatus, 15000); // Check server health every 15s
  resetTimer();
  updateUI();
  renderStatsAndHistory();
});

// Event Listeners initialization
function initEventListeners() {
  btnStart.addEventListener("click", startTimer);
  btnPause.addEventListener("click", pauseTimer);
  btnReset.addEventListener("click", () => {
    pauseTimer();
    resetTimer();
    updateUI();
  });
  btnSkip.addEventListener("click", skipSession);

  // Subject settings
  btnSetSubject.addEventListener("click", () => {
    const value = subjectInput.value.trim();
    if (value) {
      setSubject(value);
      subjectInput.value = "";
    }
  });

  quickSubBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      setSubject(e.target.dataset.sub);
    });
  });

  // Timer Configuration settings
  btnSaveSettings.addEventListener("click", () => {
    settings.study = parseInt(inputStudy.value) || 25;
    settings.short = parseInt(inputShort.value) || 5;
    settings.long = parseInt(inputLong.value) || 15;

    localStorage.setItem("neet_pomodoro_settings", JSON.stringify(settings));
    showToast("Timer configuration applied!");
    
    if (isPaused) {
      resetTimer();
      updateUI();
    }
  });

  // Clear history
  btnClearHistory.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear your study history?")) {
      localStorage.removeItem("neet_pomodoro_history");
      renderStatsAndHistory();
      showToast("Study history cleared!");
    }
  });

  // Lofi Ambient sound
  lofiToggle.addEventListener("click", toggleLofiSound);
}

// Check if Express backend is running on 5002
async function checkBackendStatus() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/status`);
    if (res.ok) {
      backendStatus.textContent = "SYS_ONLINE";
      backendStatus.className = "status-badge online";
      isBackendOnline = true;
    } else {
      throw new Error();
    }
  } catch (e) {
    backendStatus.textContent = "SYS_OFFLINE";
    backendStatus.className = "status-badge offline";
    isBackendOnline = false;
  }
}

// Load Settings from LocalStorage
function loadSettings() {
  const savedSettings = localStorage.getItem("neet_pomodoro_settings");
  if (savedSettings) {
    settings = JSON.parse(savedSettings);
    inputStudy.value = settings.study;
    inputShort.value = settings.short;
    inputLong.value = settings.long;
  }
  
  const savedSubject = localStorage.getItem("neet_pomodoro_subject");
  if (savedSubject) {
    activeSubject = savedSubject;
  }
  updateQuickSubjectButtons();
}

// Load current stats/streak from localStorage
function loadState() {
  const savedStreak = localStorage.getItem("neet_pomodoro_streak");
  if (savedStreak) {
    pomodoroStreak = parseInt(savedStreak) || 0;
  }
}

// Set active subject
function setSubject(subjectName) {
  activeSubject = subjectName;
  localStorage.setItem("neet_pomodoro_subject", activeSubject);
  activeSubjectBadge.textContent = activeSubject;
  updateQuickSubjectButtons();
  showToast(`Subject set to ${activeSubject}`);
}

function updateQuickSubjectButtons() {
  quickSubBtns.forEach(btn => {
    if (btn.dataset.sub === activeSubject) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

// Reset timer according to the current state
function resetTimer() {
  isPaused = true;
  clearInterval(timerInterval);
  timerInterval = null;

  if (currentState === "study") {
    timeLeft = settings.study * 60;
  } else if (currentState === "short_break") {
    timeLeft = settings.short * 60;
  } else if (currentState === "long_break") {
    timeLeft = settings.long * 60;
  }
  totalTime = timeLeft;
  
  // Set circle stroke color depending on state
  if (currentState === "study") {
    progressCircle.style.stroke = "var(--primary)";
    progressCircle.style.filter = "drop-shadow(0 0 8px var(--primary-glow))";
  } else {
    progressCircle.style.stroke = "var(--success)";
    progressCircle.style.filter = "drop-shadow(0 0 8px var(--success-glow))";
  }

  btnStart.disabled = false;
  btnPause.disabled = true;
}

// Update Timer visuals
function updateUI() {
  // Format MM:SS
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timeDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Update label
  if (currentState === "study") {
    timerStateLabel.textContent = "STUDY";
    timerStateLabel.className = "timer-state-label study";
  } else if (currentState === "short_break") {
    timerStateLabel.textContent = "SHORT BREAK";
    timerStateLabel.className = "timer-state-label break";
  } else if (currentState === "long_break") {
    timerStateLabel.textContent = "LONG BREAK";
    timerStateLabel.className = "timer-state-label break";
  }

  // Update session indicators
  pomodoroCountLabel.textContent = `Session ${pomodoroStreak + 1} of 4`;
  activeSubjectBadge.textContent = activeSubject;

  // Update Progress circle SVG
  // 553 is full, 0 is empty
  const progressRatio = timeLeft / totalTime;
  const offset = CIRCUMFERENCE - (progressRatio * CIRCUMFERENCE);
  progressCircle.style.strokeDashoffset = isNaN(offset) ? 0 : offset;
}

// Start Timer
function startTimer() {
  if (!isPaused) return;
  isPaused = false;
  
  btnStart.disabled = true;
  btnPause.disabled = false;

  // Log start session with backend
  if (currentState === "study") {
    logSessionStartBackend();
  }

  timerInterval = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      updateUI();
    } else {
      clearInterval(timerInterval);
      sessionCompleted();
    }
  }, 1000);
}

// Pause Timer
function pauseTimer() {
  isPaused = true;
  clearInterval(timerInterval);
  btnStart.disabled = false;
  btnPause.disabled = true;
}

// Handle Session completion
async function sessionCompleted() {
  playAlertChime();

  const completedType = currentState;
  const completedSubject = completedType === "study" ? activeSubject : "Break";
  const completedDuration = completedType === "study" ? settings.study : (completedType === "short_break" ? settings.short : settings.long);

  // Save session log locally
  saveSessionToLocal(completedType, completedSubject, completedDuration);

  // If study session finished, handle next session logic
  let randomQuote = "";
  if (completedType === "study") {
    pomodoroStreak++;
    localStorage.setItem("neet_pomodoro_streak", pomodoroStreak);
    
    // Send completion request to backend, get motivational quote
    randomQuote = await logSessionCompleteBackend(completedSubject, completedType, completedDuration);

    if (pomodoroStreak >= 4) {
      currentState = "long_break";
      pomodoroStreak = 0;
      localStorage.setItem("neet_pomodoro_streak", pomodoroStreak);
      showToast("Outstanding study sprint completed! Take a long break. 🧘‍♂️");
    } else {
      currentState = "short_break";
      showToast("Study session complete! Go rest for a bit. ☕");
    }
  } else {
    // Break finished, go back to study
    currentState = "study";
    showToast("Break over. Back to studying, Rohit! Let's conquer the next chapter.");
  }

  // Display motivational quote
  if (completedType === "study") {
    displayQuote(randomQuote || getRandomLocalQuote());
  }

  resetTimer();
  updateUI();
  renderStatsAndHistory();
}

// Skip session
function skipSession() {
  pauseTimer();
  if (confirm("Skip this session? No stats will be recorded.")) {
    if (currentState === "study") {
      currentState = "short_break";
    } else {
      currentState = "study";
    }
    resetTimer();
    updateUI();
  }
}

// Show local notification / alerts
function showToast(message) {
  console.log(`[Toast] ${message}`);
  // Add temporary floating feedback in the top center of the timer
  const originalSubject = activeSubjectBadge.textContent;
  activeSubjectBadge.textContent = "★ " + message + " ★";
  setTimeout(() => {
    activeSubjectBadge.textContent = activeSubject;
  }, 4000);
}

// Get local quote helper
function getRandomLocalQuote() {
  const idx = Math.floor(Math.random() * LOCAL_QUOTES.length);
  return LOCAL_QUOTES[idx];
}

// Display Quote with Typing/Fading effect
function displayQuote(text) {
  quotePanel.classList.remove("hidden");
  quoteText.textContent = text;
  // Trigger transition
  quotePanel.style.opacity = 0;
  setTimeout(() => {
    quotePanel.style.opacity = 1;
  }, 100);
}

// Local Storage helpers for history
function saveSessionToLocal(type, subject, duration) {
  const history = JSON.parse(localStorage.getItem("neet_pomodoro_history") || "[]");
  const newSession = {
    id: Date.now(),
    type: type,
    subject: subject,
    duration: duration,
    timestamp: new Date().toISOString()
  };
  history.unshift(newSession); // Newest at the top
  localStorage.setItem("neet_pomodoro_history", JSON.stringify(history));
}

// Renders stats (today's counts, time, graphs) and history logs
function renderStatsAndHistory() {
  const history = JSON.parse(localStorage.getItem("neet_pomodoro_history") || "[]");
  
  // 1. Calculations
  const today = new Date().toDateString();
  const todaySessions = history.filter(item => new Date(item.timestamp).toDateString() === today);
  
  // Total study sessions completed today
  const studyToday = todaySessions.filter(item => item.type === "study");
  statsTotalToday.textContent = studyToday.length;

  // Total study minutes today
  const totalMinutes = studyToday.reduce((sum, item) => sum + item.duration, 0);
  statsTotalTime.textContent = `${totalMinutes}m`;

  // 2. Subject Breakdown chart
  const subjectTimes = {};
  history.forEach(item => {
    if (item.type === "study") {
      subjectTimes[item.subject] = (subjectTimes[item.subject] || 0) + item.duration;
    }
  });

  const maxTime = Math.max(...Object.values(subjectTimes), 1);
  subjectStatsList.innerHTML = "";

  if (Object.keys(subjectTimes).length === 0) {
    subjectStatsList.innerHTML = `<p class="empty-list-text">No study sessions logged yet.</p>`;
  } else {
    Object.entries(subjectTimes).forEach(([sub, mins]) => {
      const percentage = (mins / maxTime) * 100;
      const itemHTML = `
        <div class="subject-stat-item">
          <div class="sub-stat-header">
            <span class="sub-name">${sub}</span>
            <span class="sub-time">${mins} mins</span>
          </div>
          <div class="bar-container">
            <div class="bar-fill" style="width: ${percentage}%"></div>
          </div>
        </div>
      `;
      subjectStatsList.insertAdjacentHTML("beforeend", itemHTML);
    });
  }

  // 3. History list rendering (limit to 6 logs)
  historyLogList.innerHTML = "";
  if (history.length === 0) {
    historyLogList.innerHTML = `<p class="empty-list-text">Your study log is empty.</p>`;
    btnClearHistory.classList.add("hidden");
  } else {
    btnClearHistory.classList.remove("hidden");
    history.slice(0, 6).forEach(item => {
      const isStudy = item.type === "study";
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const itemHTML = `
        <div class="history-log-item ${isStudy ? '' : 'break-log'}">
          <div class="log-left">
            <span class="log-sub-name">${isStudy ? item.subject : (item.type === 'short_break' ? 'Short Break' : 'Long Break')}</span>
            <span class="log-timestamp">${timeStr}</span>
          </div>
          <div class="log-right">${item.duration}m</div>
        </div>
      `;
      historyLogList.insertAdjacentHTML("beforeend", itemHTML);
    });
  }
}

// REST Backend Integration Helper: Start Session
async function logSessionStartBackend() {
  if (!isBackendOnline) return;
  try {
    await fetch(`${BACKEND_URL}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: activeSubject,
        duration: settings.study
      })
    });
  } catch (e) {
    console.error("Backend error during start log:", e);
  }
}

// REST Backend Integration Helper: Complete Session
async function logSessionCompleteBackend(subject, type, duration) {
  if (!isBackendOnline) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/session/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, type, duration })
    });
    if (res.ok) {
      const data = await res.json();
      return data.quote;
    }
  } catch (e) {
    console.error("Backend error during completion log:", e);
  }
  return null;
}

// -------------------------------------------------------------
// WEB AUDIO API - Chill Ambient Rain / Synth Drone Generator
// -------------------------------------------------------------
function toggleLofiSound() {
  if (isLofiPlaying) {
    stopLofiSound();
    lofiToggle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-music"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      LOFI_AMBIENT: OFF
    `;
    lofiToggle.classList.remove("active");
  } else {
    startLofiSound();
    lofiToggle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-music" style="animation: spin-slow 10s linear infinite;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      LOFI_AMBIENT: ON
    `;
    lofiToggle.classList.add("active");
  }
}

function startLofiSound() {
  try {
    // Create Audio Context if needed
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume context if suspended (browser security)
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    // 1. Master Gain
    mainGainNode = audioCtx.createGain();
    mainGainNode.gain.setValueAtTime(0.08, audioCtx.currentTime); // Soft volume

    // 2. Pink/White Noise for Rain
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    // Generate pink-ish noise for softer rain sound
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
      output[i] *= 0.11; // scale down
      b6 = white * 0.115926;
    }

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;

    // Filter rain to give it an indoor/muffled sound
    rainFilter = audioCtx.createBiquadFilter();
    rainFilter.type = "lowpass";
    rainFilter.frequency.setValueAtTime(420, audioCtx.currentTime);

    noiseNode.connect(rainFilter);
    rainFilter.connect(mainGainNode);
    noiseNode.start();

    // 3. Meditative Deep Drone (55Hz / A1 synth hum)
    droneOsc1 = audioCtx.createOscillator();
    droneOsc2 = audioCtx.createOscillator();
    const droneGain = audioCtx.createGain();
    droneGain.gain.setValueAtTime(0.03, audioCtx.currentTime);

    droneOsc1.type = "sawtooth";
    droneOsc1.frequency.setValueAtTime(55, audioCtx.currentTime); // Deep A1
    
    droneOsc2.type = "sine";
    droneOsc2.frequency.setValueAtTime(110.4, audioCtx.currentTime); // Soft A2 detuned

    const droneFilter = audioCtx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.setValueAtTime(100, audioCtx.currentTime); // Lowpass to isolate hum

    droneOsc1.connect(droneFilter);
    droneOsc2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(mainGainNode);

    droneOsc1.start();
    droneOsc2.start();

    // Connect everything to speaker output
    mainGainNode.connect(audioCtx.destination);
    isLofiPlaying = true;
    console.log("Lofi Audio Engine active.");
  } catch (e) {
    console.error("Failed to start Audio Context:", e);
  }
}

function stopLofiSound() {
  try {
    if (noiseNode) {
      noiseNode.stop();
      noiseNode.disconnect();
      noiseNode = null;
    }
    if (droneOsc1) {
      droneOsc1.stop();
      droneOsc1.disconnect();
      droneOsc1 = null;
    }
    if (droneOsc2) {
      droneOsc2.stop();
      droneOsc2.disconnect();
      droneOsc2 = null;
    }
    if (mainGainNode) {
      mainGainNode.disconnect();
      mainGainNode = null;
    }
    isLofiPlaying = false;
    console.log("Lofi Audio Engine stopped.");
  } catch (e) {
    console.error("Failed to stop Audio Context clean:", e);
  }
}

// Play Sweet alarm synthesized arpeggio chime when session ends
function playAlertChime() {
  try {
    const alarmCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = alarmCtx.currentTime;
    
    // Simple synthesized arpeggio: C4 -> E4 -> G4 -> C5
    const notes = [261.63, 329.63, 392.00, 523.25];
    
    notes.forEach((freq, idx) => {
      const osc = alarmCtx.createOscillator();
      const gainNode = alarmCtx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.15);
      
      gainNode.gain.setValueAtTime(0.12, now + idx * 0.15);
      // Fade out
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.6);
      
      osc.connect(gainNode);
      gainNode.connect(alarmCtx.destination);
      
      osc.start(now + idx * 0.15);
      osc.stop(now + idx * 0.15 + 0.65);
    });
  } catch (e) {
    console.error("Audio Alarm chime failed:", e);
  }
}
