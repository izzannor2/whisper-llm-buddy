import { useState, useEffect, useCallback } from 'react';
import { Brain, Search, Trash2, Plus, X, Tag, Clock, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Memory, listMemories, storeMemory, deleteMemory, searchMemories } from '@/lib/memory-store';
import { useAuth } from '@/components/AuthProvider';

interface MemoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemoryPanel({ open, onOpenChange }: MemoryPanelProps) {
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadMemoriesList = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listMemories(100);
      setMemories(data);
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadMemoriesList();
  }, [open, loadMemoriesList]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadMemoriesList();
      return;
    }
    setIsLoading(true);
    try {
      const results = await searchMemories(searchQuery);
      setMemories(results);
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    const tags = newTags.split(',').map(t => t.trim()).filter(Boolean);
    await storeMemory(newContent.trim(), tags);
    setNewContent('');
    setNewTags('');
    setShowAddForm(false);
    loadMemoriesList();
  };

  const handleDelete = async (id: string) => {
    await deleteMemory(id);
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI Memory
            <Badge variant="secondary" className="ml-2">{memories.length}</Badge>
          </DialogTitle>
        </DialogHeader>

        {!user && (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/20 bg-primary/5 text-sm">
            <LogIn className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-muted-foreground">Sign in to sync memories across devices.</span>
            <Button variant="link" size="sm" className="ml-auto p-0 h-auto" onClick={() => { onOpenChange(false); window.location.href = '/auth'; }}>
              Sign in
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleSearch}>Search</Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <Textarea
              placeholder="What should the AI remember?"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="min-h-[80px]"
            />
            <Input
              placeholder="Tags (comma separated)"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
            />
            <Button size="sm" onClick={handleAdd} disabled={!newContent.trim()}>
              Save Memory
            </Button>
          </div>
        )}

        {/* Memories List */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : memories.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No memories yet</p>
              <p className="text-xs mt-1">Click "Remember" on any AI response to save it</p>
            </div>
          ) : (
            <div className="space-y-2 pr-3">
              {memories.map((memory) => (
                <div key={memory.id} className="group border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                  <p className="text-sm whitespace-pre-wrap">{memory.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {memory.tags?.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] h-5">
                          <Tag className="w-2.5 h-2.5 mr-1" />{tag}
                        </Badge>
                      ))}
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDate(memory.created_at)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 opacity-0 group-hover:opacity-100"
                      onClick={() => handleDelete(memory.id)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
