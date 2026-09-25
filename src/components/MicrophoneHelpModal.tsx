import React from 'react';

interface MicrophoneHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  theme?: 'light' | 'dark';
}

export const MicrophoneHelpModal: React.FC<MicrophoneHelpModalProps> = ({
  isOpen,
  onClose,
  onRetry,
  theme = 'light',
}) => {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  const handleOpenStandalone = () => {
    try {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    } catch {
      // Fallback
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className={`max-w-lg w-full rounded-2xl p-6 sm:p-7 shadow-2xl border transition-all ${
          isLight
            ? 'bg-white border-stone-200 text-stone-800 shadow-stone-400/40'
            : 'bg-[#15181e] border-white/10 text-white shadow-black/80'
        }`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-200/20 mb-5">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-gold/10 text-gold'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className={`text-lg font-serif font-bold ${isLight ? 'text-stone-900' : 'text-white'}`}>
                Come Abilitare il Microfono
              </h3>
              <p className={`text-xs ${isLight ? 'text-stone-500' : 'text-white/60'}`}>
                Guida rapida per parlare con il tuo mentore
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isLight ? 'hover:bg-stone-100 text-stone-400 hover:text-stone-700' : 'hover:bg-white/10 text-white/50 hover:text-white'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 text-sm leading-relaxed mb-6">
          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-amber-50/60 border-amber-200/70 text-amber-900' : 'bg-gold/5 border-gold/20 text-gold/90'}`}>
            <p className="font-semibold text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span>📌</span> Passo 1: Autorizza nel Browser
            </p>
            <p className="text-xs opacity-90">
              Nella barra degli indirizzi in alto, clicca sull'icona a forma di <strong>lucchetto</strong> o <strong>cursori delle impostazioni sito</strong> (a sinistra dell'URL).
            </p>
          </div>

          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-stone-50 border-stone-200' : 'bg-white/5 border-white/10'}`}>
            <p className={`font-semibold text-xs uppercase tracking-wider mb-1 ${isLight ? 'text-stone-700' : 'text-white/80'}`}>
              <span>🎙️</span> Passo 2: Attiva il Microfono
            </p>
            <p className={`text-xs ${isLight ? 'text-stone-600' : 'text-white/70'}`}>
              Trova la voce <strong>Microfono</strong> e seleziona <strong>"Consenti"</strong> (oppure togli il blocco se impostato su <em>Bloccato</em>).
            </p>
          </div>

          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-stone-50 border-stone-200' : 'bg-white/5 border-white/10'}`}>
            <p className={`font-semibold text-xs uppercase tracking-wider mb-1 ${isLight ? 'text-stone-700' : 'text-white/80'}`}>
              <span>🚀</span> Se sei in un'anteprima integrata (iFrame):
            </p>
            <p className={`text-xs ${isLight ? 'text-stone-600' : 'text-white/70'} mb-2`}>
              Alcuni browser bloccano l'accesso al microfono all'interno di finestre incorporate. Aprendo l'app in una scheda dedicata il browser ti mostrerà subito la richiesta di permesso.
            </p>
            <button
              onClick={handleOpenStandalone}
              className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                isLight
                  ? 'bg-stone-200/80 hover:bg-stone-300 text-stone-800'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <span>Apri app in una nuova scheda</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200/20">
          <button
            onClick={onClose}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              isLight ? 'hover:bg-stone-100 text-stone-600' : 'hover:bg-white/10 text-white/70'
            }`}
          >
            Chiudi
          </button>
          <button
            onClick={() => {
              onClose();
              onRetry();
            }}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 ${
              isLight
                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30'
                : 'bg-gold hover:bg-gold/90 text-obsidian shadow-gold/30'
            }`}
          >
            <span>Riprova Microfono</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
