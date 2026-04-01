import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.88.0";

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
        // Return built-in plugin manifests
        const plugins = [
          {
            id: "file-manager",
            name: "File Manager",
            version: "1.0.0",
            description: "Move, rename, copy, and extract files",
            icon: "📁",
            enabled: true,
            capabilities: ["file_operations"],
          },
          {
            id: "system-monitor",
            name: "System Monitor",
            version: "1.0.0",
            description: "Display CPU, memory, GPU, battery info",
            icon: "📊",
            enabled: true,
            capabilities: ["system_info"],
          },
          {
            id: "macro-runner",
            name: "Macro Runner",
            version: "1.0.0",
            description: "Record and replay action sequences",
            icon: "🔄",
            enabled: true,
            capabilities: ["automation"],
          },
        ];

        return new Response(JSON.stringify({ plugins }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "execute": {
        if (!pluginId || !actionName) {
          return new Response(JSON.stringify({ error: "pluginId and actionName required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Server-side plugin actions are limited; most run client-side
        return new Response(JSON.stringify({
          result: { note: "This plugin action runs client-side. Use the browser plugin system." },
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
    console.error("plugins error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
