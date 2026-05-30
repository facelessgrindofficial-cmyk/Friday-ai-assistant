const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

// List of NEET study motivational quotes (Hinglish & English)
const MOTIVATIONAL_QUOTES = [
  "Abhi nahi toh kabhi nahi! Keep pushing, AIR 1 is waiting for you, Rohit! 🩺",
  "Physics equations can be solved, biology diagrams can be mastered. Stay focused!",
  "Hard work beats talent when talent doesn't work hard. Put in the hours!",
  "NEET is not just an exam; it's a test of your patience and consistency.",
  "Organic Chemistry reactions will click if you repeat them. Keep practicing! 🧪",
  "Every MCQ you practice today gets you closer to Government Medical College.",
  "Chupchaap mehnat karo, success ko shore machane do! 🤫",
  "Procrastination is the enemy. Focus on one Pomodoro at a time.",
  "Think of the white coat and the stethoscope. It's all worth it! 🥼🩺",
  "AIR 1 isn't born; they are made in silent hours of studying.",
  "Mistakes are proof that you are trying. Analyze what went wrong and move on.",
  "Keep your distractions locked away. Just 25 minutes of absolute focus!",
  "Consistency is key. 1 Pomodoro completed is 1 step closer to your dream. 📈"
];

// Endpoint: Start session log
app.post("/api/session/start", (req, res) => {
  const { subject, duration } = req.body;
  console.log(`[Session Started] Subject: ${subject || "Unknown"}, Duration: ${duration} mins`);
  res.json({
    success: true,
    message: "Session started successfully",
    startTime: new Date().toISOString()
  });
});

// Endpoint: Complete session, save data and return a quote
app.post("/api/session/complete", (req, res) => {
  const { subject, type, duration } = req.body;
  console.log(`[Session Completed] Type: ${type}, Subject: ${subject || "Break"}, Duration: ${duration} mins`);
  
  // Pick a random motivational quote
  const randomIdx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  const quote = MOTIVATIONAL_QUOTES[randomIdx];

  res.json({
    success: true,
    message: "Session logged successfully",
    quote: quote,
    completedAt: new Date().toISOString()
  });
});

// Endpoint: Get list of motivational quotes
app.get("/api/quotes", (req, res) => {
  res.json(MOTIVATIONAL_QUOTES);
});

// Endpoint: Simple Health check / Stats echo
app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    system: "NEET Pomodoro Study Hub",
    time: new Date().toLocaleTimeString()
  });
});

app.listen(PORT, () => {
  console.log(`NEET Pomodoro Backend running on http://localhost:${PORT}`);
});
