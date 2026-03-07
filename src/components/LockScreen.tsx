import { useState } from 'react';
import { Lock, Unlock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LockScreenProps {
  onUnlock: () => void;
  pin?: string;
}

export function LockScreen({ onUnlock, pin }: LockScreenProps) {
  const [inputPin, setInputPin] = useState('');
  const [error, setError] = useState(false);

  const handleUnlock = () => {
    if (!pin || inputPin === pin) {
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => setError(false), 1500);
      setInputPin('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleUnlock();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-xl">
      <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full">
        <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center border border-accent/20">
          <Lock className="w-10 h-10 text-accent" />
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground mb-1">LocalDev AI Locked</h2>
          <p className="text-sm text-muted-foreground">
            {pin ? 'Enter your PIN to unlock' : 'Click unlock to continue'}
          </p>
        </div>

        {pin ? (
          <div className="w-full space-y-3">
            <Input
              type="password"
              value={inputPin}
              onChange={(e) => setInputPin(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter PIN"
              className={`text-center text-lg tracking-[0.5em] ${error ? 'border-destructive animate-shake' : ''}`}
              maxLength={6}
              autoFocus
            />
            {error && <p className="text-destructive text-xs text-center">Incorrect PIN</p>}
          </div>
        ) : null}

        <Button onClick={handleUnlock} className="w-full gap-2" size="lg">
          <Unlock className="w-4 h-4" />
          Unlock
        </Button>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Shield className="w-3.5 h-3.5" />
          <span className="text-xs">Privacy protection active</span>
        </div>
      </div>
    </div>
  );
}
