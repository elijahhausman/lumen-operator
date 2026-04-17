require('colors');
const WebSocket = require('ws');
const EventEmitter = require('events');

class TranscriptionService extends EventEmitter {
  constructor() {
    super();

    this.finalResult = '';

    this.ws = new WebSocket('wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=mulaw_8000', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    });

    this.ws.on('open', () => {
      console.log('STT -> ElevenLabs connection opened'.green);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        console.log('STT -> raw message:'.cyan, JSON.stringify(msg));

        const text = msg.transcript_event?.text || msg.text || '';
        const isFinal = msg.transcript_event?.is_final ?? msg.is_final ?? false;

        if (!text.trim()) return;

        if (isFinal) {
          this.finalResult += ` ${text}`;
          console.log(`💬 FINAL TRANSCRIPT: "${this.finalResult.trim()}"`.yellow);
          this.emit('transcription', this.finalResult.trim());
          this.finalResult = '';
        } else {
          console.log(`👂 Interim: "${text}"`);
          this.emit('utterance', text);
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
