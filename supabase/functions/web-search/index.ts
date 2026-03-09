const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Use DuckDuckGo HTML search and parse results
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const html = await response.text();

    // Parse results from HTML
    const results: { title: string; url: string; snippet: string }[] = [];
    
    // Match result blocks
    const resultRegex = /<a[^>]*class=\\\"result__a\\\"[^>]*href=\\\"([^\\\"]*)\\\"[^>]*>([\\s\\S]*?)<\\/a>[\\s\\S]*?<a[^>]*class=\\\"result__snippet\\\"[^>]*>([\\s\\S]*?)<\\/a>/g;
    let match;
    
    while ((match = resultRegex.exec(html)) !== null && results.length < count) {
      const rawUrl = match[1];
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      const snippet = match[3].replace(/<[^>]*>/g, '').trim();
      
      // Decode DDG redirect URL
      let url = rawUrl;
      try {
        const urlObj = new URL(rawUrl, 'https://duckduckgo.com');
        const uddg = urlObj.searchParams.get('uddg');
        if (uddg) url = decodeURIComponent(uddg);
      } catch {
        // keep raw url
      }
      
      if (title && snippet) {
        results.push({ title, url, snippet });
      }
    }

    // Fallback: try simpler regex if primary didn't match
    if (results.length === 0) {
      const simpleRegex = /<a[^>]*class=\\\"result__url\\\"[^>]*href=\\\"([^\\\"]*)\\\"[^>]*>[\\s\\S]*?<\\/a>[\\s\\S]*?<a[^>]*class=\\\"result__snippet\\\"[^>]*>([\\s\\S]*?)<\\/a>/g;
      while ((match = simpleRegex.exec(html)) !== null && results.length < count) {
        const url = match[1].replace(/<[^>]*>/g, '').trim();
        const snippet = match[2].replace(/<[^>]*>/g, '').trim();
        if (url && snippet) {
          results.push({ title: url, url: url.startsWith('http') ? url : `https://${url}`, snippet });
        }
      }
    }

    console.log(`Found ${results.length} results`);

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
