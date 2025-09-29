import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CyberEyeLogo } from "./CyberEyeLogo";
import { CVEIntelligence } from "./CVEIntelligence";
import { CVESearchEngine } from "./CVESearchEngine";
import { TerminalLogs } from "./TerminalLogs";
import { ErrorTab } from "./ErrorTab";
import { DashboardStats } from "./DashboardStats";
import { FileSystemViewer } from "./FileSystemViewer";
import { Shield, Search, Terminal, AlertTriangle, HardDrive } from "lucide-react";

export function Dashboard() {
  const [activeTab, setActiveTab] = useState("intelligence");

  return (
    <div className="min-h-screen bg-gradient-dark">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <CyberEyeLogo size="lg" />
            <div className="text-sm text-muted-foreground">
              CVE Intelligence Automation Platform
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-6">
        {/* Dashboard Stats */}
        <DashboardStats />

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-5 bg-card/50 backdrop-blur-sm">
            <TabsTrigger 
              value="intelligence" 
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Shield className="h-4 w-4" />
              CVE Intelligence
            </TabsTrigger>
            <TabsTrigger 
              value="search" 
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Search className="h-4 w-4" />
              CVE Search
            </TabsTrigger>
            <TabsTrigger 
              value="filesystem" 
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <HardDrive className="h-4 w-4" />
              File System
            </TabsTrigger>
            <TabsTrigger 
              value="terminal" 
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Terminal className="h-4 w-4" />
              Terminal
            </TabsTrigger>
            <TabsTrigger 
              value="errors" 
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <AlertTriangle className="h-4 w-4" />
              Errors
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="intelligence" className="space-y-6">
              <CVEIntelligence />
            </TabsContent>

            <TabsContent value="search" className="space-y-6">
              <CVESearchEngine />
            </TabsContent>

            <TabsContent value="filesystem" className="space-y-6">
              <FileSystemViewer />
            </TabsContent>

            <TabsContent value="terminal" className="space-y-6">
              <TerminalLogs />
            </TabsContent>

            <TabsContent value="errors" className="space-y-6">
              <ErrorTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}