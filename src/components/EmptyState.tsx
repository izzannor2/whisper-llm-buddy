import { Lock } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 select-none">
      {/* Large Branding */}
      <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-muted-foreground/30 font-mono mb-4">
        [LOCALDEV]
      </h1>
      
      {/* Tagline */}
      <p className="text-muted-foreground/50 font-mono text-sm md:text-base mb-6">
        with great power comes great responsibility
      </p>

      {/* Encrypted Badge */}
      <div className="flex items-center gap-2 text-accent font-mono text-sm">
        <Lock className="w-4 h-4" />
        <span>encrypted</span>
      </div>
    </div>
  );
}
