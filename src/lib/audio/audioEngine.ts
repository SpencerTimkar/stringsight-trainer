/**
 * Audio Engine for real-time pitch detection
 * Manages Web Audio API, noise gate, and processing pipeline
 */

import { YINDetector, FrequencyStabilizer, PitchResult } from './pitchDetector';

export interface AudioEngineConfig {
  sampleRate?: number;
  bufferSize?: number;
  gateThreshold?: number;
  gateFrames?: number;
}

export type AudioCallback = (result: PitchResult | null) => void;

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private detector: YINDetector;
  private stabilizer: FrequencyStabilizer;
  private animationFrame: number | null = null;
  private callback: AudioCallback | null = null;
  
  // Noise gate
  private gateThreshold: number;
  private gateOpenCount: number = 0;
  private gateCloseCount: number = 0;
  private gateIsOpen: boolean = false;
  private readonly GATE_OPEN_FRAMES = 2;
  private readonly GATE_CLOSE_FRAMES = 3;
  
  // RMS calculation
  private rmsHistory: number[] = [];
  private readonly RMS_WINDOW = 3;
  
  constructor(config: AudioEngineConfig = {}) {
    const sampleRate = config.sampleRate || 48000;
    const bufferSize = config.bufferSize || 2048;
    this.gateThreshold = config.gateThreshold || 0.01;
    
    this.detector = new YINDetector(sampleRate, bufferSize);
    this.stabilizer = new FrequencyStabilizer();
  }

  async start(callback: AudioCallback): Promise<void> {
    this.callback = callback;
    
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000
        }
      });
      
      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 48000 });
      
      // Create source from stream
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // High-pass filter to remove low-frequency rumble
      const highpass = this.audioContext.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 65;
      highpass.Q.value = 0.7;
      
      // Analyser node
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0;
      
      // Connect pipeline
      source.connect(highpass);
      highpass.connect(this.analyser);
      
      // Start processing
      this.processAudio();
      
    } catch (error) {
      console.error('Failed to start audio engine:', error);
      throw new Error('Microphone access denied or not available');
    }
  }

  private processAudio(): void {
    if (!this.analyser || !this.callback) return;
    
    const bufferLength = this.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    
    const process = () => {
      this.animationFrame = requestAnimationFrame(process);
      
      if (!this.analyser) return;
      
      // Get time-domain data
      this.analyser.getFloatTimeDomainData(dataArray);
      
      // Calculate RMS for noise gate
      const rms = this.calculateRMS(dataArray);
      this.updateNoiseGate(rms);
      
      // Only process if gate is open
      if (this.gateIsOpen) {
        const result = this.detector.detect(dataArray);
        
        if (result) {
          // Stabilize frequency
          const stableFreq = this.stabilizer.addFrequency(result.frequency);
          this.callback?.({
            ...result,
            frequency: stableFreq
          });
        } else {
          this.callback?.(null);
        }
      } else {
        this.stabilizer.reset();
        this.callback?.(null);
      }
    };
    
    process();
  }

  private calculateRMS(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);
    
    // Add to history for smoothing
    this.rmsHistory.push(rms);
    if (this.rmsHistory.length > this.RMS_WINDOW) {
      this.rmsHistory.shift();
    }
    
    // Return average RMS
    return this.rmsHistory.reduce((a, b) => a + b, 0) / this.rmsHistory.length;
  }

  private updateNoiseGate(rms: number): void {
    if (rms > this.gateThreshold) {
      this.gateOpenCount++;
      this.gateCloseCount = 0;
      
      if (this.gateOpenCount >= this.GATE_OPEN_FRAMES) {
        this.gateIsOpen = true;
      }
    } else {
      this.gateCloseCount++;
      this.gateOpenCount = 0;
      
      if (this.gateCloseCount >= this.GATE_CLOSE_FRAMES) {
        this.gateIsOpen = false;
      }
    }
  }

  stop(): void {
    // Cancel animation frame
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    // Reset state
    this.gateIsOpen = false;
    this.gateOpenCount = 0;
    this.gateCloseCount = 0;
    this.rmsHistory = [];
    this.stabilizer.reset();
    this.callback = null;
  }

  setGateThreshold(threshold: number): void {
    this.gateThreshold = Math.max(0.001, Math.min(0.1, threshold));
  }

  getInputLevel(): number {
    if (!this.analyser) return 0;
    
    const bufferLength = this.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(dataArray);
    
    return this.calculateRMS(dataArray);
  }

  isGateOpen(): boolean {
    return this.gateIsOpen;
  }
}
