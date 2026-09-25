import React from 'react';
import { Message } from '../types';
import { getSpeechText } from '../utils';

interface ChatMessageProps {
  message: Message;
  personaName: string;
  onPlayAudio: (text: string, id: string) => void;
  onTogglePause: () => void;
  onStopAudio: () => void;
  isPlaying: boolean;
  isPaused: boolean;
  isLoadingAudio: boolean;
  theme?: 'light' | 'dark';
}

const ChatMessage: React.FC<ChatMessageProps> = React.memo(({
  message,
  personaName,
  onPlayAudio,
  onTogglePause,
  onStopAudio,
  isPlaying,
  isPaused,
  isLoadingAudio,
  theme = 'light',
}) => {
  const isUser = message.role === 'user';
  const isLight = theme === 'light';

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] md:max-w-[75%] rounded-2xl p-5 relative backdrop-blur-md border transition-all ${
          isUser
            ? isLight
              ? 'bg-amber-100/90 border-amber-300/80 text-stone-900 font-sans rounded-tr-none shadow-sm'
              : 'bg-gold/10 border-gold/20 text-white font-sans rounded-tr-none'
            : isLight
              ? 'bg-white border-stone-200/90 text-stone-900 font-serif rounded-tl-none shadow-md shadow-stone-200/70 animate-message-fade'
              : 'bg-white/5 border-white/10 text-white/90 font-serif rounded-tl-none animate-message-fade'
        }`}
      >
        {!isUser && (
          <div className={`flex justify-between items-center mb-2.5 pb-1.5 border-b ${isLight ? 'border-stone-200' : 'border-white/10'}`}>
            <div className={`text-xs font-sans font-bold uppercase tracking-widest ${isLight ? 'text-amber-800' : 'text-gold'}`}>
              {personaName}
            </div>
            {/* Audio Waveform Animation */}
            {isPlaying && !isPaused && (
              <div className="flex items-end space-x-[2px] h-3">
                <div className={`w-[2px] animate-[bounce_0.8s_infinite] h-2 ${isLight ? 'bg-amber-600' : 'bg-gold'}`}></div>
                <div className={`w-[2px] animate-[bounce_1.1s_infinite] h-3 ${isLight ? 'bg-amber-600' : 'bg-gold'}`}></div>
                <div className={`w-[2px] animate-[bounce_1.3s_infinite] h-1 ${isLight ? 'bg-amber-600' : 'bg-gold'}`}></div>
                <div className={`w-[2px] animate-[bounce_0.9s_infinite] h-2 ${isLight ? 'bg-amber-600' : 'bg-gold'}`}></div>
                <div className={`w-[2px] animate-[bounce_1.2s_infinite] h-3 ${isLight ? 'bg-amber-600' : 'bg-gold'}`}></div>
              </div>
            )}
          </div>
        )}
        
        <div className={`whitespace-pre-wrap leading-relaxed ${isLight && !isUser ? 'text-stone-800' : ''}`}>
          {message.text ? (
            message.text
          ) : (
            <div className="flex items-center gap-2 py-1 text-sm font-sans italic opacity-75">
              <span className={`inline-block w-2 h-2 rounded-full animate-bounce ${isLight ? 'bg-amber-600' : 'bg-gold'}`}></span>
              <span className={`inline-block w-2 h-2 rounded-full animate-bounce delay-150 ${isLight ? 'bg-amber-600' : 'bg-gold'}`}></span>
              <span className={`inline-block w-2 h-2 rounded-full animate-bounce delay-300 ${isLight ? 'bg-amber-600' : 'bg-gold'}`}></span>
              <span className="ml-1 text-xs">Il mentore sta riflettendo...</span>
            </div>
          )}
        </div>

        {/* Display Grounding Sources if present */}
        {!isUser && message.groundingSources && message.groundingSources.length > 0 && (
          <div className={`mt-4 pt-3 border-t ${isLight ? 'border-stone-200' : 'border-white/10'}`}>
            <p className={`text-[10px] uppercase font-bold mb-1 tracking-wider ${isLight ? 'text-stone-500' : 'text-white/40'}`}>
              Fonti Consultate:
            </p>
            <div className="flex flex-wrap gap-2">
              {message.groundingSources.map((source, idx) => (
                <a 
                  key={idx}
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    isLight
                      ? 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200 hover:text-stone-900'
                      : 'bg-white/5 text-white/60 border-white/5 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {source.title || source.uri}
                </a>
              ))}
            </div>
          </div>
        )}

        {!isUser && message.text && (
          <div className={`mt-4 pt-2.5 border-t flex items-center justify-end gap-2 ${isLight ? 'border-stone-100' : 'border-white/10'}`}>
            {isPlaying ? (
              <>
                <button
                  onClick={onTogglePause}
                  aria-label={isPaused ? "Riprendi audio" : "Pausa audio"}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${
                    isPaused
                      ? isLight
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-gold text-obsidian hover:bg-gold/90'
                      : isLight
                        ? 'bg-stone-100 text-stone-800 hover:bg-stone-200 border border-stone-200'
                        : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {isPaused ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span>{isPaused ? 'RIPRENDI' : 'PAUSA'}</span>
                </button>

                <button
                  onClick={onStopAudio}
                  aria-label="Ferma audio"
                  className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                    isLight
                      ? 'bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-800 border border-stone-200'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Ferma lettura"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                onClick={() => onPlayAudio(getSpeechText(message.text), message.id)}
                disabled={isLoadingAudio}
                aria-label="Leggi messaggio ad alta voce"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  isLight
                    ? 'bg-stone-100 text-stone-700 hover:bg-amber-100 hover:text-amber-900 border border-stone-200 shadow-sm'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {isLoadingAudio ? (
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
                <span>{isLoadingAudio ? '...' : 'LEGGI'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatMessage;
