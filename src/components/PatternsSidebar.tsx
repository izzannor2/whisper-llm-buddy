import { useState } from 'react';
import { GraduationCap, Code, FolderTree, Library, Palette, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Pattern {
  id: string;
  category: string;
  label: string;
  value: string;
  icon: any;
}

const DEFAULT_PATTERNS: Pattern[] = [
  { id: '1', category: 'Framework', label: 'Preferred', value: 'React + TypeScript', icon: Code },
  { id: '2', category: 'Styling', label: 'CSS Framework', value: 'Tailwind CSS', icon: Palette },
  { id: '3', category: 'Structure', label: 'Folder Layout', value: 'Feature-based', icon: FolderTree },
  { id: '4', category: 'Libraries', label: 'State Management', value: 'React Query + Zustand', icon: Library },
  { id: '5', category: 'Naming', label: 'Convention', value: 'camelCase', icon: Code },
];

interface PatternsSidebarProps {
  onClose: () => void;
}

export function PatternsSidebar({ onClose }: PatternsSidebarProps) {
  const [patterns] = useState<Pattern[]>(DEFAULT_PATTERNS);

  return (
    <div className="h-full flex flex-col border-l" style={{
      background: 'hsl(142, 20%, 6%)',
      borderColor: 'hsl(142, 30%, 16%)',
    }}>
      <div className="h-10 flex items-center justify-between px-3 border-b" style={{ borderColor: 'hsl(142, 30%, 16%)' }}>
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-green-400" />
          <span className="text-xs font-semibold text-green-300">Patterns Learned</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-green-400" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-2">
          {patterns.map(p => {
            const Icon = p.icon;
            return (
              <div key={p.id} className="p-2.5 rounded-lg border" style={{
                background: 'hsl(142, 20%, 8%)',
                borderColor: 'hsl(142, 25%, 15%)',
              }}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-3 h-3 text-green-500" />
                  <span className="text-[10px] text-green-500 font-medium uppercase">{p.category}</span>
                </div>
                <p className="text-xs text-green-200">{p.label}</p>
                <p className="text-xs text-green-400 font-mono mt-0.5">{p.value}</p>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-green-600 mt-4 text-center">
          Patterns are observed from your conversations
        </p>
      </ScrollArea>
    </div>
  );
}
