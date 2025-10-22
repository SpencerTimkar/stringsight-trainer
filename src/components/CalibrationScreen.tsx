import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AudioEngine } from '@/lib/audio/audioEngine';
import { Volume2, RotateCcw } from 'lucide-react';

interface CalibrationScreenProps {
  onCalibrated: (threshold: number) => void;
  onBack: () => void;
}

const MIN_THRESHOLD = 0.001;
const MAX_THRESHOLD = 0.08;

export default function CalibrationScreen({ onCalibrated, onBack }: CalibrationScreenProps) {
  const [isListening, setIsListening] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [status, setStatus] = useState('When you are ready, press “Start calibration” and play your high E string at your practice volume.');
  const [error, setError] = useState<string | null>(null);
  
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const levelIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);
  
  const startListening = async () => {
    setError(null);
    setPeakLevel(0);
    setInputLevel(0);
    
    try {
      stopListening();
      
      const engine = new AudioEngine({ gateThreshold: MIN_THRESHOLD });
      await engine.start(() => {});
      audioEngineRef.current = engine;
      setIsListening(true);
      setStatus('Play your high E string at your normal practice volume...');
      
      levelIntervalRef.current = setInterval(() => {
        if (!audioEngineRef.current) return;
        const level = audioEngineRef.current.getInputLevel();
        setInputLevel(level);
        setPeakLevel(prev => Math.max(prev, level));
      }, 50);
    } catch (err) {
      console.error(err);
      setError('Could not access your microphone. Please check permissions and try again.');
    }
  };
  
  const stopListening = () => {
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    
    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
      audioEngineRef.current = null;
    }
    
    setIsListening(false);
  };
  
  const handleAccept = () => {
    if (peakLevel <= 0) {
      setError('We did not detect a note. Try the calibration again or use the default level.');
      return;
    }
    
    const targetThreshold = Math.min(
      MAX_THRESHOLD,
      Math.max(MIN_THRESHOLD, peakLevel * 0.35)
    );
    
    stopListening();
    onCalibrated(targetThreshold);
  };
  
  const handleSkip = () => {
    stopListening();
    onCalibrated(0.01);
  };
  
  const handleRetry = () => {
    stopListening();
    setStatus('When you are ready, press “Start calibration” and play your high E string at your practice volume.');
    setPeakLevel(0);
    setInputLevel(0);
    setError(null);
  };
  
  const peakPercent = Math.min(100, Math.round(peakLevel * 1000));
  const livePercent = Math.min(100, Math.round(inputLevel * 1000));
  
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <Card className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Volume2 className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold">Calibrate Input</h1>
              <p className="text-sm text-muted-foreground">{status}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Live input</span>
                <span className="font-mono">{livePercent}%</span>
              </div>
              <Progress value={livePercent} />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Peak level</span>
                <span className="font-mono">{peakPercent}%</span>
              </div>
              <Progress value={peakPercent} />
              <p className="text-xs text-muted-foreground">
                Hold a note steadily; we will set the gate to roughly one third of your peak level.
              </p>
            </div>
          </div>
          
          {error && (
            <div className="p-3 rounded-md bg-error/10 text-sm text-error">
              {error}
            </div>
          )}
          
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
            {!isListening && (
              <Button onClick={startListening}>
                Start calibration
              </Button>
            )}
            {isListening && (
              <>
                <Button onClick={handleAccept} disabled={peakLevel <= 0}>
                  Use this level
                </Button>
                <Button variant="secondary" onClick={handleRetry}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Try again
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={handleSkip}>
              Use default level
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
