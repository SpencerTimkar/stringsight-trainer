import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SessionStats } from '@/lib/trainer/sessionManager';
import { getStringName } from '@/lib/music/noteMapping';
import { Trophy, Target, Clock, TrendingUp } from 'lucide-react';

interface ResultsScreenProps {
  stats: SessionStats;
  onRestart: () => void;
  onNewSession: () => void;
}

export default function ResultsScreen({ stats, onRestart, onNewSession }: ResultsScreenProps) {
  const accuracy = stats.totalAttempts > 0
    ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100)
    : 0;

  const avgTimeSeconds = stats.averageTime / 1000;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 mb-4">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold">Session Complete!</h1>
          <p className="text-muted-foreground">Here's how you performed</p>
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <Target className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="text-3xl font-bold">{stats.totalPrompts}</p>
            <p className="text-sm text-muted-foreground">Prompts</p>
          </Card>

          <Card className="p-4 text-center">
            <div className="w-6 h-6 mx-auto mb-2 text-success">✓</div>
            <p className="text-3xl font-bold text-success">{stats.correctAttempts}</p>
            <p className="text-sm text-muted-foreground">Correct</p>
          </Card>

          <Card className="p-4 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 text-accent" />
            <p className="text-3xl font-bold">{accuracy}%</p>
            <p className="text-sm text-muted-foreground">Accuracy</p>
          </Card>

          <Card className="p-4 text-center">
            <Clock className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-3xl font-bold">{avgTimeSeconds.toFixed(1)}s</p>
            <p className="text-sm text-muted-foreground">Avg Time</p>
          </Card>
        </div>

        {/* Per-String Breakdown */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Performance by String</h2>
          <div className="space-y-3">
            {Array.from(stats.perStringAccuracy.entries())
              .sort(([a], [b]) => b - a)
              .map(([string, stringStats]) => {
                const stringAccuracy = stringStats.total > 0
                  ? Math.round((stringStats.correct / stringStats.total) * 100)
                  : 0;

                return (
                  <div key={string} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono">
                        String {string} ({getStringName(string)})
                      </span>
                      <span className="font-mono">
                        {stringStats.correct}/{stringStats.total} ({stringAccuracy}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${stringAccuracy}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>

        {/* Top Missed Positions */}
        {stats.missedPositions.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Most Missed Positions</h2>
            <div className="space-y-2">
              {stats.missedPositions
                .sort((a, b) => b.missCount - a.missCount)
                .slice(0, 5)
                .map((missed, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <span className="font-mono">
                      {missed.position.note.noteName} on String {missed.position.string} (Fret {missed.position.fret})
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {missed.missCount} miss{missed.missCount > 1 ? 'es' : ''}
                    </span>
                  </div>
                ))}
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <Button size="lg" className="flex-1" onClick={onRestart}>
            Practice Same Settings
          </Button>
          <Button size="lg" variant="outline" className="flex-1" onClick={onNewSession}>
            New Session
          </Button>
        </div>
      </div>
    </div>
  );
}
