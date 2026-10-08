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

export function playUrgentChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Quick, crisp two-tone alert (A5 -> D6) ~160ms total
    const tones = [880, 1174.66];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.08;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.22, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.12);
    });
  } catch (e) {}
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
  if (clean.includes('vagner') || clean.includes('miudo') || clean.includes('miú')) return 'Vagner';
  if (clean.includes('valdeilton') || clean.includes('valde')) return 'Valdeilton';

  const match = IMAGE_EDITORS_LIST.find(e => 
    e.uid.toLowerCase() === clean || 
    e.username.toLowerCase() === clean || 
    e.name.toLowerCase().includes(clean)
  );
  if (match) return match.name;

  return editorIdOrName;
}

function speakUtterance(text: string, rate: number = 1.05) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.startsWith('pt'));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }
}

/**
 * Speaks an alert announcing that a retranca was assigned to an editor.
 * If isUrgent is true, explicitly stresses urgency in the spoken phrase.
 */
export function speakEditorAssignment(editorNameOrId: string, retrancaTitle?: string, isUrgent: boolean = false) {
  try {
    if (isUrgent) {
      playUrgentChime();
    } else {
      playMessageChime();
    }

    const spokenName = getEditorSpokenName(editorNameOrId).toUpperCase();
    const cleanTitle = (retrancaTitle || '').trim().toUpperCase();

    // Concise, direct phrasing requested: "ATENÇÃO, JEAN! MATERIAL URGENTE ATRIBUÍDO A VOCÊ. [RETRANCA]"
    let textToSpeak = '';
    if (isUrgent) {
      textToSpeak = cleanTitle 
        ? `Atenção, ${spokenName}! Material urgente atribuído a você: ${cleanTitle}.`
        : `Atenção, ${spokenName}! Material urgente atribuído a você.`;
    } else {
      textToSpeak = cleanTitle 
        ? `Atenção, ${spokenName}! Matéria atribuída a você: ${cleanTitle}.`
        : `Atenção, ${spokenName}! Matéria atribuída a você.`;
    }

    setTimeout(() => {
      speakUtterance(textToSpeak, isUrgent ? 1.12 : 1.08);
    }, isUrgent ? 200 : 150);
  } catch (err) {
    console.warn('Speech announcement error:', err);
  }
}

/**
 * Distinct bright chime for user @mentions in chat
 */
export function playMentionChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Distinct triple-bell chime with harmonics (G5 -> C6 -> E6)
    const tones = [783.99, 1046.50, 1318.51];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });
  } catch (e) {}
}

/**
 * Spoken alert when the user is tagged with @mention in the newsroom chat
 */
export function speakUserMentionAnnouncement(senderName?: string) {
  try {
    playMentionChime();
    const who = senderName ? `por ${senderName}` : 'da redação';
    const textToSpeak = `Atenção, você foi mencionado no chat ${who}.`;
    setTimeout(() => {
      speakUtterance(textToSpeak, 1.05);
    }, 450);
  } catch (err) {
    console.warn('Speech mention error:', err);
  }
}

/**
 * Broadcast voice alert to ALL editors when an UNASSIGNED URGENT retranca is created in the queue!
 */
export function speakUnassignedUrgentAnnouncement(retrancaTitle?: string) {
  try {
    playUrgentChime();

    const cleanTitle = (retrancaTitle || '').trim().toUpperCase();
    const textToSpeak = cleanTitle
      ? `Atenção! Material urgente na fila aberta: ${cleanTitle}.`
      : `Atenção! Material urgente na fila aberta.`;

    setTimeout(() => {
      speakUtterance(textToSpeak, 1.12);
    }, 200);
  } catch (err) {
    console.warn('Speech announcement error:', err);
  }
}
