import { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ChatSidebar } from '@/components/ChatSidebar';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput, ChatInputRef } from '@/components/ChatInput';
import { SettingsDialog } from '@/components/SettingsDialog';
import { TypingIndicator } from '@/components/TypingIndicator';
import { EmptyState } from '@/components/EmptyState';
import { CodeLibrary } from '@/components/CodeLibrary';
import { OpenClawOverlay } from '@/components/OpenClawOverlay';
import { IDEMode } from '@/lib/ide-types';
import { getIDESettings, saveIDESettings } from '@/lib/ide-store';
import {
  Conversation,
  Message,
  getAllConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  generateId,
  initDB,
} from '@/lib/db';
import {
  ChatSettings,
  loadSettings,
  saveSettings,
  sendChatMessage,
} from '@/lib/chat-api';
import { speak, isTTSSupported, stopSpeaking } from '@/lib/tts';
import { cn } from '@/lib/utils';

export default function Index() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings());
  const [currentMode, setCurrentMode] = useState<IDEMode>(() => getIDESettings().mode);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [codeLibraryOpen, setCodeLibraryOpen] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [openClawOpen, setOpenClawOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const { toast } = useToast();

  // Initialize DB and load conversations
  useEffect(() => {
    const init = async () => {
      await initDB();
      const convs = await getAllConversations();
      setConversations(convs);
    };
    init();
  }, []);

  // Listen for open-settings event
  useEffect(() => {
    const handleOpenSettings = () => {
      setSettingsOpen(true);
    };
    window.addEventListener('open-settings', handleOpenSettings);
    return () => window.removeEventListener('open-settings', handleOpenSettings);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentConversation?.messages, streamingContent]);

  const handleModeChange = (mode: IDEMode) => {
    setCurrentMode(mode);
    saveIDESettings({ mode });
    toast({ title: `Switched to ${mode.replace('-', ' ')}` });
  };

  const loadConversation = async (id: string) => {
    const conv = await getConversation(id);
    if (conv) {
      setCurrentConversation(conv);
    }
  };

  const createNewConversation = () => {
    setCurrentConversation(null);
    setStreamingContent('');
  };

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversation?.id === id) {
      setCurrentConversation(null);
    }
    toast({ title: 'Chat deleted' });
  };

  const handleSendMessage = async (content: string) => {
    return sendMessageAndGetResponse(content);
  };

  const handleVoiceCallMessage = async (content: string): Promise<string> => {
    return sendMessageAndGetResponse(content);
  };

  const sendMessageAndGetResponse = async (content: string): Promise<string> => {
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    let conv = currentConversation;
    if (!conv) {
      conv = {
        id: generateId(),
        title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: settings.model,
      };
    }

    conv = {
      ...conv,
      messages: [...conv.messages, userMessage],
      updatedAt: Date.now(),
    };
    setCurrentConversation(conv);
    await saveConversation(conv);
    setConversations(prev => {
      const existing = prev.find(c => c.id === conv!.id);
      if (existing) {
        return prev.map(c => (c.id === conv!.id ? conv! : c));
      }
      return [conv!, ...prev];
    });

    setIsLoading(true);
    setStreamingContent('');
    setModelLoaded(true);
    abortRef.current = new AbortController();

    let fullResponse = '';
    
    try {
      const chatMessages = conv.messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      await sendChatMessage(
        chatMessages,
        settings,
        (chunk) => {
          fullResponse += chunk;
          setStreamingContent(fullResponse);
        }
      );

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now(),
      };

      const updatedConv = {
        ...conv,
        messages: [...conv.messages, assistantMessage],
        updatedAt: Date.now(),
      };
      setCurrentConversation(updatedConv);
      await saveConversation(updatedConv);
      setConversations(prev =>
        prev.map(c => (c.id === updatedConv.id ? updatedConv : c))
      );

      if (settings.autoPlayTTS && isTTSSupported() && fullResponse) {
        speak(fullResponse, {
          voice: settings.ttsVoice,
          rate: settings.ttsRate,
          onEnd: () => {
            if (settings.voiceConversation && chatInputRef.current) {
              setTimeout(() => chatInputRef.current?.startListening(), 300);
            }
          },
        });
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      toast({
        variant: 'destructive',
        title: 'Failed to send message',
        description: err.message || 'Check your connection and settings',
      });
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
    
    return fullResponse;
  };

  const handleEditMessage = async (id: string, content: string) => {
    if (!currentConversation) return;

    const messageIndex = currentConversation.messages.findIndex(m => m.id === id);
    if (messageIndex === -1) return;

    const updatedMessages = currentConversation.messages.slice(0, messageIndex);
    updatedMessages.push({
      ...currentConversation.messages[messageIndex],
      content,
    });

    const updatedConv = {
      ...currentConversation,
      messages: updatedMessages,
      updatedAt: Date.now(),
    };
    setCurrentConversation(updatedConv);
    await saveConversation(updatedConv);

    handleSendMessage(content);
  };

  const handleDeleteMessage = async (id: string) => {
    if (!currentConversation) return;

    const updatedMessages = currentConversation.messages.filter(m => m.id !== id);
    const updatedConv = {
      ...currentConversation,
      messages: updatedMessages,
      updatedAt: Date.now(),
    };
    setCurrentConversation(updatedConv);
    await saveConversation(updatedConv);
    setConversations(prev =>
      prev.map(c => (c.id === updatedConv.id ? updatedConv : c))
    );
  };

  const handleSettingsSave = (newSettings: ChatSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    toast({ title: 'Settings saved' });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Sidebar */}
      <div
        className={cn(
          'fixed lg:relative inset-y-0 left-0 z-40 w-72 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <ChatSidebar
          conversations={conversations}
          currentId={currentConversation?.id || null}
          onSelect={loadConversation}
          onNew={createNewConversation}
          onDelete={handleDeleteConversation}
          onOpenSettings={() => setSettingsOpen(true)}
          currentMode={currentMode}
          onModeChange={handleModeChange}
          onCollapse={() => setSidebarOpen(false)}
        />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="max-w-4xl mx-auto py-6 px-4 h-full">
            {!currentConversation || currentConversation.messages.length === 0 ? (
              <EmptyState mode={currentMode} />
            ) : (
              <div className="space-y-6">
                {currentConversation.messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    onEdit={msg.role === 'user' ? handleEditMessage : undefined}
                    onDelete={handleDeleteMessage}
                  />
                ))}
                {streamingContent && (
                  <ChatMessage
                    message={{
                      id: 'streaming',
                      role: 'assistant',
                      content: streamingContent,
                      timestamp: Date.now(),
                    }}
                  />
                )}
                {isLoading && !streamingContent && <TypingIndicator />}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <ChatInput
          ref={chatInputRef}
          onSend={handleSendMessage}
          isLoading={isLoading}
          onStop={() => abortRef.current?.abort()}
          autoSendOnVoice={settings.voiceConversation}
          modelLoaded={modelLoaded}
        />
      </div>

      {/* Settings dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={handleSettingsSave}
      />

      {/* Code Library panel */}
      {codeLibraryOpen && (
        <div className="fixed inset-y-0 right-0 w-80 z-50 shadow-xl">
          <CodeLibrary onClose={() => setCodeLibraryOpen(false)} />
        </div>
      )}

      {/* OpenClaw Floating Overlay */}
      {openClawOpen && (
        <OpenClawOverlay
          onClose={() => setOpenClawOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {/* OpenClaw Toggle Button */}
      {!openClawOpen && (
        <Button
          onClick={() => setOpenClawOpen(true)}
          className="fixed bottom-24 right-6 z-50 h-12 w-12 rounded-full shadow-lg bg-gradient-to-br from-primary to-primary/70 hover:scale-105 transition-transform"
          size="icon"
        >
          <Zap className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
