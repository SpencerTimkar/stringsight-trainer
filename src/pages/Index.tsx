import { useState } from 'react';
import SettingsScreen from '@/components/SettingsScreen';
import CalibrationScreen from '@/components/CalibrationScreen';
import PracticeScreen from '@/components/PracticeScreen';
import ResultsScreen from '@/components/ResultsScreen';
import { SessionConfig, SessionStats } from '@/lib/trainer/sessionManager';

type Screen = 'settings' | 'calibration' | 'practice' | 'results';

const Index = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('settings');
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [gateThreshold, setGateThreshold] = useState<number>(0.01);

  const handleStart = (config: SessionConfig) => {
    setSessionConfig(config);
    setGateThreshold(0.01);
    setCurrentScreen('calibration');
  };

  const handleCalibrationBack = () => {
    setCurrentScreen('settings');
  };

  const handleCalibrated = (threshold: number) => {
    setGateThreshold(threshold);
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
    setGateThreshold(0.01);
  };

  return (
    <>
      {currentScreen === 'settings' && (
        <SettingsScreen onStart={handleStart} />
      )}
      
      {currentScreen === 'calibration' && sessionConfig && (
        <CalibrationScreen
          onCalibrated={handleCalibrated}
          onBack={handleCalibrationBack}
        />
      )}
      
      {currentScreen === 'practice' && sessionConfig && (
        <PracticeScreen 
          config={sessionConfig} 
          gateThreshold={gateThreshold}
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
