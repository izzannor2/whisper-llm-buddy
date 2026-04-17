import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Cog, Cpu, Wrench, Bot, Activity } from 'lucide-react';
import { ProvidersTab } from '@/components/settings/ProvidersTab';
import { RuntimeTab } from '@/components/settings/RuntimeTab';
import { ToolsTab } from '@/components/settings/ToolsTab';
import { AssistantsTab } from '@/components/settings/AssistantsTab';
import { StatusTab } from '@/components/settings/StatusTab';

export default function Settings() {
  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 border-b border-border flex items-center px-4 gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <Cog className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-base font-semibold">Settings</h1>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        <Tabs defaultValue="providers">
          <TabsList className="grid grid-cols-5 w-full mb-6">
            <TabsTrigger value="providers"><Cpu className="h-3 w-3 mr-2" />Providers</TabsTrigger>
            <TabsTrigger value="runtime"><Cog className="h-3 w-3 mr-2" />Runtime</TabsTrigger>
            <TabsTrigger value="tools"><Wrench className="h-3 w-3 mr-2" />Tools</TabsTrigger>
            <TabsTrigger value="assistants"><Bot className="h-3 w-3 mr-2" />Assistants</TabsTrigger>
            <TabsTrigger value="status"><Activity className="h-3 w-3 mr-2" />Status</TabsTrigger>
          </TabsList>
          <TabsContent value="providers"><ProvidersTab /></TabsContent>
          <TabsContent value="runtime"><RuntimeTab /></TabsContent>
          <TabsContent value="tools"><ToolsTab /></TabsContent>
          <TabsContent value="assistants"><AssistantsTab /></TabsContent>
          <TabsContent value="status"><StatusTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
