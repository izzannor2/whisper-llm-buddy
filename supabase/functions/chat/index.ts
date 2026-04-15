const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toolSchemas = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_code",
      description: "Analyze code for bugs, performance, or security issues",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Code to analyze" },
          focus: { type: "string", enum: ["bugs", "performance", "security", "style", "all"] },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_code",
      description: "Generate code from a description",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "What to generate" },
          language: { type: "string", description: "Target language" },
        },
        required: ["description"],
      },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, model, temperature, top_p, max_tokens, stream, enableTools, agentMode } = await req.json();

    // Try GOOGLE_API_KEY first for self-hosted, then BLACKBOX_API_KEY, fallback to Lovable AI Gateway
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    const BLACKBOX_API_KEY = Deno.env.get("BLACKBOX_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!GOOGLE_API_KEY && !BLACKBOX_API_KEY && !LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "No AI backend configured. Set GOOGLE_API_KEY, BLACKBOX_API_KEY, or LOVABLE_API_KEY as a secret." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Model mapping
    const modelMap: Record<string, string> = {
      'gemini-flash': 'gemini-2.5-flash',
      'gemini-pro': 'gemini-2.5-pro',
    };

    if (GOOGLE_API_KEY) {
      // Direct Google Generative Language API
      const googleModel = modelMap[model] || 'gemini-2.5-flash';
      console.log(`Chat request (Google Direct) - Model: ${googleModel}, Stream: ${stream}`);

      const contents = (messages || [])
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
        }));

      const systemMsg = (messages || []).find((m: any) => m.role === 'system');

      const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
      const streamParam = stream ? '&alt=sse' : '';

      const googleResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${googleModel}:${endpoint}?key=${GOOGLE_API_KEY}${streamParam}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: systemMsg ? { parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : '' }] } : undefined,
            generationConfig: {
              temperature: temperature ?? 0.7,
              topP: top_p ?? 0.9,
              maxOutputTokens: max_tokens ?? 2048,
            },
          }),
        }
      );

      if (!googleResponse.ok) {
        const errText = await googleResponse.text();
        console.error("Google API error:", googleResponse.status, errText);
        return new Response(JSON.stringify({ error: `Google API error: ${googleResponse.status}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (stream) {
        return new Response(googleResponse.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const data = await googleResponse.json();
      // Convert Google format to OpenAI-compatible format
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: text } }],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Blackbox AI routing
    if (BLACKBOX_API_KEY && (model === 'blackbox-ai' || model === 'blackbox-ai-pro')) {
      console.log(`Chat request (Blackbox) - Model: ${model}, Stream: ${stream}`);

      const bbResponse = await fetch('https://api.blackbox.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BLACKBOX_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: temperature ?? 0.7,
          top_p: top_p ?? 0.9,
          max_tokens: max_tokens ?? 2048,
          stream: stream ?? false,
        }),
      });

      if (!bbResponse.ok) {
        const errText = await bbResponse.text();
        console.error("Blackbox API error:", bbResponse.status, errText);
        return new Response(JSON.stringify({ error: `Blackbox API error: ${bbResponse.status}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (stream) {
        return new Response(bbResponse.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const bbData = await bbResponse.json();
      return new Response(JSON.stringify(bbData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: Lovable AI Gateway
    const aiModel = (modelMap[model] ? `google/${modelMap[model]}` : 'google/gemini-2.5-flash');
    console.log(`Chat request (Lovable Gateway) - Model: ${aiModel}, Stream: ${stream}`);

    const requestBody: Record<string, unknown> = {
      model: aiModel,
      messages,
      temperature: temperature ?? 0.7,
      top_p: top_p ?? 0.9,
      max_tokens: max_tokens ?? 2048,
      stream: stream ?? false,
    };

    if (enableTools && agentMode !== 'chat') {
      requestBody.tools = toolSchemas;
      requestBody.tool_choice = "auto";
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `AI gateway error: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (stream) {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat function error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
