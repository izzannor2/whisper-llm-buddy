// Memory system — persistent AI memory via Lovable Cloud

import { supabase } from '@/integrations/supabase/client';

export interface Memory {
  id: string;
  content: string;
  embedding_text: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export async function storeMemory(content: string, tags: string[] = []): Promise<Memory | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Store locally in IndexedDB if not authenticated
      return storeLocalMemory(content, tags);
    }

    const response = await supabase.functions.invoke('memory', {
      body: { content, tags, embedding_text: content.slice(0, 500) },
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    // Add action query param
    if (response.error) throw response.error;
    return response.data?.memory || null;
  } catch (err) {
    console.error('Failed to store memory:', err);
    return storeLocalMemory(content, tags);
  }
}

export async function searchMemories(query: string): Promise<Memory[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return searchLocalMemories(query);

    const response = await supabase.functions.invoke('memory', {
      body: {},
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    // For search, we need query params — use fetch directly
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/memory?action=search&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json();
    return data.memories || [];
  } catch (err) {
    console.error('Failed to search memories:', err);
    return searchLocalMemories(query);
  }
}

export async function listMemories(limit = 50): Promise<Memory[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return getLocalMemories();

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/memory?action=list&limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    if (!res.ok) throw new Error(`List failed: ${res.status}`);
    const data = await res.json();
    return data.memories || [];
  } catch (err) {
    console.error('Failed to list memories:', err);
    return getLocalMemories();
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return deleteLocalMemory(id);

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/memory?action=delete`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
    });
    return res.ok;
  } catch {
    return deleteLocalMemory(id);
  }
}

// --- Local fallback (IndexedDB) ---

const LOCAL_KEY = 'localdev-memories';

function getLocalMemories(): Memory[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

function storeLocalMemory(content: string, tags: string[]): Memory {
  const memories = getLocalMemories();
  const memory: Memory = {
    id: crypto.randomUUID(),
    content,
    embedding_text: content.slice(0, 500),
    tags,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memories.unshift(memory);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(memories.slice(0, 200)));
  return memory;
}

function searchLocalMemories(query: string): Memory[] {
  const q = query.toLowerCase();
  return getLocalMemories().filter(
    m => m.content.toLowerCase().includes(q) || m.embedding_text.toLowerCase().includes(q) || m.tags.some(t => t.toLowerCase().includes(q))
  );
}

function deleteLocalMemory(id: string): boolean {
  const memories = getLocalMemories().filter(m => m.id !== id);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(memories));
  return true;
}

// Get relevant memories for injection into system prompt
export async function getRelevantMemories(userMessage: string): Promise<string> {
  const keywords = userMessage.split(/\s+/).filter(w => w.length > 3).slice(0, 5).join(' ');
  if (!keywords) return '';
  
  const memories = await searchMemories(keywords);
  if (memories.length === 0) return '';
  
  const formatted = memories.slice(0, 5).map(m => `- ${m.content}`).join('\n');
  return `\n\n## Relevant Memories\nThe user has previously saved these notes:\n${formatted}\n`;
}
