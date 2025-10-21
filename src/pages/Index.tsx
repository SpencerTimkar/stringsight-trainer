import { useState } from 'react';
import SettingsScreen from '@/components/SettingsScreen';
import PracticeScreen from '@/components/PracticeScreen';
import ResultsScreen from '@/components/ResultsScreen';
import { SessionConfig, SessionStats } from '@/lib/trainer/sessionManager';

type Screen = 'settings' | 'practice' | 'results';

const Index = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('settings');
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

  const handleStart = (config: SessionConfig) => {
    setSessionConfig(config);
    setCurrentScreen('practice');
  };

  const handleComplete = (stats: SessionStats) => {
    setSessionStats(stats);
    setCurrentScreen('results');
  };

  const handleRestart = () => {
    if (sessionConfig) {
      setCurrentScreen('practice');
    }
  };

  const handleNewSession = () => {
    setCurrentScreen('settings');
    setSessionConfig(null);
    setSessionStats(null);
  };

  return (
    <>
      {currentScreen === 'settings' && (
        <SettingsScreen onStart={handleStart} />
      )}
      
      {currentScreen === 'practice' && sessionConfig && (
        <PracticeScreen 
          config={sessionConfig} 
          onComplete={handleComplete}
        />
      )}
      
      {currentScreen === 'results' && sessionStats && (
        <ResultsScreen 
          stats={sessionStats}
          onRestart={handleRestart}
          onNewSession={handleNewSession}
        />
      )}
    </>
  );
};

export default Index;
