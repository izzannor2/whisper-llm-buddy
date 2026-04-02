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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";

    switch (action) {
      case "store": {
        const { content, tags, embedding_text } = await req.json();
        if (!content) {
          return new Response(JSON.stringify({ error: "content is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Auto-generate embedding text if not provided
        const searchText = embedding_text || content.slice(0, 500);

        const { data, error } = await supabase.from("memories").insert({
          user_id: user.id,
          content,
          embedding_text: searchText,
          tags: tags || [],
        }).select().single();

        if (error) throw error;
        return new Response(JSON.stringify({ memory: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "search": {
        const query = url.searchParams.get("q") || "";
        if (!query) {
          return new Response(JSON.stringify({ memories: [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Full-text search
        const { data, error } = await supabase
          .from("memories")
          .select("*")
          .textSearch("embedding_text", query.split(" ").join(" & "), { type: "plain" })
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) {
          // Fallback to ILIKE search
          const { data: fallback, error: fbError } = await supabase
            .from("memories")
            .select("*")
            .ilike("embedding_text", `%${query}%`)
            .order("created_at", { ascending: false })
            .limit(10);
          if (fbError) throw fbError;
          return new Response(JSON.stringify({ memories: fallback || [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ memories: data || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list": {
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const { data, error } = await supabase
          .from("memories")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(Math.min(limit, 100));

        if (error) throw error;
        return new Response(JSON.stringify({ memories: data || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        const { id } = await req.json();
        if (!id) {
          return new Response(JSON.stringify({ error: "id is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error } = await supabase.from("memories").delete().eq("id", id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
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
    console.error("Memory function error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
