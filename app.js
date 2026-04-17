require('dotenv').config();
require('colors');

const express = require('express');
const ExpressWs = require('express-ws');

const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { TextToSpeechService } = require('./services/tts-service');

const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();
ExpressWs(app);

const PORT = process.env.PORT || 3000;

// ─── STARTUP DIAGNOSTICS ────────────────────────────────────────────────────
console.log('=== LUMEN OPERATOR STARTING ==='.bgWhite.black);
console.log(`PORT:          ${PORT}`);
console.log(`SERVER:        ${process.env.SERVER || '❌ NOT SET'}`);
console.log(`ELEVENLABS KEY:    ${process.env.ELEVENLABS_API_KEY ? '✅ set' : '❌ NOT SET'}`);
console.log(`ELEVENLABS VOICE:  ${process.env.ELEVENLABS_VOICE_ID || '❌ NOT SET'}`);
console.log(`OPENAI KEY:        ${process.env.OPENAI_API_KEY ? '✅ set' : '❌ NOT SET'}`);
console.log(`WebSocket URL will be: wss://${process.env.SERVER}/connection`);
console.log('═══════════════════════════════'.bgWhite.black);
// ─────────────────────────────────────────────────────────────────────────────

// Parse incoming POST bodies (needed for Twilio webhooks)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check — lets you confirm the app is alive from a browser
app.get('/', (req, res) => {
  res.send(`
    <h2>Lumen Operator is running ✅</h2>
    <p>SERVER: ${process.env.SERVER || 'NOT SET ❌'}</p>
    <p>WebSocket target: wss://${process.env.SERVER}/connection</p>
    <p>ELEVENLABS: ${process.env.ELEVENLABS_API_KEY ? '✅' : '❌ NOT SET'}</p>
    <p>OPENAI: ${process.env.OPENAI_API_KEY ? '✅' : '❌ NOT SET'}</p>
  `);
});

// ─── INCOMING CALL WEBHOOK ───────────────────────────────────────────────────
app.post('/incoming', (req, res) => {
  console.log('\n📞 INCOMING CALL HIT'.bgGreen.black);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));

  try {
    if (!process.env.SERVER) {
      console.error('❌ SERVER env var is not set — WebSocket URL will be broken!'.red);
    }

    const wsUrl = `wss://${process.env.SERVER}/connection`;
    console.log(`📡 Telling Twilio to connect to: ${wsUrl}`.cyan);

    const response = new VoiceResponse();
    const connect = response.connect();
    connect.stream({ url: wsUrl });

    const twiml = response.toString();
    console.log('📄 TwiML response:', twiml);

    res.type('text/xml');
    res.end(twiml);
  } catch (err) {
    console.error('❌ Error in /incoming:'.red, err);
    res.status(500).send('Internal Server Error');
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// ─── WEBSOCKET CONNECTION ────────────────────────────────────────────────────
app.ws('/connection', (ws) => {
  console.log('\n🔌 WEBSOCKET /connection opened'.bgBlue.white);

  try {
    ws.on('error', (err) => {
      console.error('❌ WebSocket error:'.red, err);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed — code: ${code}, reason: ${reason || 'none'}`.yellow);
    });

    let streamSid;
    let callSid;

    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});

    let marks = [];
    let interactionCount = 0;
    let mediaPacketCount = 0;

    ws.on('message', function message(data) {
      try {
        const msg = JSON.parse(data);

        if (msg.event === 'start') {
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;

          console.log(`\n🟢 CALL STARTED — sid: ${callSid}`.bgGreen.black);

          streamService.setStreamSid(streamSid);
          gptService.setCallSid(callSid);

          ttsService.generate({
            partialResponseIndex: null,
            partialResponse: 'Welcome to Bart\'s Automotive. How can I help you today?'
          }, 0);

        } else if (msg.event === 'media') {
          mediaPacketCount++;
          transcriptionService.send(msg.media.payload);

        } else if (msg.event === 'mark') {
          marks = marks.filter(m => m !== msg.mark.name);

        } else if (msg.event === 'stop') {
          console.log(`\n🔴 CALL ENDED (${interactionCount} interactions)`.bgRed.white);
        }
      } catch (err) {
        console.error('❌ Error parsing WebSocket message:'.red, err);
      }
    });

    transcriptionService.on('utterance', async (text) => {
      if (marks.length > 0 && text?.length > 5) {
        console.log('⚡ Interruption detected — clearing audio'.red);
        ws.send(JSON.stringify({ streamSid, event: 'clear' }));
      }
    });

    transcriptionService.on('transcription', async (text) => {
      if (!text) return;
      console.log(`\n💬 USER: "${text}"`.yellow);
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });

    gptService.on('gptreply', async (gptReply, icount) => {
      console.log(`\n🤖 GPT: "${gptReply.partialResponse}"`.green);
      ttsService.generate(gptReply, icount);
    });

    ttsService.on('speech', (responseIndex, audio) => {
      streamService.buffer(responseIndex, audio);
    });

    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
    });

  } catch (err) {
    console.error('❌ Fatal error in /connection WebSocket handler:'.red, err);
  }
});
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server running on port ${PORT}`.bgGreen.black);
});
