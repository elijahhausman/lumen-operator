require('dotenv').config();

const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const fetch = require('node-fetch');

class TextToSpeechService extends EventEmitter {
  constructor() {
    super();
    this.nextExpectedIndex = 0;
    this.speechBuffer = {};
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;

    if (!partialResponse) return;

    const text = partialResponse.trim();

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream?output_format=ulaw_8000`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5',
          }),
        }
      );

      if (response.status === 200) {
        try {
          const blob = await response.blob();
          const audioArrayBuffer = await blob.arrayBuffer();
          const base64String = Buffer.from(audioArrayBuffer).toString('base64');
          this.emit('speech', partialResponseIndex, base64String, partialResponse, interactionCount);
        } catch (err) {
          console.error('Error processing ElevenLabs audio:', err);
        }
      } else {
        const errorText = await response.text();
        console.error(`ElevenLabs TTS error ${response.status}:`, errorText);
      }
    } catch (err) {
      console.error('Error occurred in TextToSpeech service:', err);
    }
  }
}

module.exports = { TextToSpeechService };
