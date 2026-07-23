const TEAM_CODES = new Set([
  'ALG','ARG','AUS','AUT','BEL','BIH','BRA','CAN','COL','COD','CPV','CRO','CUW','CZE',
  'ECU','EGY','ENG','ESP','FRA','GER','GHA','HAI','IRN','IRQ','JOR','JPN','KOR','KSA',
  'MAR','MEX','NED','NOR','NZL','PAN','PAR','POR','QAT','RSA','SCO','SEN','SUI','SWE',
  'TUN','TUR','URU','USA','UZB'
]);

const PROMPT = `
Du analysierst genau eine fotografierte Panini-Doppelseite aus dem Album "Road to FIFA World Cup 2026".
Deine einzige Aufgabe ist, das Team und die fehlenden Sticker der Teamseite zu bestimmen.

Regeln:
1. Drehe das Foto gedanklich korrekt. Perspektive, Buchfalz und leichte Schräglage sind normal.
2. Bestimme das Land/Team aus der großen Teamüberschrift und aus dem wiederholten dreistelligen Teamcode auf den Stickerfeldern.
3. Ignoriere Gruppentabellen, Spielpläne, Flaggen anderer Länder und Codes anderer Teams am Seitenrand. Diese gehören nicht zur Teamidentifikation.
4. Prüfe JEDE Nummer von 1 bis 20 einzeln.
5. "missing" bedeutet: Das vorgedruckte leere Albumfeld mit Teamcode und Nummer ist sichtbar und es klebt dort kein Sticker.
6. "filled" bedeutet: Das Feld ist mit einem Spieler-, Team-, Trikot- oder Sondersticker beklebt.
7. "uncertain" nur verwenden, wenn das Feld abgeschnitten, verdeckt, unscharf oder nicht sicher beurteilbar ist.
8. Erfinde keine Nummern. Verwende ausschließlich 1 bis 20, jede Nummer genau einmal.
9. Der Code muss der auf der Teamseite wiederholte dreistellige Albumcode sein, zum Beispiel JPN, ECU, SWE oder TUN.
10. Antworte ausschließlich im vorgegebenen JSON-Format.
`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    country: {
      type: 'string',
      description: 'Deutscher Länder- oder Teamname der abgebildeten Team-Doppelseite.'
    },
    code: {
      type: 'string',
      description: 'Dreistelliger Teamcode, der auf den Stickerfeldern dieser Teamseite wiederholt steht.'
    },
    fields: {
      type: 'array',
      minItems: 20,
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          number: { type: 'integer', minimum: 1, maximum: 20 },
          status: { type: 'string', enum: ['missing', 'filled', 'uncertain'] }
        },
        required: ['number', 'status']
      }
    },
    overall_confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Gesamtsicherheit der Auswertung zwischen 0 und 1.'
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 5
    }
  },
  required: ['country', 'code', 'fields', 'overall_confidence', 'warnings']
};

function corsHeaders(origin, allowedOrigin) {
  const allowed = origin === allowedOrigin || origin === 'http://localhost:8787' || origin === 'http://127.0.0.1:8787';
  return {
    'Access-Control-Allow-Origin': allowed ? origin : allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function validateResult(value) {
  if (!value || typeof value !== 'object') throw new Error('Leere KI-Antwort.');
  const country = String(value.country || '').trim();
  const code = String(value.code || '').trim().toUpperCase();
  if (!country) throw new Error('Land fehlt in der KI-Antwort.');
  if (!TEAM_CODES.has(code)) throw new Error(`Ungültiger Teamcode: ${code || 'leer'}`);
  if (!Array.isArray(value.fields) || value.fields.length !== 20) {
    throw new Error('Die KI hat nicht alle 20 Stickerfelder bewertet.');
  }

  const seen = new Set();
  const fields = value.fields.map((field) => {
    const number = Number(field?.number);
    const status = String(field?.status || '');
    if (!Number.isInteger(number) || number < 1 || number > 20 || seen.has(number)) {
      throw new Error('Ungültige oder doppelte Stickernummer in der KI-Antwort.');
    }
    if (!['missing', 'filled', 'uncertain'].includes(status)) {
      throw new Error('Ungültiger Stickerstatus in der KI-Antwort.');
    }
    seen.add(number);
    return { number, status };
  }).sort((a, b) => a.number - b.number);

  for (let number = 1; number <= 20; number++) {
    if (!seen.has(number)) throw new Error(`Stickernummer ${number} wurde nicht bewertet.`);
  }

  const missingNumbers = fields.filter((field) => field.status === 'missing').map((field) => field.number);
  const uncertainNumbers = fields.filter((field) => field.status === 'uncertain').map((field) => field.number);
  const confidence = Math.max(0, Math.min(1, Number(value.overall_confidence) || 0));
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];

  return { country, code, fields, missingNumbers, uncertainNumbers, confidence, warnings };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://georgioskitsios.github.io';
    const cors = corsHeaders(origin, allowedOrigin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Nur POST ist erlaubt.' }, 405, cors);
    if (origin && origin !== allowedOrigin && !origin.startsWith('http://localhost') && !origin.startsWith('http://127.0.0.1')) {
      return json({ error: 'Diese Herkunft ist nicht erlaubt.' }, 403, cors);
    }
    if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY ist nicht eingerichtet.' }, 503, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Ungültige JSON-Anfrage.' }, 400, cors);
    }

    const image = String(body?.image || '');
    const mimeType = String(body?.mimeType || 'image/jpeg');
    if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) {
      return json({ error: 'Nicht unterstütztes Bildformat.' }, 400, cors);
    }
    if (!image || image.length < 1000) return json({ error: 'Es wurde kein gültiges Foto übertragen.' }, 400, cors);
    if (image.length > 12_000_000) return json({ error: 'Das Foto ist zu groß.' }, 413, cors);

    const model = env.GEMINI_MODEL || 'gemini-3.5-flash';
    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType, data: image } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseJsonSchema: RESPONSE_SCHEMA
          }
        })
      }
    );

    const apiBody = await apiResponse.json().catch(() => null);
    if (!apiResponse.ok) {
      const detail = apiBody?.error?.message || `Gemini-Fehler ${apiResponse.status}`;
      return json({ error: detail }, apiResponse.status >= 500 ? 502 : 400, cors);
    }

    const text = apiBody?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    if (!text) return json({ error: 'Gemini hat keine auswertbare Antwort geliefert.' }, 502, cors);

    try {
      const result = validateResult(JSON.parse(text));
      return json(result, 200, cors);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Ungültige KI-Antwort.' }, 502, cors);
    }
  }
};
