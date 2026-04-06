import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Pencil, Trash2, User, Bot, Volume2, VolumeX, ExternalLink, Brain, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Message } from '@/lib/db';
import { cn } from '@/lib/utils';
import { speak, stopSpeaking, isTTSSupported } from '@/lib/tts';
import { storeMemory } from '@/lib/memory-store';
import { addFeedback, getFeedback } from '@/lib/feedback-tracker';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from '@/components/CodeBlock';

const ROUTE_MAP: Record<string, { label: string; path: string }> = {
  sandbox: { label: 'Open Sandbox', path: '/sandbox' },
  ide: { label: 'Open IDE', path: '/ide' },
  iot: { label: 'Open IoT Workspace', path: '/iot' },
  improve: { label: 'Open AI Improvement', path: '/improve' },
};

function RouteButtons({ content, navigate }: { content: string; navigate: (path: string) => void }) {
  const matches = content.match(/\[ROUTE:(\w+)\]/g);
  if (!matches) return null;
  const routes = [...new Set(matches.map(m => m.match(/\[ROUTE:(\w+)\]/)?.[1]).filter(Boolean))] as string[];
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {routes.map(r => {
        const info = ROUTE_MAP[r];
        if (!info) return null;
        return (
          <Button key={r} size="sm" variant="outline" className="gap-1.5 text-xs border-accent/30 hover:bg-accent/10"
            onClick={() => navigate(info.path)}>
            <ExternalLink className="w-3 h-3" />{info.label}
          </Button>
        );
      })}
    </div>
  );
}

interface ChatMessageProps {
  message: Message;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  onAddToInput?: (text: string) => void;
}

export function ChatMessage({ message, onEdit, onDelete, onAddToInput }: ChatMessageProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [feedbackState, setFeedbackState] = useState<'up' | 'down' | null>(() => getFeedback(message.id)?.rating || null);

  const isUser = message.role === 'user';
  const ttsSupported = isTTSSupported();

  useEffect(() => {
    return () => { if (isSpeaking) window.speechSynthesis.cancel(); };
  }, [isSpeaking]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (onEdit && editContent.trim()) { onEdit(message.id, editContent.trim()); setIsEditing(false); }
  };

  const handleSpeak = useCallback(() => {
    if (isSpeaking) { stopSpeaking(); setIsSpeaking(false); }
    else { speak(message.content, { onEnd: () => setIsSpeaking(false) }); setIsSpeaking(true); }
  }, [isSpeaking, message.content]);

  // Strip [ROUTE:xxx] tags from display content
  const displayContent = message.content.replace(/\[ROUTE:\w+\]/g, '').trim();

  return (
    <div className={cn('group flex gap-3 animate-fade-in', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', isUser ? 'bg-primary' : 'bg-accent')}>
        {isUser ? <User className="w-4 h-4 text-primary-foreground" /> : <Bot className="w-4 h-4 text-accent-foreground" />}
      </div>

      <div className={cn('flex-1 max-w-[80%]', isUser && 'flex flex-col items-end')}>
        {isEditing ? (
          <div className="space-y-2 w-full">
            <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="min-h-[100px] bg-secondary" autoFocus />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setEditContent(message.content); }}>Cancel</Button>
              <Button size="sm" onClick={handleSaveEdit}>Save</Button>
            </div>
          </div>
        ) : (
          <div className={cn('message-bubble', isUser ? 'message-user' : 'message-assistant')}>
            {/* Render attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.attachments.filter(a => a.dataUrl && a.type.startsWith('image/')).map((att, i) => (
                  <img key={i} src={att.dataUrl} alt={att.name} className="max-w-[200px] max-h-[200px] rounded-md border border-border object-cover" />
                ))}
                {message.attachments.filter(a => !a.type.startsWith('image/')).map((att, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs text-muted-foreground">
                    📎 {att.name}
                  </span>
                ))}
              </div>
            )}
            {isUser ? (
              <p className="whitespace-pre-wrap">{displayContent}</p>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    code: ({ className, children, node, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');
                      const isBlock = match || codeString.includes('\n') || codeString.length > 100;
                      if (isBlock) return <CodeBlock code={codeString} language={match?.[1]} className="my-3" onAddToInput={onAddToInput} />;
                      return <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;
                    },
                    pre: ({ children }) => <>{children}</>,
                  }}
                >{displayContent}</ReactMarkdown>
                <RouteButtons content={message.content} navigate={navigate} />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!isEditing && (
          <div className={cn('flex gap-1 mt-1 transition-opacity', isUser ? 'flex-row-reverse opacity-0 group-hover:opacity-100' : 'opacity-100')}>
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={handleCopy}>
              {copied ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3" />}
            </Button>
            {!isUser && ttsSupported && (
              <Button variant="ghost" size="icon" className={cn('w-7 h-7', isSpeaking && 'text-primary')} onClick={handleSpeak}
                title={isSpeaking ? 'Stop speaking' : 'Read aloud'}>
                {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </Button>
            )}
            {!isUser && (
              <Button variant="ghost" size="icon" className={cn('w-7 h-7', remembered && 'text-primary')}
                onClick={async () => { await storeMemory(message.content, ['chat']); setRemembered(true); }}
                title="Remember this">
                <Brain className={cn("w-3 h-3", remembered && "fill-current")} />
              </Button>
            )}
            {!isUser && (
              <>
                <Button variant="ghost" size="icon" className={cn('w-7 h-7', feedbackState === 'up' && 'text-green-500')}
                  onClick={() => { addFeedback(message.id, 'up'); setFeedbackState('up'); }} title="Good response">
                  <ThumbsUp className={cn("w-3 h-3", feedbackState === 'up' && "fill-current")} />
                </Button>
                <Button variant="ghost" size="icon" className={cn('w-7 h-7', feedbackState === 'down' && 'text-destructive')}
                  onClick={() => { addFeedback(message.id, 'down'); setFeedbackState('down'); }} title="Bad response">
                  <ThumbsDown className={cn("w-3 h-3", feedbackState === 'down' && "fill-current")} />
                </Button>
              </>
            )}
            {isUser && onEdit && (
              <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100" onClick={() => setIsEditing(true)}>
                <Pencil className="w-3 h-3" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100" onClick={() => onDelete(message.id)}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
