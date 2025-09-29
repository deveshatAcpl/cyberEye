import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VENDORS = [
  "Adobe", "Microsoft", "Cisco", "ORACLE", "Apple", "Google", "VMWare", 
  "SAP", "Fortinet", "Palo Alto Networks"
];

interface UrlImprovementResult {
  success: boolean;
  message: string;
  improved_count: number;
  processed: number;
}

export function CVEUrlImprovement() {
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [limit, setLimit] = useState<number>(10);
  const [isImproving, setIsImproving] = useState(false);
  const [results, setResults] = useState<UrlImprovementResult[]>([]);
  const { toast } = useToast();

  const improveUrlsForVendor = async (vendor: string) => {
    try {
      setIsImproving(true);
      
      const response = await fetch(`http://localhost:8000/api/cve/improve-urls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vendor,
          limit
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setResults(prev => [{ ...result, vendor }, ...prev]);
        toast({
          title: "URLs Improved Successfully",
          description: `Improved ${result.improved_count} URLs for ${vendor} (${result.processed} processed)`,
        });
      } else {
        throw new Error(result.message || "Failed to improve URLs");
      }
      
    } catch (error) {
      console.error("Error improving URLs:", error);
      toast({
        variant: "destructive",
        title: "URL Improvement Failed",
        description: error instanceof Error ? error.message : "Failed to improve URLs",
      });
    } finally {
      setIsImproving(false);
    }
  };

  const improveAllVendorUrls = async () => {
    if (!selectedVendor) {
      toast({
        variant: "destructive",
        title: "No Vendor Selected",
        description: "Please select a vendor to improve URLs for",
      });
      return;
    }

    await improveUrlsForVendor(selectedVendor);
  };

  const improveUrlsForAllVendors = async () => {
    setResults([]);
    
    for (const vendor of VENDORS) {
      await improveUrlsForVendor(vendor);
      // Add small delay between vendors to prevent overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          CVE URL Improvement
        </CardTitle>
        <CardDescription>
          Improve CVE URLs by fetching actual vendor-specific advisory links from CVE Details for all vendors
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Single Vendor Improvement */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Improve URLs for Specific Vendor</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor">Select Vendor</Label>
              <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {VENDORS.map((vendor) => (
                    <SelectItem key={vendor} value={vendor}>
                      {vendor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="limit">Limit (CVEs to process)</Label>
              <Input
                id="limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 10))}
                min={1}
                max={100}
                className="bg-background/50"
              />
            </div>
            
            <div className="flex items-end">
              <Button 
                onClick={improveAllVendorUrls}
                disabled={!selectedVendor || isImproving}
                className="w-full"
              >
                {isImproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Improve URLs
              </Button>
            </div>
          </div>
        </div>

        {/* All Vendors Improvement */}
        <div className="space-y-4 pt-6 border-t">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Improve URLs for All Vendors</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Process all {VENDORS.length} vendors with {limit} CVEs each
              </p>
            </div>
            <Button 
              onClick={improveUrlsForAllVendors}
              disabled={isImproving}
              variant="outline"
            >
              {isImproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Improve All Vendors
            </Button>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4 pt-6 border-t">
            <h3 className="text-sm font-medium">Recent Results</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {results.map((result, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border"
                >
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{(result as any).vendor}</p>
                      <p className="text-xs text-muted-foreground">
                        {result.message}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">
                      {result.improved_count} improved
                    </Badge>
                    <Badge variant="outline">
                      {result.processed} processed
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Info */}
        <div className="text-xs text-muted-foreground bg-muted/20 p-3 rounded-lg">
          <p className="font-medium mb-1">ℹ️ About URL Improvement:</p>
          <ul className="space-y-1 ml-4 list-disc">
            <li>Fetches actual vendor-specific advisory URLs from CVE Details</li>
            <li>Replaces generic URLs with Adobe, Microsoft, Cisco, Oracle, Apple security bulletins</li>
            <li>Only improves URLs that are better quality than existing ones</li>
            <li>Uses respectful rate limiting to avoid overwhelming external services</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}