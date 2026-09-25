import { useState, useRef, useEffect, useCallback } from 'react';
import { generateSpeech } from '../services/geminiService';
import { decodeBase64, getSpeechText } from '../utils';

// Helper to check if base64 is WAV
const isWavBase64 = (base64: string) => {
  return base64.startsWith('UklGR');
};

// Helper to convert PCM to WAV
const pcmToWavBase64 = (pcmBase64: string, sampleRate: number = 24000): string => {
  if (isWavBase64(pcmBase64)) return pcmBase64;

  const pcmData = decodeBase64(pcmBase64);
  const numChannels = 1;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.length, true);

  const wavData = new Uint8Array(44 + pcmData.length);
  wavData.set(new Uint8Array(header), 0);
  wavData.set(pcmData, 44);

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < wavData.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(wavData.subarray(i, i + chunkSize)));
  }
  return window.btoa(binary);
};

// Browser speech synthesis helper to safely speak in Italian
let activeGlobalUtterance: SpeechSynthesisUtterance | null = null;

const getItalianVoice = (): SpeechSynthesisVoice | null => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(v => v.lang === 'it-IT' || v.lang === 'it_IT') ||
    voices.find(v => v.lang.toLowerCase().startsWith('it')) ||
    null
  );
};

interface QueueItem {
  id: number;
  text: string;
  audio?: HTMLAudioElement;
  status: 'pending' | 'fetching' | 'ready' | 'fallback' | 'done';
}

export const useAudioStreamer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  const sessionIdRef = useRef<number>(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const currentMessageIdRef = useRef<string | null>(null);
  const currentVoiceNameRef = useRef<string>('Fenrir');
  
  const queueRef = useRef<QueueItem[]>([]);
  const currentPlayIndexRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const allChunksFeededRef = useRef<boolean>(false);

  // Pre-populate browser voices on initialization
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }
  }, []);

  const initAudio = useCallback(() => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      audio.volume = 0;
      audio.play().catch(() => {});
    } catch {
      // Ignore
    }
  }, []);

  const stop = useCallback(() => {
    sessionIdRef.current++;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      activeGlobalUtterance = null;
    }
    queueRef.current = [];
    currentPlayIndexRef.current = 0;
    isFetchingRef.current = false;
    allChunksFeededRef.current = false;
    isPausedRef.current = false;
    currentMessageIdRef.current = null;

    setPlayingMessageId(null);
    setLoadingAudioId(null);
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (currentAudioRef.current) {
      if (currentAudioRef.current.paused) {
        currentAudioRef.current.play().catch(console.error);
        setIsPaused(false);
        isPausedRef.current = false;
      } else {
        currentAudioRef.current.pause();
        setIsPaused(true);
        isPausedRef.current = true;
      }
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
        isPausedRef.current = false;
      } else {
        window.speechSynthesis.pause();
        setIsPaused(true);
        isPausedRef.current = true;
      }
    } else if (isPlaying) {
      setIsPaused(prev => {
        isPausedRef.current = !prev;
        return !prev;
      });
    }
  }, [isPlaying]);

  // Fallback to browser SpeechSynthesis for a chunk (zero API quota usage)
  const speakWithBrowserSynthesis = useCallback((
    text: string, 
    currentSession: number, 
    onEnd: () => void
  ) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'it-IT';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const itVoice = getItalianVoice();
      if (itVoice) {
        utterance.voice = itVoice;
      }

      utterance.onstart = () => {
        if (currentSession !== sessionIdRef.current) {
          window.speechSynthesis.cancel();
          return;
        }
        setLoadingAudioId(null);
        setPlayingMessageId(currentMessageIdRef.current);
        setIsPlaying(true);
        setIsPaused(false);
      };

      utterance.onend = () => {
        if (currentSession !== sessionIdRef.current) return;
        activeGlobalUtterance = null;
        onEnd();
      };

      utterance.onerror = (e) => {
        console.warn('Speech synthesis progressing:', e);
        if (currentSession !== sessionIdRef.current) return;
        activeGlobalUtterance = null;
        onEnd();
      };

      activeGlobalUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Error invoking speech synthesis:', err);
      onEnd();
    }
  }, []);

  // Sequential audio player
  const checkAndPlayNext = useCallback((currentSession: number) => {
    if (currentSession !== sessionIdRef.current) return;
    if (isPausedRef.current) return;

    const queue = queueRef.current;
    const playIdx = currentPlayIndexRef.current;

    if (playIdx >= queue.length) {
      if (allChunksFeededRef.current) {
        // All parts played!
        stop();
      }
      return;
    }

    const currentItem = queue[playIdx];

    if (currentItem.status === 'ready' && currentItem.audio) {
      const audio = currentItem.audio;
      currentAudioRef.current = audio;

      audio.onended = () => {
        if (currentSession !== sessionIdRef.current) return;
        currentAudioRef.current = null;
        currentItem.status = 'done';
        currentPlayIndexRef.current++;
        checkAndPlayNext(currentSession);
      };

      audio.onerror = (e) => {
        console.warn('Audio chunk playback failed, fallback to synthesis:', e);
        if (currentSession !== sessionIdRef.current) return;
        currentAudioRef.current = null;
        speakWithBrowserSynthesis(currentItem.text, currentSession, () => {
          currentItem.status = 'done';
          currentPlayIndexRef.current++;
          checkAndPlayNext(currentSession);
        });
      };

      setLoadingAudioId(null);
      setPlayingMessageId(currentMessageIdRef.current);
      setIsPlaying(true);
      setIsPaused(false);

      audio.play().catch(err => {
        console.warn('audio.play() rejected, fallback to synthesis:', err);
        if (currentSession !== sessionIdRef.current) return;
        currentAudioRef.current = null;
        speakWithBrowserSynthesis(currentItem.text, currentSession, () => {
          currentItem.status = 'done';
          currentPlayIndexRef.current++;
          checkAndPlayNext(currentSession);
        });
      });
    } else if (currentItem.status === 'fallback') {
      speakWithBrowserSynthesis(currentItem.text, currentSession, () => {
        currentItem.status = 'done';
        currentPlayIndexRef.current++;
        checkAndPlayNext(currentSession);
      });
    }
  }, [stop, speakWithBrowserSynthesis]);

  // Background worker to fetch audio chunks (used for manual "LEGGI")
  const processQueue = useCallback(async (currentSession: number) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      while (currentSession === sessionIdRef.current) {
        const queue = queueRef.current;
        const nextPending = queue.find(item => item.status === 'pending');
        if (!nextPending) break;

        nextPending.status = 'fetching';
        const textToSpeak = nextPending.text;
        const voiceName = currentVoiceNameRef.current;

        try {
          const base64Audio = await generateSpeech(textToSpeak, voiceName);
          if (currentSession !== sessionIdRef.current) return;

          if (base64Audio) {
            const wavBase64 = pcmToWavBase64(base64Audio);
            const audioUrl = `data:audio/wav;base64,${wavBase64}`;
            const audio = new Audio(audioUrl);
            audio.preload = 'auto';

            nextPending.audio = audio;
            nextPending.status = 'ready';
          } else {
            // TTS unavailable or quota reached -> switch this and ALL pending items to browser synthesis
            nextPending.status = 'fallback';
            for (const item of queue) {
              if (item.status === 'pending') {
                item.status = 'fallback';
              }
            }
          }
        } catch {
          if (currentSession !== sessionIdRef.current) return;
          nextPending.status = 'fallback';
          for (const item of queue) {
            if (item.status === 'pending') {
              item.status = 'fallback';
            }
          }
        }

        // If the player is waiting on this chunk, start playback immediately!
        const itemIdx = queue.indexOf(nextPending);
        if (
          itemIdx === currentPlayIndexRef.current &&
          !currentAudioRef.current &&
          !isPausedRef.current &&
          (!window.speechSynthesis || !window.speechSynthesis.speaking)
        ) {
          checkAndPlayNext(currentSession);
        }
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [checkAndPlayNext]);

  // Start progressive streaming audio session for live incoming LLM response
  // Uses browser speech synthesis: zero network calls, zero quota usage, instant start!
  const startStreamingAudio = useCallback((_voiceName: string, messageId: string) => {
    stop();
    const currentSession = ++sessionIdRef.current;
    currentMessageIdRef.current = messageId;
    setLoadingAudioId(messageId);

    let processedChars = 0;
    let hasSentFirstSentence = false;
    let fullAccumulatedText = '';

    const pushChunk = (textChunk: string) => {
      if (currentSession !== sessionIdRef.current) return;
      const clean = getSpeechText(textChunk);
      if (!clean) return;

      queueRef.current.push({
        id: queueRef.current.length,
        text: clean,
        status: 'fallback', // Uses browser SpeechSynthesis for instant, zero-quota audio
      });

      if (
        !currentAudioRef.current &&
        !isPausedRef.current &&
        (!window.speechSynthesis || !window.speechSynthesis.speaking)
      ) {
        checkAndPlayNext(currentSession);
      }
    };

    const feed = (textSoFar: string) => {
      if (currentSession !== sessionIdRef.current) return;
      fullAccumulatedText = textSoFar;

      if (!hasSentFirstSentence) {
        // Fast start: look for the first sentence boundary
        const unread = textSoFar.slice(processedChars);
        const match = unread.match(/^([\s\S]*?[.!?:\n]+)(\s+|$)/);
        
        if (match && match[1].trim().length >= 25) {
          const firstSentence = match[1].trim();
          processedChars += match[0].length;
          hasSentFirstSentence = true;
          pushChunk(firstSentence);
        } else if (unread.length >= 140) {
          const spaceIdx = unread.lastIndexOf(' ', 140);
          const breakPoint = spaceIdx > 50 ? spaceIdx : 140;
          const firstPart = unread.slice(0, breakPoint).trim();
          processedChars += breakPoint;
          hasSentFirstSentence = true;
          pushChunk(firstPart);
        }
      }
    };

    const finish = () => {
      if (currentSession !== sessionIdRef.current) return;
      allChunksFeededRef.current = true;

      // Handle the remaining text
      const remaining = fullAccumulatedText.slice(processedChars).trim();
      if (remaining) {
        const cleanRemaining = getSpeechText(remaining);
        if (cleanRemaining) {
          pushChunk(cleanRemaining);
        }
      }

      if (queueRef.current.length === 0) {
        stop();
      } else {
        checkAndPlayNext(currentSession);
      }
    };

    return {
      feed,
      finish,
      cancel: stop,
    };
  }, [stop, checkAndPlayNext]);

  // Play audio for a completed message (manual click on "LEGGI")
  const play = useCallback((text: string, voiceName: string, messageId: string) => {
    if (playingMessageId === messageId && isPlaying) {
      stop();
      return;
    }

    stop();
    const currentSession = ++sessionIdRef.current;
    currentMessageIdRef.current = messageId;
    currentVoiceNameRef.current = voiceName;
    setLoadingAudioId(messageId);

    const clean = getSpeechText(text);
    if (!clean) {
      setLoadingAudioId(null);
      return;
    }

    // Split into sentences / manageable blocks
    const chunks: string[] = [];
    if (clean.length > 300) {
      const firstSentenceMatch = clean.match(/^([\s\S]*?[.!?:\n]+)([\s\S]*)$/);
      if (firstSentenceMatch && firstSentenceMatch[1].trim().length >= 20) {
        chunks.push(firstSentenceMatch[1].trim());
        const rest = firstSentenceMatch[2].trim();
        if (rest) {
          chunks.push(rest);
        }
      } else {
        chunks.push(clean);
      }
    } else {
      chunks.push(clean);
    }

    allChunksFeededRef.current = true;
    queueRef.current = chunks.map((chunkText, idx) => ({
      id: idx,
      text: chunkText,
      status: 'pending',
    }));

    processQueue(currentSession);
  }, [stop, playingMessageId, isPlaying, processQueue]);

  return {
    isPlaying,
    isPaused,
    loadingAudioId,
    playingMessageId,
    play,
    startStreamingAudio,
    stop,
    togglePause,
    initAudio,
  };
};
