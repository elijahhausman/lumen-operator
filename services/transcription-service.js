require('colors');
const WebSocket = require('ws');
const EventEmitter = require('events');

class TranscriptionService extends EventEmitter {
  constructor() {
    super();

    this.finalResult = '';

    this.ws = new WebSocket('wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    });

    this.ws.on('open', () => {
      console.log('STT -> ElevenLabs connection opened'.green);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'transcript') {
          const text = msg.transcript_event?.text || '';
          if (!text.trim()) return;

          if (msg.transcript_event?.is_final) {
            this.finalResult += ` ${text}`;
            this.emit('transcription', this.finalResult.trim());
            this.finalResult = '';
          } else {
            this.emit('utterance', text);
            console.log(`👂 Interim transcript: "${text}"`);
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
        message_type: 'input_audio_chunk',
        audio_base_64: payload, // already base64 from Twilio
        sample_rate: 8000,
      }));
    }
  }
}

module.exports = { TranscriptionService };
