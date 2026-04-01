import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, pluginId, actionName, params } = await req.json();

    switch (action) {
      case "list": {
        // Return available cloud models
        const models = {
          cloud: [
            { id: "gemini-flash", name: "Gemini 2.5 Flash", status: "available", provider: "cloud" },
            { id: "gemini-pro", name: "Gemini 2.5 Pro", status: "available", provider: "cloud" },
          ],
          local: [] as any[],
        };

        // Try to check Ollama (won't work from edge function, but placeholder)
        return new Response(JSON.stringify({ models }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "status": {
        return new Response(JSON.stringify({
          cloud: { status: "available", latency: "low" },
          ollama: { status: "check-locally", endpoint: "http://localhost:11434" },
          llamaCpp: { status: "check-locally", endpoint: "http://localhost:8081" },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("models error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
