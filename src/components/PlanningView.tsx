import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Sparkles, Layers, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getModeTheme } from '@/lib/mode-themes';
import { sendChatMessage, loadSettings } from '@/lib/chat-api';
import { getModeSystemPrompt } from '@/lib/mode-themes';
import { cn } from '@/lib/utils';

interface PlanningViewProps {
  mode: 'app-builder' | 'ai-improvement';
  onStartBuilding: (plan: PlanMessage[]) => void;
}

export interface PlanMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MODE_CONFIG = {
  'app-builder': {
    title: 'Plan Your App',
    subtitle: 'Describe what you want to build. The AI will create a plan before we start coding.',
    placeholder: 'Describe your app idea... e.g., "A task manager with drag-and-drop, user auth, and dark mode"',
    buildLabel: 'Start Building',
    icon: Layers,
    navigateTo: '/ide',
  },
  'ai-improvement': {
    title: 'Plan Improvements',
    subtitle: 'Describe what you want to improve about LocalDev AI. The AI will analyze and create a plan.',
    placeholder: 'What should we improve? e.g., "Make the sidebar more responsive and add keyboard shortcuts"',
    buildLabel: 'Start Improving',
    icon: Sparkles,
    navigateTo: '/improve',
  },
};

export function PlanningView({ mode, onStartBuilding }: PlanningViewProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<PlanMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const theme = getModeTheme(mode);
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: PlanMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const settings = loadSettings();
      const systemPrompt = getModeSystemPrompt(mode) + '\n\nYou are in PLANNING PHASE. Create a structured plan with numbered steps. Include:\n1. Architecture overview\n2. Key files to create/modify\n3. Technologies and libraries needed\n4. Implementation steps\n\nBe specific and actionable. Format with markdown.';

      const chatMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...newMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      let fullResponse = '';
      await sendChatMessage(
        chatMessages,
        { ...settings, systemPrompt: '' },
        (chunk) => { fullResponse += chunk; }
      );

      setMessages(prev => [...prev, { role: 'assistant', content: fullResponse }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStartBuilding = () => {
    onStartBuilding(messages);
    navigate(config.navigateTo, { state: { plan: messages } });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div
        className="px-6 py-8 border-b border-border"
        style={{ background: `linear-gradient(135deg, hsl(${theme.accent} / 0.08), hsl(${theme.accent} / 0.02))` }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, hsl(${theme.accent} / 0.3), hsl(${theme.accent} / 0.1))` }}
            >
              <Icon className="w-6 h-6" style={{ color: `hsl(${theme.accent})` }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{config.title}</h1>
              <p className="text-sm text-muted-foreground">{config.subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Icon className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">Start planning</p>
              <p className="text-sm">Describe your idea and the AI will create a structured plan.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-card border border-border rounded-bl-md'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input + Start Building */}
      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={config.placeholder}
              className="min-h-[44px] max-h-[120px] resize-none flex-1"
              rows={1}
            />
            <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          {messages.length > 0 && (
            <Button
              onClick={handleStartBuilding}
              className="w-full gap-2"
              style={{
                background: `linear-gradient(135deg, hsl(${theme.accent}), hsl(${theme.accent} / 0.8))`,
                color: 'white',
              }}
            >
              {config.buildLabel}
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
