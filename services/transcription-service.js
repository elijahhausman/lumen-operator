require('colors');
const WebSocket = require('ws');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');

class TranscriptionService extends EventEmitter {
  constructor() {
    super();

    this.finalResult = '';
    this.speechFinal = false;

    this.ws = new WebSocket('wss://api.elevenlabs.io/v1/speech-to-text/stream', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    });

    this.ws.on('open', () => {
      // Send stream config once connection is open
      this.ws.send(JSON.stringify({
        type: 'stream_start',
        audio_format: 'mulaw_8000',
      }));
      console.log('STT -> ElevenLabs connection opened'.green);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'interim_transcript') {
          const text = msg.text || '';
          this.emit('utterance', text);
          console.log(`👂 Interim transcript: "${text}"`);

        } else if (msg.type === 'final_transcript') {
          const text = msg.text || '';
          if (text.trim().length > 0) {
            this.finalResult += ` ${text}`;
            this.speechFinal = true;
            this.emit('transcription', this.finalResult.trim());
            this.finalResult = '';
            this.speechFinal = false;
          }

        } else if (msg.type === 'error') {
          console.error('STT -> ElevenLabs error:', msg);
        }
      } catch (err) {
        console.error('STT -> Failed to parse message:', err);
      }
    });

    this.ws.on('error', (err) => {
      console.error('STT -> ElevenLabs WebSocket error:', err);
    });

    this.ws.on('close', () => {
      console.log('STT -> ElevenLabs connection closed'.yellow);
    });
  }

  send(payload) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'audio_chunk',
        audio: payload, // already base64 from Twilio
      }));
    }
  }
}

module.exports = { TranscriptionService };
