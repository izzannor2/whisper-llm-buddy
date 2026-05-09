import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertCircle } from 'lucide-react';
import { resolveModelSync } from '@/lib/model-routing';
import { getCachedRegistry, getModelRegistry, type ModelRegistrySnapshot } from '@/lib/model-registry';
import { useAgentStatus } from '@/hooks/use-agent-status';
import { getModelCallLog, type ModelCallRecord } from '@/lib/chat-api';

function Row({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean | null }) {
  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-mono text-right">
        {ok === true && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
        {ok === false && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
        {ok === null && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />}
        {value}
      </span>
    </div>
  );
}

export function ChatHealthCard() {
  const [snap, setSnap] = useState<ModelRegistrySnapshot | null>(() => getCachedRegistry());
  const [lastCall, setLastCall] = useState<ModelCallRecord | null>(null);
  const agent = useAgentStatus();

  useEffect(() => {
    let alive = true;
    getModelRegistry().then((s) => { if (alive) setSnap(s); }).catch(() => {});
    const onCall = () => {
      const log = getModelCallLog();
      setLastCall(log[log.length - 1] || null);
    };
    onCall();
    window.addEventListener('model-call-logged', onCall);
    return () => { alive = false; window.removeEventListener('model-call-logged', onCall); };
  }, []);

  const assistant = resolveModelSync('assistant', snap);
  const voice = resolveModelSync('voice', snap);
  const ollamaCount = snap?.ollama.length ?? 0;
  const ggufCount = snap?.gguf.length ?? 0;
  const lastError = lastCall && !lastCall.ok ? lastCall.error : null;

  return (
    <Card className="border-border/60 max-w-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" /> Chat Health
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Row
          label="Assistant model"
          value={assistant.detected?.name || assistant.model || <span className="text-muted-foreground italic">none</span>}
          ok={!!assistant.detected}
        />
        <Row
          label="Provider"
          value={assistant.provider}
          ok={assistant.provider !== 'auto' || !!assistant.detected}
        />
        <Row label="Agent (3847)" value={agent.connected ? 'online' : 'offline'} ok={agent.connected} />
        <Row label="Ollama models" value={ollamaCount} ok={ollamaCount > 0} />
        <Row label="GGUF models" value={ggufCount} ok={ggufCount > 0} />
        <Row
          label="Voice model"
          value={voice.detected?.name || <span className="text-muted-foreground italic">none</span>}
          ok={!!voice.detected}
        />
        {lastError ? (
          <div className="mt-2 flex items-start gap-2 text-xs p-2 rounded bg-destructive/10 border border-destructive/30">
            <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
            <span className="text-destructive break-all">{lastError}</span>
          </div>
        ) : (
          <div className="mt-2 text-[10px] text-muted-foreground">
            {lastCall ? (
              <>Last: {lastCall.role} · {lastCall.backend} · {lastCall.responseMs}ms</>
            ) : (
              <>No requests yet.</>
            )}
          </div>
        )}
        {!assistant.detected && (
          <Badge variant="outline" className="mt-2 text-amber-400 border-amber-400/40 text-[10px]">
            No models detected — open Settings → Models
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
