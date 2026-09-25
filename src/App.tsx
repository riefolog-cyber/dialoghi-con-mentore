import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import SetupScreen from './components/SetupScreen';
import ChatMessage from './components/ChatMessage';
import { MicrophoneHelpModal } from './components/MicrophoneHelpModal';
import { Persona, Message, GroundingSource } from './types';
import { startChat, sendMessageStream, getSuggestions } from './services/geminiService';
import { useAudioStreamer } from './hooks/useAudioStreamer';
import { useVoiceInput } from './hooks/useVoiceInput';

// Generate a random ID
const generateId = () => Math.random().toString(36).substr(2, 9);

function App() {
  // Theme state: defaults to 'light' per user request, with localStorage persistence
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('chronos_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  const [persona, setPersona] = useState<Persona | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isAutoPlayEnabledState, setIsAutoPlayEnabledState] = useState(true);
  const [isMicHelpOpen, setIsMicHelpOpen] = useState(false);
  const isAutoPlayEnabledRef = useRef(true);

  // Sync theme with HTML class
  useEffect(() => {
    localStorage.setItem('chronos_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const setIsAutoPlayEnabled = (val: boolean) => {
    setIsAutoPlayEnabledState(val);
    isAutoPlayEnabledRef.current = val;
    if (!val) {
      stop(); // Stop audio if user turns it off
    }
  };
  
  // Custom Hook for Audio Logic
  const { 
    play, 
    startStreamingAudio,
    stop, 
    togglePause, 
    initAudio,
    isPlaying, 
    isPaused, 
    loadingAudioId, 
    playingMessageId 
  } = useAudioStreamer();

  // Voice Input Hook for speaking directly with the mentor
  const {
    isListening,
    isTranscribing,
    audioLevel,
    error: voiceError,
    isPermissionDenied,
    clearError,
    toggleListening,
    stopListening,
  } = useVoiceInput({
    onTranscriptUpdate: (text) => {
      setInputText(text);
    },
    onFinalTranscript: (text) => {
      setInputText(text);
    },
  });

  const handleMicClick = () => {
    initAudio(); // Unlock audio context on user action
    clearError();
    if (isPlaying || loadingAudioId) {
      stop();
    }
    toggleListening();
  };
  
  // Refs
  const chatRef = useRef<any>(null); 
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Smart Auto-Scroll Logic
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    shouldAutoScrollRef.current = isAtBottom;
  };

  useLayoutEffect(() => {
    if (shouldAutoScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, suggestions]);

  const DEFAULT_SUGGESTIONS: Record<string, string[]> = {
    'Marco Aurelio': [
      'Come mantenere la serenità nelle avversità?',
      'Qual è il vero senso del dovere?',
      'Come accettare ciò che sfugge al nostro controllo?'
    ],
    'Dante': [
      'Cosa simboleggia per te la selva oscura?',
      'Qual è il legame profondo tra amore e conoscenza?',
      'Come trovare luce nei momenti di disorientamento?'
    ],
    'Machiavelli': [
      'È meglio essere amati o temuti da chi governa?',
      'Come la Fortuna influisce sulla vita umana?',
      'Qual è la virtù necessaria nei tempi di crisi?'
    ],
    'Socrate': [
      'Perché una vita senza esame non è degna di essere vissuta?',
      'Come distinguere la vera sapienza dall\'illusione?',
      'Che cos\'è la virtù dell\'anima?'
    ],
    'Seneca': [
      'Come smettere di sprecare il nostro tempo prezioso?',
      'Qual è il rimedio contro l\'ansia e l\'inquietudine?',
      'In che cosa consiste la vera libertà interiore?'
    ]
  };

  const getInitialSuggestions = (name: string): string[] => {
    for (const [key, list] of Object.entries(DEFAULT_SUGGESTIONS)) {
      if (name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(name.toLowerCase())) {
        return list;
      }
    }
    return [
      `Qual è la lezione fondamentale della tua vita, ${name}?`,
      `Cosa consiglieresti a uno studente di oggi?`,
      `Qual è la virtù più importante per vivere rettamente?`
    ];
  };

  useEffect(() => {
    let isActive = true;
    let timer: any = null;

    const fetchSuggestionsDebounced = async () => {
      // Don't waste quota on the initial greeting or while typing
      if (!persona || isTyping || messages.length < 3) return;
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'model') {
        // Debounce by 2 seconds to not conflict with active user typing or stream
        timer = setTimeout(async () => {
          if (!isActive) return;
          const newSuggestions = await getSuggestions(persona.name, messages);
          if (isActive && newSuggestions.length > 0) {
            setSuggestions(newSuggestions);
          }
        }, 2000);
      }
    };

    fetchSuggestionsDebounced();
    return () => {
      isActive = false;
      if (timer) clearTimeout(timer);
    };
  }, [messages, isTyping, persona]);

  const handleStart = async (selectedPersona: Persona) => {
    initAudio(); // Unlock audio context on user interaction
    setPersona(selectedPersona);
    setSuggestions(getInitialSuggestions(selectedPersona.name));
    chatRef.current = startChat(selectedPersona);
    
    setIsTyping(true);
    const msgId = generateId();
    const initialAiMsg: Message = {
      id: msgId,
      role: 'model',
      text: '',
      timestamp: new Date()
    };
    setMessages([initialAiMsg]);

    const audioSession = isAutoPlayEnabledRef.current
      ? startStreamingAudio(selectedPersona.voiceName, msgId)
      : null;

    try {
      const stream = sendMessageStream(
        chatRef.current,
        `Presentati brevemente come ${selectedPersona.name}, accogliendo gli studenti nell'anno 2026.`
      );
      let fullText = '';

      for await (const chunk of stream) {
        if (chunk.text) {
          fullText += chunk.text;
          if (audioSession) {
            audioSession.feed(fullText);
          }
          setMessages(prev =>
            prev.map(msg =>
              msg.id === msgId ? { ...msg, text: fullText } : msg
            )
          );
        }
      }

      if (audioSession) {
        audioSession.finish();
      }
    } catch (e) {
      console.error(e);
      if (audioSession) {
        audioSession.cancel();
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    initAudio(); // Keep audio context active on user interaction
    if (isListening) {
      stopListening();
    }
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() || !chatRef.current) return;

    // Stop audio if user interrupts with a new message
    if (isPlaying || loadingAudioId) {
      stop();
    }

    setInputText('');
    setSuggestions([]);
    
    // Add user message
    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      text: textToSend,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    shouldAutoScrollRef.current = true; // Force scroll on user send
    setIsTyping(true);

    // Create a placeholder for the AI message
    const aiMsgId = generateId();
    const initialAiMsg: Message = {
      id: aiMsgId,
      role: 'model',
      text: '', // Start empty
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, initialAiMsg]);

    // Start progressive audio stream if auto-play is enabled
    const audioSession = (isAutoPlayEnabledRef.current && persona)
      ? startStreamingAudio(persona.voiceName, aiMsgId)
      : null;

    try {
      // Stream the response
      const stream = sendMessageStream(chatRef.current, textToSend);
      
      let fullText = '';
      let accumulatedSources: GroundingSource[] = [];

      for await (const chunk of stream) {
        if (chunk.text) {
          fullText += chunk.text;
          if (audioSession) {
            audioSession.feed(fullText);
          }
        }
        if (chunk.sources) {
          const newSources = chunk.sources.filter(
            src => !accumulatedSources.some(existing => existing.uri === src.uri)
          );
          accumulatedSources = [...accumulatedSources, ...newSources];
        }

        setMessages(prev => 
          prev.map(msg => 
            msg.id === aiMsgId ? { 
              ...msg, 
              text: fullText,
              groundingSources: accumulatedSources.length > 0 ? accumulatedSources : undefined
            } : msg
          )
        );
      }
      
      if (audioSession) {
        audioSession.finish();
      }
    } catch (error) {
      console.error("Failed to get response", error);
      if (audioSession) {
        audioSession.cancel();
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handlePlayClick = useCallback((text: string, messageId: string) => {
    if (!persona) return;
    if (playingMessageId === messageId && isPlaying) {
      stop();
    } else {
      play(text, persona.voiceName, messageId);
    }
  }, [persona, play, playingMessageId, isPlaying, stop]);

  const handleResetMentor = () => {
    stop();
    setPersona(null);
    setMessages([]);
    setSuggestions([]);
    setInputText('');
    chatRef.current = null;
  };

  const isLight = theme === 'light';

  if (!persona) {
    return (
      <SetupScreen 
        onStart={handleStart} 
        onUnlockAudio={initAudio} 
        theme={theme} 
        onToggleTheme={toggleTheme} 
      />
    );
  }

  return (
    <div className={`flex flex-col h-screen transition-colors duration-300 ${
      isLight ? 'bg-[#fbf9f5] text-stone-900' : 'bg-obsidian text-text-light'
    }`}>
      {/* Header */}
      <header className={`p-4 sticky top-0 z-10 shadow-sm flex items-center justify-between backdrop-blur-xl border-b transition-colors ${
        isLight 
          ? 'bg-white/85 border-stone-200/90 text-stone-900' 
          : 'bg-obsidian/80 border-white/10 text-white'
      }`}>
        <div className="flex items-center gap-3">
          <div>
            <h1 className={`text-xl font-serif font-bold tracking-wider uppercase ${isLight ? 'text-stone-900' : 'text-white'}`}>
              {persona.name}
            </h1>
            <p className={`text-xs uppercase tracking-widest font-sans ${isLight ? 'text-amber-800 font-semibold' : 'text-gold'}`}>
              Mentore Storico • 2026
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`p-2 sm:px-3 sm:py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all ${
              isLight
                ? 'bg-stone-100 hover:bg-stone-200 border-stone-300 text-stone-800'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
            }`}
            title={isLight ? "Passa al tema scuro" : "Passa al tema chiaro"}
          >
            {isLight ? (
              <>
                <span className="text-amber-700">🌙</span>
                <span className="hidden md:inline">Scuro</span>
              </>
            ) : (
              <>
                <span className="text-amber-300">☀️</span>
                <span className="hidden md:inline">Chiaro</span>
              </>
            )}
          </button>

          {/* Auto-Play Toggle */}
          <button 
            onClick={() => setIsAutoPlayEnabled(!isAutoPlayEnabledState)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-sans font-medium transition-all border ${
              isAutoPlayEnabledState 
                ? isLight
                  ? 'bg-amber-100/80 border-amber-300 text-amber-900'
                  : 'bg-gold/20 border-gold/30 text-gold hover:bg-gold/30' 
                : isLight
                  ? 'bg-stone-100 border-stone-200 text-stone-500 hover:bg-stone-200'
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
            }`}
            title={isAutoPlayEnabledState ? "Disattiva lettura automatica" : "Attiva lettura automatica"}
          >
            {isAutoPlayEnabledState ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
            <span className="hidden sm:inline">Voce</span>
          </button>

          {/* Change Mentor */}
          <button 
            onClick={handleResetMentor}
            className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors font-sans ${
              isLight ? 'text-stone-500 hover:text-stone-900 hover:bg-stone-100' : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
            title="Cambia personaggio o esci"
          >
            Cambia
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Chat Area */}
        <main 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide"
        >
          <div className="max-w-3xl mx-auto">
            {messages.map((msg) => (
              <ChatMessage 
                key={msg.id} 
                message={msg} 
                personaName={persona.name}
                onPlayAudio={handlePlayClick}
                onTogglePause={togglePause}
                onStopAudio={stop}
                isPlaying={playingMessageId === msg.id}
                isPaused={isPaused}
                isLoadingAudio={loadingAudioId === msg.id}
                theme={theme}
              />
            ))}
            
            {isTyping && (
              <div className="flex justify-start mb-6">
                {messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                  <div className={`rounded-2xl p-4 flex items-center space-x-2 border ${
                    isLight 
                      ? 'bg-white border-stone-200 shadow-sm' 
                      : 'bg-white/5 border-white/10'
                  }`}>
                    <div className={`w-2 h-2 rounded-full animate-bounce ${isLight ? 'bg-amber-600/60' : 'bg-white/30'}`}></div>
                    <div className={`w-2 h-2 rounded-full animate-bounce delay-150 ${isLight ? 'bg-amber-600/60' : 'bg-white/30'}`}></div>
                    <div className={`w-2 h-2 rounded-full animate-bounce delay-300 ${isLight ? 'bg-amber-600/60' : 'bg-white/30'}`}></div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Area */}
        <aside className={`w-full md:w-80 lg:w-96 flex flex-col backdrop-blur-xl border-t md:border-t-0 md:border-l transition-colors ${
          isLight 
            ? 'bg-white/70 border-stone-200/90 shadow-xl' 
            : 'bg-obsidian/40 border-white/10'
        }`}>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-end">
            
            {/* Suggestions */}
            {suggestions.length > 0 && !isTyping && (
              <div className="flex flex-col gap-2 mb-4">
                <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isLight ? 'text-stone-500' : 'text-white/30'}`}>
                  Spunti di Riflessione
                </span>
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(undefined, suggestion)}
                    className={`text-sm py-2.5 px-3.5 rounded-xl border transition-all text-left ${
                      isLight
                        ? 'bg-white hover:bg-amber-50/80 text-stone-800 border-stone-200/90 hover:border-amber-400 shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/5'
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            
            {/* Active Listening Indicator with Audio Waves */}
            {isListening && (
              <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${isLight ? 'text-red-700' : 'text-red-300'}`}>
                      In ascolto... Parla ora
                    </span>
                    <span className={`text-[10px] ${isLight ? 'text-red-600/70' : 'text-white/50'}`}>
                      Trascrizione in tempo reale
                    </span>
                  </div>
                </div>
                {/* Audio visualizer bars */}
                <div className="flex items-end gap-1 h-5 px-1">
                  <span className="w-1 bg-red-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(4, Math.min(20, (audioLevel / 100) * 20))}px` }}></span>
                  <span className="w-1 bg-red-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(6, Math.min(20, (audioLevel / 100) * 24))}px` }}></span>
                  <span className="w-1 bg-red-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(4, Math.min(20, (audioLevel / 100) * 16))}px` }}></span>
                  <span className="w-1 bg-red-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(8, Math.min(20, (audioLevel / 100) * 22))}px` }}></span>
                </div>
              </div>
            )}

            {isTranscribing && (
              <div className={`mb-3 p-2.5 rounded-xl flex items-center gap-2 text-xs border animate-pulse ${
                isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-gold/10 border-gold/30 text-gold'
              }`}>
                <div className={`w-3 h-3 border-2 rounded-full animate-spin border-t-transparent ${isLight ? 'border-amber-700' : 'border-gold'}`}></div>
                <span>Trascrizione voce in corso...</span>
              </div>
            )}

            {/* Microphone Permission Warning & Guide Banner */}
            {(voiceError || isPermissionDenied) && (
              <div className={`mb-3 p-3 rounded-2xl border flex flex-col gap-2 ${
                isLight 
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950' 
                  : 'bg-red-950/40 border-red-500/30 text-red-200'
              }`}>
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-base leading-none">⚠️</span>
                  <div className="flex-1">
                    <p className="font-semibold">Microfono bloccato o non autorizzato</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Abilita il microfono nel browser per parlare direttamente con il mentore.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-current/10">
                  <button
                    type="button"
                    onClick={() => setIsMicHelpOpen(true)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold underline transition-colors ${
                      isLight ? 'hover:text-amber-800' : 'hover:text-white'
                    }`}
                  >
                    Come abilitare il microfono →
                  </button>
                  <button
                    type="button"
                    onClick={handleMicClick}
                    className={`ml-auto px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                      isLight
                        ? 'bg-white hover:bg-stone-50 border-amber-300 text-amber-900 shadow-xs'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                    }`}
                  >
                    Riprova
                  </button>
                </div>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSend} className="relative flex flex-col">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={isListening ? "Sto ascoltando la tua voce..." : "Fai una domanda o premi il microfono..."}
                className={`w-full p-4 pb-16 pr-24 rounded-2xl border outline-none font-sans text-sm resize-none min-h-[140px] transition-all ${
                  isLight
                    ? 'bg-white border-stone-300 text-stone-900 placeholder-stone-400 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 shadow-sm'
                    : 'bg-white/5 border-white/10 text-white placeholder-white/30 focus:ring-2 focus:ring-gold/50 backdrop-blur-md'
                }`}
                disabled={isTyping || isTranscribing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {/* Microphone Button */}
                <button
                  type="button"
                  onClick={handleMicClick}
                  disabled={isTyping || isTranscribing}
                  className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
                    isListening
                      ? 'bg-red-600 text-white shadow-[0_0_18px_rgba(220,38,38,0.7)] animate-pulse'
                      : isLight
                        ? 'bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-800 border border-stone-300 shadow-xs'
                        : 'bg-white/5 hover:bg-gold/20 text-white/70 hover:text-gold border border-white/10 hover:border-gold/40'
                  }`}
                  title={isListening ? "Ferma ascolto vocale" : "Parla con il mentore (Microfono)"}
                >
                  {isListening ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isTyping || isTranscribing}
                  className={`p-2.5 rounded-xl transition-all ${
                    !inputText.trim() || isTyping || isTranscribing
                      ? 'text-stone-400 bg-transparent opacity-40 cursor-not-allowed' 
                      : isLight
                        ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/30'
                        : 'bg-gold text-obsidian hover:bg-white shadow-[0_0_15px_rgba(212,175,55,0.4)]'
                  }`}
                  title="Invia domanda"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </form>
            
            <div className="text-center mt-5">
              <span className={`text-[10px] tracking-widest uppercase font-mono ${isLight ? 'text-stone-400' : 'text-white/20'}`}>
                Chronos Engine v2026
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Microphone Help Modal */}
      <MicrophoneHelpModal
        isOpen={isMicHelpOpen}
        onClose={() => setIsMicHelpOpen(false)}
        onRetry={handleMicClick}
        theme={theme}
      />
    </div>
  );
}

export default App;
