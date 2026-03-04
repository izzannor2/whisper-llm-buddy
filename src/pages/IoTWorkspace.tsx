import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Check, Upload, ChevronDown, Settings, Cpu, Activity, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CodeEditor } from '@/components/ide/CodeEditor';
import { IDEChat } from '@/components/ide/IDEChat';
import { applyModeTheme } from '@/lib/mode-themes';
import { BOARD_TYPES, ProjectFile } from '@/lib/ide-types';
import { generateId } from '@/lib/ide-store';
import { streamChat, ChatMessage } from '@/lib/ollama-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Message extends ChatMessage {
  id: string;
  timestamp: number;
}

const DEFAULT_SKETCH: ProjectFile = {
  id: 'main',
  name: 'sketch.ino',
  path: '/sketch.ino',
  content: `// IoT Sketch
// Board: ESP32

#include <WiFi.h>

const char* ssid = "your_ssid";
const char* password = "your_password";

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nConnected!");
  Serial.println(WiFi.localIP());
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
`,
  language: 'cpp',
  isDirectory: false,
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

  // Apply IoT theme on mount
  useState(() => { applyModeTheme('embedded-iot'); });

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

  const handleFileChange = useCallback((path: string, content: string) => {
    setSelectedFile(prev => prev ? { ...prev, content } : prev);
    setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, content } : f));
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

      let fullResponse = '';
      for await (const chunk of streamChat(chatMessages)) {
        fullResponse += chunk;
        setStreamingContent(fullResponse);
      }

      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: fullResponse, timestamp: Date.now() }]);
      setStreamingContent('');
    } catch {
      toast.error('Failed to get response. Check your LLM connection.');
    } finally {
      setIsLoading(false);
    }
  }, [messages, board]);

  return (
    <div className="h-screen flex flex-col" style={{ background: 'hsl(160, 20%, 6%)' }}>
      {/* Arduino-style header */}
      <header className="h-12 flex items-center justify-between px-3 border-b" style={{
        background: 'linear-gradient(180deg, hsl(168, 50%, 18%) 0%, hsl(168, 50%, 12%) 100%)',
        borderColor: 'hsl(168, 40%, 25%)',
      }}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8 text-teal-300 hover:text-teal-100">
            <Home className="h-4 w-4" />
          </Button>
          <Cpu className="w-5 h-5 text-orange-400" />
          <span className="font-bold text-orange-300 text-sm">IoT Workspace</span>
          <span className="text-xs text-teal-400/60 ml-2">|</span>
          <span className="text-xs text-teal-400/80 font-mono">{selectedFile.name}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Verify button */}
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-teal-700 hover:bg-teal-600 text-white"
            onClick={handleVerify}
            disabled={isVerifying}
          >
            <Check className="w-3.5 h-3.5" />
            {isVerifying ? 'Verifying...' : 'Verify'}
          </Button>
          {/* Upload button */}
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-orange-600 hover:bg-orange-500 text-white"
            onClick={handleUpload}
            disabled={isUploading}
          >
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? 'Uploading...' : 'Upload'}
          </Button>

          {/* Board selector */}
          <Select value={board} onValueChange={setBoard}>
            <SelectTrigger className="w-44 h-8 text-xs bg-teal-900/50 border-teal-700 text-teal-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOARD_TYPES.map(b => (
                <SelectItem key={b.id} value={b.id} className="text-xs">
                  {b.name} — {b.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Main content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Chat */}
        <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
          <IDEChat
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            streamingContent={streamingContent}
            mode="embedded-iot"
            onOpenSettings={() => navigate('/settings')}
            onToggleCodeLibrary={() => {}}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Editor + Serial Monitor */}
        <ResizablePanel defaultSize={75}>
          <ResizablePanelGroup direction="vertical">
            {/* Code Editor */}
            <ResizablePanel defaultSize={65} minSize={30}>
              <CodeEditor
                file={selectedFile}
                openFiles={openFiles}
                onFileChange={handleFileChange}
                onCloseFile={() => {}}
                onSelectFile={() => {}}
                fontSize={14}
              />
            </ResizablePanel>

            <ResizableHandle />

            {/* Serial Monitor */}
            <ResizablePanel defaultSize={35} minSize={15}>
              <div className="h-full flex flex-col" style={{ background: 'hsl(160, 20%, 5%)' }}>
                <div className="h-8 flex items-center justify-between px-3 border-b" style={{ borderColor: 'hsl(168, 40%, 20%)' }}>
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-xs font-mono text-teal-300">Serial Monitor</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-teal-500">115200 baud</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-teal-400 hover:text-teal-200"
                      onClick={() => setSerialOutput(['[Serial Monitor] Cleared'])}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-2">
                  <div className="font-mono text-xs space-y-0.5">
                    {serialOutput.map((line, i) => (
                      <div key={i} className={cn(
                        line.includes('✓') ? 'text-green-400' :
                        line.includes('Error') ? 'text-red-400' :
                        line.startsWith('[') ? 'text-teal-400' : 'text-teal-200/70'
                      )}>
                        {line}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
