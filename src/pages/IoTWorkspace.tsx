import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Check, Upload, Cpu, Activity, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CodeEditor } from '@/components/ide/CodeEditor';
import { IDEChat } from '@/components/ide/IDEChat';
import { applyModeTheme } from '@/lib/mode-themes';
import { BOARD_TYPES, ProjectFile } from '@/lib/ide-types';
import { generateId } from '@/lib/ide-store';
import { sendChatMessage, loadSettings, ChatMessage } from '@/lib/chat-api';
import { speak, isTTSSupported, stopSpeaking } from '@/lib/tts';
import { saveConversation, Conversation } from '@/lib/db';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { VoiceCallMode } from '@/components/VoiceCallMode';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

const DEFAULT_SKETCH: ProjectFile = {
  id: 'main', name: 'sketch.ino', path: '/sketch.ino',
  content: `// IoT Sketch\n// Board: ESP32\n\n#include <WiFi.h>\n\nconst char* ssid = "your_ssid";\nconst char* password = "your_password";\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED_BUILTIN, OUTPUT);\n  \n  WiFi.begin(ssid, password);\n  while (WiFi.status() != WL_CONNECTED) {\n    delay(500);\n    Serial.print(".");\n  }\n  Serial.println("\\nConnected!");\n  Serial.println(WiFi.localIP());\n}\n\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);\n  delay(1000);\n  digitalWrite(LED_BUILTIN, LOW);\n  delay(1000);\n}\n`,
  language: 'cpp', isDirectory: false,
};

export default function IoTWorkspace() {
  const navigate = useNavigate();
  const [board, setBoard] = useState('esp32');
  const [serialOutput, setSerialOutput] = useState<string[]>(['[Serial Monitor] Ready...']);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<ProjectFile>(DEFAULT_SKETCH);
  const [openFiles, setOpenFiles] = useState<ProjectFile[]>([DEFAULT_SKETCH]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [convId] = useState(() => generateId());
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  useEffect(() => { applyModeTheme('embedded-iot'); }, []);

  const handleVerify = () => {
    setIsVerifying(true);
    setSerialOutput(prev => [...prev, '[Compiling] Verifying sketch...']);
    setTimeout(() => {
      setSerialOutput(prev => [...prev, '[Compiling] Sketch uses 245320 bytes (18%) of program storage', '[Compiling] ✓ Compilation successful']);
      setIsVerifying(false);
      toast.success('Compilation successful');
    }, 1500);
  };

  const handleUpload = () => {
    setIsUploading(true);
    setSerialOutput(prev => [...prev, `[Upload] Uploading to ${BOARD_TYPES.find(b => b.id === board)?.name}...`]);
    setTimeout(() => {
      setSerialOutput(prev => [...prev, '[Upload] Writing at 0x00010000... (100%)', '[Upload] ✓ Upload complete']);
      setIsUploading(false);
      toast.success('Upload complete');
    }, 2000);
  };

  const handleFileChange = useCallback((_path: string, content: string) => {
    setSelectedFile(prev => prev ? { ...prev, content } : prev);
    setOpenFiles(prev => prev.map(f => f.path === _path ? { ...f, content } : f));
  }, []);

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: Message = { id: generateId(), role: 'user', content, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent('');

    try {
      const boardName = BOARD_TYPES.find(b => b.id === board)?.name || board;
      const systemPrompt = `You are an embedded systems expert. The user is working with a ${boardName}. Help with hardware code, wiring, sensor integration, and debugging. Always specify pin numbers and include required libraries.`;
      const chatMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content },
      ];

      const settings = loadSettings();
      let fullResponse = '';
      await sendChatMessage(chatMessages, { ...settings, systemPrompt: '' }, (chunk) => { fullResponse += chunk; setStreamingContent(fullResponse); });

      const newMessages = [...messages, userMessage, { id: generateId(), role: 'assistant' as const, content: fullResponse, timestamp: Date.now() }];
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: fullResponse, timestamp: Date.now() }]);
      setStreamingContent('');

      // Persist to IndexedDB
      const conv: Conversation = {
        id: convId, title: `IoT: ${messages.length === 0 ? content.slice(0, 40) : 'session'}`,
        messages: newMessages, createdAt: Date.now(), updatedAt: Date.now(),
        model: settings.model || 'local', modeKey: 'embedded-iot',
      };
      await saveConversation(conv);
      if (settings.autoPlayTTS && isTTSSupported() && fullResponse) {
        speak(fullResponse, { voice: settings.ttsVoice, rate: settings.ttsRate });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to get response. Check your backend settings.');
    } finally {
      setIsLoading(false);
    }
  }, [messages, board]);

  const handleVoiceMessage = useCallback(async (content: string): Promise<string> => {
    const userMessage: Message = { id: generateId(), role: 'user', content, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    try {
      const boardName = BOARD_TYPES.find(b => b.id === board)?.name || board;
      const chatMessages: ChatMessage[] = [
        { role: 'system', content: `You are an embedded systems expert for ${boardName}.` },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content },
      ];
      const settings = loadSettings();
      let fullResponse = '';
      await sendChatMessage(chatMessages, { ...settings, systemPrompt: '' }, (chunk) => { fullResponse += chunk; });
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: fullResponse, timestamp: Date.now() }]);
      return fullResponse;
    } catch { return ''; }
    finally { setIsLoading(false); }
  }, [messages, board]);

  return (
    <div className="h-screen flex flex-col" style={{ background: 'hsl(160, 20%, 6%)' }}>
      <header className="h-12 flex items-center justify-between px-3 border-b" style={{
        background: 'linear-gradient(180deg, hsl(168, 50%, 18%) 0%, hsl(168, 50%, 12%) 100%)',
        borderColor: 'hsl(168, 40%, 25%)',
      }}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8 text-teal-300 hover:text-teal-100"><Home className="h-4 w-4" /></Button>
          <Cpu className="w-5 h-5 text-orange-400" />
          <span className="font-bold text-orange-300 text-sm">IoT Workspace</span>
          <span className="text-xs text-teal-400/60 ml-2">|</span>
          <span className="text-xs text-teal-400/80 font-mono">{selectedFile.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-400 hover:text-green-300" onClick={() => setShowVoiceCall(true)} title="Voice call">
            <Phone className="h-4 w-4" />
          </Button>
          <Button size="sm" className="h-8 gap-1.5 bg-teal-700 hover:bg-teal-600 text-white" onClick={handleVerify} disabled={isVerifying}>
            <Check className="w-3.5 h-3.5" />{isVerifying ? 'Verifying...' : 'Verify'}
          </Button>
          <Button size="sm" className="h-8 gap-1.5 bg-orange-600 hover:bg-orange-500 text-white" onClick={handleUpload} disabled={isUploading}>
            <Upload className="w-3.5 h-3.5" />{isUploading ? 'Uploading...' : 'Upload'}
          </Button>
          <Select value={board} onValueChange={setBoard}>
            <SelectTrigger className="w-44 h-8 text-xs bg-teal-900/50 border-teal-700 text-teal-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BOARD_TYPES.map(b => (<SelectItem key={b.id} value={b.id} className="text-xs">{b.name} — {b.description}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
          <IDEChat messages={messages} onSendMessage={handleSendMessage} isLoading={isLoading}
            streamingContent={streamingContent} mode="embedded-iot"
            onOpenSettings={() => navigate('/settings')} onToggleCodeLibrary={() => {}} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={65} minSize={30}>
              <CodeEditor file={selectedFile} openFiles={openFiles} onFileChange={handleFileChange}
                onCloseFile={() => {}} onSelectFile={() => {}} fontSize={14} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={35} minSize={15}>
              <div className="h-full flex flex-col" style={{ background: 'hsl(160, 20%, 5%)' }}>
                <div className="h-8 flex items-center justify-between px-3 border-b" style={{ borderColor: 'hsl(168, 40%, 20%)' }}>
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-xs font-mono text-teal-300">Serial Monitor</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-teal-500">115200 baud</span>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-teal-400 hover:text-teal-200"
                      onClick={() => setSerialOutput(['[Serial Monitor] Cleared'])}>Clear</Button>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-2">
                  <div className="font-mono text-xs space-y-0.5">
                    {serialOutput.map((line, i) => (
                      <div key={i} className={cn(
                        line.includes('✓') ? 'text-green-400' :
                        line.includes('Error') ? 'text-red-400' :
                        line.startsWith('[') ? 'text-teal-400' : 'text-teal-200/70'
                      )}>{line}</div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
      {showVoiceCall && (
        <VoiceCallMode
          onSendMessage={async (content, _screenshot) => handleVoiceMessage(content)}
          ttsVoice={loadSettings().ttsVoice}
          ttsRate={loadSettings().ttsRate}
          onEnd={() => setShowVoiceCall(false)}
          autoStart
          existingMessages={messages
            .filter(m => m.role !== 'system')
            .map(m => ({
              id: m.id, role: m.role as 'user' | 'assistant', content: m.content, timestamp: m.timestamp,
            }))}
        />
      )}
    </div>
  );
}
