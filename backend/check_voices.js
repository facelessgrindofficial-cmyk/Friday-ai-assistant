require("dotenv").config({ path: "../.env" });
const axios = require("axios");

async function checkVoices() {
  try {
    const res = await axios.get("https://api.elevenlabs.io/v1/voices", {
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY
      }
    });
    
    console.log("--- AVAILABLE VOICES ---");
    res.data.voices.forEach(voice => {
      console.log(`Name: ${voice.name} | ID: ${voice.voice_id} | Category: ${voice.category}`);
    });
  } catch (err) {
    console.error("Error fetching voices:", err.response?.data || err.message);
  }
}

checkVoices();
