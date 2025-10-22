import { SessionStats } from './sessionManager';
import { DIFFICULTY_SETTINGS } from './difficulty';

const STORAGE_KEY = 'stringsight_mastery_profile_v1';
const DEFAULT_RATING = 1200;

export type MasteryLevel = 'Beginner' | 'Novice' | 'Intermediate' | 'Advanced' | 'Virtuoso';

export interface MasteryRecord {
  rating: number;
  updatedAt: number;
}

export interface MasteryProfile {
  ratings: Record<number, MasteryRecord>;
}

export interface MasteryUpdate {
  previousRating: number;
  newRating: number;
  delta: number;
  masteryLevel: MasteryLevel;
  accuracy: number;
  averageMillis: number;
}

function supportsStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadProfile(): MasteryProfile {
  if (!supportsStorage()) {
    return { ratings: {} };
  }
  
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ratings: {} };
    }
    const parsed = JSON.parse(raw) as MasteryProfile;
    if (!parsed || typeof parsed !== 'object' || !parsed.ratings) {
      return { ratings: {} };
    }
    return {
      ratings: Object.fromEntries(
        Object.entries(parsed.ratings).map(([key, value]) => [
          Number(key),
          {
            rating: typeof value === 'object' && value && 'rating' in value
              ? Number((value as MasteryRecord).rating) || DEFAULT_RATING
              : DEFAULT_RATING,
            updatedAt: typeof value === 'object' && value && 'updatedAt' in value
              ? Number((value as MasteryRecord).updatedAt) || Date.now()
              : Date.now()
          }
        ])
      )
    };
  } catch (error) {
    console.warn('Failed to load mastery profile, resetting.', error);
    return { ratings: {} };
  }
}

function saveProfile(profile: MasteryProfile): void {
  if (!supportsStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.warn('Failed to persist mastery profile.', error);
  }
}

export function getMasteryLevel(rating: number): MasteryLevel {
  if (rating < 1000) return 'Beginner';
  if (rating < 1200) return 'Novice';
  if (rating < 1400) return 'Intermediate';
  if (rating < 1600) return 'Advanced';
  return 'Virtuoso';
}

function computePerformanceScore(
  accuracy: number,
  averageMillis: number,
  timeLimitSeconds: number
): number {
  const clampedAccuracy = Math.max(0, Math.min(1, accuracy));
  
  if (timeLimitSeconds <= 0) {
    return clampedAccuracy;
  }
  
  const timeLimitMillis = timeLimitSeconds * 1000;
  const speedScore = averageMillis > 0
    ? Math.max(0, Math.min(1, (timeLimitMillis - averageMillis) / timeLimitMillis))
    : clampedAccuracy; // if no average yet, mirror accuracy
  
  // Weight accuracy more heavily than speed
  return Math.max(0, Math.min(1, clampedAccuracy * 0.7 + speedScore * 0.3));
}

export function applyMasteryUpdates(stats: SessionStats): Record<number, MasteryUpdate> {
  const profile = loadProfile();
  const difficultySettings = DIFFICULTY_SETTINGS[stats.difficulty];
  const updates: Record<number, MasteryUpdate> = {};
  
  stats.perStringPerformance.forEach((performance, string) => {
    if (performance.total === 0) return;
    
    const accuracy = performance.total > 0 ? performance.correct / performance.total : 0;
    const averageMillis = performance.correct > 0
      ? performance.averageMillis
      : difficultySettings.timeLimit * 1000;
    
    const performanceScore = computePerformanceScore(
      accuracy,
      averageMillis,
      difficultySettings.timeLimit
    );
    
    const difficultyBias =
      stats.difficulty === 'hard' ? 0.08 :
      stats.difficulty === 'medium' ? 0.04 :
      0;
    
    const actualScore = Math.max(0, Math.min(1, performanceScore + difficultyBias));
    
    const currentRating = profile.ratings[string]?.rating ?? DEFAULT_RATING;
    const expectedScore = 1 / (1 + Math.pow(
      10,
      (difficultySettings.baseRating - currentRating) / 400
    ));
    
    const kFactor = difficultySettings.kFactor;
    const delta = Math.round(kFactor * (actualScore - expectedScore));
    const newRating = Math.max(600, currentRating + delta);
    const masteryLevel = getMasteryLevel(newRating);
    
    profile.ratings[string] = {
      rating: newRating,
      updatedAt: Date.now()
    };
    
    updates[string] = {
      previousRating: currentRating,
      newRating,
      delta,
      masteryLevel,
      accuracy,
      averageMillis
    };
  });
  
  if (Object.keys(updates).length > 0) {
    saveProfile(profile);
  }
  
  return updates;
}
