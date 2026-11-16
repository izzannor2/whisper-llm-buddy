import { useState } from 'react';
import { Bot, Check, Copy, ExternalLink, Github, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ASSISTANT_OPTIONS, ASSISTANT_STORAGE_KEY, buildAssistantHandoff, normalizeGithubRepository, readAssistantPreferences } from '@/lib/assistant-handoff';

export function AssistantsPanel() {
  const [preferences, setPreferences] = useState(() => {
    try { return readAssistantPreferences(localStorage.getItem(ASSISTANT_STORAGE_KEY)); }
    catch { return readAssistantPreferences(null); }
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const selected = ASSISTANT_OPTIONS.find(option => option.id === preferences.assistant);
  const change = (patch: Partial<typeof preferences>) => {
    setPreferences(previous => ({ ...previous, ...patch })); setSaved(false); setError('');
  };
  const reportError = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'Could not prepare the handoff.';
    setError(message);
  };
  const save = () => {
    try {
      const next = { ...preferences, repository: preferences.repository.trim() ? normalizeGithubRepository(preferences.repository) : '' };
      localStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(next));
      setPreferences(next); setSaved(true); setError(''); toast.success('Assistant preferences saved');
    } catch (cause) { reportError(cause); }
  };
  const copyHandoff = async () => {
    try { await navigator.clipboard.writeText(buildAssistantHandoff(preferences)); setError(''); toast.success('Project handoff copied'); }
    catch (cause) { reportError(cause); }
  };
  const openRepository = () => {
    try { window.open(normalizeGithubRepository(preferences.repository), '_blank', 'noopener,noreferrer'); setError(''); }
    catch (cause) { reportError(cause); }
  };

  return <div className="space-y-8 min-w-0">
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-mono uppercase text-accent mb-2">External tools</p><h2 className="text-xl font-semibold">Coding assistants</h2></div>
        <span className="shrink-0 border border-border rounded-md px-2 py-1 text-xs text-muted-foreground">Manual handoff</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ASSISTANT_OPTIONS.map(option => <Button key={option.id} variant="outline" aria-pressed={preferences.assistant === option.id}
          onClick={() => change({ assistant: option.id })}
          className={cn('h-auto min-h-20 justify-start gap-3 p-4 whitespace-normal text-left hover:bg-secondary hover:text-foreground', preferences.assistant === option.id && 'border-accent bg-accent/5')}>
          <Bot className="text-accent" /><span className="flex-1"><span className="block font-medium">{option.name}</span><span className="block text-xs text-muted-foreground mt-1">{option.detail}</span></span>
          {preferences.assistant === option.id && <Check className="text-accent" />}
        </Button>)}
      </div>
      {preferences.assistant === 'custom' && <div className="space-y-2"><Label htmlFor="assistant-name">Assistant name</Label><Input id="assistant-name" value={preferences.customName} onChange={event => change({ customName: event.target.value })} placeholder="Your coding assistant" /></div>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={save}><Save />{saved ? 'Saved' : 'Save preferences'}</Button>
        {selected?.url && <Button variant="ghost" asChild><a href={selected.url} target="_blank" rel="noopener noreferrer"><ExternalLink />{selected.name} setup</a></Button>}
      </div>
      <p className="text-xs text-muted-foreground">Not connected. Sign in and run the assistant separately. Preferences stay in this browser; no keys are stored here.</p>
    </section>
    <section className="border-t border-border pt-6 space-y-4">
      <h3 className="font-semibold flex items-center gap-2"><Github className="h-5 w-5" />GitHub project</h3>
      <div className="space-y-2"><Label htmlFor="assistant-repository">Repository URL</Label><Input id="assistant-repository" type="url" value={preferences.repository} onChange={event => change({ repository: event.target.value })} placeholder="https://github.com/owner/repository" /></div>
      <div className="space-y-2"><Label htmlFor="assistant-task">Project goal</Label><Textarea id="assistant-task" value={preferences.task} onChange={event => change({ task: event.target.value })} rows={5} placeholder="Understand this project, modernize the interface, and preserve its existing functionality…" /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button onClick={copyHandoff}><Copy />Copy project handoff</Button><Button variant="outline" onClick={openRepository}><ExternalLink />Open repository</Button></div>
      <p className="text-xs text-muted-foreground">Repository access is handled by your assistant. Private repositories require its GitHub sign-in; this page does not clone or execute code.</p>
    </section>
    <div className="flex items-start gap-3 border-t border-border pt-4 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-accent" /><p>Review the license and changes before running code from a repository. Never include passwords or API keys in a handoff.</p></div>
  </div>;
}