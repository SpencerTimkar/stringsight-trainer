import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AudioEngine } from '@/lib/audio/audioEngine';
import { SessionManager, SessionConfig } from '@/lib/trainer/sessionManager';
import { parseFrequency, validatePosition, getStringName } from '@/lib/music/noteMapping';
import { toast } from 'sonner';
import { Mic, MicOff, Volume2, Eye } from 'lucide-react';

interface PracticeScreenProps {
  config: SessionConfig;
  onComplete: (stats: any) => void;
}

export default function PracticeScreen({ config, onComplete }: PracticeScreenProps) {
  const [isListening, setIsListening] = useState(false);
  const [currentNote, setCurrentNote] = useState<string>('—');
  const [currentFreq, setCurrentFreq] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);
  const [inputLevel, setInputLevel] = useState<number>(0);
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [targetPrompt, setTargetPrompt] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [feedbackType, setFeedbackType] = useState<'correct' | 'incorrect' | 'neutral'>('neutral');
  const consecutiveCorrectRef = useRef(0);
  
  const audioEngine = useRef<AudioEngine | null>(null);
  const sessionManager = useRef<SessionManager | null>(null);
  const levelInterval = useRef<NodeJS.Timeout | null>(null);
  const promptAnswered = useRef(false);

  useEffect(() => {
    // Initialize session
    sessionManager.current = new SessionManager(config);
    const firstPrompt = sessionManager.current.nextPrompt();
    setTargetPrompt(`${firstPrompt.displayName} on ${getStringName(firstPrompt.position.string)} string`);
    setFeedback('Ready to listen');
    promptAnswered.current = false;
    
    return () => {
      stopListening();
    };
  }, [config]);

  const startListening = async () => {
    try {
      audioEngine.current = new AudioEngine({
        gateThreshold: 0.01
      });
      
      await audioEngine.current.start((result) => {
        if (!sessionManager.current) return;
        
        if (result) {
          const note = parseFrequency(result.frequency);
          setCurrentNote(`${note.noteName}${note.octave}`);
          setCurrentFreq(result.frequency);
          setConfidence(result.confidence);
          
          // Check if correct
          const currentPrompt = sessionManager.current.getCurrentPrompt();
          if (currentPrompt) {
            const validation = validatePosition(
              result.frequency,
              currentPrompt.position,
              config.toleranceCents
            );
            
            if (validation.isCorrect && !promptAnswered.current) {
              consecutiveCorrectRef.current += 1;
              
              // Require 2-3 consecutive correct frames for debounce
              if (consecutiveCorrectRef.current >= 2) {
                promptAnswered.current = true;
                handleCorrect(result.frequency, validation.cents);
              } else {
                setFeedback('Keep holding...');
                setFeedbackType('neutral');
              }
            } else if (!promptAnswered.current) {
              consecutiveCorrectRef.current = 0;
              setFeedback(validation.feedback);
              setFeedbackType('incorrect');
            }
          }
        } else {
          setCurrentNote('—');
          setCurrentFreq(0);
          setConfidence(0);
          consecutiveCorrectRef.current = 0;
          setFeedback('');
          setFeedbackType('neutral');
        }
      });
      
      setIsListening(true);
      
      // Start level monitoring
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

  const stopListening = () => {
    if (audioEngine.current) {
      audioEngine.current.stop();
      audioEngine.current = null;
    }
    
    if (levelInterval.current) {
      clearInterval(levelInterval.current);
      levelInterval.current = null;
    }
    
    setIsListening(false);
    setInputLevel(0);
    setIsGateOpen(false);
  };

  const handleCorrect = (freq: number, cents: number) => {
    if (!sessionManager.current) return;
    
    // Record attempt
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
    
    // Show success feedback with animation
    setFeedback('✓ Correct! Nice work!');
    setFeedbackType('correct');
    consecutiveCorrectRef.current = 0;
    
    // Advance to next prompt after brief delay
    setTimeout(() => {
      const nextPrompt = sessionManager.current!.nextPrompt();
      setTargetPrompt(`${nextPrompt.displayName} on ${getStringName(nextPrompt.position.string)} string`);
      setFeedback('');
      setFeedbackType('neutral');
      promptAnswered.current = false;
    }, 1200);
  };

  const handleReveal = () => {
    if (!sessionManager.current || promptAnswered.current) return;
    
    promptAnswered.current = true;
    const answer = sessionManager.current.revealAnswer();
    if (answer) {
      setFeedback(`Answer: Fret ${answer.fret} on ${getStringName(answer.string)} string`);
      setFeedbackType('neutral');
      
      setTimeout(() => {
        const nextPrompt = sessionManager.current!.nextPrompt();
        setTargetPrompt(`${nextPrompt.displayName} on ${getStringName(nextPrompt.position.string)} string`);
        setFeedback('');
        setFeedbackType('neutral');
        promptAnswered.current = false;
      }, 2000);
    }
  };

  const handleComplete = () => {
    if (sessionManager.current) {
      const stats = sessionManager.current.getStats();
      stopListening();
      onComplete(stats);
    }
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
