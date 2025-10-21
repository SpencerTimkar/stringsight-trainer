import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SessionConfig } from '@/lib/trainer/sessionManager';
import { getStringName } from '@/lib/music/noteMapping';

interface SettingsScreenProps {
  onStart: (config: SessionConfig) => void;
}

export default function SettingsScreen({ onStart }: SettingsScreenProps) {
  const [config, setConfig] = useState<SessionConfig>({
    enabledStrings: [6, 5, 4, 3, 2, 1],
    minFret: 0,
    maxFret: 12,
    toleranceCents: 25,
    mode: 'untimed',
    enharmonicPolicy: 'random'
  });

  const toggleString = (string: number) => {
    setConfig(prev => ({
      ...prev,
      enabledStrings: prev.enabledStrings.includes(string)
        ? prev.enabledStrings.filter(s => s !== string)
        : [...prev.enabledStrings, string].sort((a, b) => b - a)
    }));
  };

  const handleStart = () => {
    if (config.enabledStrings.length === 0) {
      return;
    }
    onStart(config);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">
            String<span className="text-primary">Sight</span>
          </h1>
          <p className="text-muted-foreground">Configure your practice session</p>
        </div>

        {/* Settings Card */}
        <Card className="p-6 space-y-6">
          {/* String Selection */}
          <div className="space-y-3">
            <Label className="text-base">Enabled Strings</Label>
            <div className="grid grid-cols-6 gap-2">
              {[6, 5, 4, 3, 2, 1].map(string => (
                <Button
                  key={string}
                  variant={config.enabledStrings.includes(string) ? 'default' : 'outline'}
                  className="h-16 flex flex-col gap-1"
                  onClick={() => toggleString(string)}
                >
                  <span className="text-lg font-bold">{string}</span>
                  <span className="text-xs">{getStringName(string)}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Fret Range */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Fret Range</Label>
              <span className="text-sm font-mono text-muted-foreground">
                {config.minFret} - {config.maxFret}
              </span>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Minimum Fret</Label>
                <Slider
                  value={[config.minFret]}
                  onValueChange={([value]) => setConfig(prev => ({ ...prev, minFret: value }))}
                  min={0}
                  max={config.maxFret - 1}
                  step={1}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Maximum Fret</Label>
                <Slider
                  value={[config.maxFret]}
                  onValueChange={([value]) => setConfig(prev => ({ ...prev, maxFret: value }))}
                  min={config.minFret + 1}
                  max={24}
                  step={1}
                />
              </div>
            </div>
          </div>

          {/* Tolerance */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Pitch Tolerance</Label>
              <span className="text-sm font-mono text-muted-foreground">
                ±{config.toleranceCents} cents
              </span>
            </div>
            <Slider
              value={[config.toleranceCents]}
              onValueChange={([value]) => setConfig(prev => ({ ...prev, toleranceCents: value }))}
              min={5}
              max={50}
              step={5}
            />
            <p className="text-xs text-muted-foreground">
              Lower = stricter (5¢ = very precise, 50¢ = forgiving)
            </p>
          </div>

          {/* Enharmonic Policy */}
          <div className="space-y-3">
            <Label className="text-base">Note Spelling</Label>
            <div className="grid grid-cols-3 gap-2">
              {['random', 'sharps', 'flats'].map(policy => (
                <Button
                  key={policy}
                  variant={config.enharmonicPolicy === policy ? 'default' : 'outline'}
                  onClick={() => setConfig(prev => ({ ...prev, enharmonicPolicy: policy as any }))}
                  className="capitalize"
                >
                  {policy}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* Start Button */}
        <Button 
          size="lg" 
          className="w-full text-lg h-14"
          onClick={handleStart}
          disabled={config.enabledStrings.length === 0}
        >
          Start Practice
        </Button>

        {/* Info */}
        <p className="text-center text-sm text-muted-foreground">
          Make sure your microphone is connected and enabled
        </p>
      </div>
    </div>
  );
}
