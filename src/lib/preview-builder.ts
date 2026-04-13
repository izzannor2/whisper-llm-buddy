// Build a live preview HTML blob from project files for iframe rendering
import { ProjectFile } from './ide-types';

/**
 * Flatten a file tree into a flat path->content map.
 */
function flattenFiles(files: ProjectFile[], result: Record<string, string> = {}): Record<string, string> {
  for (const f of files) {
    if (f.isDirectory && f.children) {
      flattenFiles(f.children, result);
    } else if (f.content) {
      result[f.path] = f.content;
    }
  }
  return result;
}

/**
 * Strip TypeScript-specific syntax so code can run in Babel's React+TS preset.
 * Much more robust than the previous regex-only approach — uses brace counting
 * for multi-line constructs.
 */
function stripTypeScript(code: string): string {
  let lines = code.split('\n');
  let result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Skip import statements entirely
    if (/^import\s/.test(trimmed)) {
      // Handle multi-line imports
      if (!trimmed.includes(';') && !trimmed.includes(' from ')) {
        while (i < lines.length - 1 && !lines[i].includes(';') && !lines[i].includes(' from ')) {
          i++;
        }
      }
      i++;
      continue;
    }

    // Skip standalone interface blocks (brace counting)
    if (/^(export\s+)?interface\s+\w+/.test(trimmed)) {
      if (trimmed.includes('{')) {
        let braces = 0;
        for (let c of lines[i]) { if (c === '{') braces++; if (c === '}') braces--; }
        while (braces > 0 && i < lines.length - 1) {
          i++;
          for (let c of lines[i]) { if (c === '{') braces++; if (c === '}') braces--; }
        }
      }
      i++;
      continue;
    }

    // Skip standalone type alias declarations
    if (/^(export\s+)?type\s+\w+\s*=/.test(trimmed)) {
      // Single-line type
      if (trimmed.endsWith(';') || !trimmed.includes('{')) {
        i++;
        continue;
      }
      // Multi-line type with braces
      let braces = 0;
      for (let c of lines[i]) { if (c === '{') braces++; if (c === '}') braces--; }
      while (braces > 0 && i < lines.length - 1) {
        i++;
        for (let c of lines[i]) { if (c === '{') braces++; if (c === '}') braces--; }
      }
      i++;
      continue;
    }

    // Skip enum declarations
    if (/^(export\s+)?(const\s+)?enum\s+\w+/.test(trimmed)) {
      let braces = 0;
      for (let c of lines[i]) { if (c === '{') braces++; if (c === '}') braces--; }
      while (braces > 0 && i < lines.length - 1) {
        i++;
        for (let c of lines[i]) { if (c === '{') braces++; if (c === '}') braces--; }
      }
      i++;
      continue;
    }

    let processed = line;

    // export default function X → function X
    processed = processed.replace(/^(\s*)export\s+default\s+function\s+/, '$1function ');
    // export default class X → class X  
    processed = processed.replace(/^(\s*)export\s+default\s+class\s+/, '$1class ');
    // export default X; → (remove)
    if (/^\s*export\s+default\s+[\w]+\s*;?\s*$/.test(processed)) { i++; continue; }
    // export function → function
    processed = processed.replace(/^(\s*)export\s+function\s+/, '$1function ');
    // export const → const
    processed = processed.replace(/^(\s*)export\s+const\s+/, '$1const ');
    // export { ... } → remove
    if (/^\s*export\s*\{/.test(processed)) { i++; continue; }

    // Remove React.FC / FC type annotations: `const X: React.FC<Props> = ` → `const X = `
    processed = processed.replace(/:\s*React\.FC(?:<[^>]*>)?\s*=/, ' =');
    processed = processed.replace(/:\s*FC(?:<[^>]*>)?\s*=/, ' =');

    // Remove generic type params from function declarations `<T>` or `<T,>` after function name
    processed = processed.replace(/(function\s+\w+)\s*<[^>]+>/g, '$1');

    // Remove generic type params from arrow functions `= <T,>(...` → `= (...`
    processed = processed.replace(/=\s*<[A-Z]\w*(?:,\s*[A-Z]\w*)*,?\s*>\s*\(/g, '= (');

    // Remove return type annotations `: ReturnType` before `=>` or `{`
    processed = processed.replace(/\)\s*:\s*[\w.<>\[\]| &]+\s*(=>)/g, ') $1');
    processed = processed.replace(/\)\s*:\s*[\w.<>\[\]| &]+\s*(\{)/g, ') $1');

    // Remove type annotations from params — handles `: Type`, `: Type<T>`, `: Type | null`
    // But be careful not to break object literals or ternaries
    processed = processed.replace(/(\w)\s*:\s*(?:readonly\s+)?(?:[\w.]+)(?:<[^>]*>)?(?:\[\])?(?:\s*\|\s*(?:[\w.]+)(?:<[^>]*>)?(?:\[\])?)*(\s*[,\)=])/g, '$1$2');

    // Remove `as Type` assertions
    processed = processed.replace(/\s+as\s+(?:const|[\w.]+(?:<[^>]*>)?)/g, '');

    // Remove `!` non-null assertion operator on property access
    processed = processed.replace(/(\w)!\./g, '$1.');
    processed = processed.replace(/(\w)!\[/g, '$1[');

    // Remove `?: Type` optional params — strip the type, keep `?`... actually just strip `: Type`
    processed = processed.replace(/(\w)\?\s*:\s*[\w.<>\[\]| &]+(\s*[,\)])/g, '$1$2');

    // Remove `satisfies Type`
    processed = processed.replace(/\s+satisfies\s+[\w.<>]+/g, '');

    result.push(processed);
    i++;
  }

  return result.join('\n');
}

/**
 * Extract the names of top-level declarations (function X, const X, class X) from processed code.
 */
function extractDeclaredNames(code: string): string[] {
  const names: string[] = [];
  const patterns = [
    /(?:^|\n)\s*function\s+(\w+)/g,
    /(?:^|\n)\s*const\s+(\w+)/g,
    /(?:^|\n)\s*let\s+(\w+)/g,
    /(?:^|\n)\s*class\s+(\w+)/g,
    /(?:^|\n)\s*var\s+(\w+)/g,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(code)) !== null) {
      if (m[1] && m[1] !== 'undefined' && m[1].length > 1) names.push(m[1]);
    }
  }
  return [...new Set(names)];
}

/**
 * Build a dependency graph and return topologically sorted components.
 * App always comes last.
 */
function topologicalSort(components: { path: string; code: string; processed: string }[]): { path: string; code: string; processed: string }[] {
  // Map name → component index
  const nameToIndex = new Map<string, number>();
  const declaredPerComponent: string[][] = [];

  components.forEach((c, idx) => {
    const names = extractDeclaredNames(c.processed);
    declaredPerComponent.push(names);
    names.forEach(n => nameToIndex.set(n, idx));
  });

  // Build adjacency: component i depends on component j if i's code references a name declared in j
  const deps = components.map(() => new Set<number>());
  components.forEach((c, idx) => {
    nameToIndex.forEach((ownerIdx, name) => {
      if (ownerIdx !== idx) {
        // Check if this component's code references the name
        const re = new RegExp(`\\b${name}\\b`);
        if (re.test(c.processed)) {
          deps[idx].add(ownerIdx);
        }
      }
    });
  });

  // Kahn's algorithm
  const inDegree = components.map((_, idx) => {
    let count = 0;
    deps.forEach(d => { if (d.has(idx)) count++; });
    return count;
  });
  // Actually we need: for each idx, how many deps it has (edges from idx → dep)
  // We want: items with no deps come first
  const sorted: number[] = [];
  const visited = new Set<number>();
  const queue: number[] = [];

  // In-degree = number of components that THIS component depends on... no.
  // Standard topo: edge from A→B means A must come before B.
  // We have: deps[i] = set of indices i depends on. So edge from dep → i.
  // In-degree of i = deps[i].size
  const inDeg = components.map((_, idx) => deps[idx].size);
  for (let idx = 0; idx < components.length; idx++) {
    if (inDeg[idx] === 0) queue.push(idx);
  }

  while (queue.length > 0) {
    const idx = queue.shift()!;
    sorted.push(idx);
    visited.add(idx);
    // For all components that depend on idx, reduce their in-degree
    for (let j = 0; j < components.length; j++) {
      if (deps[j].has(idx)) {
        inDeg[j]--;
        if (inDeg[j] === 0 && !visited.has(j)) queue.push(j);
      }
    }
  }

  // Add any remaining (cycles) at the end
  for (let idx = 0; idx < components.length; idx++) {
    if (!visited.has(idx)) sorted.push(idx);
  }

  // Ensure App.tsx is last
  const result = sorted.map(i => components[i]);
  const appIdx = result.findIndex(c => /\/App\.(tsx?|jsx?)$/.test(c.path));
  if (appIdx !== -1 && appIdx !== result.length - 1) {
    const [app] = result.splice(appIdx, 1);
    result.push(app);
  }

  return result;
}

/**
 * Library shims injected into the preview so common imports don't error.
 */
const LIBRARY_SHIMS = `
// --- Library Shims ---
// lucide-react: create a generic icon component factory
const __iconCache = {};
const __createIcon = (name) => {
  if (__iconCache[name]) return __iconCache[name];
  const Icon = forwardRef(({ className, size, color, strokeWidth, ...props }, ref) => {
    return React.createElement('svg', {
      ref,
      className: className || '',
      width: size || 24,
      height: size || 24,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color || 'currentColor',
      strokeWidth: strokeWidth || 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      ...props,
    }, React.createElement('rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }));
  });
  Icon.displayName = name;
  __iconCache[name] = Icon;
  return Icon;
};

// Proxy to auto-create any icon on access
const LucideIcons = typeof Proxy !== 'undefined' ? new Proxy({}, {
  get(_, name) {
    if (typeof name === 'string' && name[0] === name[0].toUpperCase()) return __createIcon(name);
    return undefined;
  }
}) : {};

// Common lucide icons destructured
const Settings = __createIcon('Settings');
const Home = __createIcon('Home');
const Search = __createIcon('Search');
const Menu = __createIcon('Menu');
const X = __createIcon('X');
const Check = __createIcon('Check');
const ChevronDown = __createIcon('ChevronDown');
const ChevronRight = __createIcon('ChevronRight');
const ChevronLeft = __createIcon('ChevronLeft');
const ChevronUp = __createIcon('ChevronUp');
const Plus = __createIcon('Plus');
const Minus = __createIcon('Minus');
const Trash = __createIcon('Trash');
const Edit = __createIcon('Edit');
const Copy = __createIcon('Copy');
const Download = __createIcon('Download');
const Upload = __createIcon('Upload');
const File = __createIcon('File');
const Folder = __createIcon('Folder');
const Image = __createIcon('Image');
const Video = __createIcon('Video');
const Music = __createIcon('Music');
const Heart = __createIcon('Heart');
const Star = __createIcon('Star');
const User = __createIcon('User');
const Users = __createIcon('Users');
const Mail = __createIcon('Mail');
const Phone = __createIcon('Phone');
const Calendar = __createIcon('Calendar');
const Clock = __createIcon('Clock');
const MapPin = __createIcon('MapPin');
const Globe = __createIcon('Globe');
const Link = __createIcon('Link');
const ExternalLink = __createIcon('ExternalLink');
const Eye = __createIcon('Eye');
const EyeOff = __createIcon('EyeOff');
const Lock = __createIcon('Lock');
const Unlock = __createIcon('Unlock');
const Bell = __createIcon('Bell');
const AlertCircle = __createIcon('AlertCircle');
const Info = __createIcon('Info');
const HelpCircle = __createIcon('HelpCircle');
const AlertTriangle = __createIcon('AlertTriangle');
const ArrowLeft = __createIcon('ArrowLeft');
const ArrowRight = __createIcon('ArrowRight');
const ArrowUp = __createIcon('ArrowUp');
const ArrowDown = __createIcon('ArrowDown');
const MoreHorizontal = __createIcon('MoreHorizontal');
const MoreVertical = __createIcon('MoreVertical');
const Loader2 = __createIcon('Loader2');
const RefreshCw = __createIcon('RefreshCw');
const RotateCcw = __createIcon('RotateCcw');
const Send = __createIcon('Send');
const MessageSquare = __createIcon('MessageSquare');
const Moon = __createIcon('Moon');
const Sun = __createIcon('Sun');
const Laptop = __createIcon('Laptop');
const Smartphone = __createIcon('Smartphone');
const Tablet = __createIcon('Tablet');
const Monitor = __createIcon('Monitor');
const Code = __createIcon('Code');
const Terminal = __createIcon('Terminal');
const Play = __createIcon('Play');
const Pause = __createIcon('Pause');
const Square = __createIcon('Square');
const Circle = __createIcon('Circle');
const Maximize2 = __createIcon('Maximize2');
const Minimize2 = __createIcon('Minimize2');
const Save = __createIcon('Save');
const Filter = __createIcon('Filter');
const SortAsc = __createIcon('SortAsc');
const SortDesc = __createIcon('SortDesc');
const LayoutGrid = __createIcon('LayoutGrid');
const List = __createIcon('List');
const Zap = __createIcon('Zap');
const Shield = __createIcon('Shield');
const Key = __createIcon('Key');
const Database = __createIcon('Database');
const Cloud = __createIcon('Cloud');
const Wifi = __createIcon('Wifi');
const Power = __createIcon('Power');
const LogOut = __createIcon('LogOut');
const LogIn = __createIcon('LogIn');
const Share = __createIcon('Share');
const Bookmark = __createIcon('Bookmark');
const Tag = __createIcon('Tag');
const Hash = __createIcon('Hash');
const AtSign = __createIcon('AtSign');
const Paperclip = __createIcon('Paperclip');
const Scissors = __createIcon('Scissors');
const Clipboard = __createIcon('Clipboard');
const FileText = __createIcon('FileText');

// react-router-dom shims
const BrowserRouter = ({ children }) => React.createElement('div', null, children);
const Routes = ({ children }) => {
  const arr = React.Children.toArray(children);
  return arr[0] || null;
};
const Route = ({ element, children }) => element || children || null;
const NavLink = ({ to, children, className, ...props }) =>
  React.createElement('a', { href: to || '#', className: typeof className === 'function' ? className({ isActive: false }) : className, onClick: (e) => e.preventDefault(), ...props }, children);
const RouterLink = ({ to, children, className, ...props }) =>
  React.createElement('a', { href: to || '#', className, onClick: (e) => e.preventDefault(), ...props }, children);
const Outlet = () => null;
const useNavigate = () => (path) => console.log('navigate:', path);
const useParams = () => ({});
const useSearchParams = () => [new URLSearchParams(), () => {}];
const useLocation = () => ({ pathname: '/', search: '', hash: '', state: null });

// framer-motion shims
const motion = typeof Proxy !== 'undefined' ? new Proxy({}, {
  get(_, tag) {
    return forwardRef(({ initial, animate, exit, transition, whileHover, whileTap, whileInView, variants, layout, layoutId, ...props }, ref) =>
      React.createElement(tag, { ref, ...props })
    );
  }
}) : {};
const AnimatePresence = ({ children }) => React.createElement(Fragment, null, children);
const useAnimation = () => ({ start: () => Promise.resolve(), stop: () => {} });
const useInView = () => [null, true];
const useMotionValue = (v) => ({ get: () => v, set: () => {} });
const useTransform = (v) => v;
const useSpring = (v) => v;

// uuid / nanoid
const v4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
const nanoid = (size = 21) => { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'; let id = ''; for (let i = 0; i < size; i++) id += chars[Math.random() * 64 | 0]; return id; };

// date-fns shim
const format = (date, fmt) => { try { return new Date(date).toLocaleDateString(); } catch { return String(date); } };
const formatDistance = (a, b) => 'some time ago';
const formatRelative = (a, b) => 'recently';
const isAfter = (a, b) => new Date(a) > new Date(b);
const isBefore = (a, b) => new Date(a) < new Date(b);
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
const subDays = (date, n) => addDays(date, -n);
const parseISO = (s) => new Date(s);

// toast shim
const toast = Object.assign(
  (msg) => console.log('[toast]', msg),
  { success: (m) => console.log('[toast:success]', m), error: (m) => console.log('[toast:error]', m), info: (m) => console.log('[toast:info]', m), warning: (m) => console.log('[toast:warning]', m), loading: (m) => console.log('[toast:loading]', m) }
);

// shadcn/ui basic shims
const Button = forwardRef(({ className, variant, size, asChild, children, ...props }, ref) =>
  React.createElement('button', { ref, className: cn('inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors px-4 py-2', className), ...props }, children));
Button.displayName = 'Button';

const Input = forwardRef(({ className, type, ...props }, ref) =>
  React.createElement('input', { ref, type: type || 'text', className: cn('flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm', className), ...props }));
Input.displayName = 'Input';

const Card = forwardRef(({ className, children, ...props }, ref) =>
  React.createElement('div', { ref, className: cn('rounded-lg border bg-card text-card-foreground shadow-sm', className), ...props }, children));
Card.displayName = 'Card';

const CardHeader = forwardRef(({ className, children, ...props }, ref) =>
  React.createElement('div', { ref, className: cn('flex flex-col space-y-1.5 p-6', className), ...props }, children));
CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef(({ className, children, ...props }, ref) =>
  React.createElement('h3', { ref, className: cn('text-2xl font-semibold leading-none tracking-tight', className), ...props }, children));
CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef(({ className, children, ...props }, ref) =>
  React.createElement('p', { ref, className: cn('text-sm text-muted-foreground', className), ...props }, children));
CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef(({ className, children, ...props }, ref) =>
  React.createElement('div', { ref, className: cn('p-6 pt-0', className), ...props }, children));
CardContent.displayName = 'CardContent';

const CardFooter = forwardRef(({ className, children, ...props }, ref) =>
  React.createElement('div', { ref, className: cn('flex items-center p-6 pt-0', className), ...props }, children));
CardFooter.displayName = 'CardFooter';

const Badge = ({ className, variant, children, ...props }) =>
  React.createElement('span', { className: cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', className), ...props }, children);

const Separator = ({ className, orientation, ...props }) =>
  React.createElement('div', { className: cn(orientation === 'vertical' ? 'h-full w-[1px]' : 'h-[1px] w-full', 'bg-border', className), ...props });

const Label = forwardRef(({ className, children, ...props }, ref) =>
  React.createElement('label', { ref, className: cn('text-sm font-medium leading-none', className), ...props }, children));
Label.displayName = 'Label';

const Textarea = forwardRef(({ className, ...props }, ref) =>
  React.createElement('textarea', { ref, className: cn('flex min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-sm', className), ...props }));
Textarea.displayName = 'Textarea';

const Select = ({ children, value, onValueChange }) => React.createElement('div', null, children);
const SelectTrigger = forwardRef(({ className, children, ...props }, ref) =>
  React.createElement('button', { ref, className: cn('flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm', className), ...props }, children));
SelectTrigger.displayName = 'SelectTrigger';
const SelectContent = ({ children }) => React.createElement('div', null, children);
const SelectItem = ({ children, value }) => React.createElement('div', null, children);
const SelectValue = ({ placeholder }) => React.createElement('span', null, placeholder || '');

const Switch = forwardRef(({ className, checked, onCheckedChange, ...props }, ref) =>
  React.createElement('button', { ref, role: 'switch', className: cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted', className), onClick: () => onCheckedChange?.(!checked), ...props },
    React.createElement('span', { className: cn('inline-block h-4 w-4 rounded-full bg-white transition-transform', checked ? 'translate-x-6' : 'translate-x-1') })));
Switch.displayName = 'Switch';

const Avatar = ({ className, children, ...props }) =>
  React.createElement('div', { className: cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className), ...props }, children);
const AvatarImage = ({ className, src, alt, ...props }) =>
  React.createElement('img', { className: cn('aspect-square h-full w-full', className), src, alt, ...props });
const AvatarFallback = ({ className, children, ...props }) =>
  React.createElement('div', { className: cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className), ...props }, children);

const ScrollArea = ({ className, children, ...props }) =>
  React.createElement('div', { className: cn('overflow-auto', className), ...props }, children);

const Skeleton = ({ className, ...props }) =>
  React.createElement('div', { className: cn('animate-pulse rounded-md bg-muted', className), ...props });

const Progress = ({ className, value, ...props }) =>
  React.createElement('div', { className: cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className), ...props },
    React.createElement('div', { className: 'h-full bg-primary transition-all', style: { width: (value || 0) + '%' } }));

const Tabs = ({ children, value, onValueChange, defaultValue, className }) => {
  const [active, setActive] = useState(value || defaultValue || '');
  const current = value !== undefined ? value : active;
  const onChange = onValueChange || setActive;
  return React.createElement('div', { className }, 
    React.Children.map(children, child => {
      if (!React.isValidElement(child)) return child;
      return React.cloneElement(child, { __tabValue: current, __onTabChange: onChange });
    }));
};
const TabsList = ({ children, className, __tabValue, __onTabChange, ...props }) =>
  React.createElement('div', { className: cn('inline-flex items-center justify-center rounded-md bg-muted p-1', className), ...props },
    React.Children.map(children, child => {
      if (!React.isValidElement(child)) return child;
      return React.cloneElement(child, { __tabValue, __onTabChange });
    }));
const TabsTrigger = ({ children, value, className, __tabValue, __onTabChange, ...props }) =>
  React.createElement('button', { className: cn('inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all', __tabValue === value ? 'bg-background text-foreground shadow-sm' : '', className), onClick: () => __onTabChange?.(value), ...props }, children);
const TabsContent = ({ children, value, className, __tabValue, ...props }) =>
  __tabValue === value ? React.createElement('div', { className, ...props }, children) : null;

const Dialog = ({ children, open, onOpenChange }) => open !== false ? React.createElement('div', null, children) : null;
const DialogTrigger = ({ children, asChild }) => children;
const DialogContent = ({ children, className, ...props }) =>
  React.createElement('div', { className: cn('fixed inset-0 z-50 flex items-center justify-center bg-black/50', className), ...props },
    React.createElement('div', { className: 'bg-background rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl' }, children));
const DialogHeader = ({ children, className }) => React.createElement('div', { className: cn('mb-4', className) }, children);
const DialogTitle = ({ children, className }) => React.createElement('h2', { className: cn('text-lg font-semibold', className) }, children);
const DialogDescription = ({ children, className }) => React.createElement('p', { className: cn('text-sm text-muted-foreground', className) }, children);
const DialogFooter = ({ children, className }) => React.createElement('div', { className: cn('mt-4 flex justify-end gap-2', className) }, children);

const DropdownMenu = ({ children }) => React.createElement('div', { className: 'relative inline-block' }, children);
const DropdownMenuTrigger = ({ children, asChild }) => children;
const DropdownMenuContent = ({ children, className }) => React.createElement('div', { className: cn('absolute z-50 mt-1 rounded-md border bg-popover p-1 shadow-md', className) }, children);
const DropdownMenuItem = ({ children, className, ...props }) => React.createElement('div', { className: cn('flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent', className), ...props }, children);

const Tooltip = ({ children }) => React.createElement(Fragment, null, children);
const TooltipTrigger = ({ children, asChild }) => children;
const TooltipContent = ({ children }) => null;
const TooltipProvider = ({ children }) => React.createElement(Fragment, null, children);

const Accordion = ({ children, className }) => React.createElement('div', { className }, children);
const AccordionItem = ({ children, className, value }) => React.createElement('div', { className }, children);
const AccordionTrigger = ({ children, className }) => React.createElement('button', { className: cn('flex w-full items-center justify-between py-4 font-medium', className) }, children);
const AccordionContent = ({ children, className }) => React.createElement('div', { className: cn('pb-4 pt-0', className) }, children);

const Popover = ({ children }) => React.createElement('div', { className: 'relative inline-block' }, children);
const PopoverTrigger = ({ children, asChild }) => children;
const PopoverContent = ({ children, className }) => React.createElement('div', { className: cn('absolute z-50 mt-1 rounded-md border bg-popover p-4 shadow-md', className) }, children);

const Sheet = Dialog;
const SheetTrigger = DialogTrigger;
const SheetContent = DialogContent;
const SheetHeader = DialogHeader;
const SheetTitle = DialogTitle;
const SheetDescription = DialogDescription;

const Checkbox = forwardRef(({ className, checked, onCheckedChange, ...props }, ref) =>
  React.createElement('button', { ref, role: 'checkbox', className: cn('h-4 w-4 rounded border', checked ? 'bg-primary' : '', className), onClick: () => onCheckedChange?.(!checked), ...props },
    checked ? React.createElement('span', { className: 'text-xs text-primary-foreground' }, '✓') : null));
Checkbox.displayName = 'Checkbox';

const RadioGroup = ({ children, className, value, onValueChange }) => React.createElement('div', { className }, children);
const RadioGroupItem = ({ value, className }) => React.createElement('div', { className: cn('h-4 w-4 rounded-full border', className) });

const Table = ({ className, children, ...props }) => React.createElement('table', { className: cn('w-full caption-bottom text-sm', className), ...props }, children);
const TableHeader = ({ className, children, ...props }) => React.createElement('thead', { className: cn('[&_tr]:border-b', className), ...props }, children);
const TableBody = ({ className, children, ...props }) => React.createElement('tbody', { className: cn('[&_tr:last-child]:border-0', className), ...props }, children);
const TableRow = ({ className, children, ...props }) => React.createElement('tr', { className: cn('border-b transition-colors hover:bg-muted/50', className), ...props }, children);
const TableHead = ({ className, children, ...props }) => React.createElement('th', { className: cn('h-12 px-4 text-left align-middle font-medium', className), ...props }, children);
const TableCell = ({ className, children, ...props }) => React.createElement('td', { className: cn('p-4 align-middle', className), ...props }, children);

// recharts shims
const ResponsiveContainer = ({ children, width, height }) => React.createElement('div', { style: { width: width || '100%', height: height || 300 } }, children);
const LineChart = ({ children, data }) => React.createElement('div', { className: 'flex items-center justify-center h-full bg-muted/20 rounded text-muted-foreground text-sm' }, '[Line Chart]');
const BarChart = ({ children, data }) => React.createElement('div', { className: 'flex items-center justify-center h-full bg-muted/20 rounded text-muted-foreground text-sm' }, '[Bar Chart]');
const PieChart = ({ children, data }) => React.createElement('div', { className: 'flex items-center justify-center h-full bg-muted/20 rounded text-muted-foreground text-sm' }, '[Pie Chart]');
const AreaChart = ({ children, data }) => React.createElement('div', { className: 'flex items-center justify-center h-full bg-muted/20 rounded text-muted-foreground text-sm' }, '[Area Chart]');
const XAxis = () => null;
const YAxis = () => null;
const CartesianGrid = () => null;
const Line = () => null;
const Bar = () => null;
const Area = () => null;
const Pie = () => null;
const Cell = () => null;
const RechartsTooltip = () => null;
const Legend = () => null;

// @tanstack/react-query shims
const useQuery = ({ queryKey, queryFn }) => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (queryFn) {
      Promise.resolve(queryFn()).then(d => { setData(d); setIsLoading(false); }).catch(e => { setError(e); setIsLoading(false); });
    } else { setIsLoading(false); }
  }, []);
  return { data, isLoading, error, refetch: () => {} };
};
const useMutation = ({ mutationFn, onSuccess, onError }) => {
  const [isPending, setIsPending] = useState(false);
  return { mutate: (vars) => { setIsPending(true); Promise.resolve(mutationFn?.(vars)).then(d => { setIsPending(false); onSuccess?.(d); }).catch(e => { setIsPending(false); onError?.(e); }); }, mutateAsync: mutationFn, isPending, isLoading: isPending };
};
const QueryClient = function() { this.invalidateQueries = () => {}; };
const QueryClientProvider = ({ children }) => React.createElement(Fragment, null, children);
const useQueryClient = () => ({ invalidateQueries: () => {} });

// next-themes shim
const useTheme = () => ({ theme: 'dark', setTheme: () => {}, resolvedTheme: 'dark', themes: ['light', 'dark'] });
const ThemeProvider = ({ children }) => React.createElement(Fragment, null, children);

// react-hook-form shims
const useForm = (opts) => {
  const [values, setValues] = useState(opts?.defaultValues || {});
  return {
    register: (name) => ({ name, value: values[name] || '', onChange: (e) => setValues(p => ({ ...p, [name]: e.target?.value ?? e })) }),
    handleSubmit: (fn) => (e) => { e?.preventDefault?.(); fn(values); },
    formState: { errors: {}, isSubmitting: false, isValid: true },
    watch: (name) => name ? values[name] : values,
    setValue: (name, val) => setValues(p => ({ ...p, [name]: val })),
    getValues: () => values,
    reset: (v) => setValues(v || opts?.defaultValues || {}),
    control: {},
  };
};

// zod shim
const z = {
  string: () => ({ min: () => z.string(), max: () => z.string(), email: () => z.string(), optional: () => z.string(), nullable: () => z.string(), default: () => z.string() }),
  number: () => ({ min: () => z.number(), max: () => z.number(), int: () => z.number(), optional: () => z.number(), default: () => z.number() }),
  boolean: () => ({ optional: () => z.boolean(), default: () => z.boolean() }),
  array: (s) => ({ min: () => z.array(s), optional: () => z.array(s) }),
  object: (shape) => ({ parse: (d) => d, safeParse: (d) => ({ success: true, data: d }), optional: () => z.object(shape), extend: (s) => z.object({ ...shape, ...s }) }),
  enum: (vals) => ({ optional: () => z.enum(vals) }),
  infer: null,
};

// sonner Toaster shim  
const Toaster = () => null;
`;

/**
 * Collect CSS from all .css files, stripping Tailwind directives.
 */
function collectCSS(flat: Record<string, string>): string {
  return Object.entries(flat)
    .filter(([p]) => /\.css$/.test(p))
    .map(([, c]) => c)
    .join('\n')
    .replace(/@tailwind\s+\w+\s*;/g, '')
    .replace(/@layer\s+\w+\s*\{[\s\S]*?\}/g, '')
    .replace(/@import\s+.*$/gm, '')
    .replace(/@apply\s+[^;]+;/g, '');
}

/**
 * Build a self-contained HTML string from project files.
 * Supports React/TSX projects by inlining components into a single HTML preview.
 */
export function buildPreviewHTML(files: ProjectFile[]): string {
  const flat = flattenFiles(files);

  // Check if there's a direct index.html with no React
  const indexHtml = flat['/index.html'] || flat['/public/index.html'];
  if (indexHtml && !flat['/src/App.tsx'] && !flat['/src/App.jsx']) {
    let html = indexHtml;
    const cssFile = flat['/styles.css'] || flat['/style.css'] || flat['/src/index.css'];
    if (cssFile) {
      html = html.replace('</head>', `<style>${cssFile}</style></head>`);
    }
    const jsFile = flat['/script.js'] || flat['/src/main.js'] || flat['/src/index.js'];
    if (jsFile) {
      html = html.replace('</body>', `<script>${jsFile}</script></body>`);
    }
    return html;
  }

  // Collect all component files (skip entry points like main.tsx)
  const entryPaths = ['/src/main.tsx', '/src/main.jsx', '/src/main.ts', '/src/main.js', '/src/index.tsx', '/src/index.jsx'];
  const components: { path: string; code: string; processed: string }[] = [];
  for (const [path, code] of Object.entries(flat)) {
    if (/\.(tsx?|jsx?)$/.test(path) && !path.includes('node_modules') && !entryPaths.includes(path)) {
      const processed = stripTypeScript(code);
      components.push({ path, code, processed: `// --- ${path} ---\n${processed}` });
    }
  }

  const allCSS = collectCSS(flat);
  const appFile = flat['/src/App.tsx'] || flat['/src/App.jsx'] || flat['/App.tsx'] || flat['/App.jsx'];

  if (!appFile && components.length === 0) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Preview</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#888;background:#0f0f1a;">
<div style="text-align:center"><h2 style="color:#e2e8f0">No Preview Available</h2><p>Add an App component to see a preview here.</p></div>
</body></html>`;
  }

  // Topological sort
  const sorted = topologicalSort(components);
  const processedComponents = sorted.map(c => c.processed).join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: { DEFAULT: '#8b5cf6', foreground: '#fff' },
            secondary: { DEFAULT: '#1e1b4b', foreground: '#e2e8f0' },
            accent: { DEFAULT: '#06b6d4', foreground: '#fff' },
            destructive: { DEFAULT: '#ef4444', foreground: '#fff' },
            muted: { DEFAULT: '#1e1e2e', foreground: '#94a3b8' },
            card: { DEFAULT: '#16162a', foreground: '#e2e8f0' },
            popover: { DEFAULT: '#16162a', foreground: '#e2e8f0' },
            background: '#0f0f1a',
            foreground: '#e2e8f0',
            border: '#2e2e4a',
            ring: '#8b5cf6',
            input: '#2e2e4a',
          },
          borderRadius: {
            lg: '0.5rem',
            md: '0.375rem',
            sm: '0.25rem',
          }
        }
      }
    }
  <\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #e2e8f0; }
    #__error-overlay { display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.85); padding:2rem; overflow:auto; font-family:monospace; }
    #__error-overlay.visible { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:4rem; }
    #__error-overlay h3 { color:#ef4444; font-size:1.25rem; margin-bottom:1rem; }
    #__error-overlay pre { background:#1e1e2e; color:#f87171; padding:1rem; border-radius:0.5rem; max-width:100%; overflow-x:auto; white-space:pre-wrap; word-break:break-word; font-size:0.8rem; line-height:1.5; }
    #__error-overlay button { margin-top:1rem; padding:0.5rem 1rem; background:#8b5cf6; color:#fff; border:none; border-radius:0.375rem; cursor:pointer; font-size:0.875rem; }
    #__error-overlay button:hover { background:#7c3aed; }
    ${allCSS}
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="__error-overlay">
    <h3>⚠ Preview Error</h3>
    <pre id="__error-message"></pre>
    <button onclick="document.getElementById('__error-overlay').classList.remove('visible')">Dismiss</button>
  </div>
  <script type="text/babel" data-presets="react,typescript">
    const { useState, useEffect, useCallback, useRef, useMemo, useReducer, createContext, useContext, forwardRef, memo, Fragment, Children, cloneElement, isValidElement, lazy, Suspense } = React;

    // Shim for common imports that won't be available
    const cn = (...classes) => classes.filter(Boolean).join(' ');
    const clsx = cn;
    const cva = (base, config) => (props) => {
      let classes = base || '';
      if (config?.variants && props) {
        Object.entries(config.variants).forEach(([key, variants]) => {
          const val = props[key] || config.defaultVariants?.[key];
          if (val && variants[val]) classes += ' ' + variants[val];
        });
      }
      return classes;
    };

    ${LIBRARY_SHIMS}

    // Safety net: auto-stub any undefined component (uppercase name) as a placeholder
    if (typeof Proxy !== 'undefined') {
      window.__stubCache = {};
      window.__origGet = window.__lookupGetter__ ? null : null;
      const handler = {
        get(target, prop, receiver) {
          if (typeof prop === 'string' && /^[A-Z][a-zA-Z0-9]*$/.test(prop) && !(prop in target) && !(prop in window.__stubCache)) {
            const Stub = function(props) {
              return React.createElement('div', {
                style: { padding: '16px', border: '1px dashed rgba(234,179,8,0.3)', borderRadius: '8px', margin: '4px 0' },
                'data-stub-component': prop
              }, props && props.children ? props.children : React.createElement('span', { style: { color: 'rgba(234,179,8,0.5)', fontSize: '12px' } }, '⚠ ' + prop));
            };
            Stub.displayName = prop + '_Stub';
            window[prop] = Stub;
            window.__stubCache[prop] = true;
            return Stub;
          }
          return Reflect.get(target, prop, receiver);
        }
      };
      try { window.__proxyRef = new Proxy(window, handler); } catch(e) {}
      // Wrap eval/script execution to catch undefined refs and auto-stub
      window.addEventListener('error', function(e) {
        const m = e.message && e.message.match(/^(?:Uncaught )?ReferenceError: ([A-Z][a-zA-Z0-9]*) is not defined/);
        if (m && m[1]) {
          const name = m[1];
          if (!window[name]) {
            window[name] = function(props) {
              return React.createElement('div', {
                style: { padding: '16px', border: '1px dashed rgba(234,179,8,0.3)', borderRadius: '8px', margin: '4px 0' },
                'data-stub-component': name
              }, props && props.children ? props.children : React.createElement('span', { style: { color: 'rgba(234,179,8,0.5)', fontSize: '12px' } }, '⚠ ' + name));
            };
          }
        }
      });
    }

    ${processedComponents}

    // Render
    try {
      const AppComponent = typeof App !== 'undefined' ? App : null;
      if (AppComponent) {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(AppComponent));
      } else {
        document.getElementById('root').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#64748b;"><div style="text-align:center"><h2 style="color:#e2e8f0;margin-bottom:0.5rem">Preview Ready</h2><p>Define an App component to see it rendered here.</p></div></div>';
      }
    } catch (err) {
      const overlay = document.getElementById('__error-overlay');
      document.getElementById('__error-message').textContent = err.message + '\\n\\n' + (err.stack || '');
      overlay.classList.add('visible');
      console.error('Preview error:', err);
    }

    // Catch runtime errors too
    window.onerror = function(msg, src, line, col, err) {
      const overlay = document.getElementById('__error-overlay');
      document.getElementById('__error-message').textContent = msg + '\\nLine ' + line + ', Col ' + col + '\\n\\n' + (err?.stack || '');
      overlay.classList.add('visible');
    };

    // Listen for hot-reload messages from parent
    window.addEventListener('message', function(event) {
      if (event.data?.type === 'hot-reload') {
        try {
          const root = ReactDOM.createRoot(document.getElementById('root'));
          const AppComponent = typeof App !== 'undefined' ? App : null;
          if (AppComponent) root.render(React.createElement(AppComponent));
        } catch (err) {
          console.error('Hot reload error:', err);
        }
      }
    });
  <\/script>
</body>
</html>`;
}

/**
 * Create a blob URL from HTML string for iframe src.
 */
export function createPreviewBlobUrl(html: string): string {
  const blob = new Blob([html], { type: 'text/html' });
  return URL.createObjectURL(blob);
}
