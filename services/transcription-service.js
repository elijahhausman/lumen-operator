require('colors');
const WebSocket = require('ws');
const EventEmitter = require('events');

class TranscriptionService extends EventEmitter {
  constructor() {
    super();

    this.ws = new WebSocket('wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=ulaw_8000', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    });

    this.ws.on('open', () => {
      console.log('STT -> ElevenLabs connection opened'.green);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.message_type === 'partial_transcript') {
          const text = msg.text || '';
          if (text.trim()) this.emit('utterance', text);

        } else if (msg.message_type === 'final_transcript') {
          const text = msg.text || '';
          if (text.trim()) {
            console.log(`💬 FINAL: "${text}"`.yellow);
            this.emit('transcription', text.trim());
          }

        } else if (msg.message_type === 'error' || msg.message_type === 'invalid_request') {
          console.error('STT -> ElevenLabs error:', msg);
        }
      } catch (err) {
        console.error('STT -> Failed to parse message:', err);
      }
    });

    this.ws.on('error', (err) => {
      console.error('STT -> ElevenLabs WebSocket error:', err);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`STT -> ElevenLabs connection closed (${code}: ${reason || 'none'})`.yellow);
    });
  }

  send(payload) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: payload,
        sample_rate: 8000,
      }));
    }
  }
}

module.exports = { TranscriptionService };
