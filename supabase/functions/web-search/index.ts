const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'brave' | 'duckduckgo';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, count = 5 } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Web search query:', query);

    const SEARCH_API_KEY = Deno.env.get('SEARCH_API_KEY');

    // Primary: Brave Search API
    if (SEARCH_API_KEY) {
      try {
        const braveUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
        const braveRes = await fetch(braveUrl, {
          headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': SEARCH_API_KEY },
        });

        if (braveRes.ok) {
          const braveData = await braveRes.json();
          const results: SearchResult[] = (braveData.web?.results || []).slice(0, count).map((r: any) => ({
            title: r.title || '',
            url: r.url || '',
            snippet: r.description || '',
            source: 'brave' as const,
          }));

          console.log(`Brave Search: ${results.length} results`);
          return new Response(
            JSON.stringify({ success: true, results, query }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.warn('Brave Search failed:', braveRes.status, '— falling back to DuckDuckGo');
      } catch (e) {
        console.warn('Brave Search error:', e, '— falling back to DuckDuckGo');
      }
    }

    // Fallback: DuckDuckGo
    const results: SearchResult[] = [];

    // DuckDuckGo instant answer API
    const apiUrl = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1';
    const response = await fetch(apiUrl, { headers: { 'User-Agent': 'LocalDevAI/1.0' } });

    if (response.ok) {
      const data = await response.json();

      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || 'Answer',
          url: data.AbstractURL,
          snippet: data.AbstractText,
          source: 'duckduckgo',
        });
      }

      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics) {
          if (results.length >= count) break;
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 80),
              url: topic.FirstURL,
              snippet: topic.Text,
              source: 'duckduckgo',
            });
          }
          if (topic.Topics) {
            for (const sub of topic.Topics) {
              if (results.length >= count) break;
              if (sub.Text && sub.FirstURL) {
                results.push({
                  title: sub.Text.split(' - ')[0] || sub.Text.substring(0, 80),
                  url: sub.FirstURL,
                  snippet: sub.Text,
                  source: 'duckduckgo',
                });
              }
            }
          }
        }
      }
    }

    // HTML scrape fallback if no results
    if (results.length === 0) {
      const htmlUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
      const htmlResp = await fetch(htmlUrl, { headers: { 'User-Agent': 'LocalDevAI/1.0' } });

      if (htmlResp.ok) {
        const html = await htmlResp.text();
        const snippetParts = html.split('class="result__snippet"');
        for (let i = 1; i < snippetParts.length && results.length < count; i++) {
          const part = snippetParts[i];
          const textStart = part.indexOf('>');
          const textEnd = part.indexOf('</a>');
          if (textStart === -1 || textEnd === -1) continue;
          const snippet = part.substring(textStart + 1, textEnd).replace(/<[^>]*>/g, '').trim();

          const urlPart = snippetParts[i - 1] || '';
          const hrefMatch = urlPart.lastIndexOf('href="');
          let url = '';
          if (hrefMatch !== -1) {
            const hrefEnd = urlPart.indexOf('"', hrefMatch + 6);
            url = urlPart.substring(hrefMatch + 6, hrefEnd);
            if (url.includes('uddg=')) {
              try {
                const u = new URL(url, 'https://duckduckgo.com');
                const uddg = u.searchParams.get('uddg');
                if (uddg) url = decodeURIComponent(uddg);
              } catch { /* keep raw */ }
            }
          }

          if (snippet) {
            results.push({
              title: snippet.substring(0, 80),
              url: url || 'https://duckduckgo.com/?q=' + encodeURIComponent(query),
              snippet,
              source: 'duckduckgo',
            });
          }
        }
      }
    }

    console.log('Found ' + results.length + ' results');

    return new Response(
      JSON.stringify({ success: true, results, query }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Search error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Search failed';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
