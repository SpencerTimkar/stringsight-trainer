/**
 * Musical note mapping and validation
 * Converts frequencies to notes and validates guitar positions
 */

export interface Note {
  midi: number;
  noteName: string;
  octave: number;
  frequency: number;
  cents: number;
}

export interface GuitarPosition {
  string: number;
  fret: number;
  note: Note;
}

export interface ValidationResult {
  isCorrect: boolean;
  cents: number;
  feedback: string;
  normalizedFreq: number;
  octaveAdjusted: boolean;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Standard tuning: E2, A2, D3, G3, B3, E4
const STANDARD_TUNING = [
  { string: 6, baseMidi: 40, baseName: 'E', octave: 2 }, // E2
  { string: 5, baseMidi: 45, baseName: 'A', octave: 2 }, // A2
  { string: 4, baseMidi: 50, baseName: 'D', octave: 3 }, // D3
  { string: 3, baseMidi: 55, baseName: 'G', octave: 3 }, // G3
  { string: 2, baseMidi: 59, baseName: 'B', octave: 3 }, // B3
  { string: 1, baseMidi: 64, baseName: 'E', octave: 4 }, // E4
];

/**
 * Convert frequency to MIDI note number
 */
export function frequencyToMidi(frequency: number): number {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

/**
 * Convert MIDI note to frequency (A4 = 440 Hz)
 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Calculate cents offset from perfect pitch
 */
export function calculateCents(frequency: number, targetMidi: number): number {
  const targetFreq = midiToFrequency(targetMidi);
  return 1200 * Math.log2(frequency / targetFreq);
}

/**
 * Get note name from MIDI number
 */
export function midiToNoteName(midi: number, useFlats: boolean = false): string {
  const noteIndex = midi % 12;
  return useFlats ? NOTE_NAMES_FLAT[noteIndex] : NOTE_NAMES[noteIndex];
}

/**
 * Get octave from MIDI number
 */
export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/**
 * Parse frequency into musical note
 */
export function parseFrequency(frequency: number, useFlats: boolean = false): Note {
  const midi = frequencyToMidi(frequency);
  const exactFreq = midiToFrequency(midi);
  const cents = calculateCents(frequency, midi);
  
  return {
    midi,
    noteName: midiToNoteName(midi, useFlats),
    octave: midiToOctave(midi),
    frequency: exactFreq,
    cents
  };
}

/**
 * Generate all guitar positions for enabled strings and fret range
 */
export function generatePositions(
  enabledStrings: number[],
  minFret: number = 0,
  maxFret: number = 12
): GuitarPosition[] {
  const positions: GuitarPosition[] = [];
  
  for (const stringInfo of STANDARD_TUNING) {
    if (!enabledStrings.includes(stringInfo.string)) continue;
    
    for (let fret = minFret; fret <= maxFret; fret++) {
      const midi = stringInfo.baseMidi + fret;
      const frequency = midiToFrequency(midi);
      
      positions.push({
        string: stringInfo.string,
        fret,
        note: {
          midi,
          noteName: midiToNoteName(midi),
          octave: midiToOctave(midi),
          frequency,
          cents: 0
        }
      });
    }
  }
  
  return positions;
}

/**
 * Get the target position for a specific string and note
 * Enforces lower-octave rule: only accept the lowest fret within range
 */
export function getTargetPosition(
  string: number,
  noteName: string,
  minFret: number = 0,
  maxFret: number = 12
): GuitarPosition | null {
  const stringInfo = STANDARD_TUNING.find(s => s.string === string);
  if (!stringInfo) return null;
  
  // Find all frets on this string that match the note name
  const matchingPositions: GuitarPosition[] = [];
  
  for (let fret = minFret; fret <= maxFret; fret++) {
    const midi = stringInfo.baseMidi + fret;
    const name = midiToNoteName(midi);
    const nameFlat = midiToNoteName(midi, true);
    
    if (name === noteName || nameFlat === noteName) {
      const frequency = midiToFrequency(midi);
      matchingPositions.push({
        string,
        fret,
        note: {
          midi,
          noteName: name,
          octave: midiToOctave(midi),
          frequency,
          cents: 0
        }
      });
    }
  }
  
  // Return the lowest octave (lowest fret) position
  if (matchingPositions.length === 0) return null;
  
  return matchingPositions.reduce((lowest, current) => 
    current.note.midi < lowest.note.midi ? current : lowest
  );
}

/**
 * Validate if detected note matches target position within tolerance
 */
export function validatePosition(
  detectedFreq: number,
  targetPosition: GuitarPosition,
  toleranceCents: number = 25
): ValidationResult {
  const targetMidi = targetPosition.note.midi;
  const frequencyCandidates = [
    { freq: detectedFreq, octaveAdjusted: false },
    { freq: detectedFreq / 2, octaveAdjusted: true },
    { freq: detectedFreq * 2, octaveAdjusted: true }
  ].filter(candidate => candidate.freq > 0 && candidate.freq < 5000);
  
  if (frequencyCandidates.length === 0) {
    return {
      isCorrect: false,
      cents: 0,
      feedback: '',
      normalizedFreq: detectedFreq,
      octaveAdjusted: false
    };
  }
  
  let bestCandidate = frequencyCandidates[0];
  let bestCents = calculateCents(bestCandidate.freq, targetMidi);
  
  for (let i = 1; i < frequencyCandidates.length; i++) {
    const candidate = frequencyCandidates[i];
    const candidateCents = calculateCents(candidate.freq, targetMidi);
    
    if (Math.abs(candidateCents) < Math.abs(bestCents)) {
      bestCandidate = candidate;
      bestCents = candidateCents;
    }
  }
  
  const absCents = Math.abs(bestCents);
  const octaveAdjusted = bestCandidate.octaveAdjusted;
  
  if (absCents <= toleranceCents) {
    return {
      isCorrect: true,
      cents: bestCents,
      feedback: octaveAdjusted ? 'Perfect! (harmonic detected)' : 'Perfect!',
      normalizedFreq: bestCandidate.freq,
      octaveAdjusted
    };
  }
  
  const detectedMidi = frequencyToMidi(detectedFreq);
  const midiDiff = detectedMidi - targetMidi;
  
  if (Math.abs(midiDiff) >= 12) {
    return {
      isCorrect: false,
      cents: bestCents,
      feedback: '',
      normalizedFreq: bestCandidate.freq,
      octaveAdjusted
    };
  }
  
  if (absCents > 50) {
    return {
      isCorrect: false,
      cents: bestCents,
      feedback: '',
      normalizedFreq: bestCandidate.freq,
      octaveAdjusted
    };
  }
  
  return {
    isCorrect: false,
    cents: bestCents,
    feedback: '',
    normalizedFreq: bestCandidate.freq,
    octaveAdjusted
  };
}

/**
 * Get string name for display
 */
export function getStringName(string: number): string {
  const names = ['E', 'B', 'G', 'D', 'A', 'E'];
  return names[6 - string] || '?';
}
