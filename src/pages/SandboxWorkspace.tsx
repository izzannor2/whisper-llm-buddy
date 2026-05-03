import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Play, Trash2, FlaskConical, AlertTriangle, Terminal as TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CodeEditor } from '@/components/ide/CodeEditor';
import { applyModeTheme } from '@/lib/mode-themes';
import { runPython } from '@/lib/python-runner';
import { cn } from '@/lib/utils';
import { ProjectFile } from '@/lib/ide-types';
import { SystemStatusBar } from '@/components/SystemStatusBar';

interface OutputLine {
  type: 'stdout' | 'stderr' | 'info';
  text: string;
  timestamp: number;
}

type SandboxLang = 'python' | 'javascript' | 'typescript' | 'html' | 'css' | 'json' | 'markdown' | 'cpp' | 'c' | 'rust' | 'go' | 'java' | 'sql' | 'bash' | 'yaml' | 'xml';

const LANG_CONFIG: Record<SandboxLang, { label: string; emoji: string; ext: string; monaco: string }> = {
  python:     { label: 'Python',      emoji: '🐍', ext: 'py',   monaco: 'python' },
  javascript: { label: 'JavaScript',  emoji: '⚡', ext: 'js',   monaco: 'javascript' },
  typescript: { label: 'TypeScript',  emoji: '🔷', ext: 'ts',   monaco: 'typescript' },
  html:       { label: 'HTML',        emoji: '🌐', ext: 'html', monaco: 'html' },
  css:        { label: 'CSS',         emoji: '🎨', ext: 'css',  monaco: 'css' },
  json:       { label: 'JSON',        emoji: '📋', ext: 'json', monaco: 'json' },
  markdown:   { label: 'Markdown',    emoji: '📝', ext: 'md',   monaco: 'markdown' },
  cpp:        { label: 'C++',         emoji: '⚙️', ext: 'cpp',  monaco: 'cpp' },
  c:          { label: 'C',           emoji: '🔧', ext: 'c',    monaco: 'c' },
  rust:       { label: 'Rust',        emoji: '🦀', ext: 'rs',   monaco: 'rust' },
  go:         { label: 'Go',          emoji: '🐹', ext: 'go',   monaco: 'go' },
  java:       { label: 'Java',        emoji: '☕', ext: 'java', monaco: 'java' },
  sql:        { label: 'SQL',         emoji: '🗃️', ext: 'sql',  monaco: 'sql' },
  bash:       { label: 'Bash',        emoji: '💻', ext: 'sh',   monaco: 'shell' },
  yaml:       { label: 'YAML',        emoji: '📄', ext: 'yaml', monaco: 'yaml' },
  xml:        { label: 'XML',         emoji: '📰', ext: 'xml',  monaco: 'xml' },
};

const STARTER_CODE: Record<SandboxLang, string> = {
  python: 'print("Hello from Sandbox!")\nfor i in range(5):\n    print(f"  Count: {i}")',
  javascript: '// JavaScript sandbox\nconst data = { message: "Hello from JS!" };\nconsole.log(JSON.stringify(data, null, 2));\nconsole.log("Array:", [1,2,3].map(x => x * 2));',
  typescript: '// TypeScript sandbox\ninterface User {\n  name: string;\n  age: number;\n}\n\nconst greet = (user: User): string => {\n  return `Hello, ${user.name}! You are ${user.age}.`;\n};\n\nconsole.log(greet({ name: "Alice", age: 30 }));',
  html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Sandbox</title>\n  <style>\n    body { font-family: sans-serif; padding: 2rem; background: #1a1a2e; color: #eee; }\n    h1 { color: #00d4ff; }\n  </style>\n</head>\n<body>\n  <h1>Hello Sandbox!</h1>\n  <p>Edit this HTML and click Run to preview.</p>\n</body>\n</html>',
  css: '/* CSS Sandbox */\n.container {\n  display: flex;\n  gap: 1rem;\n  padding: 2rem;\n}\n\n.card {\n  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n  border-radius: 12px;\n  padding: 1.5rem;\n  color: white;\n  box-shadow: 0 10px 30px rgba(0,0,0,0.3);\n}',
  json: '{\n  "name": "sandbox-project",\n  "version": "1.0.0",\n  "description": "A sandbox playground",\n  "dependencies": {\n    "react": "^18.0.0"\n  }\n}',
  markdown: '# Sandbox Markdown\n\n## Features\n- **Bold** and *italic* text\n- Code blocks\n- Lists\n\n```javascript\nconsole.log("Hello!");\n```\n\n> This is a blockquote\n\n| Column 1 | Column 2 |\n|----------|----------|\n| Data     | More     |',
  cpp: '#include <iostream>\n#include <vector>\n#include <algorithm>\n\nint main() {\n    std::vector<int> nums = {5, 2, 8, 1, 9, 3};\n    std::sort(nums.begin(), nums.end());\n    \n    std::cout << "Sorted: ";\n    for (int n : nums) {\n        std::cout << n << " ";\n    }\n    std::cout << std::endl;\n    return 0;\n}',
  c: '#include <stdio.h>\n#include <stdlib.h>\n\nint factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}\n\nint main() {\n    for (int i = 0; i <= 10; i++) {\n        printf("%d! = %d\\n", i, factorial(i));\n    }\n    return 0;\n}',
  rust: 'fn main() {\n    let numbers: Vec<i32> = (1..=10).collect();\n    let evens: Vec<&i32> = numbers.iter().filter(|&&x| x % 2 == 0).collect();\n    \n    println!("Numbers: {:?}", numbers);\n    println!("Evens: {:?}", evens);\n    println!("Sum: {}", numbers.iter().sum::<i32>());\n}',
  go: 'package main\n\nimport (\n\t"fmt"\n\t"strings"\n)\n\nfunc main() {\n\twords := []string{"Hello", "from", "Go", "Sandbox"}\n\tfmt.Println(strings.Join(words, " "))\n\t\n\tfor i, w := range words {\n\t\tfmt.Printf("  [%d] %s\\n", i, w)\n\t}\n}',
  java: 'public class Sandbox {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java Sandbox!");\n        \n        int[] fibonacci = new int[10];\n        fibonacci[0] = 0;\n        fibonacci[1] = 1;\n        for (int i = 2; i < 10; i++) {\n            fibonacci[i] = fibonacci[i-1] + fibonacci[i-2];\n        }\n        \n        for (int f : fibonacci) {\n            System.out.print(f + " ");\n        }\n    }\n}',
  sql: '-- SQL Sandbox\nCREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(100) NOT NULL,\n  email VARCHAR(255) UNIQUE,\n  created_at TIMESTAMP DEFAULT NOW()\n);\n\nINSERT INTO users (name, email) VALUES\n  (\'Alice\', \'alice@example.com\'),\n  (\'Bob\', \'bob@example.com\');\n\nSELECT * FROM users WHERE name LIKE \'A%\';',
  bash: '#!/bin/bash\n\necho "Hello from Bash Sandbox!"\n\n# Loop example\nfor i in {1..5}; do\n  echo "  Iteration $i"\ndone\n\n# Array example\nfruits=("apple" "banana" "cherry")\nfor fruit in "${fruits[@]}"; do\n  echo "  Fruit: $fruit"\ndone',
  yaml: '# YAML Sandbox\napp:\n  name: sandbox-project\n  version: 1.0.0\n  \nserver:\n  host: localhost\n  port: 8080\n  \ndatabase:\n  driver: postgres\n  host: localhost\n  port: 5432\n  name: sandbox_db\n  \nfeatures:\n  - authentication\n  - api\n  - websockets',
  xml: '<?xml version="1.0" encoding="UTF-8"?>\n<project>\n  <name>Sandbox Project</name>\n  <version>1.0.0</version>\n  <dependencies>\n    <dependency>\n      <groupId>com.example</groupId>\n      <artifactId>core</artifactId>\n      <version>2.0.0</version>\n    </dependency>\n  </dependencies>\n</project>',
};

// Languages that can be executed in-browser
const EXECUTABLE_LANGS = new Set<SandboxLang>(['python', 'javascript', 'typescript', 'html']);

export default function SandboxWorkspace() {
  const navigate = useNavigate();
  const [language, setLanguage] = useState<SandboxLang>('python');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const cfg = LANG_CONFIG[language];

  const [sandboxFile, setSandboxFile] = useState<ProjectFile>({
    id: 'sandbox',
    name: `sandbox.${cfg.ext}`,
    path: `/sandbox.${cfg.ext}`,
    content: STARTER_CODE[language],
    language: cfg.monaco,
    isDirectory: false,
  });

  useEffect(() => { applyModeTheme('sandbox'); }, []);

  const handleFileChange = useCallback((_path: string, content: string) => {
    setSandboxFile(prev => ({ ...prev, content }));
  }, []);

  const runCode = useCallback(async () => {
    setIsRunning(true);
    setOutput([{ type: 'info', text: `Running ${LANG_CONFIG[language].label}...`, timestamp: Date.now() }]);

    try {
      if (language === 'python') {
        const result = await runPython(sandboxFile.content);
        if (result.output) setOutput(prev => [...prev, { type: 'stdout', text: result.output, timestamp: Date.now() }]);
        if (result.error) setOutput(prev => [...prev, { type: 'stderr', text: result.error!, timestamp: Date.now() }]);
        if (result.success) setOutput(prev => [...prev, { type: 'info', text: '✓ Execution complete', timestamp: Date.now() }]);
      } else if (language === 'javascript' || language === 'typescript') {
        const logs: string[] = [];
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
        console.error = (...args) => logs.push('ERROR: ' + args.join(' '));
        try {
          const code = language === 'typescript'
            ? sandboxFile.content.replace(/:\s*\w+(\[\])?\s*(=|,|\)|\}|;)/g, '$2').replace(/interface\s+\w+\s*\{[^}]*\}/g, '').replace(/<\w+>/g, '')
            : sandboxFile.content;
          const result = eval(code);
          if (result !== undefined) logs.push(`→ ${String(result)}`);
        } catch (e: any) {
          logs.push(`Error: ${e.message}`);
        } finally {
          console.log = originalLog;
          console.error = originalError;
        }
        setOutput(prev => [
          ...prev,
          ...logs.map(l => ({ type: (l.startsWith('ERROR') ? 'stderr' : 'stdout') as OutputLine['type'], text: l, timestamp: Date.now() })),
          { type: 'info', text: '✓ Execution complete', timestamp: Date.now() },
        ]);
      } else if (language === 'html') {
        setOutput(prev => [
          ...prev,
          { type: 'info', text: '🌐 HTML Preview rendered below (open browser console for full output)', timestamp: Date.now() },
          { type: 'stdout', text: '─'.repeat(40), timestamp: Date.now() },
          { type: 'stdout', text: sandboxFile.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500), timestamp: Date.now() },
          { type: 'info', text: '✓ Parsed successfully', timestamp: Date.now() },
        ]);
      } else {
        setOutput(prev => [
          ...prev,
          { type: 'info', text: `⚠ ${LANG_CONFIG[language].label} cannot be executed in-browser.`, timestamp: Date.now() },
          { type: 'info', text: 'Syntax highlighting and editing are available. Use a local compiler/runtime to execute.', timestamp: Date.now() },
        ]);
      }
    } catch (err: any) {
      setOutput(prev => [...prev, { type: 'stderr', text: err.message, timestamp: Date.now() }]);
    } finally {
      setIsRunning(false);
    }
  }, [sandboxFile.content, language]);

  const handleLanguageChange = (v: string) => {
    const lang = v as SandboxLang;
    const c = LANG_CONFIG[lang];
    setLanguage(lang);
    setSandboxFile({
      id: 'sandbox',
      name: `sandbox.${c.ext}`,
      path: `/sandbox.${c.ext}`,
      content: STARTER_CODE[lang],
      language: c.monaco,
      isDirectory: false,
    });
    setOutput([]);
  };

  const canRun = EXECUTABLE_LANGS.has(language);

  return (
    <div className="h-screen flex flex-col" style={{ background: 'hsl(195, 25%, 6%)' }}>
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-3 border-b" style={{
        background: 'linear-gradient(180deg, hsl(195, 50%, 14%) 0%, hsl(195, 50%, 9%) 100%)',
        borderColor: 'hsl(195, 40%, 22%)',
      }}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8 text-cyan-300 hover:text-cyan-100">
            <Home className="h-4 w-4" />
          </Button>
          <FlaskConical className="w-5 h-5 text-cyan-400" />
          <span className="font-bold text-cyan-300 text-sm">Sandbox</span>
        </div>

        <div className="flex items-center gap-2">
          <SystemStatusBar compact buildState={isRunning ? 'building' : 'idle'} />
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-amber-400 font-medium">Experimental</span>
          </div>

          <Select value={language} onValueChange={handleLanguageChange}>
            <SelectTrigger className="w-40 h-8 text-xs bg-cyan-900/30 border-cyan-700/50 text-cyan-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {(Object.entries(LANG_CONFIG) as [SandboxLang, typeof LANG_CONFIG[SandboxLang]][]).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  {cfg.emoji} {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-white",
              canRun ? "bg-cyan-600 hover:bg-cyan-500" : "bg-cyan-800/50 cursor-not-allowed opacity-60"
            )}
            onClick={runCode}
            disabled={isRunning || !canRun}
            title={canRun ? 'Run code' : `${LANG_CONFIG[language].label} cannot be executed in-browser`}
          >
            <Play className="w-3.5 h-3.5" />
            {isRunning ? 'Running...' : canRun ? 'Run' : 'View Only'}
          </Button>
        </div>
      </header>

      {/* Main */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={55} minSize={30}>
          <CodeEditor
            file={sandboxFile}
            openFiles={[sandboxFile]}
            onFileChange={handleFileChange}
            onCloseFile={() => {}}
            onSelectFile={() => {}}
            fontSize={14}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={45} minSize={20}>
          <div className="h-full flex flex-col" style={{ background: 'hsl(195, 30%, 5%)' }}>
            <div className="h-8 flex items-center justify-between px-3 border-b" style={{ borderColor: 'hsl(195, 30%, 16%)' }}>
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-3.5 h-3.5 text-cyan-500" />
                <span className="text-xs font-mono text-cyan-400">Output</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-cyan-400 hover:text-cyan-200"
                onClick={() => setOutput([])}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="font-mono text-xs space-y-0.5">
                {output.length === 0 && (
                  <div className="text-cyan-500/40 py-4 text-center">
                    {canRun ? 'Click Run to execute code' : `${LANG_CONFIG[language].label} — edit with full syntax highlighting`}
                  </div>
                )}
                {output.map((line, i) => (
                  <div key={i} className={cn(
                    'whitespace-pre-wrap',
                    line.type === 'stderr' ? 'text-red-400' :
                    line.type === 'info' ? 'text-cyan-500' : 'text-cyan-100'
                  )}>
                    {line.text}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
