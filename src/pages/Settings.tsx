import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Cog, Cpu, Wrench, Bot, Activity } from 'lucide-react';
import { ProvidersTab } from '@/components/settings/ProvidersTab';
import { RuntimeTab } from '@/components/settings/RuntimeTab';
import { ToolsTab } from '@/components/settings/ToolsTab';
import { AssistantsTab } from '@/components/settings/AssistantsTab';
import { StatusTab } from '@/components/settings/StatusTab';

const VALID_TABS = ['providers', 'runtime', 'tools', 'assistants', 'status'] as const;
type TabId = typeof VALID_TABS[number];

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: TabId = (VALID_TABS as readonly string[]).includes(rawTab || '')
    ? (rawTab as TabId)
    : 'providers';

  const setTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 border-b border-border flex items-center px-4 gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Cog className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-base font-semibold">Settings</h1>
        <Button asChild variant="ghost" size="sm" className="ml-auto text-xs text-muted-foreground">
          <Link to="/">Home</Link>
        </Button>
      </header>
      <main className="max-w-6xl mx-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setTab} className="flex flex-col md:flex-row gap-4 md:gap-6">
          <TabsList className="md:flex-col md:h-auto md:w-48 md:p-2 md:bg-muted/50 md:items-stretch md:justify-start gap-1 md:sticky md:top-4">
            <TabsTrigger value="providers" className="md:justify-start md:w-full">
              <Cpu className="h-3.5 w-3.5 mr-2" />Providers
            </TabsTrigger>
            <TabsTrigger value="runtime" className="md:justify-start md:w-full">
              <Cog className="h-3.5 w-3.5 mr-2" />Runtime
            </TabsTrigger>
            <TabsTrigger value="tools" className="md:justify-start md:w-full">
              <Wrench className="h-3.5 w-3.5 mr-2" />Tools
            </TabsTrigger>
            <TabsTrigger value="assistants" className="md:justify-start md:w-full">
              <Bot className="h-3.5 w-3.5 mr-2" />Assistants
            </TabsTrigger>
            <TabsTrigger value="status" className="md:justify-start md:w-full">
              <Activity className="h-3.5 w-3.5 mr-2" />Status
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 min-w-0">
            <TabsContent value="providers" className="mt-0"><ProvidersTab /></TabsContent>
            <TabsContent value="runtime" className="mt-0"><RuntimeTab /></TabsContent>
            <TabsContent value="tools" className="mt-0"><ToolsTab /></TabsContent>
            <TabsContent value="assistants" className="mt-0"><AssistantsTab /></TabsContent>
            <TabsContent value="status" className="mt-0"><StatusTab /></TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
