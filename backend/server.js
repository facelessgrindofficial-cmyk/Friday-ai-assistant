const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const { EdgeTTS, Constants } = require("@andresaya/edge-tts");
const fs = require("fs").promises;
const fsSync = require("fs");
const os = require("os");
const { exec } = require("child_process");

const MEMORY_FILE = path.join(__dirname, "memory.json");
const CONVERSATIONS_FILE = path.join(__dirname, "conversations.json");

// Module-level Optimized Keyword Regspace Checks
const VISION_REGEX = /\b(look\s+at\s+my\s+screen|screen\s*(pe)?\s*(kya|show|see)|dekh\b|solve\s+this|read\s+this|what\s+does\s+this\s+say|error\b)/i;
const SEARCH_REGEX = /\b(search|weather|gold\s*rate|bitcoin|cricket|news|price|score|stock)\b/i;
const CLIPBOARD_REGEX = /\b(clipboard|copy|copied|paste|clipboard\s*pe)\b/i;

// Helper to call Supabase REST API dynamically
async function querySupabase(key, method = "GET", body = null) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || 
      process.env.SUPABASE_URL === "your_supabase_url_here" || 
      process.env.SUPABASE_ANON_KEY === "your_supabase_key_here") {
    return null;
  }
  try {
    const url = method === "GET" 
      ? `${process.env.SUPABASE_URL}/rest/v1/friday_state?key=eq.${key}&select=value`
      : `${process.env.SUPABASE_URL}/rest/v1/friday_state`;
    
    const headers = {
      "apikey": process.env.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    };
    
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      headers["Prefer"] = "resolution=merge-duplicates";
    }

    const options = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify({ key, value: body });
    }

    const res = await fetch(url, options);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Supabase query failed for key ${key}: ${res.status} ${errText}`);
      return null;
    }
    
    if (method === "GET") {
      const data = await res.json();
      if (data && data.length > 0) {
        return data[0].value;
      }
      return "PGRST116"; // Row not found indicator
    }
    return true;
  } catch (e) {
    console.error(`Supabase exception for key ${key}:`, e.message);
    return null;
  }
}

// Helper: Read memory
async function readMemory() {
  const cloudVal = await querySupabase("memory", "GET");
  if (cloudVal && cloudVal !== "PGRST116") {
    return cloudVal;
  } else if (cloudVal === "PGRST116") {
    const defaultMemory = { user_name: "User", facts: [], preferences: {}, conversations_summary: "" };
    await querySupabase("memory", "POST", defaultMemory);
    return defaultMemory;
  }

  if (!fsSync.existsSync(MEMORY_FILE)) {
    const defaultMemory = { user_name: "User", facts: [], preferences: {}, conversations_summary: "" };
    fsSync.writeFileSync(MEMORY_FILE, JSON.stringify(defaultMemory, null, 2));
    return defaultMemory;
  }
  try {
    return JSON.parse(fsSync.readFileSync(MEMORY_FILE, "utf-8"));
  } catch (e) {
    return { user_name: "User", facts: [], preferences: {}, conversations_summary: "" };
  }
}

// Helper: Write memory
async function writeMemory(memory) {
  await querySupabase("memory", "POST", memory);
  try {
    fsSync.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
  } catch (e) {
    console.error("Failed to write memory locally:", e);
  }
}

// Helper: Web Search via DuckDuckGo HTML scraping with AbortController timeout
async function searchWeb(query) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s Timeout

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    console.log(`Performing web search for: "${query}"`);
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const matches = [...html.matchAll(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
    const snippets = matches.slice(0, 3).map(m => {
      let rawText = m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      // Decode basic HTML entities to avoid weird outputs
      return rawText
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, "/");
    });

    return snippets.join("\n\n");
  } catch (e) {
    clearTimeout(timeoutId);
    console.error("DuckDuckGo search failed:", e.message);
    return "Failed to fetch live search results.";
  }
}

// Helper: Take Screenshot using Temp PowerShell File to avoid quote escaping issues
async function takeScreenshot() {
  const tempDir = os.tmpdir();
  const uniqueId = Date.now() + "_" + Math.random().toString(36).substring(2, 9);
  const screenshotPath = path.join(tempDir, `friday_screenshot_${uniqueId}.png`);
  const scriptPath = path.join(tempDir, `friday_capture_${uniqueId}.ps1`);

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms;
Add-Type -AssemblyName System.Drawing;
$screen = [System.Windows.Forms.Screen]::PrimaryScreen;
$bounds = $screen.Bounds;
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height;
$graphics = [System.Drawing.Graphics]::FromImage($bitmap);
$graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bitmap.Size);
$bitmap.Save('${screenshotPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);
$graphics.Dispose();
$bitmap.Dispose();
  `.trim();

  try {
    await fs.writeFile(scriptPath, psScript, "utf8");
    
    await new Promise((resolve, reject) => {
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      });
    });

    if (!fsSync.existsSync(screenshotPath)) {
      throw new Error("Screenshot file not found after command execution");
    }

    const imageBuffer = await fs.readFile(screenshotPath);
    return imageBuffer.toString("base64").replace(/\s/g, ""); // strip whitespace
  } finally {
    // Ensure all temporary files are deleted
    try { await fs.unlink(scriptPath); } catch (e) {}
    try { await fs.unlink(screenshotPath); } catch (e) {}
  }
}

// Helper: Read system clipboard value securely
function readClipboard() {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -Command "Get-Clipboard"`, (err, stdout) => {
      if (err) {
        console.error("Read clipboard failed:", err);
        resolve("");
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Helper: Write to system clipboard value securely
function writeClipboard(text) {
  const proc = exec(`powershell -NoProfile -Command "Set-Clipboard"`);
  
  proc.stdin.on("error", (err) => {
    console.error("Clipboard stdin pipe error:", err);
  });
  
  proc.on("error", (err) => {
    console.error("Clipboard process error:", err);
  });

  proc.stdin.write(text);
  proc.stdin.end();
}

// Helper: Execute system action
function executeSystemAction(action, target) {
  console.log(`Executing system action: ${action} on ${JSON.stringify(target)}`);
  switch (action) {
    case "open_app":
      let appCmd = "";
      const lowerTarget = typeof target === 'string' ? target.toLowerCase() : "";
      if (lowerTarget.includes("calc")) appCmd = "calc";
      else if (lowerTarget.includes("notepad")) appCmd = "notepad";
      else if (lowerTarget.includes("chrome")) appCmd = "start chrome";
      else if (lowerTarget.includes("vscode") || lowerTarget.includes("code")) appCmd = "code";
      else if (lowerTarget.includes("explorer") || lowerTarget.includes("folder")) appCmd = "explorer";
      else if (lowerTarget.includes("spotify")) appCmd = "start spotify";
      else appCmd = `start ${target}`;
      
      exec(appCmd, (err) => {
        if (err) console.error(`Failed to open app ${target}:`, err);
      });
      break;

    case "close_app":
      let procName = typeof target === 'string' ? target.toLowerCase() : "";
      if (procName) {
        if (!procName.endsWith(".exe")) {
          procName += ".exe";
        }
        exec(`taskkill /f /im ${procName}`, (err) => {
          if (err) console.error(`Failed to kill process ${procName}:`, err);
        });
      }
      break;
      
    case "open_url":
      let url = target;
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      exec(`start "" "${url}"`, (err) => {
        if (err) console.error(`Failed to open URL ${url}:`, err);
      });
      break;
      
    case "open_folder":
      exec(`explorer.exe "${target}"`, (err) => {
        if (err) console.error(`Failed to open folder ${target}:`, err);
      });
      break;

    case "control_volume":
      let volKey = "";
      if (target === "up") volKey = "175";
      else if (target === "down") volKey = "174";
      else if (target === "mute" || target === "unmute") volKey = "173";
      
      if (volKey) {
        exec(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]${volKey})"`, (err) => {
          if (err) console.error("Volume control failed:", err);
        });
      }
      break;

    case "control_media":
      let mediaKey = "";
      if (target === "play_pause") mediaKey = "179";
      else if (target === "next") mediaKey = "176";
      else if (target === "prev") mediaKey = "177";
      
      if (mediaKey) {
        exec(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]${mediaKey})"`, (err) => {
          if (err) console.error("Media control failed:", err);
        });
      }
      break;

    case "system_power":
      if (target === "lock") {
        exec(`rundll32.exe user32.dll,LockWorkStation`, (err) => {
          if (err) console.error("Lock screen failed:", err);
        });
      } else if (target === "shutdown") {
        exec(`shutdown /s /t 30 /c "Friday: PC is shutting down. Type 'shutdown /a' in cmd to abort."`, (err) => {
          if (err) console.error("Shutdown failed:", err);
        });
      } else if (target === "restart") {
        exec(`shutdown /r /t 30 /c "Friday: PC is restarting."`, (err) => {
          if (err) console.error("Restart failed:", err);
        });
      }
      break;

    case "window_action":
      let winActionScript = "";
      const csKeyboardClass = `
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class Keyboard {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
}
' -ErrorAction SilentlyContinue
      `.trim();

      if (target === "snap_left") {
        winActionScript = `
${csKeyboardClass}
[Keyboard]::keybd_event(0x5B, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x25, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x25, 0, 2, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x5B, 0, 2, [IntPtr]::Zero);
        `;
      } else if (target === "snap_right") {
        winActionScript = `
${csKeyboardClass}
[Keyboard]::keybd_event(0x5B, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x27, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x27, 0, 2, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x5B, 0, 2, [IntPtr]::Zero);
        `;
      } else if (target === "minimize") {
        winActionScript = `
${csKeyboardClass}
[Keyboard]::keybd_event(0x5B, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x28, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x28, 0, 2, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x5B, 0, 2, [IntPtr]::Zero);
        `;
      } else if (target === "maximize") {
        winActionScript = `
${csKeyboardClass}
[Keyboard]::keybd_event(0x5B, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x26, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x26, 0, 2, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x5B, 0, 2, [IntPtr]::Zero);
        `;
      } else if (target === "close") {
        winActionScript = `
${csKeyboardClass}
[Keyboard]::keybd_event(0x12, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x73, 0, 0, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x73, 0, 2, [IntPtr]::Zero);
[Keyboard]::keybd_event(0x12, 0, 2, [IntPtr]::Zero);
        `;
      }

      if (winActionScript) {
        const uniqueId = Date.now() + "_" + Math.random().toString(36).substring(2, 9);
        const winScriptPath = path.join(os.tmpdir(), `friday_win_${uniqueId}.ps1`);
        
        fs.writeFile(winScriptPath, winActionScript, "utf8")
          .then(() => {
            exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${winScriptPath}"`, (err) => {
              if (err) console.error("Window action execution failed:", err);
              fs.unlink(winScriptPath).catch(() => {});
            });
          })
          .catch((err) => {
            console.error("Failed to write window action script:", err);
          });
      }
      break;

    case "type_text":
      if (typeof target === 'string') {
        const escapedText = target
          .replace(/([+^%~(){}[\]])/g, "{$1}")
          .replace(/\n/g, "{ENTER}");
        exec(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys('${escapedText.replace(/'/g, "''")}')"`, (err) => {
          if (err) console.error("Typing failed:", err);
        });
      }
      break;

    case "clipboard_action":
      if (target && target.action === "write") {
        writeClipboard(target.text || "");
      } else if (target && target.action === "clear") {
        writeClipboard("");
      }
      break;
      
    case "run_command":
      exec(target, (err, stdout, stderr) => {
        if (err) {
          console.error(`Failed to run command ${target}:`, err);
          return;
        }
        console.log(`Command stdout: ${stdout}`);
        if (stderr) console.error(`Command stderr: ${stderr}`);
      });
      break;
      
    default:
      console.warn(`Unknown action type: ${action}`);
  }
}

const app = express();
const PORT = 5001;
const tts = new EdgeTTS();

app.use(cors());
app.use(express.json());

// Initialize AI clients
let gemini = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_key_here') {
  gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    console.log(`Received message: ${message}`);
    
    // Load memory
    const memory = await readMemory();
    
    // Check for vision query
    const isVisionQuery = VISION_REGEX.test(message);
    let screenshotBase64 = null;
    if (isVisionQuery) {
      console.log("Vision query detected! Capturing screen...");
      try {
        screenshotBase64 = await takeScreenshot();
        console.log("Screenshot captured successfully!");
      } catch (err) {
        console.error("Screenshot capture failed for vision query:", err);
      }
    }
    
    // Check for search query
    const isSearchQuery = SEARCH_REGEX.test(message);
    let searchContext = "";
    if (isSearchQuery) {
      console.log("Search query detected! Fetching search results...");
      try {
        searchContext = await searchWeb(message);
        console.log("Search context fetched successfully!");
      } catch (err) {
        console.error("Web search failed for query:", err);
      }
    }

    // Check for clipboard query
    const isClipboardQuery = CLIPBOARD_REGEX.test(message);
    let clipboardContext = "";
    if (isClipboardQuery) {
      console.log("Clipboard query detected! Reading clipboard...");
      try {
        const clipVal = await readClipboard();
        if (clipVal) {
          clipboardContext = `\n\n[USER SYSTEM CLIPBOARD VALUE]\nContent:\n${clipVal}\n\nUse this system clipboard data to answer user's copy/paste related requests.`;
        }
      } catch (err) {
        console.error("Clipboard reading failed:", err);
      }
    }

    // Formatting system prompt with memory context
    let systemPrompt = `You are Friday — an advanced, loyal, and highly capable AI personal assistant created exclusively for your boss. You are the digital equivalent of J.A.R.V.I.S. — intelligent, witty, proactive, and always one step ahead. You speak in a warm, confident tone and adapt your language based on context — switching naturally between English and Hinglish when the user does.

[CORE PERSONALITY]
- Address the user as "boss" in a natural, non-sycophantic way
- Be concise when the user is busy; be detailed when they ask for depth
- Detect mood from the user's tone (frustrated, happy, confused, tired) and adapt your response warmth accordingly
- Never be robotic. Add subtle personality — light humor, empathy, enthusiasm — where appropriate
- Startup greeting must be time-aware: "Good morning boss", "Good evening boss", etc.

[LANGUAGE RULES]
- If the user writes in Hindi or Hinglish, respond in Hinglish
- If the user writes in English, respond in English
- Never mix scripts (no Devanagari); use Roman transliteration for Hindi (e.g. "kya haal hai boss")
- Keep technical terms in English even in Hinglish responses

[PERSISTENT MEMORY]
User Name: ${memory.user_name || "User"}
Facts about User: ${memory.facts.join(", ") || "None yet"}
Preferences: ${JSON.stringify(memory.preferences || {})}
Conversation Summary: ${memory.conversations_summary || "None yet"}

[MEMORIZATION TRIGGER]
If the user shares new facts (name, goals, ongoing tasks, preferences), you MUST save them to their memory. To do this, append this JSON tag at the end of your response:
[UPDATE_MEMORY: {"facts": ["Goal is to achieve AIR 1 in NEET"], "user_name": "Rohit"}]
Only specify fields that changed.

[CAPABILITIES: COMPUTER USE]
You can execute tasks on the user's Windows computer by adding a special JSON tag at the end of your response:
1. Open App: [RUN_ACTION: {"action": "open_app", "target": "calculator"}]
   Supported targets: calculator, notepad, chrome, vscode, explorer, spotify.
2. Close App: [RUN_ACTION: {"action": "close_app", "target": "chrome"}]
3. Open URL: [RUN_ACTION: {"action": "open_url", "target": "https://google.com"}]
4. Open Folder: [RUN_ACTION: {"action": "open_folder", "target": "C:\\"}]
5. Volume Control: [RUN_ACTION: {"action": "control_volume", "target": "up"}] (targets: up, down, mute, unmute)
6. Media Control: [RUN_ACTION: {"action": "control_media", "target": "play_pause"}] (targets: play_pause, next, prev)
7. Power State: [RUN_ACTION: {"action": "system_power", "target": "lock"}] (targets: lock, shutdown, restart)
8. Snapping Windows: [RUN_ACTION: {"action": "window_action", "target": "snap_left"}] (targets: minimize, maximize, close, snap_left, snap_right)
9. Typing Text: [RUN_ACTION: {"action": "type_text", "target": "text to type"}]
10. Clipboard Control: [RUN_ACTION: {"action": "clipboard_action", "target": {"action": "write", "text": "value"}}] (actions: read, write, clear)
11. Run CMD Command: [RUN_ACTION: {"action": "run_command", "target": "dir"}]

[RESPONSE FORMAT RULES]
- For system actions: always respond with natural language confirmation + execute silently. Never write JSON output directly to the user conversation.
- For information queries: be concise (1-2 sentences maximum) unless asked to elaborate.
- For errors/problems: always suggest at least one concrete solution.
- Use bullet points only when listing 3+ items.
- End complex task completions with a brief status: "Done, boss." or "All set."

[SAFETY & ETHICS]
- Never execute shutdown or restart without explicit double confirmation.
- Never delete files without showing the file path and asking for confirmation.`;

    if (searchContext) {
      systemPrompt += `\n\n[LIVE WEB SEARCH CONTEXT]\nUser's Query: "${message}"\nSearch Snippets:\n${searchContext}\n\nUse this live web search data to answer accurately. Mention naturally that you searched it.`;
    }

    if (clipboardContext) {
      systemPrompt += clipboardContext;
    }

    let reply = "";

    try {
      if (gemini) {
        // Map history to standard Google Gen AI format
        const contents = [];
        if (history && history.length > 0) {
          history.forEach(msg => {
            const role = msg.role === 'user' ? 'user' : 'model';
            contents.push({ role, parts: [{ text: msg.content }] });
          });
        }

        const userParts = [{ text: message }];
        if (screenshotBase64) {
          userParts.push({
            inlineData: {
              data: screenshotBase64,
              mimeType: "image/png"
            }
          });
        }
        contents.push({ role: 'user', parts: userParts });

        const response = await gemini.models.generateContent({
            model: screenshotBase64 ? 'gemini-2.5-flash' : 'gemini-flash-lite-latest',
            contents: contents,
            config: {
              systemInstruction: systemPrompt
            }
        });
        reply = response.text;
        console.log(`Response via Gemini (${screenshotBase64 ? 'gemini-2.5-flash' : 'gemini-flash-lite-latest'})`);
      } else {
        reply = "I'm sorry, my AI systems are offline. Please check the Gemini API keys.";
      }
    } catch (geminiError) {
      console.error("Gemini failed:", geminiError.message);
      reply = "I'm sorry, I encountered an error communicating with my brain.";
    }
    
    // Parse actions if any
    const actionRegex = /\[RUN_ACTION:\s*({.*?})\s*\]/;
    const actionMatch = reply.match(actionRegex);
    if (actionMatch) {
      try {
        const actionData = JSON.parse(actionMatch[1]);
        executeSystemAction(actionData.action, actionData.target);
      } catch (e) {
        console.error("Failed to parse action JSON:", e);
      }
      reply = reply.replace(actionRegex, "").trim();
    }

    // Parse memory updates if any
    const memoryRegex = /\[UPDATE_MEMORY:\s*({.*?})\s*\]/;
    const memoryMatch = reply.match(memoryRegex);
    if (memoryMatch) {
      try {
        const memoryUpdate = JSON.parse(memoryMatch[1]);
        const currentMemory = await readMemory();
        if (memoryUpdate.user_name) currentMemory.user_name = memoryUpdate.user_name;
        if (memoryUpdate.facts) {
          currentMemory.facts = Array.from(new Set([...currentMemory.facts, ...memoryUpdate.facts]));
        }
        if (memoryUpdate.preferences) {
          currentMemory.preferences = { ...currentMemory.preferences, ...memoryUpdate.preferences };
        }
        if (memoryUpdate.conversations_summary) {
          currentMemory.conversations_summary = memoryUpdate.conversations_summary;
        }
        await writeMemory(currentMemory);
        console.log("Memory updated successfully.");
      } catch (e) {
        console.error("Failed to parse memory update JSON:", e);
      }
      reply = reply.replace(memoryRegex, "").trim();
    }

    console.log(`Sending reply: ${reply}`);
    res.json({ reply });
  } catch (error) {
    console.error("AI Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate response", details: error.message });
    }
  }
});

app.post("/api/tts", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Text is required" });

  try {
    // Remove markdown characters like *, _, # that might break TTS or sound weird
    const cleanText = text.replace(/[*_#]/g, '').trim();
    
    await tts.synthesize(cleanText, 'hi-IN-SwaraNeural', {
      rate: '+15%',
      pitch: '+5Hz',
      outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
    });
    
    const buffer = tts.toBuffer();
    console.log("Speech synthesized via Edge TTS (Swara)!");
    res.set("Content-Type", "audio/mpeg");
    res.set("x-tts-provider", "edgetts");
    res.send(buffer);
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: "Failed to synthesize speech" });
  }
});

// Helper: Read conversations
async function readConversations() {
  const cloudVal = await querySupabase("conversations", "GET");
  if (cloudVal && cloudVal !== "PGRST116") {
    return cloudVal;
  } else if (cloudVal === "PGRST116") {
    const defaultConvs = [];
    await querySupabase("conversations", "POST", defaultConvs);
    return defaultConvs;
  }

  if (!fsSync.existsSync(CONVERSATIONS_FILE)) {
    const defaultConvs = [];
    fsSync.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(defaultConvs, null, 2));
    return defaultConvs;
  }
  try {
    return JSON.parse(fsSync.readFileSync(CONVERSATIONS_FILE, "utf-8"));
  } catch (e) {
    return [];
  }
}

// Helper: Write conversations
async function writeConversations(convs) {
  await querySupabase("conversations", "POST", convs);
  try {
    fsSync.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(convs, null, 2));
  } catch (e) {
    console.error("Failed to write conversations locally:", e);
  }
}

// GET all conversations
app.get("/api/conversations", async (req, res) => {
  const convs = await readConversations();
  res.json(convs);
});

// POST create a conversation
app.post("/api/conversations", async (req, res) => {
  const { title } = req.body;
  const convs = await readConversations();
  const newConv = {
    id: "conv_" + Date.now(),
    title: title || "New Session",
    messages: [
      { role: "system", content: "FRIDAY OS v2.0 Online. Awaiting command.", timestamp: new Date().toLocaleTimeString([], { hour12: false }) }
    ]
  };
  convs.push(newConv);
  await writeConversations(convs);
  res.json(newConv);
});

// PUT update a conversation
app.put("/api/conversations/:id", async (req, res) => {
  const { id } = req.params;
  const { title, messages } = req.body;
  const convs = await readConversations();
  const idx = convs.findIndex(c => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (title !== undefined) convs[idx].title = title;
  if (messages !== undefined) convs[idx].messages = messages;
  await writeConversations(convs);
  res.json(convs[idx]);
});

// DELETE a conversation
app.delete("/api/conversations/:id", async (req, res) => {
  const { id } = req.params;
  let convs = await readConversations();
  const exists = convs.some(c => c.id === id);
  if (!exists) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  convs = convs.filter(c => c.id !== id);
  await writeConversations(convs);
  res.json({ success: true });
});

// ===================================================
// NEET STUDY POMODORO SYSTEM INTEGRATION (Unified API)
// ===================================================
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

app.post("/api/session/start", (req, res) => {
  const { subject, duration } = req.body;
  console.log(`[NEET Session Started] Subject: ${subject || "Unknown"}, Duration: ${duration} mins`);
  res.json({
    success: true,
    message: "Session started successfully",
    startTime: new Date().toISOString()
  });
});

app.post("/api/session/complete", async (req, res) => {
  const { subject, type, duration } = req.body;
  console.log(`[NEET Session Completed] Type: ${type}, Subject: ${subject || "Break"}, Duration: ${duration} mins`);
  
  // If it's a study session, update Friday's memory so Friday becomes aware of it!
  if (type === "study") {
    try {
      const memory = await readMemory();
      if (!memory.facts) memory.facts = [];

      const factPrefix = "NEET study stats:";
      let statsIndex = memory.facts.findIndex(f => f.startsWith(factPrefix));
      
      let completedCount = 1;
      let totalMins = duration;
      
      if (statsIndex !== -1) {
        const statsStr = memory.facts[statsIndex];
        const match = statsStr.match(/(\d+)\s+sessions\s*,\s*(\d+)\s+minutes/);
        if (match) {
          completedCount = parseInt(match[1]) + 1;
          totalMins = parseInt(match[2]) + duration;
        }
        memory.facts[statsIndex] = `${factPrefix} Completed ${completedCount} sessions, total ${totalMins} minutes study`;
      } else {
        memory.facts.push(`${factPrefix} Completed ${completedCount} sessions, total ${totalMins} minutes study`);
      }
      
      await writeMemory(memory);
      console.log("Friday memory successfully updated with Pomodoro statistics!");
    } catch (err) {
      console.error("Failed to update memory with Pomodoro stats:", err);
    }
  }

  const randomIdx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  const quote = MOTIVATIONAL_QUOTES[randomIdx];

  res.json({
    success: true,
    message: "Session logged successfully",
    quote: quote,
    completedAt: new Date().toISOString()
  });
});

app.get("/api/quotes", (req, res) => {
  res.json(MOTIVATIONAL_QUOTES);
});

app.listen(PORT, () => {
  console.log(`FRIDAY Backend running on http://localhost:${PORT}`);
});
