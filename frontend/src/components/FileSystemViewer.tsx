import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DataStorage } from "@/utils/dataStorage";
import { useToast } from "@/hooks/use-toast";
import { 
  FolderOpen, 
  File, 
  Download, 
  Upload, 
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  HardDrive
} from "lucide-react";

export function FileSystemViewer() {
  const [fileSystemStats, setFileSystemStats] = useState({
    totalFiles: 0,
    totalDirectories: 0,
    totalSize: 0
  });
  const [vendors, setVendors] = useState<string[]>([]);
  const [vendorDates, setVendorDates] = useState<Record<string, string[]>>({});
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();
  const dataStorage = DataStorage.getInstance();

  const refreshStats = async () => {
    try {
      const stats = await dataStorage.getFileSystemStats();
      setFileSystemStats(stats);
      const storedVendors = await dataStorage.getStoredVendors();
      setVendors(storedVendors);
      
      // Load dates for each vendor
      const dates: Record<string, string[]> = {};
      for (const vendor of storedVendors) {
        dates[vendor] = await dataStorage.getStoredDatesForVendor(vendor);
      }
      setVendorDates(dates);
    } catch (error) {
      console.error("Failed to refresh stats:", error);
      toast({
        title: "Error",
        description: "Failed to load file system stats",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    refreshStats();
  }, []);

  const handleExportFileSystem = async () => {
    try {
      const allData = await dataStorage.getAllStoredData();
      const jsonData = JSON.stringify(allData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cve-dashboard-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: "File system data exported to JSON file",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export file system data",
        variant: "destructive",
      });
    }
  };

  const handleImportFileSystem = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = e.target?.result as string;
        // TODO: Implement import functionality in dataStorage
        console.log("Import data:", JSON.parse(jsonData));
        refreshStats();
        
        toast({
          title: "Import Feature",
          description: "Import functionality needs to be implemented",
          variant: "destructive",
        });
      } catch (error) {
        toast({
          title: "Import Failed",
          description: "Failed to import file system data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleClearFileSystem = () => {
    if (window.confirm("Are you sure you want to clear all data? This action cannot be undone.")) {
      try {
        dataStorage.clearAllData();
        refreshStats();
        
        toast({
          title: "Data Cleared",
          description: "All file system data has been cleared",
        });
      } catch (error) {
        toast({
          title: "Clear Failed",
          description: "Failed to clear file system data",
          variant: "destructive",
        });
      }
    }
  };

  const toggleVendor = (vendor: string) => {
    const newExpanded = new Set(expandedVendors);
    if (newExpanded.has(vendor)) {
      newExpanded.delete(vendor);
    } else {
      newExpanded.add(vendor);
    }
    setExpandedVendors(newExpanded);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <HardDrive className="h-5 w-5" />
          JSON File System
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File System Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-background/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{fileSystemStats.totalFiles}</div>
            <div className="text-sm text-muted-foreground">JSON Files</div>
          </div>
          <div className="text-center p-3 bg-background/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{fileSystemStats.totalDirectories}</div>
            <div className="text-sm text-muted-foreground">Directories</div>
          </div>
          <div className="text-center p-3 bg-background/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{formatFileSize(fileSystemStats.totalSize)}</div>
            <div className="text-sm text-muted-foreground">Total Size</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshStats}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportFileSystem}
            disabled={loading}
          >
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
          
          <label className="cursor-pointer">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              asChild
            >
              <span>
                <Upload className="h-4 w-4 mr-2" />
                Import JSON
              </span>
            </Button>
            <input
              type="file"
              accept=".json"
              onChange={handleImportFileSystem}
              className="hidden"
            />
          </label>
          
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearFileSystem}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>

        {/* File System Tree */}
        {vendors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground mb-2">File Structure:</h4>
            <div className="bg-background/30 rounded-lg p-3 max-h-64 overflow-y-auto">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="h-4 w-4 text-blue-500" />
                  <span className="font-mono">data/</span>
                </div>
                
                {vendors.map(vendor => {
                  const dates = vendorDates[vendor] || [];
                  const isExpanded = expandedVendors.has(vendor);
                  
                  return (
                    <div key={vendor} className="ml-4">
                      <Collapsible>
                        <CollapsibleTrigger
                          onClick={() => toggleVendor(vendor)}
                          className="flex items-center gap-2 text-sm hover:bg-background/50 p-1 rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          <FolderOpen className="h-4 w-4 text-blue-500" />
                          <span className="font-mono">{vendor}/</span>
                          <Badge variant="secondary" className="text-xs">
                            {dates.length}
                          </Badge>
                        </CollapsibleTrigger>
                        
                        <CollapsibleContent>
                          {dates.map(date => (
                            <div key={date} className="ml-6 space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <FolderOpen className="h-4 w-4 text-blue-500" />
                                <span className="font-mono">{date}/</span>
                              </div>
                              <div className="ml-4 flex items-center gap-2 text-sm text-muted-foreground">
                                <File className="h-4 w-4 text-green-500" />
                                <span className="font-mono">SanReport.json</span>
                              </div>
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {vendors.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No JSON files stored yet</p>
            <p className="text-sm">Use the filters to fetch and store CVE data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}