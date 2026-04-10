import { useState, useEffect, useRef } from 'react';

interface AgentStatus {
  connected: boolean;
  version?: string;
  platform?: string;
  sessionToken?: string;
}

export function useAgentStatus(pollInterval = 10000): AgentStatus {
  const [status, setStatus] = useState<AgentStatus>({ connected: false });
  const tokenRef = useRef<string | undefined>();

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('http://localhost:3847/status', { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok && active) {
          const data = await res.json();
          tokenRef.current = data.sessionToken;
          setStatus({
            connected: true,
            version: data.version,
            platform: data.platform,
            sessionToken: data.sessionToken,
          });
        } else if (active) {
          setStatus({ connected: false });
        }
      } catch {
        if (active) setStatus({ connected: false });
      }
    };

    check();
    const interval = setInterval(check, pollInterval);
    return () => { active = false; clearInterval(interval); };
  }, [pollInterval]);

  return status;
}
