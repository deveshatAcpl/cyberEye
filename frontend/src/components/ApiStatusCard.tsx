import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CVEApiService } from "@/services/cveApi";
import { useToast } from "@/hooks/use-toast";
import { 
  Globe, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Info,
  ExternalLink
} from "lucide-react";

export function ApiStatusCard() {
  const [apiStatus, setApiStatus] = useState<'unknown' | 'connected' | 'error' | 'cors-error'>('unknown');
  const [loading, setLoading] = useState(false);
  const [lastTestTime, setLastTestTime] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string>('');

  const { toast } = useToast();
  const apiService = CVEApiService.getInstance();

  const testApiConnection = async () => {
    setLoading(true);
    setErrorDetails('');
    try {
      const isConnected = await apiService.testApiConnection();
      setApiStatus(isConnected ? 'connected' : 'error');
      setLastTestTime(new Date().toLocaleTimeString());
      
      if (isConnected) {
        toast({
          title: "API Connection Successful",
          description: "CVE Details API is accessible and working correctly",
        });
      } else {
        // Fetch backend logs to get detailed error information
        const logs = await apiService.fetchBackendLogs();
        const lastErrorLog = logs.reverse().find(log => log.type === 'error');
        const errorMessage = lastErrorLog?.message || "Unable to connect to CVE Details API";
        
        setErrorDetails(errorMessage);
        
        toast({
          title: "API Connection Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('CORS')) {
        setApiStatus('cors-error');
        toast({
          title: "CORS Error Detected",
          description: "The API does not allow direct browser requests. This is expected in development.",
          variant: "destructive",
        });
      } else {
        setApiStatus('error');
        setErrorDetails(errorMessage);
        toast({
          title: "API Test Error",
          description: `Error testing API: ${errorMessage}`,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    testApiConnection();
  }, []);

  const getStatusInfo = () => {
    switch (apiStatus) {
      case 'connected':
        return {
          icon: <CheckCircle className="h-5 w-5 text-green-500" />,
          badge: <Badge variant="default" className="bg-green-500">Connected</Badge>,
          title: "API Connected",
          description: "CVE Details API is accessible and responding normally."
        };
      case 'cors-error':
        return {
          icon: <Shield className="h-5 w-5 text-orange-500" />,
          badge: <Badge variant="destructive">CORS Error</Badge>,
          title: "CORS Restriction",
          description: "The API blocks direct browser requests for security. This is normal in development mode."
        };
      case 'error':
        return {
          icon: <XCircle className="h-5 w-5 text-red-500" />,
          badge: <Badge variant="destructive">Error</Badge>,
          title: "API Error",
          description: errorDetails || "Unable to connect to the CVE Details API. Check network connectivity."
        };
      default:
        return {
          icon: <Globe className="h-5 w-5 text-gray-500" />,
          badge: <Badge variant="secondary">Unknown</Badge>,
          title: "API Status Unknown",
          description: "Click 'Test Connection' to check API accessibility."
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          {statusInfo.icon}
          CVE Details API Status
          {statusInfo.badge}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h4 className="font-medium">{statusInfo.title}</h4>
          <p className="text-sm text-muted-foreground">{statusInfo.description}</p>
          {lastTestTime && (
            <p className="text-xs text-muted-foreground">Last tested: {lastTestTime}</p>
          )}
        </div>

        <Button
          onClick={testApiConnection}
          disabled={loading}
          variant="outline"
          size="sm"
          className="w-full"
        >
          {loading ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Test Connection
            </>
          )}
        </Button>

        {apiStatus === 'cors-error' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>CORS Information</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-sm">
                The CVE Details API blocks direct browser requests due to CORS (Cross-Origin Resource Sharing) policies. 
                This is a security feature that prevents unauthorized access from web browsers.
              </p>
              <div className="space-y-1 text-xs">
                <p><strong>Solutions:</strong></p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Use mock data for development and testing (automatic fallback enabled)</li>
                  <li>Deploy the app with a backend proxy to handle API requests</li>
                  <li>Use a CORS proxy service for testing purposes</li>
                </ul>
              </div>
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://www.cvedetails.com/api-documentation/', '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  API Documentation
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {apiStatus === 'error' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Troubleshooting Guide</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-sm">
                Common causes and solutions:
              </p>
              <div className="space-y-1 text-xs">
                <ul className="list-disc ml-4 space-y-1">
                  <li><strong>DNS/Network Issue:</strong> Check your internet connection. Try accessing https://www.cvedetails.com in your browser.</li>
                  <li><strong>Firewall/Proxy:</strong> Ensure your firewall or corporate proxy allows connections to cvedetails.com</li>
                  <li><strong>Invalid API Token:</strong> Verify your API token in the backend .env file is valid and not expired</li>
                  <li><strong>API Service Down:</strong> Check https://www.cvedetails.com/api-documentation/ to see if the service is operational</li>
                  <li><strong>Rate Limiting:</strong> Wait a few minutes if you've made too many requests</li>
                </ul>
              </div>
              {errorDetails && (
                <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                  <strong>Error Details:</strong> {errorDetails}
                </div>
              )}
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://www.cvedetails.com/api-documentation/', '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Check API Status
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {(apiStatus === 'error' || apiStatus === 'cors-error') && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Mock Data Mode</AlertTitle>
            <AlertDescription>
              Since the API is not accessible, the application will use realistic mock data for demonstration purposes. 
              All CVE data shown will be sample data that mimics the real API structure and format.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}