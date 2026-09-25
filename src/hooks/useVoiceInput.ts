import { useState, useRef, useEffect, useCallback } from 'react';
import { transcribeAudio } from '../services/geminiService';

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

interface UseVoiceInputOptions {
  onTranscriptUpdate?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
}

export const useVoiceInput = (options?: UseVoiceInputOptions) => {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);

  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const pulseIntervalRef = useRef<number | null>(null);
  const accumulatedFinalRef = useRef<string>('');

  const isSpeechRecognitionSupported = typeof window !== 'undefined' && 
    Boolean((window as unknown as IWindow).SpeechRecognition || (window as unknown as IWindow).webkitSpeechRecognition);

  // Simulated visualizer if getUserMedia is restricted
  const startSimulatedVisualizer = () => {
    stopVisualizers();
    pulseIntervalRef.current = window.setInterval(() => {
      // Gentle pseudo-random pulse between 30 and 85
      const randomLevel = Math.floor(35 + Math.random() * 50);
      setAudioLevel(randomLevel);
    }, 150);
  };

  // Real audio analyzer
  const startAudioAnalyzer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        startSimulatedVisualizer();
        return;
      }
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch {
      startSimulatedVisualizer();
    }
  };

  const stopVisualizers = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
      pulseIntervalRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  const stopListening = useCallback(() => {
    setIsListening(false);
    stopVisualizers();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    const finalText = accumulatedFinalRef.current.trim();
    if (finalText) {
      options?.onFinalTranscript?.(finalText);
    }
  }, [options]);

  const startMediaRecorderFallback = useCallback((stream: MediaStream) => {
    audioChunksRef.current = [];
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/mp4') 
        ? 'audio/mp4' 
        : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setIsTranscribing(true);
        try {
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(',')[1];
            if (base64Data) {
              const text = await transcribeAudio(base64Data, mimeType);
              if (text) {
                setTranscript(text);
                accumulatedFinalRef.current = text;
                options?.onTranscriptUpdate?.(text);
                options?.onFinalTranscript?.(text);
              }
            }
            setIsTranscribing(false);
          };
        } catch (e) {
          console.error("Error finalizing audio transcription:", e);
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setIsListening(true);
    } catch (e) {
      console.error("MediaRecorder fallback failed:", e);
      setError("Impossibile registrare audio sul dispositivo corrente.");
      setIsListening(false);
    }
  }, [options]);

  const startListening = useCallback(async () => {
    setError(null);
    setIsPermissionDenied(false);
    setTranscript('');
    setInterimTranscript('');
    accumulatedFinalRef.current = '';

    const SpeechRec = (window as unknown as IWindow).SpeechRecognition || 
                      (window as unknown as IWindow).webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.lang = 'it-IT';
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setIsListening(true);
          setError(null);
          setIsPermissionDenied(false);
          startSimulatedVisualizer();

          // Try non-blocking real audio analyzer
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
              .then(stream => {
                mediaStreamRef.current = stream;
                stopVisualizers();
                startAudioAnalyzer(stream);
              })
              .catch(() => {
                // If getUserMedia fails (e.g. iframe policy), keep recognition running with simulated visualizer
              });
          }
        };

        recognition.onresult = (event: any) => {
          let currentInterim = '';
          let currentFinal = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const text = res[0].transcript;
            if (res.isFinal) {
              currentFinal += text + ' ';
            } else {
              currentInterim += text;
            }
          }

          if (currentFinal) {
            accumulatedFinalRef.current = (accumulatedFinalRef.current + ' ' + currentFinal).replace(/\s+/g, ' ').trim();
            setTranscript(accumulatedFinalRef.current);
            options?.onTranscriptUpdate?.(accumulatedFinalRef.current);
          }

          setInterimTranscript(currentInterim);
          if (currentInterim) {
            const combined = `${accumulatedFinalRef.current} ${currentInterim}`.trim();
            options?.onTranscriptUpdate?.(combined);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition error:", event.error);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setIsPermissionDenied(true);
            setError("Permesso microfono non concesso. Abilita il microfono nel browser.");
            stopListening();
          } else if (event.error === 'no-speech') {
            // Just silence, don't abort
          } else {
            setError(`Errore microfono: ${event.error}`);
            stopListening();
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          stopVisualizers();
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      } catch (err: any) {
        console.warn("Direct SpeechRecognition start failed, trying getUserMedia fallback:", err);
      }
    }

    // Fallback: If SpeechRecognition not available or failed to start, use getUserMedia + Gemini transcription
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsPermissionDenied(true);
      setError("Il browser non supporta la registrazione vocale.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      startAudioAnalyzer(stream);
      startMediaRecorderFallback(stream);
    } catch (err: any) {
      console.error("Microphone access denied:", err);
      setIsPermissionDenied(true);
      setError("Permesso microfono non concesso. Abilita il microfono nel browser.");
      setIsListening(false);
    }
  }, [options, startMediaRecorderFallback, stopListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const clearError = useCallback(() => {
    setError(null);
    setIsPermissionDenied(false);
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    isTranscribing,
    transcript,
    interimTranscript,
    audioLevel,
    error,
    isPermissionDenied,
    clearError,
    startListening,
    stopListening,
    toggleListening,
    isSpeechRecognitionSupported,
  };
};
