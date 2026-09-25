import { Persona, GroundingSource, Message } from '../types';

export interface ChatSession {
  persona: Persona;
  history: Array<{ role: 'user' | 'model'; text: string }>;
}

export const startChat = (persona: Persona): ChatSession => {
  return {
    persona,
    history: [],
  };
};

export const sendMessage = async (chat: ChatSession, text: string): Promise<string> => {
  try {
    let fullText = '';
    for await (const chunk of sendMessageStream(chat, text)) {
      if (chunk.text) {
        fullText += chunk.text;
      }
    }
    return fullText || 'I miei pensieri sono momentaneamente sospesi. Riprova tra poco.';
  } catch (error) {
    console.error('Error sending message:', error);
    return 'Si è verificata una breve pausa nel dialogo attraverso i secoli.';
  }
};

export const getSuggestions = async (personaName: string, recentMessages: Message[]): Promise<string[]> => {
  try {
    const formatted = recentMessages.slice(-3).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    const res = await fetch('/api/chat/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personaName,
        recentMessages: formatted,
      }),
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return Array.isArray(data.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  }
};

export interface StreamResult {
  text?: string;
  sources?: GroundingSource[];
  error?: string;
}

export async function* sendMessageStream(chat: ChatSession, text: string): AsyncGenerator<StreamResult> {
  let fullAccumulatedText = '';

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        persona: chat.persona,
        history: chat.history,
        message: text,
      }),
    });

    if (!response.ok || !response.body) {
      yield { text: '\n[Il mentore sta riflettendo intensamente. Attendi qualche istante e riprova.]' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') {
          break;
        }

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            let errorMsg = parsed.error;
            if (typeof errorMsg === 'string') {
              try {
                const nested = JSON.parse(errorMsg);
                if (nested.error?.message) {
                  errorMsg = nested.error.message;
                }
              } catch {}

              if (errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE') || errorMsg.includes('high demand') || errorMsg.includes('Spikes in demand')) {
                errorMsg = 'I server sono al momento molto richiesti. I mentori riprenderanno tra pochi istanti.';
              } else if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota')) {
                errorMsg = 'Limite temporaneo di richieste raggiunto. Attendi qualche istante e riprova.';
              }
            }
            yield { text: `\n\n*${errorMsg}*`, error: errorMsg };
          } else {
            if (parsed.text) {
              fullAccumulatedText += parsed.text;
            }
            yield {
              text: parsed.text,
              sources: parsed.sources && parsed.sources.length > 0 ? parsed.sources : undefined,
            };
          }
        } catch {
          // If not JSON, ignore
        }
      }
    }

    // Save exchange to local history for multi-turn context
    if (fullAccumulatedText) {
      chat.history.push({ role: 'user', text });
      chat.history.push({ role: 'model', text: fullAccumulatedText });
    }
  } catch (error: any) {
    console.error('Error in text stream:', error);
    yield { text: '\n[Comunicazione con il mentore momentaneamente interrotta. Riprova tra poco.]' };
  }
}

export const generateSpeech = async (text: string, voiceName: string): Promise<string | null> => {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceName }),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data.audio || null;
  } catch {
    return null;
  }
};

export const transcribeAudio = async (audioBase64: string, mimeType: string = 'audio/webm'): Promise<string> => {
  try {
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType }),
    });

    if (!res.ok) {
      return '';
    }

    const data = await res.json();
    return data.transcript || '';
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return '';
  }
};
