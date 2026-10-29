import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { GoogleGenAI } from '@google/genai';

const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Traductor WebSocket Server');
  }
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  console.log('Cliente conectado');
  let genSession = null;

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'start') {
        // Iniciar sesión de traducción en tiempo real con Gemini
        const fromLang = msg.fromLang || 'es-US';
        const toLang = msg.toLang || 'en-US';
        const fromName = fromLang.startsWith('es') ? 'Spanish' : 'English';
        const toName = toLang.startsWith('es') ? 'Spanish' : 'English';

        genSession = { fromLang, toLang, fromName, toName };
        ws.send(JSON.stringify({ type: 'ready' }));
        console.log(`Sesión iniciada: ${fromName} → ${toName}`);
      }

      if (msg.type === 'audio' && genSession) {
        // Recibir audio base64, enviar a Google STT, traducir con Gemini, devolver
        const { audio, mimeType } = msg;

        // 1. Transcribir con Google STT
        let encoding = 'WEBM_OPUS';
        let sampleRate = 48000;
        if (mimeType && mimeType.includes('ogg')) {
          encoding = 'OGG_OPUS';
        } else if (mimeType && (mimeType.includes('mp4') || mimeType.includes('aac') || mimeType.includes('m4a'))) {
          encoding = 'MP3'; // Google STT acepta MP3 para audio/mp4 de móviles
          sampleRate = 44100;
        }

        const sttRes = await fetch(
          `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: {
                encoding,
                sampleRateHertz: sampleRate,
                languageCode: genSession.fromLang,
                enableAutomaticPunctuation: true,
              },
              audio: { content: audio }
            })
          }
        );

        const sttData = await sttRes.json();
        console.log(`STT mimeType=${mimeType} encoding=${encoding} sampleRate=${sampleRate} audioLen=${audio?.length}`);
        if (sttData.error) {
          console.error('STT error:', JSON.stringify(sttData.error));
          ws.send(JSON.stringify({ type: 'error', message: `STT: ${sttData.error.message}` }));
          return;
        }
        const transcript = sttData.results?.[0]?.alternatives?.[0]?.transcript;
        console.log(`STT resultado: "${transcript}"`);
        if (!transcript || transcript.trim() === '') return;

        console.log(`Transcripción: ${transcript}`);
        ws.send(JSON.stringify({ type: 'transcript', text: transcript }));

        // 2. Traducir con Gemini Flash (rápido)
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Translate this ${genSession.fromName} text to ${genSession.toName}. Return ONLY the translation, nothing else:\n\n${transcript}` }] }]
            })
          }
        );
        const geminiData = await geminiRes.json();
        if (geminiData.error) {
          console.error('Gemini error:', JSON.stringify(geminiData.error));
          ws.send(JSON.stringify({ type: 'error', message: `Gemini: ${geminiData.error.message}` }));
          return;
        }
        const translated = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!translated) return;

        console.log(`Traducción: ${translated}`);
        ws.send(JSON.stringify({ type: 'translation', text: translated }));

        // 3. Convertir a voz con Google TTS
        const voiceMap = {
          'en-US': 'en-US-Journey-F',
          'es-US': 'es-US-Journey-F',
          'es-ES': 'es-ES-Journey-F',
        };
        const voiceName = voiceMap[genSession.toLang] || 'en-US-Journey-F';

        const ttsRes = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: { text: translated },
              voice: { languageCode: genSession.toLang, name: voiceName },
              audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 }
            })
          }
        );

        const ttsData = await ttsRes.json();
        if (ttsData.audioContent) {
          ws.send(JSON.stringify({ type: 'tts', audio: ttsData.audioContent }));
        }
      }

    } catch (err) {
      console.error('Error:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    console.log('Cliente desconectado');
    genSession = null;
  });
});

httpServer.listen(PORT, () => {
  console.log(`Servidor WebSocket corriendo en puerto ${PORT}`);
});
