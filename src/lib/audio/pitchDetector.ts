/**
 * YIN Pitch Detection Algorithm
 * Real-time, low-latency pitch detection for guitar frequencies
 */

export interface PitchResult {
  frequency: number;
  confidence: number;
  clarity: number;
}

export class YINDetector {
  private bufferSize: number;
  private sampleRate: number;
  private threshold: number;
  private probabilityThreshold: number;

  constructor(sampleRate: number = 48000, bufferSize: number = 2048) {
    this.sampleRate = sampleRate;
    this.bufferSize = bufferSize;
    this.threshold = 0.15;
    this.probabilityThreshold = 0.6;
  }

  /**
   * Detect pitch using YIN algorithm
   */
  detect(buffer: Float32Array): PitchResult | null {
    const yinBuffer = new Float32Array(this.bufferSize / 2);
    
    // Step 1: Difference function
    this.difference(buffer, yinBuffer);
    
    // Step 2: Cumulative mean normalized difference
    this.cumulativeMeanNormalizedDifference(yinBuffer);
    
    // Step 3: Absolute threshold
    const tauEstimate = this.absoluteThreshold(yinBuffer);
    
    if (tauEstimate === -1) {
      return null;
    }
    
    // Step 4: Parabolic interpolation
    const betterTau = this.parabolicInterpolation(yinBuffer, tauEstimate);
    
    // Calculate frequency and confidence
    const frequency = this.sampleRate / betterTau;
    const confidence = 1 - yinBuffer[tauEstimate];
    
    // Filter out unrealistic guitar frequencies (E2 ~82Hz to E6 ~1318Hz)
    if (frequency < 70 || frequency > 1400 || confidence < this.probabilityThreshold) {
      return null;
    }
    
    return {
      frequency,
      confidence,
      clarity: confidence
    };
  }

  private difference(buffer: Float32Array, yinBuffer: Float32Array): void {
    for (let tau = 0; tau < yinBuffer.length; tau++) {
      yinBuffer[tau] = 0;
    }
    
    for (let tau = 1; tau < yinBuffer.length; tau++) {
      for (let i = 0; i < yinBuffer.length; i++) {
        const delta = buffer[i] - buffer[i + tau];
        yinBuffer[tau] += delta * delta;
      }
    }
  }

  private cumulativeMeanNormalizedDifference(yinBuffer: Float32Array): void {
    yinBuffer[0] = 1;
    let runningSum = 0;
    
    for (let tau = 1; tau < yinBuffer.length; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] *= tau / runningSum;
    }
  }

  private absoluteThreshold(yinBuffer: Float32Array): number {
    let tau = 2;
    
    // Find first minimum below threshold
    while (tau < yinBuffer.length) {
      if (yinBuffer[tau] < this.threshold) {
        while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        return tau;
      }
      tau++;
    }
    
    // No suitable tau found
    return -1;
  }

  private parabolicInterpolation(yinBuffer: Float32Array, tau: number): number {
    if (tau === 0 || tau === yinBuffer.length - 1) {
      return tau;
    }
    
    const s0 = yinBuffer[tau - 1];
    const s1 = yinBuffer[tau];
    const s2 = yinBuffer[tau + 1];
    
    return tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
  }

  setThreshold(threshold: number): void {
    this.threshold = Math.max(0.01, Math.min(0.5, threshold));
  }

  setProbabilityThreshold(threshold: number): void {
    this.probabilityThreshold = Math.max(0.1, Math.min(1.0, threshold));
  }
}

/**
 * Median filter for frequency stabilization
 */
export class FrequencyStabilizer {
  private history: number[] = [];
  private maxHistory: number = 5;
  private maxJumpCents: number = 60;

  addFrequency(freq: number): number {
    if (this.history.length > 0) {
      const lastFreq = this.history[this.history.length - 1];
      const cents = Math.abs(1200 * Math.log2(freq / lastFreq));
      
      // Reject outliers unless sustained
      if (cents > this.maxJumpCents && this.history.length >= 2) {
        return this.getMedian();
      }
    }
    
    this.history.push(freq);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    return this.getMedian();
  }

  private getMedian(): number {
    if (this.history.length === 0) return 0;
    
    const sorted = [...this.history].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  reset(): void {
    this.history = [];
  }
}
