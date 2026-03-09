// Web search client - calls the web-search edge function

import { supabase } from '@/integrations/supabase/client';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  success: boolean;
  results?: SearchResult[];
  query?: string;
  error?: string;
}

/**
 * Search the web via DuckDuckGo (through edge function).
 */
export async function searchWeb(query: string, count = 5): Promise<SearchResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('web-search', {
      body: { query, count },
    });

    if (error) {
      console.error('Web search error:', error);
      return { success: false, error: error.message };
    }

    return data as SearchResponse;
  } catch (err) {
    console.error('Web search failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Search failed' };
  }
}

/**
 * Format search results into a context string for the AI.
 */
export function formatSearchContext(results: SearchResult[]): string {
  if (!results || results.length === 0) return '';
  
  let context = '## Web Search Results\n\n';
  results.forEach((r, i) => {
    context += `**${i + 1}. ${r.title}**\n`;
    context += `URL: ${r.url}\n`;
    context += `${r.snippet}\n\n`;
  });
  context += '---\nUse the above search results to inform your response. Cite sources when relevant.\n';
  return context;
}
