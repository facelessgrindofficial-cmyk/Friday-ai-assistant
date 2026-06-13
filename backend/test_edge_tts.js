const { EdgeTTS, Constants } = require("@andresaya/edge-tts");
const fs = require("fs");

async function testTTS() {
  const tts = new EdgeTTS();
  const text = "Hello boss, aap kaise hain? Main Friday hoon.";
  console.log("Synthesizing: ", text);
  try {
    await tts.synthesize(text, 'hi-IN-SwaraNeural', {
      rate: '+15%',
      pitch: '+5Hz',
      outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
    });
    const buffer = tts.toBuffer();
    fs.writeFileSync("test_output.mp3", buffer);
    console.log("Success! File saved to test_output.mp3, length:", buffer.length);
  } catch (err) {
    console.error("TTS synthesis error:", err);
  }
}

testTTS();
