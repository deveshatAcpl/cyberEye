import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Terminal, Trash2, Play, Square } from "lucide-react";
import { CVEApiService } from "@/services/cveApi";
import { LogEntry } from "@/types/cve";

export function TerminalLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const apiService = CVEApiService.getInstance();

  useEffect(() => {
    // Subscribe to logs from API service
    const unsubscribe = apiService.onLog((log: LogEntry) => {
      setLogs(prev => [...prev, log]);
    });

    // Load existing frontend logs
    const frontendLogs = apiService.getLogs();
    
    // Load backend logs
    apiService.fetchBackendLogs().then(backendLogs => {
      const allLogs = [...frontendLogs, ...backendLogs].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setLogs(allLogs);
    }).catch(console.error);

    return unsubscribe;
  }, [apiService]);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (isAutoScroll && scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [logs, isAutoScroll]);

  const clearLogs = () => {
    setLogs([]);
  };

  const getLogIcon = (type: LogEntry["type"]) => {
    switch (type) {
      case "info":
        return "ℹ️";
      case "success":
        return "✅";
      case "warning":
        return "⚠️";
      case "error":
        return "❌";
      default:
        return "📝";
    }
  };

  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "info":
        return "text-terminal-info";
      case "success":
        return "text-terminal-text";
      case "warning":
        return "text-terminal-warning";
      case "error":
        return "text-terminal-error";
      default:
        return "text-foreground";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const runRealOperation = async () => {
    setIsRunning(true);
    
    try {
      // Start real CVE intelligence scan
      const logEntry = (type: LogEntry["type"], message: string) => {
        const newLog: LogEntry = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type,
          message
        };
        setLogs(prev => [...prev, newLog]);
      };

      logEntry("info", "Starting CVE intelligence scan...");
      logEntry("info", "Connecting to CVEDetails API...");
      
      // Test API connection
      const apiService = CVEApiService.getInstance();
      const testResponse = await apiService.searchVulnerabilities({
        resultsPerPage: 1
      });
      
      logEntry("success", "API connection established");
      logEntry("info", `Found ${testResponse.totalResults || 0} total CVEs in database`);
      
      // Scan a few vendors
      const testVendors = ["Adobe", "Microsoft", "Cisco"];
      
      for (const vendor of testVendors) {
        logEntry("info", `Scanning ${vendor} products...`);
        
        try {
          const vendorData = await apiService.searchVulnerabilitiesByVendor(
            vendor,
            "2024-01-01",
            new Date().toISOString().split('T')[0],
            1,
            10
          );
          
          logEntry("success", `Found ${vendorData.length} CVEs for ${vendor}`);
          
          if (vendorData.length > 0) {
            logEntry("info", `Processing vendor advisories for ${vendor}...`);
            const advisoryUrl = await apiService.googleSearchVendorAdvisory(vendorData[0].cve, vendor);
            logEntry("success", `${vendor} advisory found: ${advisoryUrl}`);
          }
          
        } catch (error) {
          logEntry("error", `Failed to scan ${vendor}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Add delay between vendor scans
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      logEntry("success", "CVE intelligence scan completed");
      
    } catch (error) {
      const newLog: LogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        type: "error",
        message: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      setLogs(prev => [...prev, newLog]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Terminal Header */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Live Terminal Logs
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge 
                variant={isRunning ? "default" : "secondary"}
                className={isRunning ? "pulse-red" : ""}
              >
                {isRunning ? "Running" : "Idle"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={runRealOperation}
                disabled={isRunning}
                className="border-border hover:bg-secondary"
              >
                {isRunning ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isRunning ? "Stop" : "Run Scan"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearLogs}
                className="border-border hover:bg-secondary"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div>Total Logs: {logs.length}</div>
            <div>Auto-scroll: {isAutoScroll ? "On" : "Off"}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAutoScroll(!isAutoScroll)}
              className="h-auto p-1 text-xs"
            >
              Toggle
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Terminal Output */}
      <Card className="bg-terminal-bg border-border/50 overflow-hidden">
        <CardContent className="p-0">
          <ScrollArea className="h-96" ref={scrollAreaRef}>
            <div className="p-4 space-y-1 font-mono text-sm">
              {logs.length === 0 ? (
                <div className="text-terminal-text opacity-60">
                  CyberEye Terminal v1.0.0<br />
                  Ready for CVE intelligence operations...<br />
                  <span className="text-primary">$</span> <span className="animate-pulse">_</span>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-muted-foreground text-xs mt-0.5 w-20 flex-shrink-0">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <span className="text-xs mt-0.5">
                      {getLogIcon(log.type)}
                    </span>
                    <span className={`${getLogColor(log.type)} terminal-text flex-1`}>
                      {log.message}
                      {log.details && (
                        <div className="text-xs text-muted-foreground mt-1 pl-4">
                          {log.details}
                        </div>
                      )}
                    </span>
                  </div>
                ))
              )}
              {isRunning && (
                <div className="flex items-center gap-2 text-primary">
                  <span className="text-muted-foreground text-xs w-20">
                    {formatTimestamp(new Date().toISOString())}
                  </span>
                  <span className="text-xs">⚙️</span>
                  <span className="terminal-text">
                    <span className="animate-pulse">Processing...</span>
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}