import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Body parsers with generous limits for audio payload
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Initialize GoogleGenAI SDK on server-side
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Resilient model hierarchy: includes Gemma models which run on dedicated infrastructure immune to Gemini Flash 503 spikes
const TEXT_MODELS = [
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite',
  'gemma-4-31b-it',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];
const PRIMARY_TTS_MODEL = 'gemini-3.8-flash-lite-tts';

// Server-side audio cache
const audioCache = new Map<string, string>();

// Model cooldown map to dynamically skip models experiencing transient 503 or 429 errors
const modelCooldowns = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getOrderedModels(): string[] {
  const now = Date.now();
  const healthy: string[] = [];
  const inCooldown: string[] = [];

  for (const m of TEXT_MODELS) {
    if ((modelCooldowns.get(m) || 0) < now) {
      healthy.push(m);
    } else {
      inCooldown.push(m);
    }
  }

  return healthy.length > 0 ? [...healthy, ...inCooldown] : TEXT_MODELS;
}

function markModelCooldown(model: string, durationMs = 120000) {
  modelCooldowns.set(model, Date.now() + durationMs);
}

// Helper to detect quota/rate limit or high demand (503) error and extract clean message
function parseGeminiError(error: any): { isQuotaError: boolean; isHighDemandError: boolean; userFriendlyMessage: string } {
  let errStr = '';
  if (typeof error === 'string') {
    errStr = error;
  } else if (error?.message) {
    errStr = error.message;
  } else {
    try {
      errStr = JSON.stringify(error);
    } catch {
      errStr = String(error);
    }
  }

  let nestedCode: number | undefined;
  let nestedMsg: string | undefined;
  try {
    const parsed = JSON.parse(errStr);
    if (parsed.error) {
      nestedCode = parsed.error.code;
      nestedMsg = parsed.error.message || parsed.error.status;
    }
  } catch {}

  const isHighDemand =
    nestedCode === 503 ||
    errStr.includes('503') ||
    errStr.includes('UNAVAILABLE') ||
    errStr.includes('high demand') ||
    errStr.includes('Spikes in demand') ||
    errStr.includes('overloaded');

  const isQuota =
    nestedCode === 429 ||
    errStr.includes('429') ||
    errStr.includes('RESOURCE_EXHAUSTED') ||
    errStr.includes('quota') ||
    errStr.includes('rate-limit') ||
    errStr.includes('Too Many Requests');

  if (isHighDemand) {
    return {
      isQuotaError: false,
      isHighDemandError: true,
      userFriendlyMessage: 'I server di calcolo stanno registrando un picco di traffico. Riprova tra un istante.',
    };
  }

  if (isQuota) {
    return {
      isQuotaError: true,
      isHighDemandError: false,
      userFriendlyMessage: 'Limite temporaneo di richieste raggiunto. Attendi qualche istante e riprova.',
    };
  }

  const cleanMessage = nestedMsg || (error?.message && !error.message.startsWith('{') ? error.message : 'Il dialogo con il mentore è momentaneamente sospeso. Riprova tra poco.');

  return {
    isQuotaError: false,
    isHighDemandError: false,
    userFriendlyMessage: cleanMessage,
  };
}

// Fast timeout helper for model generation attempts
function withTimeout<T>(promise: Promise<T>, timeoutMs = 6000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Model timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// Resilient stream generation with multi-model cascade, quiet fallback, and per-model timeout
async function generateStreamWithFallback(formattedContents: any[], systemInstruction: string) {
  let lastError: any = null;
  const candidateModels = getOrderedModels();

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];

    const isGemini = model.startsWith('gemini');
    let contents = formattedContents;
    let config: any = { temperature: 0.8 };

    if (isGemini) {
      config.systemInstruction = systemInstruction;
      // Try Google Search grounding only on primary Gemini attempt
      if (i === 0) {
        try {
          return await withTimeout(
            ai.models.generateContentStream({
              model,
              contents,
              config: {
                ...config,
                tools: [{ googleSearch: {} }],
              },
            }),
            5000
          );
        } catch {
          // Silently continue to direct streaming
        }
      }
    } else {
      // For Gemma models: inject system instruction into first message
      contents = formattedContents.map((c, idx) => {
        if (idx === 0 && c.role === 'user') {
          return {
            role: 'user',
            parts: [{ text: `[Istruzioni di ruolo: ${systemInstruction}]\n\n${c.parts[0]?.text || ''}` }],
          };
        }
        return c;
      });
    }

    // Direct streaming on current model
    try {
      return await withTimeout(
        ai.models.generateContentStream({
          model,
          contents,
          config,
        }),
        7000
      );
    } catch (err: any) {
      lastError = err;
      const { isHighDemandError, isQuotaError } = parseGeminiError(err);
      if (isHighDemandError || isQuotaError || err?.message?.includes('timed out')) {
        markModelCooldown(model);
        await sleep(100);
      }
    }
  }

  throw lastError;
}

// API: Stream chat response
app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const { persona, history, message } = req.body;

  if (!persona || !message) {
    res.status(400).json({ error: 'Persona and message are required' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const formattedContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    if (Array.isArray(history)) {
      const recent = history.slice(-6);
      for (const msg of recent) {
        if (msg.text && (msg.role === 'user' || msg.role === 'model')) {
          formattedContents.push({
            role: msg.role,
            parts: [{ text: msg.text }],
          });
        }
      }
    }

    formattedContents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const systemInstruction = `Sei ${persona.name}. Rispondi sempre e solo impersonando fedelmente ${persona.name}, mantenendo il tuo stile, il tuo lessico, le tue convinzioni filosofiche e il tuo contesto storico, ma parlando fluentemente in italiano moderno e comprensibile agli studenti del 2026. Sii profondo, stimolante, socratico quando opportuno. Non rompere mai il personaggio.`;

    const streamResponse = await generateStreamWithFallback(formattedContents, systemInstruction);

    for await (const chunk of streamResponse) {
      const text = chunk.text || '';
      const sources: Array<{ title?: string; uri: string }> = [];

      const candidate = chunk.candidates?.[0];
      const searchChunks = candidate?.groundingMetadata?.groundingChunks;
      if (Array.isArray(searchChunks)) {
        for (const sc of searchChunks) {
          if (sc.web?.uri) {
            sources.push({
              title: sc.web.title || sc.web.uri,
              uri: sc.web.uri,
            });
          }
        }
      }

      if (text || sources.length > 0) {
        const payload = JSON.stringify({ text, sources });
        res.write(`data: ${payload}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    const { userFriendlyMessage } = parseGeminiError(error);
    res.write(`data: ${JSON.stringify({ error: userFriendlyMessage })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// API: Suggestions for next questions (with graceful fallback)
app.post('/api/chat/suggestions', async (req: Request, res: Response) => {
  const { personaName, recentMessages } = req.body;

  try {
    const formattedHistory = Array.isArray(recentMessages)
      ? recentMessages.slice(-3).map((m: any) => `${m.role === 'user' ? 'Studente' : personaName}: ${m.text}`).join('\n')
      : '';

    const prompt = `Sei un precettore socratico. Basandoti su questo recente scambio con ${personaName}:\n${formattedHistory}\n\nGenera esattamente 3 domande o spunti di riflessione molto brevi (massimo 10 parole l'uno), stimolanti ed essenziali, che lo studente potrebbe porre adesso a ${personaName}. Rispondi ESCLUSIVAMENTE con un array JSON di 3 stringhe, senza markdown né commenti.`;

    let responseText = '';
    const suggestionModels = ['gemma-4-26b-a4b-it', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'];
    for (const m of suggestionModels) {
      try {
        const resp = await withTimeout(
          ai.models.generateContent({
            model: m,
            contents: prompt,
          }),
          4000
        );
        if (resp.text) {
          responseText = resp.text.trim();
          break;
        }
      } catch {
        continue;
      }
    }

    let suggestions: string[] = [];
    if (responseText) {
      try {
        // Strip markdown backticks if any
        const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        suggestions = JSON.parse(cleaned);
        if (!Array.isArray(suggestions)) suggestions = [];
      } catch {
        suggestions = [];
      }
    }

    res.json({ suggestions });
  } catch {
    res.json({ suggestions: [] });
  }
});

// API: Text-to-Speech with quota protection and fallback indicator
app.post('/api/tts', async (req: Request, res: Response) => {
  const { text, voiceName = 'Fenrir' } = req.body;

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  const trimmedText = text.trim().slice(0, 800);
  const cacheKey = `${voiceName}:${trimmedText}`;
  if (audioCache.has(cacheKey)) {
    res.json({ audio: audioCache.get(cacheKey) });
    return;
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: PRIMARY_TTS_MODEL,
        contents: [
          {
            role: 'user',
            parts: [{ text: trimmedText }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      }),
      4000
    );

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      audioCache.set(cacheKey, base64Audio);
      res.json({ audio: base64Audio });
      return;
    }
  } catch {
    // Graceful fallback to client SpeechSynthesis
  }

  res.json({ audio: null, fallbackToBrowser: true });
});

// API: Audio Transcription
app.post('/api/transcribe', async (req: Request, res: Response) => {
  const { audioBase64, mimeType = 'audio/webm' } = req.body;

  if (!audioBase64) {
    res.status(400).json({ error: 'audioBase64 is required' });
    return;
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: audioBase64,
                },
              },
              {
                text: 'Trascrivi fedelmente questo audio in italiano, senza aggiungere commenti né spiegazioni.',
              },
            ],
          },
        ],
      }),
      8000
    );

    const transcription = response.text || '';
    res.json({ transcription: transcription.trim() });
  } catch (error: any) {
    const { userFriendlyMessage } = parseGeminiError(error);
    res.status(500).json({ error: userFriendlyMessage });
  }
});

// Production vs Development serving
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    // Dynamic import vite only in development
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    // In production, serve static assets from dist
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));

    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running in ${isProduction ? 'production' : 'development'} mode on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
