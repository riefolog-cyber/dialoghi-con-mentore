import React, { useState } from 'react';
import { Persona } from '../types';

interface SetupScreenProps {
  onStart: (persona: Persona) => void;
  onUnlockAudio: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const VOICES = [
  { id: 'Fenrir', label: 'Fenrir', desc: 'Profondo e Autorevole (Maschile)' },
  { id: 'Charon', label: 'Charon', desc: 'Grave e Solenne (Maschile)' },
  { id: 'Puck', label: 'Puck', desc: 'Vivace ed Espressivo (Maschile)' },
  { id: 'Kore', label: 'Kore', desc: 'Calmo ed Equilibrato (Femminile)' },
  { id: 'Zephyr', label: 'Zephyr', desc: 'Amichevole e Chiaro (Femminile)' },
];

const PRESET_MENTORS = [
  { name: 'Marco Aurelio', role: 'Imperatore Stoico', voice: 'Fenrir', emoji: '🏛️' },
  { name: 'Socrate', role: 'Metodo Socratico', voice: 'Charon', emoji: '📜' },
  { name: 'Dante Alighieri', role: 'Sommo Poeta', voice: 'Puck', emoji: '🪶' },
  { name: 'Niccolò Machiavelli', role: 'Filosofo Politico', voice: 'Fenrir', emoji: '👑' },
  { name: 'Seneca', role: 'Maestro Stoico', voice: 'Charon', emoji: '🕯️' },
  { name: "Ipazia d'Alessandria", role: 'Filosofa e Matematica', voice: 'Kore', emoji: '✨' },
];

const SetupScreen: React.FC<SetupScreenProps> = ({ onStart, onUnlockAudio, theme, onToggleTheme }) => {
  const [name, setName] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLight = theme === 'light';

  const handleSelectPreset = (mentor: typeof PRESET_MENTORS[0]) => {
    setName(mentor.name);
    setSelectedVoice(mentor.voice);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // Unlock audio context synchronously during user gesture
    onUnlockAudio();

    setIsSubmitting(true);
    setTimeout(() => {
      onStart({ name: name.trim(), voiceName: selectedVoice });
      setIsSubmitting(false);
    }, 400);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 transition-colors duration-300">
      <div
        className={`max-w-xl w-full backdrop-blur-2xl shadow-2xl rounded-3xl p-6 sm:p-10 border transition-all duration-300 relative ${
          isLight
            ? 'bg-white/90 border-stone-200/90 text-stone-900 shadow-stone-300/60'
            : 'bg-obsidian/60 border-white/10 text-white shadow-black/80'
        }`}
      >
        {/* Theme Switcher in top right */}
        <div className="absolute top-5 right-5 sm:top-6 sm:right-6">
          <button
            type="button"
            onClick={onToggleTheme}
            className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold transition-all ${
              isLight
                ? 'bg-stone-100 hover:bg-stone-200 border-stone-300 text-stone-800'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
            }`}
            title={isLight ? "Passa a Tema Scuro" : "Passa a Tema Chiaro"}
          >
            {isLight ? (
              <>
                <span className="text-amber-600">🌙</span>
                <span className="hidden sm:inline">Tema Scuro</span>
              </>
            ) : (
              <>
                <span className="text-amber-300">☀️</span>
                <span className="hidden sm:inline">Tema Chiaro</span>
              </>
            )}
          </button>
        </div>

        <div className="text-center mb-7 pt-2">
          <h1 className={`text-4xl sm:text-5xl font-serif font-bold tracking-tight mb-2 ${isLight ? 'text-stone-900' : 'text-white'}`}>
            Chronos Mentor
          </h1>
          <p className={`italic font-serif text-sm sm:text-base ${isLight ? 'text-amber-800 font-medium' : 'text-gold font-light'}`}>
            "Il dialogo attraverso i secoli"
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label 
              htmlFor="character" 
              className={`block text-xs font-sans font-semibold mb-2 tracking-wider uppercase ${isLight ? 'text-stone-700' : 'text-white/70'}`}
            >
              Chi vuoi evocare oggi?
            </label>
            <input
              id="character"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. Marco Aurelio, Socrate, Dante..."
              className={`w-full px-5 py-3.5 rounded-2xl border outline-none font-sans text-base transition-all ${
                isLight
                  ? 'bg-stone-50 border-stone-300 text-stone-900 placeholder-stone-400 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 shadow-inner'
                  : 'bg-white/5 border-white/10 text-white placeholder-white/30 focus:ring-2 focus:ring-gold/50 backdrop-blur-md'
              }`}
              autoComplete="off"
            />

            {/* Quick-select chips */}
            <div className="mt-3">
              <span className={`block text-[11px] font-sans font-medium mb-2 ${isLight ? 'text-stone-500' : 'text-white/40'}`}>
                Oppure seleziona un mentore illustre:
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESET_MENTORS.map((m) => {
                  const isCurSelected = name.toLowerCase() === m.name.toLowerCase();
                  return (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => handleSelectPreset(m)}
                      className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all ${
                        isCurSelected
                          ? isLight
                            ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                            : 'bg-gold text-obsidian border-gold font-medium'
                          : isLight
                            ? 'bg-stone-100 hover:bg-stone-200 border-stone-200 text-stone-700'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
                      }`}
                    >
                      <span>{m.emoji}</span>
                      <span>{m.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <span className={`block text-xs font-sans font-semibold mb-3 tracking-wider uppercase ${isLight ? 'text-stone-700' : 'text-white/70'}`}>
              Timbro Vocale del Mentore
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {VOICES.map((voice) => {
                const isSelected = selectedVoice === voice.id;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => setSelectedVoice(voice.id)}
                    className={`p-3 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden group ${
                      isSelected
                        ? isLight
                          ? 'border-amber-600 bg-amber-500/10 shadow-[0_0_15px_rgba(184,134,11,0.25)]'
                          : 'border-gold bg-white/10 shadow-[0_0_20px_rgba(212,175,55,0.35)]'
                        : isLight
                          ? 'border-stone-200 bg-stone-50/70 hover:border-amber-400/80 hover:bg-stone-50'
                          : 'border-white/5 bg-white/5 hover:border-gold/40'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className={`font-serif font-bold text-sm ${
                        isSelected 
                          ? isLight ? 'text-amber-800' : 'text-gold' 
                          : isLight ? 'text-stone-800' : 'text-white'
                      }`}>
                        {voice.label}
                      </span>
                      {isSelected && (
                        <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-amber-600' : 'bg-gold'}`} />
                      )}
                    </div>
                    <span className={`text-[11px] block leading-tight ${isLight ? 'text-stone-600' : 'text-white/50'}`}>
                      {voice.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            onClick={onUnlockAudio}
            disabled={!name.trim() || isSubmitting}
            className={`w-full py-4 rounded-2xl font-serif font-bold text-base tracking-widest transition-all transform hover:-translate-y-0.5 shadow-lg ${
              !name.trim() || isSubmitting
                ? isLight
                  ? 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
                  : 'bg-white/5 text-white/30 cursor-not-allowed shadow-none'
                : isLight
                  ? 'bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-white shadow-amber-600/30'
                  : 'bg-gold hover:bg-gold/90 text-obsidian shadow-gold/30'
            }`}
          >
            {isSubmitting ? 'Evocazione in corso...' : 'INIZIA IL DIALOGO'}
          </button>
        </form>
        
        <div className={`mt-6 text-center text-[10px] tracking-widest uppercase font-mono ${isLight ? 'text-stone-400' : 'text-white/30'}`}>
          Chronos Engine • Voce & Pensiero
        </div>
      </div>
    </div>
  );
};

export default SetupScreen;
