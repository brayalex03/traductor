export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://brayalex03.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { text, languageCode, voiceName } = req.body;
    const key = process.env.GOOGLE_STT_KEY;

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: languageCode || 'en-US',
            name: voiceName || 'en-US-Journey-F',
            ssmlGender: 'FEMALE'
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 1.0,
            pitch: 0
          }
        })
      }
    );

    const data = await response.json();
    if (data.audioContent) {
      res.status(200).json({ audioContent: data.audioContent });
    } else {
      res.status(500).json({ error: data.error || 'TTS failed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
