// Synthesized Web Audio API Chimes & Native Speech Synthesis for Newsroom Announcements
import { IMAGE_EDITORS_LIST } from './constants';

export function playMessageChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now); // E5
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1); // A5
    gain2.gain.setValueAtTime(0.25, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.4);
  } catch (e) {
    // Audio context may be restricted before user gesture
  }
}

export function playSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Three rising notes for conclusion fanfare: C5 -> E5 -> G5
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.12;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  } catch (e) {}
}

/**
 * Normalizes and looks up the friendly spoken name of an editor
 */
export function getEditorSpokenName(editorIdOrName: string): string {
  if (!editorIdOrName) return 'Editor';
  const clean = editorIdOrName.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (clean.includes('zand')) return 'Zand';
  if (clean.includes('jamir')) return 'Jamir';
  if (clean.includes('jean')) return 'Jean';
  if (clean.includes('miudo') || clean.includes('miú')) return 'Miúdo';
  if (clean.includes('valdeilton') || clean.includes('valde')) return 'Valdeilton';

  const match = IMAGE_EDITORS_LIST.find(e => 
    e.uid.toLowerCase() === clean || 
    e.username.toLowerCase() === clean || 
    e.name.toLowerCase().includes(clean)
  );
  if (match) return match.name;

  return editorIdOrName;
}

/**
 * Speaks an alert announcing that a retranca was assigned to an editor.
 * Plays a discrete news chime before speaking.
 */
export function speakEditorAssignment(editorNameOrId: string, retrancaTitle?: string) {
  try {
    // 1. Play alerting chime first
    playMessageChime();

    // 2. Browser Web Speech API check
    if (!('speechSynthesis' in window)) return;

    const spokenName = getEditorSpokenName(editorNameOrId);
    
    // Cancellation prevents multiple overlapping utterances if multiple tasks arrive
    window.speechSynthesis.cancel();

    // Formulate a natural, professional television newsroom announcement in Portuguese
    const textToSpeak = retrancaTitle 
      ? `Atenção, ${spokenName}. Nova matéria atribuída: ${retrancaTitle}.`
      : `Atenção, ${spokenName}. Nova matéria atribuída na ilha de edição.`;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05; // Slightly brisk newsroom tempo
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Pick a Portuguese voice if available
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.startsWith('pt'));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    // Delay slightly to let the chime ring
    setTimeout(() => {
      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('Speech synthesis error:', err);
      }
    }, 280);
  } catch (err) {
    console.warn('Speech announcement error:', err);
  }
}
