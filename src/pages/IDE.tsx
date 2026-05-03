// IDE workspace
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileTree } from '@/components/ide/FileTree';
import { FileNameDialog, DeleteConfirmDialog } from '@/components/ide/FileDialogs';
import { CodeEditor } from '@/components/ide/CodeEditor';
import { PreviewPane } from '@/components/ide/PreviewPane';
import { IDEChat } from '@/components/ide/IDEChat';
import { ConnectionIndicator } from '@/components/ide/ConnectionIndicator';
import { SystemCommandPanel } from '@/components/ide/SystemCommandPanel';
import { PluginManager } from '@/components/ide/PluginManager';
import { Terminal } from '@/components/ide/Terminal';
import { TTSControls } from '@/components/ide/TTSControls';
import { IDESettings as IDESettingsType, Project, ProjectFile, Plugin, DEFAULT_SETTINGS } from '@/lib/ide-types';
import { getIDESettings, saveIDESettings, getProjects, saveProject, createProject, generateId, getPlugins } from '@/lib/ide-store';
import { isOllamaRunning, ChatMessage } from '@/lib/ollama-client';
import { sendChatMessage as sendChat, loadSettings as loadChatSettings } from '@/lib/chat-api';
import { SystemCommand, parseCommandFromAIResponse, executeCommand as executeSystemCommand } from '@/lib/system-commands';
import { downloadProjectAsZip, downloadStartupScript, generateDocumentation } from '@/lib/project-export';
import { parseCodeBlocks, applyCodeBlocks, isBuildTrigger, getAppBuilderBuildPrompt, getAppBuilderPlanPrompt } from '@/lib/code-parser';
import { buildPreviewHTML } from '@/lib/preview-builder';
import { checkAgentStatus, downloadAgentScript, startDevServer, stopDevServer, AgentStatus, onOutput } from '@/lib/local-backend-agent';
import { onOpenClawEventForIDE } from '@/lib/openclaw-bridge';
import { initTTS, speakAIResponse, getTTSSettings } from '@/lib/tts-engine';
import { speak, isTTSSupported } from '@/lib/tts';
import { loadSettings } from '@/lib/chat-api';
import { Button } from '@/components/ui/button';
import { Settings, FolderPlus, Download, FileText, Play, Square, Terminal as TerminalIcon, Plug, Home, Bot, MonitorDown, Bug, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SystemStatusBar } from '@/components/SystemStatusBar';
import { HardwareMetricsPanel } from '@/components/ide/HardwareMetricsPanel';
import { BuildPipelinePanel } from '@/components/ide/BuildPipelinePanel';
import { Cpu, Rocket as RocketIcon } from 'lucide-react';

interface Message extends ChatMessage {
  id: string;
  timestamp: number;
}

export default function IDE() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<IDESettingsType>(DEFAULT_SETTINGS);
  const [project, setProject] = useState<Project | null>(null);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [openFiles, setOpenFiles] = useState<ProjectFile[]>([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ connected: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [logs, setLogs] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [systemCommands, setSystemCommands] = useState<SystemCommand[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<'preview' | 'terminal' | 'commands' | 'plugins' | 'debug'>('preview');
  const [debugLogs, setDebugLogs] = useState<Array<{ type: 'error' | 'info'; message: string; timestamp: number }>>([]);
  const [codeLibraryOpen, setCodeLibraryOpen] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | undefined>();
  const [previewHtml, setPreviewHtml] = useState<string | undefined>();
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false);
  const [fileDialog, setFileDialog] = useState<{ open: boolean; parentPath: string; isDirectory: boolean }>({ open: false, parentPath: '/', isDirectory: false });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; path: string }>({ open: false, path: '' });

  // Listen for debug messages from preview iframe
  useEffect(() => {
    const handlePreviewMessage = (event: MessageEvent) => {
      if (event.data?.type === 'preview-error') {
        setDebugLogs(prev => [...prev.slice(-99), { type: 'error', message: event.data.message, timestamp: Date.now() }]);
        if (settings.autoOpenDebugOnError && rightPanelTab !== 'debug') {
          setRightPanelTab('debug');
        }
      } else if (event.data?.type === 'preview-log') {
        setDebugLogs(prev => [...prev.slice(-99), { type: 'info', message: event.data.message, timestamp: Date.now() }]);
      }
    };
    window.addEventListener('message', handlePreviewMessage);
    return () => window.removeEventListener('message', handlePreviewMessage);
  }, [settings.autoOpenDebugOnError, rightPanelTab]);

  useEffect(() => {
    setSettings(getIDESettings());
    setPlugins(getPlugins());
    initTTS();
    const checkConnections = async () => {
      setOllamaConnected(await isOllamaRunning());
      setAgentStatus(await checkAgentStatus());
    };
    checkConnections();
    const interval = setInterval(checkConnections, 10000);
    const unsubscribe = onOutput((output, isError) => {
      if (isError) setErrors(prev => [...prev, output]);
      else setLogs(prev => [...prev, output]);
    });

    return () => { clearInterval(interval); unsubscribe(); };
  }, []);

  // Listen for OpenClaw bridge events — depends on project so closure is fresh
  useEffect(() => {
    const unsubscribeClaw = onOpenClawEventForIDE((event) => {
      if (event.type === 'send-to-ide' && event.payload.message) {
        handleSendMessage(event.payload.message);
      }
      if (event.type === 'apply-code' && event.payload.filePath && event.payload.code) {
        const currentProject = project || getProjects()[0] || createProject('My App', 'react');
        const codeBlocks = [{ filePath: event.payload.filePath, content: event.payload.code, language: 'typescript' }];
        const { files: updatedFiles, created, updated } = applyCodeBlocks(currentProject.files, codeBlocks);
        const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: Date.now() };
        setProject(updatedProject);
        saveProject(updatedProject);
        const firstPath = [...created, ...updated][0];
        if (firstPath) {
          const fileToOpen = findFileByPath(updatedFiles, firstPath);
          if (fileToOpen) {
            setSelectedFile(fileToOpen);
            setOpenFiles(prev => {
              const exists = prev.find(f => f.path === fileToOpen.path);
              return exists ? prev.map(f => f.path === fileToOpen.path ? fileToOpen : f) : [...prev, fileToOpen];
            });
          }
        }
        toast.success(`OpenClaw applied: ${event.payload.filePath}`);
        generatePreview(updatedFiles);
      }
      if (event.type === 'edit-file' && event.payload.filePath && event.payload.content) {
        handleFileChange(event.payload.filePath, event.payload.content);
        toast.success(`OpenClaw edited: ${event.payload.filePath}`);
      }
    });
    return () => { unsubscribeClaw(); };
  }, [project]);

  useEffect(() => {
    const projects = getProjects();
    if (projects.length === 0) { const p = createProject('My App', 'react'); saveProject(p); setProject(p); }
    else setProject(projects[0]);
  }, []);

  useEffect(() => {
    if (settings.mode === 'system-helper') setRightPanelTab('commands');
    else if (settings.mode === 'plugin') setRightPanelTab('plugins');
    else setRightPanelTab('preview');
  }, [settings.mode]);

  // Auto-generate preview on project load and on every file change (debounced)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!project || project.files.length === 0) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      setIsPreviewGenerating(true);
      const html = buildPreviewHTML(project.files);
      setPreviewHtml(html);
      setIsPreviewGenerating(false);
    }, 600);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [project?.updatedAt]);

  const handleSelectFile = useCallback((file: ProjectFile) => {
    if (!file.isDirectory) {
      setSelectedFile(file);
      if (!openFiles.find(f => f.path === file.path)) setOpenFiles(prev => [...prev, file]);
    }
  }, [openFiles]);

  const handleCreateFile = useCallback((parentPath: string, isDirectory: boolean) => {
    if (!project) return;
    setFileDialog({ open: true, parentPath, isDirectory });
  }, [project]);

  const handleCreateFileSubmit = useCallback((name: string) => {
    if (!project) return;
    const { parentPath, isDirectory } = fileDialog;
    const newPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = { tsx: 'typescript', ts: 'typescript', jsx: 'javascript', js: 'javascript', css: 'css', html: 'html', json: 'json', py: 'python', md: 'markdown', cpp: 'cpp', c: 'c', h: 'c' };
    const newFile: ProjectFile = {
      id: generateId(), name, path: newPath, content: isDirectory ? '' : '', language: langMap[ext] || 'text',
      isDirectory, ...(isDirectory ? { children: [] } : {}),
    };
    const addToTree = (files: ProjectFile[]): ProjectFile[] => {
      if (parentPath === '/') return [...files, newFile];
      return files.map(f => {
        if (f.path === parentPath && f.isDirectory) return { ...f, children: [...(f.children || []), newFile] };
        if (f.children) return { ...f, children: addToTree(f.children) };
        return f;
      });
    };
    const updatedProject = { ...project, files: addToTree(project.files), updatedAt: Date.now() };
    setProject(updatedProject);
    saveProject(updatedProject);
    if (!isDirectory) handleSelectFile(newFile);
    toast.success(`${isDirectory ? 'Folder' : 'File'} created: ${name}`);
  }, [project, fileDialog, handleSelectFile]);

  const handleDeleteFile = useCallback((path: string) => {
    if (!project) return;
    setDeleteDialog({ open: true, path });
  }, [project]);

  const handleDeleteFileConfirm = useCallback(() => {
    if (!project) return;
    const { path } = deleteDialog;
    const removeFromTree = (files: ProjectFile[]): ProjectFile[] =>
      files.filter(f => f.path !== path).map(f => f.children ? { ...f, children: removeFromTree(f.children) } : f);
    const updatedProject = { ...project, files: removeFromTree(project.files), updatedAt: Date.now() };
    setProject(updatedProject);
    saveProject(updatedProject);
    setOpenFiles(prev => prev.filter(f => !f.path.startsWith(path)));
    if (selectedFile?.path.startsWith(path)) setSelectedFile(null);
    setDeleteDialog({ open: false, path: '' });
    toast.success(`Deleted: ${path}`);
  }, [project, selectedFile, deleteDialog]);

  const handleRenameFile = useCallback((oldPath: string, newPath: string) => {
    if (!project) return;
    const newName = newPath.split('/').pop() || '';
    const renameInTree = (files: ProjectFile[]): ProjectFile[] =>
      files.map(f => {
        if (f.path === oldPath) return { ...f, path: newPath, name: newName };
        if (f.children) return { ...f, children: renameInTree(f.children) };
        return f;
      });
    const updatedProject = { ...project, files: renameInTree(project.files), updatedAt: Date.now() };
    setProject(updatedProject);
    saveProject(updatedProject);
    setOpenFiles(prev => prev.map(f => f.path === oldPath ? { ...f, path: newPath, name: newName } : f));
    if (selectedFile?.path === oldPath) setSelectedFile(prev => prev ? { ...prev, path: newPath, name: newName } : null);
    toast.success(`Renamed to: ${newName}`);
  }, [project, selectedFile]);

  const handleCloseFile = useCallback((path: string) => {
    setOpenFiles(prev => prev.filter(f => f.path !== path));
    if (selectedFile?.path === path) setSelectedFile(openFiles.find(f => f.path !== path) || null);
  }, [openFiles, selectedFile]);

  const handleFileChange = useCallback((path: string, content: string) => {
    if (!project) return;
    const updateFile = (files: ProjectFile[]): ProjectFile[] => files.map(f => {
      if (f.path === path) return { ...f, content, isModified: true };
      if (f.children) return { ...f, children: updateFile(f.children) };
      return f;
    });
    const updatedFiles = updateFile(project.files);
    const updatedProject = { ...project, files: updatedFiles, updatedAt: Date.now() };
    setProject(updatedProject);
    saveProject(updatedProject);
    setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, content, isModified: true } : f));
    if (selectedFile?.path === path) setSelectedFile(prev => prev ? { ...prev, content, isModified: true } : null);
  }, [project, selectedFile]);

  const findFileByPath = (files: ProjectFile[], path: string): ProjectFile | null => {
    for (const f of files) {
      if (f.path === path && !f.isDirectory) return f;
      if (f.isDirectory && f.children) {
        const found = findFileByPath(f.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  const handleSendMessage = useCallback(async (content: string, isPlan?: boolean) => {
    const userMessage: Message = { id: generateId(), role: 'user', content, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent('');

    try {
      const chatMessages: ChatMessage[] = messages.map(m => ({ role: m.role, content: m.content }));
      chatMessages.push({ role: 'user', content });
      
      const chatSettings = loadChatSettings();
      const effectiveSettings = { ...chatSettings };

      // Determine if this is a build trigger (user approved a plan)
      const buildTrigger = isPlan === false && isBuildTrigger(content) && messages.length > 0;
      
      if (settings.mode === 'app-builder' || settings.mode === 'ai-improvement') {
        if (isPlan) {
          // Planning mode
          effectiveSettings.systemPrompt = getAppBuilderPlanPrompt();
        } else {
          // Build mode — tell AI to output complete files
          let buildPrompt = getAppBuilderBuildPrompt();
          if (buildTrigger) {
            // Include summary of the plan conversation for context
            buildPrompt += '\n\nThe user has approved the plan above. Now implement everything discussed. Output ALL files needed.';
          }
          effectiveSettings.systemPrompt = buildPrompt;
        }
      }
      
      let fullResponse = '';
      const appliedBlockKeys = new Set<string>();
      const isAppBuilder = (settings.mode === 'app-builder' || settings.mode === 'ai-improvement') && !isPlan;
      let lastLiveBuildAt = 0;

      // Throttled live preview during streaming — does NOT switch tabs
      const liveStreamPreview = (files: ProjectFile[]) => {
        const now = Date.now();
        if (now - lastLiveBuildAt < 400) return;
        lastLiveBuildAt = now;
        try {
          const html = buildPreviewHTML(files);
          setPreviewHtml(html);
        } catch (err) {
          console.error('[live preview]', err);
        }
      };

      await sendChat(chatMessages, effectiveSettings, (chunk) => {
        fullResponse += chunk;
        setStreamingContent(fullResponse);

        // Live preview: apply code blocks as they stream in
        if (isAppBuilder && project) {
          const blocks = parseCodeBlocks(fullResponse);
          const newBlocks = blocks.filter(b => !appliedBlockKeys.has(b.filePath + ':' + b.content.length));
          if (newBlocks.length > 0) {
            newBlocks.forEach(b => appliedBlockKeys.add(b.filePath + ':' + b.content.length));
            const currentProject = project;
            const { files: updatedFiles } = applyCodeBlocks(currentProject.files, newBlocks);
            const updatedProject = { ...currentProject, files: updatedFiles, updatedAt: Date.now() };
            setProject(updatedProject);
            saveProject(updatedProject);
            // Throttled HTML rebuild only — keep user's current right-pane tab
            liveStreamPreview(updatedFiles);
          }
        }
      });

      const assistantMessage: Message = { id: generateId(), role: 'assistant', content: fullResponse, timestamp: Date.now() };
      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');

      // Auto-apply code blocks from AI response to the project
      if (project && (settings.mode === 'app-builder' || settings.mode === 'ai-improvement') && !isPlan) {
        const codeBlocks = parseCodeBlocks(fullResponse);
        if (codeBlocks.length > 0) {
          const { files: updatedFiles, created, updated } = applyCodeBlocks(project.files, codeBlocks);
          const updatedProject = { ...project, files: updatedFiles, updatedAt: Date.now() };
          setProject(updatedProject);
          saveProject(updatedProject);

          // Auto-open the first created/updated file in the editor
          const firstPath = [...created, ...updated][0];
          if (firstPath) {
            const fileToOpen = findFileByPath(updatedFiles, firstPath);
            if (fileToOpen) {
              setSelectedFile(fileToOpen);
              setOpenFiles(prev => {
                const exists = prev.find(f => f.path === fileToOpen.path);
                return exists ? prev.map(f => f.path === fileToOpen.path ? fileToOpen : f) : [...prev, fileToOpen];
              });
            }
          }

          const totalChanges = created.length + updated.length;
          toast.success(`Applied ${totalChanges} file${totalChanges > 1 ? 's' : ''}: ${created.length} created, ${updated.length} updated`);

          // Auto-generate preview
          generatePreview(updatedFiles);
        }
      }

      // TTS
      const globalSettings = loadSettings();
      if (globalSettings.autoPlayTTS && isTTSSupported() && fullResponse) {
        speak(fullResponse, { voice: globalSettings.ttsVoice, rate: globalSettings.ttsRate });
      }

      if (settings.mode === 'system-helper') {
        const commands = parseCommandFromAIResponse(fullResponse);
        if (commands.length > 0) {
          setSystemCommands(prev => [...prev, ...commands]);
          setRightPanelTab('commands');
          toast.info(`${commands.length} command(s) need review`);
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to get response. Check your backend settings.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [messages, settings.mode, project]);

  const handleApproveCommand = (id: string) => setSystemCommands(prev => prev.map(c => c.id === id ? { ...c, status: 'approved' as const } : c));
  const handleRejectCommand = (id: string) => setSystemCommands(prev => prev.map(c => c.id === id ? { ...c, status: 'rejected' as const } : c));
  const handleExecuteCommand = async (id: string) => {
    setSystemCommands(prev => prev.map(c => c.id === id ? { ...c, status: 'running' as const } : c));
    const command = systemCommands.find(c => c.id === id);
    if (command) { const result = await executeSystemCommand(command); setSystemCommands(prev => prev.map(c => c.id === id ? result : c)); }
  };
  const handleClearCommands = () => setSystemCommands([]);

  const handleStartServer = async () => {
    setLogs(prev => [...prev, 'Starting dev server...']);
    const result = await startDevServer();
    if (result) {
      setIsServerRunning(true);
      setPreviewUrl(`http://localhost:${result.port}`);
      setLogs(prev => [...prev, `Dev server running on http://localhost:${result.port}`]);
      toast.success('Dev server started');
    } else {
      const msg = 'Local agent not connected (port 3847). Start the agent to run a dev server.';
      setErrors(prev => [...prev, msg]);
      setLogs(prev => [...prev, msg]);
      toast.error(msg);
    }
  };

  const handleStopServer = async () => {
    await stopDevServer(); setIsServerRunning(false); setPreviewUrl(undefined);
    setLogs(prev => [...prev, 'Dev server stopped']); toast.success('Dev server stopped');
  };

  const generatePreview = useCallback((files?: ProjectFile[]) => {
    const filesToUse = files || project?.files;
    if (!filesToUse || filesToUse.length === 0) return;
    setIsPreviewGenerating(true);
    const html = buildPreviewHTML(filesToUse);
    setPreviewHtml(html);
    setIsPreviewGenerating(false);
    setRightPanelTab('preview');
  }, [project]);

  const handleDownloadZip = async () => { if (!project) return; try { await downloadProjectAsZip(project); toast.success('Project downloaded'); } catch { toast.error('Failed to download'); } };
  const handleDownloadStartupScript = (platform: 'windows' | 'linux' | 'macos') => { downloadStartupScript(settings, platform); toast.success(`Script for ${platform} downloaded`); };
  const handleDownloadDocs = () => {
    if (!project) return;
    const docs = generateDocumentation(project, settings);
    const blob = new Blob([docs], { type: 'text/markdown' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'README.md'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success('Documentation downloaded');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} title="Back to Chat"><Home className="h-5 w-5" /></Button>
          <h1 className="text-lg font-bold gradient-text">LocalDev AI</h1>
          <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full"><span className="text-xs font-medium text-accent">App Builder</span></div>
          <span className="text-sm text-muted-foreground">{project?.name || 'No Project'}</span>
          <div className="flex items-center gap-1.5 text-xs">
            <Bot className="h-3.5 w-3.5" />
            <span className={agentStatus.connected ? 'text-accent' : 'text-muted-foreground'}>{agentStatus.connected ? 'Agent Connected' : 'Agent Offline'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SystemStatusBar compact buildState={isLoading ? 'generating' : 'idle'} />
          <TTSControls compact />
          <ConnectionIndicator mode={settings.connectionMode} ollamaConnected={ollamaConnected} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Download className="h-5 w-5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownloadZip}><FileText className="h-4 w-4 mr-2" />Download as ZIP</DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadDocs}><FileText className="h-4 w-4 mr-2" />Download Documentation</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleDownloadStartupScript('windows')}><TerminalIcon className="h-4 w-4 mr-2" />Startup Script (Windows)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownloadStartupScript('linux')}><TerminalIcon className="h-4 w-4 mr-2" />Startup Script (Linux)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownloadStartupScript('macos')}><TerminalIcon className="h-4 w-4 mr-2" />Startup Script (macOS)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => downloadAgentScript('windows')}><MonitorDown className="h-4 w-4 mr-2" />Download Agent (Windows)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadAgentScript('linux')}><MonitorDown className="h-4 w-4 mr-2" />Download Agent (Linux/macOS)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}><Settings className="h-5 w-5" /></Button>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <IDEChat messages={messages} onSendMessage={handleSendMessage} isLoading={isLoading}
            streamingContent={streamingContent} mode={settings.mode}
            onOpenSettings={() => navigate('/settings')} onToggleCodeLibrary={() => setCodeLibraryOpen(!codeLibraryOpen)} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={45} minSize={30}>
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={25} minSize={15} maxSize={35}>
              <FileTree files={project?.files || []} selectedFile={selectedFile?.path} onSelectFile={handleSelectFile} onCreateFile={handleCreateFile} onDeleteFile={handleDeleteFile} onRenameFile={handleRenameFile} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={75}>
              <CodeEditor file={selectedFile} openFiles={openFiles} onFileChange={handleFileChange}
                onCloseFile={handleCloseFile} onSelectFile={handleSelectFile} fontSize={settings.fontSize}
                onSendToPreview={() => generatePreview()} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="h-full flex flex-col">
            <Tabs value={rightPanelTab} onValueChange={(v) => setRightPanelTab(v as typeof rightPanelTab)} className="flex-1 flex flex-col">
              <TabsList className="w-full justify-start rounded-none border-b border-border bg-card px-2">
                <TabsTrigger value="preview" className="gap-1"><Play className="h-3 w-3" />Preview</TabsTrigger>
                <TabsTrigger value="terminal" className="gap-1"><TerminalIcon className="h-3 w-3" />Terminal</TabsTrigger>
                <TabsTrigger value="commands" className="gap-1">
                  <TerminalIcon className="h-3 w-3" />Commands
                  {systemCommands.filter(c => c.status === 'pending').length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">{systemCommands.filter(c => c.status === 'pending').length}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="plugins" className="gap-1"><Plug className="h-3 w-3" />Plugins</TabsTrigger>
                <TabsTrigger value="debug" className="gap-1">
                  <Bug className="h-3 w-3" />Debug
                  {debugLogs.filter(l => l.type === 'error').length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">{debugLogs.filter(l => l.type === 'error').length}</span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="flex-1 m-0">
                <PreviewPane previewUrl={previewUrl} previewHtml={previewHtml} previewBlobUrl={previewBlobUrl}
                  isServerRunning={isServerRunning} isGenerating={isPreviewGenerating} logs={logs} errors={errors}
                  agentConnected={agentStatus.connected}
                  onRefresh={() => generatePreview()} onStartServer={handleStartServer} onStopServer={handleStopServer}
                  onGeneratePreview={() => generatePreview()}
                  onCopyHtml={async () => {
                    let html = previewHtml || '';
                    if (!html && previewUrl) {
                      try { html = await fetch(previewUrl).then(r => r.text()); } catch { /* ignore */ }
                    }
                    if (!html) { toast.info('No preview HTML available'); return; }
                    try {
                      await navigator.clipboard.writeText(html);
                      toast.success('Preview HTML copied to clipboard');
                    } catch {
                      toast.error('Failed to copy preview HTML');
                    }
                  }}
                  onOpenExternal={() => {
                    if (previewUrl) {
                      window.open(previewUrl, '_blank');
                    } else if (previewHtml) {
                      const blob = new Blob([previewHtml], { type: 'text/html' });
                      window.open(URL.createObjectURL(blob), '_blank');
                    } else {
                      toast.info('No preview available to open');
                    }
                  }} />
              </TabsContent>
              <TabsContent value="terminal" className="flex-1 m-0"><Terminal className="h-full" /></TabsContent>
              <TabsContent value="commands" className="flex-1 m-0">
                <SystemCommandPanel commands={systemCommands} onApprove={handleApproveCommand}
                  onReject={handleRejectCommand} onExecute={handleExecuteCommand} onClear={handleClearCommands} />
              </TabsContent>
              <TabsContent value="plugins" className="flex-1 m-0"><PluginManager plugins={plugins} onPluginsChange={setPlugins} /></TabsContent>
              <TabsContent value="debug" className="flex-1 m-0">
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                    <span className="text-xs font-medium">Preview Debug Console</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setDebugLogs([])}>Clear</Button>
                  </div>
                  <div className="flex-1 overflow-auto p-3 font-mono text-xs space-y-1">
                    {debugLogs.length === 0 ? (
                      <div className="text-muted-foreground">No debug output yet. Errors from the preview will appear here.</div>
                    ) : (
                      debugLogs.map((log, i) => (
                        <div key={i} className={log.type === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                          <span className="opacity-50">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                          <span className={log.type === 'error' ? 'text-destructive' : 'text-accent'}>[{log.type}]</span>{' '}
                          {log.message}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <FileNameDialog
        open={fileDialog.open}
        onOpenChange={(open) => setFileDialog(prev => ({ ...prev, open }))}
        onSubmit={handleCreateFileSubmit}
        title={fileDialog.isDirectory ? 'New Folder' : 'New File'}
        description={`Create a new ${fileDialog.isDirectory ? 'folder' : 'file'} in ${fileDialog.parentPath}`}
        icon={fileDialog.isDirectory ? 'folder' : 'file'}
      />
      <DeleteConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
        onConfirm={handleDeleteFileConfirm}
        path={deleteDialog.path}
      />
    </div>
  );
}
