import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, RefreshCw, Trash2, ExternalLink } from "lucide-react";

interface ErrorEntry {
  id: string;
  timestamp: string;
  type: "api_error" | "fetch_error" | "parsing_error" | "vendor_error";
  vendor?: string;
  cve?: string;
  message: string;
  details?: string;
  retryCount: number;
  canRetry: boolean;
}

export function ErrorTab() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get real errors from API service
    loadRealErrors();
    
    // Update errors every 10 seconds
    const interval = setInterval(loadRealErrors, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadRealErrors = async () => {
    try {
      // In a real implementation, this would fetch from error logging service
      // For now, we'll show errors that might occur during real API usage
      const currentErrors: ErrorEntry[] = [];
      
      // Check for potential API rate limiting
      try {
        const response = await fetch('https://www.cvedetails.com/api/v1/vulnerability/search?resultsPerPage=1', {
          headers: {
            'Authorization': 'Bearer f640ec21d2347c50a68e56cc9cd2a1a7abc99b12.eyJzdWIiOjE0NDQ3LCJpYXQiOjE3NTg2ODY4MzksImV4cCI6MjAxODk5NTIwMCwia2lkIjoxLCJjIjoicmZGRWNXRjBaaXhTOXFuNTFsNTlHOFFVK2NJZURXeG9tc2ZlTFVodWliRzVpMGJxNWZ5bFZrYzBkVkwrUFkwalNHVThcL0s4ZFpRPT0ifQ=='
          }
        });
        
        if (response.status === 429) {
          currentErrors.push({
            id: `rate-limit-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: "api_error",
            message: "API rate limit exceeded",
            details: `CVEDetails API returned ${response.status}. Retry after cooldown period.`,
            retryCount: 0,
            canRetry: true
          });
        } else if (!response.ok) {
          currentErrors.push({
            id: `api-error-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: "api_error",
            message: `API request failed with status ${response.status}`,
            details: response.statusText,
            retryCount: 0,
            canRetry: true
          });
        }
      } catch (fetchError) {
        currentErrors.push({
          id: `network-error-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: "fetch_error",
          message: "Network connection failed",
          details: fetchError instanceof Error ? fetchError.message : 'Unknown network error',
          retryCount: 0,
          canRetry: true
        });
      }
      
      setErrors(currentErrors);
    } catch (error) {
      console.error("Failed to load error status:", error);
    } finally {
      setLoading(false);
    }
  };

  const getErrorTypeColor = (type: ErrorEntry["type"]) => {
    switch (type) {
      case "api_error":
        return "bg-destructive text-destructive-foreground";
      case "fetch_error":
        return "bg-high text-high-foreground";
      case "parsing_error":
        return "bg-warning text-warning-foreground";
      case "vendor_error":
        return "bg-medium text-medium-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getErrorTypeLabel = (type: ErrorEntry["type"]) => {
    switch (type) {
      case "api_error":
        return "API Error";
      case "fetch_error":
        return "Fetch Error";
      case "parsing_error":
        return "Parse Error";
      case "vendor_error":
        return "Vendor Error";
      default:
        return "Unknown Error";
    }
  };

  const handleRetry = (errorId: string) => {
    setErrors(prev => prev.map(error => 
      error.id === errorId 
        ? { ...error, retryCount: error.retryCount + 1 }
        : error
    ));
  };

  const clearErrors = () => {
    setErrors([]);
  };

  const clearError = (errorId: string) => {
    setErrors(prev => prev.filter(error => error.id !== errorId));
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Error Summary */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Error Management
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="pulse-red">
                {errors.length} Errors
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={clearErrors}
                disabled={errors.length === 0}
                className="border-border hover:bg-secondary"
              >
                <Trash2 className="h-4 w-4" />
                Clear All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">API Errors</div>
              <div className="font-medium text-destructive">
                {errors.filter(e => e.type === "api_error").length}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Vendor Errors</div>
              <div className="font-medium text-medium">
                {errors.filter(e => e.type === "vendor_error").length}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Parse Errors</div>
              <div className="font-medium text-warning">
                {errors.filter(e => e.type === "parsing_error").length}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Retryable</div>
              <div className="font-medium text-foreground">
                {errors.filter(e => e.canRetry).length}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error List */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground">Error Details</CardTitle>
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <div className="text-muted-foreground">
                No errors recorded. All operations completed successfully.
              </div>
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-4">
                {errors.map((error) => (
                  <div
                    key={error.id}
                    className="p-4 rounded-lg border border-border bg-accent/30 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Badge className={getErrorTypeColor(error.type)}>
                          {getErrorTypeLabel(error.type)}
                        </Badge>
                        {error.vendor && (
                          <Badge variant="outline" className="border-primary/30 text-primary">
                            {error.vendor}
                          </Badge>
                        )}
                        {error.cve && (
                          <Badge variant="outline" className="font-mono">
                            {error.cve}
                          </Badge>
                        )}
                        {error.retryCount > 0 && (
                          <Badge variant="secondary">
                            Retry #{error.retryCount}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTimestamp(error.timestamp)}
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="font-medium text-foreground mb-1">
                        {error.message}
                      </div>
                      {error.details && (
                        <div className="text-sm text-foreground/80 bg-muted/30 p-2 rounded font-mono">
                          {error.details}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {error.canRetry && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(error.id)}
                          className="border-border hover:bg-secondary"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => clearError(error.id)}
                        className="border-border hover:bg-secondary"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Dismiss
                      </Button>
                      {error.type === "vendor_error" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`https://google.com/search?q=${error.cve}+${error.vendor}+security+advisory`, "_blank")}
                          className="border-border hover:bg-secondary"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Manual Search
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}