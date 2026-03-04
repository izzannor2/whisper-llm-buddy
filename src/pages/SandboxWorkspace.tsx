import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Play, Trash2, FlaskConical, AlertTriangle, FileCode2, Terminal as TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { applyModeTheme } from '@/lib/mode-themes';
import { runPython, isPyodideLoaded, isPyodideLoading } from '@/lib/python-runner';
import { cn } from '@/lib/utils';

interface OutputLine {
  type: 'stdout' | 'stderr' | 'info';
  text: string;
  timestamp: number;
}

const EXAMPLES: Record<string, { name: string; lang: string; code: string }> = {
  'py-hello': { name: 'Hello World', lang: 'python', code: 'print("Hello from Sandbox!")\nfor i in range(5):\n    print(f"  Count: {i}")' },
  'py-math': { name: 'Math & NumPy', lang: 'python', code: 'import math\nprint(f"Pi = {math.pi}")\nprint(f"e = {math.e}")\nprint(f"sqrt(2) = {math.sqrt(2)}")' },
  'js-fetch': { name: 'Fetch API', lang: 'javascript', code: '// JavaScript sandbox\nconst data = { message: "Hello from JS!" };\nconsole.log(JSON.stringify(data, null, 2));\nconsole.log("Array:", [1,2,3].map(x => x * 2));' },
  'js-algo': { name: 'Algorithm', lang: 'javascript', code: '// Fibonacci\nfunction fib(n) {\n  if (n <= 1) return n;\n  return fib(n-1) + fib(n-2);\n}\nfor (let i = 0; i < 10; i++) {\n  console.log(`fib(${i}) = ${fib(i)}`);\n}' },
};

export default function SandboxWorkspace() {
  const navigate = useNavigate();
  const [code, setCode] = useState(EXAMPLES['py-hello'].code);
  const [language, setLanguage] = useState<'python' | 'javascript'>('python');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useState(() => { applyModeTheme('sandbox'); });

  const runCode = useCallback(async () => {
    setIsRunning(true);
    setOutput([{ type: 'info', text: `Running ${language}...`, timestamp: Date.now() }]);

    try {
      if (language === 'python') {
        const result = await runPython(code);
        if (result.output) {
          setOutput(prev => [...prev, { type: 'stdout', text: result.output, timestamp: Date.now() }]);
        }
        if (result.error) {
          setOutput(prev => [...prev, { type: 'stderr', text: result.error!, timestamp: Date.now() }]);
        }
        if (result.success) {
          setOutput(prev => [...prev, { type: 'info', text: '✓ Execution complete', timestamp: Date.now() }]);
        }
      } else {
        // JavaScript eval
        const logs: string[] = [];
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
        console.error = (...args) => logs.push('ERROR: ' + args.join(' '));
        
        try {
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
      }
    } catch (err: any) {
      setOutput(prev => [...prev, { type: 'stderr', text: err.message, timestamp: Date.now() }]);
    } finally {
      setIsRunning(false);
    }
  }, [code, language]);

  const loadExample = (id: string) => {
    const ex = EXAMPLES[id];
    if (ex) {
      setCode(ex.code);
      setLanguage(ex.lang as 'python' | 'javascript');
    }
  };

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
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-amber-400 font-medium">Experimental</span>
          </div>

          <Select value={language} onValueChange={(v) => setLanguage(v as 'python' | 'javascript')}>
            <SelectTrigger className="w-32 h-8 text-xs bg-cyan-900/30 border-cyan-700/50 text-cyan-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="python">🐍 Python</SelectItem>
              <SelectItem value="javascript">⚡ JavaScript</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            className="h-8 gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white"
            onClick={runCode}
            disabled={isRunning}
          >
            <Play className="w-3.5 h-3.5" />
            {isRunning ? 'Running...' : 'Run'}
          </Button>
        </div>
      </header>

      {/* Examples bar */}
      <div className="h-9 flex items-center gap-2 px-3 border-b overflow-x-auto" style={{
        background: 'hsl(195, 30%, 8%)',
        borderColor: 'hsl(195, 30%, 16%)',
      }}>
        <span className="text-[10px] text-cyan-500 font-medium shrink-0">EXAMPLES:</span>
        {Object.entries(EXAMPLES).map(([id, ex]) => (
          <Button
            key={id}
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-cyan-400/70 hover:text-cyan-200 px-2"
            onClick={() => loadExample(id)}
          >
            {ex.name}
          </Button>
        ))}
      </div>

      {/* Main */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Code Editor */}
        <ResizablePanel defaultSize={55} minSize={30}>
          <div className="h-full flex flex-col" style={{ background: 'hsl(195, 25%, 7%)' }}>
            <div className="h-8 flex items-center px-3 border-b" style={{ borderColor: 'hsl(195, 30%, 16%)' }}>
              <FileCode2 className="w-3.5 h-3.5 text-cyan-500 mr-2" />
              <span className="text-xs font-mono text-cyan-400">
                {language === 'python' ? 'sandbox.py' : 'sandbox.js'}
              </span>
            </div>
            <textarea
              value={code}
              onChange={e => setCode(e.target.value)}
              className="flex-1 w-full bg-transparent text-cyan-100 font-mono text-sm p-4 resize-none outline-none"
              style={{ tabSize: 2 }}
              spellCheck={false}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Output */}
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
                  <div className="text-cyan-500/40 py-4 text-center">Click Run to execute code</div>
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
