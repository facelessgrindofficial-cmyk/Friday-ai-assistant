const { GoogleGenAI } = require("@google/genai");
require("dotenv").config({ path: "../.env" });

async function testGemini() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        console.log("Testing with key:", process.env.GEMINI_API_KEY ? "Present (ends with " + process.env.GEMINI_API_KEY.slice(-5) + ")" : "Missing");
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "Hello! If you can read this, reply with 'Yes, connection works!'"
        });
        console.log("Response text:", response.text);
    } catch (e) {
        console.error("Error occurred:", e);
    }
}

testGemini();
