import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { ScrollArea } from './ui/scroll-area';
import { FilterState } from '@/types/cve';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  Settings,
  Activity
} from 'lucide-react';

interface AutomatedVendorProcessingProps {
  currentFilters?: FilterState;
}

interface TokenStatus {
  tokenIndex: number;
  isActive: boolean;
  lastUsed?: string;
  rateLimitReset?: string;
  requestsRemaining?: number;
  status: 'ready' | 'rate_limited' | 'error';
}

interface VendorProgress {
  vendor: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'rate_limited';
  progress: number;
  totalCVEs: number;
  processedCVEs: number;
  improvedCVEs: number;
  errors: string[];
  startTime?: string;
  endTime?: string;
  estimatedTimeRemaining?: string;
}

interface AutomationProgress {
  isRunning: boolean;
  currentVendor?: string;
  overallProgress: number;
  vendorProgress: VendorProgress[];
  activeTokenIndex: number;
  tokenStatuses: TokenStatus[];
  startTime?: string;
  estimatedCompletion?: string;
  totalVendors: number;
  completedVendors: number;
  errorVendors: number;
  totalCVEsProcessed: number;
  totalCVEsImproved: number;
  errors: string[];
  lastUpdate: string;
}

const VENDORS = [
  "7-ZIP",
  "AdAudit Plus", 
  "Adobe",
  "AMD",
  "Android",
  "Apache",
  "Apple",
  "Asus",
  "AWS",
  "CentOS",
  "Cert",
  "CISA",
  "Cisco",
  "Cisecurity",
  "Citrix",
  "Debian",
  "Dell",
  "Eclipse",
  "F5",
  "Fedora",
  "FileZilla",
  "Fortinet",
  "Genesys",
  "Google",
  "Google Cloud Platform Marketplace",
  "Google Cloud Platform Service Broker",
  "HCL",
  "HP",
  "HPE",
  "Intel",
  "Ivanti",
  "Jetbrains",
  "Juniper",
  "Lenovo",
  "Microsoft",
  "Mozilla",
  "Nessus",
  "NIST",
  "Nutanix",
  "Nvidia",
  "OpenSUSE",
  "ORACLE",
  "Palo Alto",
  "Palo Alto Networks",
  "PHP",
  "PHPmyadmin",
  "PostgreSQL",
  "Python",
  "RedHat",
  "RubyonRails",
  "Salesforce",
  "SAP",
  "Solarwinds",
  "SUSE",
  "TeamViewer",
  "Tomcat",
  "Ubuntu",
  "Veeam",
  "VMWare",
  "WinSCP",
  "Zoom",
  "Zscaler"
];

const AutomatedVendorProcessing: React.FC<AutomatedVendorProcessingProps> = ({ currentFilters }) => {
  const [progress, setProgress] = useState<AutomationProgress | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Start polling when automation starts or when progress is first loaded
  useEffect(() => {
    if (progress?.isRunning && !isPolling) {
      startPolling();
    } else if (!progress?.isRunning && isPolling) {
      stopPolling();
    }
  }, [progress?.isRunning, isPolling]);

  const startPolling = () => {
    setIsPolling(true);
    pollIntervalRef.current = setInterval(fetchProgress, 2000); // Poll every 2 seconds
  };

  const stopPolling = () => {
    setIsPolling(false);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const fetchProgress = async () => {
    try {
      const response = await fetch('/api/automation/progress');
      const data = await response.json();
      
      if (data.success) {
        const newProgress = data.progress;
        
        // If this is the first fetch and automation is running, add initial log
        if (!progress && newProgress.isRunning) {
          addLog(`Found automation already running - ${newProgress.currentVendor || 'Processing'} (${newProgress.overallProgress}% complete)`);
        }
        
        // Add log entries for status changes
        if (progress && newProgress) {
          if (progress.currentVendor !== newProgress.currentVendor && newProgress.currentVendor) {
            addLog(`Started processing vendor: ${newProgress.currentVendor}`);
          }
          
          // Check for completed vendors
          newProgress.vendorProgress?.forEach((vendor: VendorProgress) => {
            const prevVendor = progress.vendorProgress?.find((v: VendorProgress) => v.vendor === vendor.vendor);
            if (prevVendor?.status !== 'completed' && vendor.status === 'completed') {
              addLog(`✅ Completed ${vendor.vendor}: ${vendor.improvedCVEs}/${vendor.totalCVEs} URLs improved`);
            } else if (prevVendor?.status !== 'error' && vendor.status === 'error') {
              addLog(`❌ Error processing ${vendor.vendor}: ${vendor.errors.join(', ')}`);
            }
          });
        }
        
        setProgress(newProgress);
        setError(null);
        
        // Start polling immediately if automation is running and we're not already polling
        if (newProgress.isRunning && !isPolling) {
          startPolling();
        }
      }
    } catch (err) {
      console.error('Failed to fetch progress:', err);
      setError('Failed to fetch automation progress');
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev: string[]) => [...prev, `[${timestamp}] ${message}`]);
  };

  const startAutomation = async () => {
    try {
      setError(null);
      setLogs([]);
      
      // Prepare automation request with current filter dates
      const requestBody: any = {
        vendors: selectedVendors.length > 0 ? selectedVendors : undefined
      };
      
      // Add date filters if they exist
      if (currentFilters?.dateFrom) {
        requestBody.dateFrom = currentFilters.dateFrom;
        addLog(`📅 Using filtered date range: FROM ${currentFilters.dateFrom}`);
      }
      
      if (currentFilters?.dateTo) {
        requestBody.dateTo = currentFilters.dateTo;
        addLog(`📅 Using filtered date range: TO ${currentFilters.dateTo}`);
      }
      
      if (!currentFilters?.dateFrom && !currentFilters?.dateTo) {
        addLog('📅 No date filters applied - using default last 7 days');
      }
      
      addLog('🚀 Starting automated vendor processing...');
      
      const response = await fetch('/api/automation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      
      if (data.success) {
        addLog(`Automation started for ${selectedVendors.length > 0 ? selectedVendors.length : VENDORS.length} vendors`);
        setProgress(data.progress);
      } else {
        setError(data.message || 'Failed to start automation');
        addLog(`❌ Failed to start: ${data.message}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to start automation: ${errorMsg}`);
      addLog(`❌ Error: ${errorMsg}`);
    }
  };

  const stopAutomation = async () => {
    try {
      const response = await fetch('/api/automation/stop', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        addLog('Automation stopped by user');
        await fetchProgress(); // Get final state
      } else {
        setError(data.message || 'Failed to stop automation');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to stop automation: ${errorMsg}`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'rate_limited':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'rate_limited':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return 'N/A';
    try {
      return new Date(timeStr).toLocaleTimeString();
    } catch {
      return timeStr;
    }
  };

  // Load initial progress on mount
  useEffect(() => {
    fetchProgress();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Automated Vendor Processing
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-4 h-4" />
            </Button>
            {progress?.isRunning ? (
              <Button variant="destructive" onClick={stopAutomation}>
                <Pause className="w-4 h-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button onClick={startAutomation} disabled={!progress || progress.isRunning}>
                <Play className="w-4 h-4 mr-2" />
                Start Automation
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Settings Panel */}
          {showSettings && (
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium">Vendor Selection</h4>
              <div className="text-sm text-gray-600 mb-2">
                Leave empty to process all vendors, or select specific vendors:
              </div>
              <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                {VENDORS.map(vendor => (
                  <label key={vendor} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedVendors.includes(vendor)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVendors(prev => [...prev, vendor]);
                        } else {
                          setSelectedVendors(prev => prev.filter(v => v !== vendor));
                        }
                      }}
                      disabled={progress?.isRunning}
                    />
                    <span>{vendor}</span>
                  </label>
                ))}
              </div>
              {selectedVendors.length > 0 && (
                <div className="text-sm text-blue-600">
                  Selected: {selectedVendors.length} vendor(s)
                </div>
              )}
            </div>
          )}

          {/* Date Range Info */}
          <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-900/20">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-800 dark:text-blue-200">Date Range for Automation:</span>
            </div>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {currentFilters?.dateFrom && currentFilters?.dateTo ? (
                <span>📅 Will process CVEs from <strong>{currentFilters.dateFrom}</strong> to <strong>{currentFilters.dateTo}</strong></span>
              ) : currentFilters?.dateFrom ? (
                <span>📅 Will process CVEs from <strong>{currentFilters.dateFrom}</strong> onwards</span>
              ) : currentFilters?.dateTo ? (
                <span>📅 Will process CVEs up to <strong>{currentFilters.dateTo}</strong></span>
              ) : (
                <span>📅 Will process CVEs from the <strong>last 7 days</strong> (no date filters applied)</span>
              )}
            </div>
          </div>

          {/* Overall Progress */}
          {progress && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Overall Progress</span>
                  <span>{progress.overallProgress}%</span>
                </div>
                <Progress value={progress.overallProgress} className="h-3" />
              </div>

              {/* Current Status */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{progress.completedVendors}</div>
                  <div className="text-gray-600">Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{progress.totalCVEsImproved}</div>
                  <div className="text-gray-600">URLs Improved</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{progress.totalCVEsProcessed}</div>
                  <div className="text-gray-600">CVEs Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{progress.errorVendors}</div>
                  <div className="text-gray-600">Errors</div>
                </div>
              </div>

              {progress.currentVendor && (
                <Alert>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <AlertDescription>
                    Currently processing: <strong>{progress.currentVendor}</strong>
                  </AlertDescription>
                </Alert>
              )}

              {/* Token Status */}
              <div>
                <h4 className="font-medium mb-2">API Token Status</h4>
                <div className="flex gap-2 flex-wrap">
                  {progress.tokenStatuses?.map((token, index) => (
                    <Badge
                      key={index}
                      variant={token.isActive ? "default" : "secondary"}
                      className={`${token.status === 'rate_limited' ? 'bg-yellow-100 text-yellow-800' : 
                        token.status === 'error' ? 'bg-red-100 text-red-800' : 
                        token.isActive ? 'bg-green-100 text-green-800' : ''}`}
                    >
                      Token {index + 1} 
                      {token.isActive && ' (Active)'}
                      {token.status === 'rate_limited' && ' (Rate Limited)'}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vendor Progress Details */}
      {progress?.vendorProgress && progress.vendorProgress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Vendor Progress Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {progress.vendorProgress.map((vendor, index) => (
                  <div key={index} className="border rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(vendor.status)}
                        <span className="font-medium">{vendor.vendor}</span>
                        <Badge className={getStatusColor(vendor.status)}>
                          {vendor.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        {vendor.improvedCVEs}/{vendor.totalCVEs} improved
                      </div>
                    </div>
                    
                    {vendor.progress > 0 && (
                      <div>
                        <Progress value={vendor.progress} className="h-2" />
                        <div className="text-xs text-gray-600 mt-1">
                          {vendor.processedCVEs}/{vendor.totalCVEs} CVEs processed ({vendor.progress}%)
                        </div>
                      </div>
                    )}
                    
                    {vendor.startTime && (
                      <div className="text-xs text-gray-500">
                        Started: {formatTime(vendor.startTime)}
                        {vendor.endTime && ` • Completed: ${formatTime(vendor.endTime)}`}
                      </div>
                    )}
                    
                    {vendor.errors.length > 0 && (
                      <div className="text-xs text-red-600">
                        Errors: {vendor.errors.slice(-2).join(', ')}
                        {vendor.errors.length > 2 && ` (+${vendor.errors.length - 2} more)`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Live Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Live Activity Log</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setLogs([])}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <div className="space-y-1 text-sm font-mono">
              {logs.length === 0 ? (
                <div className="text-gray-500 italic">No activity yet...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="text-gray-700">
                    {log}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default AutomatedVendorProcessing;