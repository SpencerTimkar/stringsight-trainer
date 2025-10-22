import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AudioEngine } from '@/lib/audio/audioEngine';
import { SessionManager, SessionConfig, Prompt, SessionStats } from '@/lib/trainer/sessionManager';
import { parseFrequency, validatePosition, ValidationResult } from '@/lib/music/noteMapping';
import { DIFFICULTY_SETTINGS } from '@/lib/trainer/difficulty';
import { applyMasteryUpdates } from '@/lib/trainer/mastery';
import { toast } from 'sonner';
import { Mic, MicOff, Eye } from 'lucide-react';

interface PracticeScreenProps {
  config: SessionConfig;
  gateThreshold: number;
  onComplete: (stats: SessionStats) => void;
}

export default function PracticeScreen({ config, gateThreshold, onComplete }: PracticeScreenProps) {
  const difficultySettings = useMemo(
    () => DIFFICULTY_SETTINGS[config.difficulty] ?? DIFFICULTY_SETTINGS.easy,
    [config.difficulty]
  );
  
  const [isListening, setIsListening] = useState(false);
  const [currentNote, setCurrentNote] = useState<string>('—');
  const [currentFreq, setCurrentFreq] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);
  const [inputLevel, setInputLevel] = useState<number>(0);
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [targetPrompt, setTargetPrompt] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [feedbackType, setFeedbackType] = useState<'correct' | 'incorrect' | 'neutral'>('neutral');
  const [attemptsLeft, setAttemptsLeft] = useState<number>(difficultySettings.maxAttempts);
  const [timeLeft, setTimeLeft] = useState<number>(difficultySettings.timeLimit);
  const consecutiveCorrectRef = useRef(0);
  
  const audioEngine = useRef<AudioEngine | null>(null);
  const sessionManager = useRef<SessionManager | null>(null);
  const levelInterval = useRef<NodeJS.Timeout | null>(null);
  const promptAnswered = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const attemptsRemainingRef = useRef<number>(difficultySettings.maxAttempts);
  const timeRemainingRef = useRef<number>(difficultySettings.timeLimit);
  const pendingAttemptRef = useRef<{
    freq: number;
    midi: number | null;
    cents: number;
    confidence: number;
    frames: number;
  } | null>(null);
  const lastAttemptRef = useRef<{
    freq: number | null;
    midi: number | null;
    cents: number;
    confidence: number;
  } | null>(null);
  const failureHandledRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  function handleFailure(_reason: 'timeout' | 'attempts') {
    if (failureHandledRef.current || !sessionManager.current) return;
    
    if (pendingAttemptRef.current && pendingAttemptRef.current.frames >= 3) {
      lastAttemptRef.current = {
        freq: pendingAttemptRef.current.freq,
        midi: pendingAttemptRef.current.midi,
        cents: pendingAttemptRef.current.cents,
        confidence: pendingAttemptRef.current.confidence
      };
    }
    
    failureHandledRef.current = true;
    clearTimer();
    promptAnswered.current = true;
    
    const attemptData = lastAttemptRef.current ?? {
      freq: null,
      midi: null,
      cents: 0,
      confidence: 0
    };
    
    sessionManager.current.recordAttempt({
      detectedFreq: attemptData.freq ?? null,
      detectedMidi: attemptData.midi ?? null,
      cents: attemptData.cents,
      confidence: attemptData.confidence,
      isCorrect: false,
      revealed: false,
      millisToCorrect: sessionManager.current.getElapsedTime()
    });
    
    pendingAttemptRef.current = null;
    lastAttemptRef.current = null;
    attemptsRemainingRef.current = 0;
    timeRemainingRef.current = 0;
    setAttemptsLeft(0);
    setTimeLeft(0);
    consecutiveCorrectRef.current = 0;
    setFeedback('');
    setFeedbackType('incorrect');
    
    setTimeout(() => {
      if (!sessionManager.current) return;
      const nextPrompt = sessionManager.current.nextPrompt();
      applyPrompt(nextPrompt);
    }, 1200);
  }

  function finalizeAttempt() {
    if (promptAnswered.current || failureHandledRef.current) {
      pendingAttemptRef.current = null;
      return;
    }
    
    const pending = pendingAttemptRef.current;
    if (!pending) return;
    
    pendingAttemptRef.current = null;
    
    if (pending.frames < 5) {
      return;
    }
    
    lastAttemptRef.current = {
      freq: pending.freq,
      midi: pending.midi,
      cents: pending.cents,
      confidence: pending.confidence
    };
    
    const nextRemaining = attemptsRemainingRef.current - 1;
    attemptsRemainingRef.current = Math.max(nextRemaining, 0);
    setAttemptsLeft(Math.max(nextRemaining, 0));
    
    if (attemptsRemainingRef.current <= 0) {
      handleFailure('attempts');
    }
  }

  function startTimer() {
    if (difficultySettings.timeLimit <= 0 || failureHandledRef.current || promptAnswered.current) return;
    
    clearTimer();
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (promptAnswered.current || failureHandledRef.current) {
          return prev;
        }
        
        if (prev <= 1) {
          clearTimer();
          timeRemainingRef.current = 0;
          handleFailure('timeout');
          return 0;
        }
        
        const next = prev - 1;
        timeRemainingRef.current = next;
        return next;
      });
    }, 1000);
  }

  function applyPrompt(prompt: Prompt, options: { preserveFeedback?: boolean } = {}) {
    setTargetPrompt(`${prompt.displayName} on string ${prompt.position.string}`);
    attemptsRemainingRef.current = difficultySettings.maxAttempts;
    timeRemainingRef.current = difficultySettings.timeLimit;
    setAttemptsLeft(difficultySettings.maxAttempts);
    setTimeLeft(difficultySettings.timeLimit);
    pendingAttemptRef.current = null;
    lastAttemptRef.current = null;
    failureHandledRef.current = false;
    consecutiveCorrectRef.current = 0;
    promptAnswered.current = false;
    
    if (!options.preserveFeedback) {
      setFeedback('');
      setFeedbackType('neutral');
    }
    
    clearTimer();
    if (audioEngine.current) {
      startTimer();
    }
  }

  const stopListening = () => {
    if (audioEngine.current) {
      audioEngine.current.stop();
      audioEngine.current = null;
    }
    
    if (levelInterval.current) {
      clearInterval(levelInterval.current);
      levelInterval.current = null;
    }
    
    clearTimer();
    setIsListening(false);
    setInputLevel(0);
    setIsGateOpen(false);
  };

  useEffect(() => {
    attemptsRemainingRef.current = difficultySettings.maxAttempts;
    timeRemainingRef.current = difficultySettings.timeLimit;
    setAttemptsLeft(difficultySettings.maxAttempts);
    setTimeLeft(difficultySettings.timeLimit);
  }, [difficultySettings]);

  useEffect(() => {
    sessionManager.current = new SessionManager(config);
    const firstPrompt = sessionManager.current.nextPrompt();
    applyPrompt(firstPrompt, { preserveFeedback: true });
    setFeedback('Ready to listen');
    setFeedbackType('neutral');
    
    return () => {
      stopListening();
    };
  }, [config, difficultySettings]);

  const startListening = async () => {
    try {
      if (audioEngine.current) {
        audioEngine.current.stop();
        audioEngine.current = null;
      }
      
      audioEngine.current = new AudioEngine({
        gateThreshold: Math.max(0.001, Math.min(0.1, gateThreshold || 0.01))
      });
      
      await audioEngine.current.start((result) => {
        if (!sessionManager.current) return;
        
        if (promptAnswered.current && !result) {
          setCurrentNote('—');
          setCurrentFreq(0);
          setConfidence(0);
          return;
        }
        
        if (result) {
          const currentPrompt = sessionManager.current.getCurrentPrompt();
          let displayFrequency = result.frequency;
          let validation: ValidationResult | null = null;
          
          if (currentPrompt) {
            validation = validatePosition(
              result.frequency,
              currentPrompt.position,
              config.toleranceCents
            );
            displayFrequency = validation.normalizedFreq;
          }
          
          const note = parseFrequency(displayFrequency);
          setCurrentNote(`${note.noteName}${note.octave}`);
          setCurrentFreq(displayFrequency);
          setConfidence(result.confidence);
          
          if (promptAnswered.current) {
            return;
          }
          
          if (currentPrompt && validation) {
            if (validation.isCorrect) {
              consecutiveCorrectRef.current += 1;
              
              if (consecutiveCorrectRef.current >= 2) {
                promptAnswered.current = true;
                pendingAttemptRef.current = null;
                lastAttemptRef.current = null;
                handleCorrect(validation.normalizedFreq, validation.cents, validation.octaveAdjusted);
              } else {
                setFeedback('Keep holding...');
                setFeedbackType('neutral');
              }
            } else {
              consecutiveCorrectRef.current = 0;
              
              const pending = pendingAttemptRef.current;
              if (pending) {
                pendingAttemptRef.current = {
                  freq: displayFrequency,
                  midi: note.midi,
                  cents: validation.cents,
                  confidence: result.confidence,
                  frames: pending.frames + 1
                };
              } else {
                pendingAttemptRef.current = {
                  freq: displayFrequency,
                  midi: note.midi,
                  cents: validation.cents,
                  confidence: result.confidence,
                  frames: 1
                };
              }
              
              lastAttemptRef.current = {
                freq: displayFrequency,
                midi: note.midi,
                cents: validation.cents,
                confidence: result.confidence
              };
              
              setFeedback(validation.feedback);
              setFeedbackType('incorrect');
            }
          }
        } else {
          setCurrentNote('—');
          setCurrentFreq(0);
          setConfidence(0);
          
          if (!promptAnswered.current) {
            consecutiveCorrectRef.current = 0;
            setFeedback('');
            setFeedbackType('neutral');
            finalizeAttempt();
          }
        }
      });
      
      setIsListening(true);
      
      if (!promptAnswered.current) {
        startTimer();
      }
      
      levelInterval.current = setInterval(() => {
        if (audioEngine.current) {
          setInputLevel(audioEngine.current.getInputLevel());
          setIsGateOpen(audioEngine.current.isGateOpen());
        }
      }, 50);
      
    } catch (error) {
      toast.error('Failed to access microphone. Please check permissions.');
      console.error(error);
    }
  };

  const handleCorrect = (freq: number, cents: number, octaveAdjusted: boolean) => {
    if (!sessionManager.current) return;
    
    clearTimer();
    failureHandledRef.current = true;
    pendingAttemptRef.current = null;
    lastAttemptRef.current = null;
    
    const elapsed = sessionManager.current.getElapsedTime();
    sessionManager.current.recordAttempt({
      detectedFreq: freq,
      detectedMidi: parseFrequency(freq).midi,
      cents,
      confidence,
      isCorrect: true,
      revealed: false,
      millisToCorrect: elapsed
    });
    
    setFeedback(octaveAdjusted ? '✓ Correct! Harmonic locked in!' : '✓ Correct! Nice work!');
    setFeedbackType('correct');
    consecutiveCorrectRef.current = 0;
    
    setTimeout(() => {
      if (!sessionManager.current) return;
      const nextPrompt = sessionManager.current.nextPrompt();
      applyPrompt(nextPrompt);
    }, 1200);
  };

  const handleReveal = () => {
    if (!sessionManager.current || promptAnswered.current) return;
    
    promptAnswered.current = true;
    clearTimer();
    failureHandledRef.current = true;
    pendingAttemptRef.current = null;
    lastAttemptRef.current = null;
    
    const answer = sessionManager.current.revealAnswer();
    if (answer) {
      setFeedback(`Answer: Fret ${answer.fret} on string ${answer.string}`);
      setFeedbackType('neutral');
      
      setTimeout(() => {
        if (!sessionManager.current) return;
        const nextPrompt = sessionManager.current.nextPrompt();
        applyPrompt(nextPrompt);
      }, 2000);
    }
  };

  const handleComplete = () => {
    if (!sessionManager.current) return;
    
    const baseStats = sessionManager.current.getStats();
    const masterySummary = applyMasteryUpdates(baseStats);
    sessionManager.current.setMasterySummary(masterySummary);
    const finalStats: SessionStats = {
      ...sessionManager.current.getStats(),
      masterySummary
    };
    
    stopListening();
    onComplete(finalStats);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      {/* Prompt Card */}
      <Card className={`w-full max-w-2xl p-8 transition-all duration-300 ${
        feedbackType === 'correct' ? 'ring-4 ring-success shadow-[0_0_40px_hsl(var(--glow-correct)/0.4)]' :
        feedbackType === 'incorrect' ? 'ring-2 ring-error' :
        ''
      }`}>
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-muted-foreground">Target</h2>
          <p className="text-5xl font-bold text-foreground min-h-[60px] flex items-center justify-center">
            {targetPrompt}
          </p>
          {feedback && (
            <p className={`text-2xl font-semibold transition-colors duration-200 min-h-[32px] ${
              feedbackType === 'correct' ? 'text-success' :
              feedbackType === 'incorrect' ? 'text-error' :
              'text-muted-foreground'
            }`}>
              {feedback}
            </p>
          )}
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground font-mono">
            <span>Tries left: {Math.max(attemptsLeft, 0)}</span>
            <span>Time left: {Math.max(timeLeft, 0)}s</span>
          </div>
        </div>
      </Card>

      {/* Detector Display */}
      <Card className="w-full max-w-2xl p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Detected Note</p>
              <p className="text-3xl font-mono font-bold">{currentNote}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Frequency</p>
              <p className="text-2xl font-mono">{currentFreq > 0 ? `${currentFreq.toFixed(1)} Hz` : '—'}</p>
            </div>
          </div>

          {/* Input Level Meter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm min-h-[20px]">
              <span className="text-muted-foreground">Input Level</span>
              <span className={isGateOpen ? 'text-accent' : 'text-muted-foreground'}>
                {isGateOpen ? 'Gate Open' : 'Gate Closed'}
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden relative">
              <div 
                className="h-full bg-accent transition-all duration-100 absolute left-0 top-0"
                style={{ 
                  width: `${Math.min(inputLevel * 1000, 100)}%`,
                  boxShadow: isGateOpen ? '0 0 8px hsl(var(--glow-info))' : 'none'
                }}
              />
            </div>
          </div>

          {/* Confidence */}
          <div className="space-y-2 min-h-[44px]">
            {confidence > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Confidence</span>
                  <span className="font-mono">{(confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                  <div 
                    className="h-full bg-primary transition-all duration-200 absolute left-0 top-0"
                    style={{ width: `${confidence * 100}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Controls */}
      <div className="flex gap-4">
        {!isListening ? (
          <Button 
            size="lg" 
            onClick={startListening}
            className="gap-2"
          >
            <Mic className="w-5 h-5" />
            Start Listening
          </Button>
        ) : (
          <>
            <Button 
              size="lg" 
              variant="secondary"
              onClick={stopListening}
              className="gap-2"
            >
              <MicOff className="w-5 h-5" />
              Stop
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={handleReveal}
              className="gap-2"
            >
              <Eye className="w-5 h-5" />
              I Don't Know
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={handleComplete}
            >
              End Session
            </Button>
          </>
        )}
      </div>

      {/* Stats Preview */}
      {sessionManager.current && (
        <Card className="w-full max-w-2xl p-4">
          <div className="flex justify-around text-center">
            <div>
              <p className="text-2xl font-bold">{sessionManager.current.getStats().totalPrompts}</p>
              <p className="text-sm text-muted-foreground">Prompts</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-success">
                {sessionManager.current.getStats().correctAttempts}
              </p>
              <p className="text-sm text-muted-foreground">Correct</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {sessionManager.current.getStats().totalAttempts > 0
                  ? Math.round((sessionManager.current.getStats().correctAttempts / sessionManager.current.getStats().totalAttempts) * 100)
                  : 0}%
              </p>
              <p className="text-sm text-muted-foreground">Accuracy</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
