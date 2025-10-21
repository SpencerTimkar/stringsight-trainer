/**
 * Session Manager
 * Handles practice session logic, prompt scheduling, and attempt tracking
 */

import { GuitarPosition, generatePositions, getTargetPosition } from '../music/noteMapping';

export interface SessionConfig {
  enabledStrings: number[];
  minFret: number;
  maxFret: number;
  toleranceCents: number;
  mode: 'untimed' | 'timed';
  enharmonicPolicy: 'random' | 'sharps' | 'flats';
  timeLimit?: number; // seconds per prompt in timed mode
}

export interface Attempt {
  detectedFreq: number | null;
  detectedMidi: number | null;
  cents: number;
  confidence: number;
  isCorrect: boolean;
  revealed: boolean;
  millisToCorrect: number;
}

export interface Prompt {
  position: GuitarPosition;
  displayName: string;
}

export interface SessionStats {
  totalPrompts: number;
  correctAttempts: number;
  totalAttempts: number;
  averageTime: number;
  perStringAccuracy: Map<number, { correct: number; total: number }>;
  missedPositions: Array<{ position: GuitarPosition; missCount: number }>;
}

export class SessionManager {
  private config: SessionConfig;
  private positions: GuitarPosition[];
  private positionCounters: Map<string, number> = new Map();
  private currentPrompt: Prompt | null = null;
  private currentAttempts: Attempt[] = [];
  private promptStartTime: number = 0;
  private sessionStats: SessionStats;
  
  constructor(config: SessionConfig) {
    this.config = config;
    this.positions = generatePositions(
      config.enabledStrings,
      config.minFret,
      config.maxFret
    );
    
    // Initialize counters
    this.positions.forEach(pos => {
      const key = this.getPositionKey(pos);
      this.positionCounters.set(key, 0);
    });
    
    this.sessionStats = {
      totalPrompts: 0,
      correctAttempts: 0,
      totalAttempts: 0,
      averageTime: 0,
      perStringAccuracy: new Map(),
      missedPositions: []
    };
  }

  /**
   * Get next prompt using weighted random selection for uniform coverage
   */
  nextPrompt(): Prompt {
    // Weighted random selection based on least-seen positions
    const weights: number[] = [];
    let totalWeight = 0;
    
    this.positions.forEach(pos => {
      const key = this.getPositionKey(pos);
      const count = this.positionCounters.get(key) || 0;
      const weight = 1 / (1 + count);
      weights.push(weight);
      totalWeight += weight;
    });
    
    // Select position
    let random = Math.random() * totalWeight;
    let selectedIndex = 0;
    
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }
    
    const position = this.positions[selectedIndex];
    
    // Increment counter
    const key = this.getPositionKey(position);
    this.positionCounters.set(key, (this.positionCounters.get(key) || 0) + 1);
    
    // Format display name based on enharmonic policy
    const displayName = this.formatNoteName(position);
    
    this.currentPrompt = { position, displayName };
    this.currentAttempts = [];
    this.promptStartTime = Date.now();
    this.sessionStats.totalPrompts++;
    
    return this.currentPrompt;
  }

  /**
   * Record an attempt
   */
  recordAttempt(attempt: Attempt): void {
    this.currentAttempts.push(attempt);
    this.sessionStats.totalAttempts++;
    
    if (attempt.isCorrect) {
      this.sessionStats.correctAttempts++;
      this.updatePerStringStats(true);
    } else {
      this.updatePerStringStats(false);
      
      if (!attempt.revealed) {
        this.trackMissedPosition();
      }
    }
  }

  /**
   * Mark current prompt as revealed
   */
  revealAnswer(): GuitarPosition | null {
    if (!this.currentPrompt) return null;
    
    const revealAttempt: Attempt = {
      detectedFreq: null,
      detectedMidi: null,
      cents: 0,
      confidence: 0,
      isCorrect: false,
      revealed: true,
      millisToCorrect: Date.now() - this.promptStartTime
    };
    
    this.recordAttempt(revealAttempt);
    
    return this.currentPrompt.position;
  }

  /**
   * Get current prompt
   */
  getCurrentPrompt(): Prompt | null {
    return this.currentPrompt;
  }

  /**
   * Get elapsed time for current prompt (ms)
   */
  getElapsedTime(): number {
    return Date.now() - this.promptStartTime;
  }

  /**
   * Get session statistics
   */
  getStats(): SessionStats {
    // Calculate average time for correct attempts
    const correctAttempts = this.currentAttempts.filter(a => a.isCorrect);
    if (correctAttempts.length > 0) {
      const totalTime = correctAttempts.reduce((sum, a) => sum + a.millisToCorrect, 0);
      this.sessionStats.averageTime = totalTime / correctAttempts.length;
    }
    
    return this.sessionStats;
  }

  private getPositionKey(position: GuitarPosition): string {
    return `${position.string}-${position.fret}`;
  }

  private formatNoteName(position: GuitarPosition): string {
    const { noteName } = position.note;
    
    if (this.config.enharmonicPolicy === 'random') {
      // Randomly choose sharp or flat for black keys
      if (noteName.includes('#')) {
        return Math.random() < 0.5 ? noteName : this.toFlat(noteName);
      }
    } else if (this.config.enharmonicPolicy === 'flats') {
      return this.toFlat(noteName);
    }
    
    return noteName;
  }

  private toFlat(noteName: string): string {
    const flats: Record<string, string> = {
      'C#': 'Db',
      'D#': 'Eb',
      'F#': 'Gb',
      'G#': 'Ab',
      'A#': 'Bb'
    };
    return flats[noteName] || noteName;
  }

  private updatePerStringStats(isCorrect: boolean): void {
    if (!this.currentPrompt) return;
    
    const string = this.currentPrompt.position.string;
    const stats = this.sessionStats.perStringAccuracy.get(string) || { correct: 0, total: 0 };
    
    stats.total++;
    if (isCorrect) stats.correct++;
    
    this.sessionStats.perStringAccuracy.set(string, stats);
  }

  private trackMissedPosition(): void {
    if (!this.currentPrompt) return;
    
    const existing = this.sessionStats.missedPositions.find(
      m => this.getPositionKey(m.position) === this.getPositionKey(this.currentPrompt!.position)
    );
    
    if (existing) {
      existing.missCount++;
    } else {
      this.sessionStats.missedPositions.push({
        position: this.currentPrompt.position,
        missCount: 1
      });
    }
  }
}
