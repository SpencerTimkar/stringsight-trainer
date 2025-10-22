export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface DifficultySettings {
  maxAttempts: number;
  timeLimit: number; // seconds allowed per prompt
  baseRating: number;
  kFactor: number;
}

export const DIFFICULTY_SETTINGS: Record<DifficultyLevel, DifficultySettings> = {
  easy: {
    maxAttempts: 5,
    timeLimit: 20,
    baseRating: 1000,
    kFactor: 12
  },
  medium: {
    maxAttempts: 3,
    timeLimit: 10,
    baseRating: 1200,
    kFactor: 16
  },
  hard: {
    maxAttempts: 1,
    timeLimit: 5,
    baseRating: 1400,
    kFactor: 20
  }
};

export function getDifficultySettings(level: DifficultyLevel): DifficultySettings {
  return DIFFICULTY_SETTINGS[level];
}
