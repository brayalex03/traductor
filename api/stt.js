export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://brayalex03.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { audio, languageCode, mimeType } = req.body;
    const key = process.env.GOOGLE_STT_KEY;

    // Detectar encoding según mimeType enviado desde el cliente
    let encoding = 'WEBM_OPUS';
    let sampleRateHertz = 48000;
    if (mimeType && mimeType.includes('ogg')) {
      encoding = 'OGG_OPUS';
      sampleRateHertz = 48000;
    } else if (mimeType && mimeType.includes('webm') && !mimeType.includes('opus')) {
      encoding = 'WEBM_OPUS';
    }

    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding,
            sampleRateHertz,
            languageCode: languageCode || 'es-US',
            enableAutomaticPunctuation: true,
          },
          audio: { content: audio }
        })
      }
    );

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
