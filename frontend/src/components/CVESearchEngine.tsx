import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, Shield, Calendar } from "lucide-react";
import { CVEApiService } from "@/services/cveApi";
import { useToast } from "@/hooks/use-toast";

interface SearchResult {
  cve: string;
  vendor: string;
  product: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  publishedDate: string;
  description: string;
  cvssScore: number;
  vendorUrl?: string;
  cveDetailsUrl: string;
}

export function CVESearchEngine() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  
  const { toast } = useToast();
  const apiService = CVEApiService.getInstance();

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    
    setSearching(true);
    setSearchResults([]);
    
    try {
      // Determine if search term is a CVE ID or general search
      const isCveId = searchTerm.match(/^CVE-\d{4}-\d+$/i);
      
      if (isCveId) {
        // Search for specific CVE across all vendors
        const vendors = ['Adobe', 'Microsoft', 'Cisco', 'Apple', 'Google', '7-zip', 'Oracle', 'IBM'];
        let allResults: any[] = [];
        
        for (const vendor of vendors) {
          try {
            const apiResponse = await apiService.searchVulnerabilities({
              vendorName: vendor,
              publishDateStart: "2020-01-01",
              resultsPerPage: 50
            });

            const filtered = (apiResponse as any).data?.filter((item: any) => 
              item.cve.toLowerCase() === searchTerm.toLowerCase()
            ) || [];
            
            allResults.push(...filtered);
          } catch (error) {
            console.warn(`Failed to search ${vendor} for CVE`, error);
          }
        }

        const results: SearchResult[] = await Promise.all(
          allResults.map(async (item: any) => {
            const vendorUrl = await apiService.googleSearchVendorAdvisory(item.cve, item.vendor);
            return {
              cve: item.cve,
              vendor: item.vendor,
              product: item.productsAffected?.[0] || 'Unknown',
              severity: item.severity as "Critical" | "High" | "Medium" | "Low",
              publishedDate: item.publishedDate,
              description: item.securityAdvisories || 'No description available',
              cvssScore: item.cvssScore || 0,
              vendorUrl,
              cveDetailsUrl: `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${item.cve}`
            };
          })
        );

        setSearchResults(results);
        
      } else {
        // Check if search term matches a vendor name
        const vendors = ['Adobe', 'Microsoft', 'Cisco', 'Apple', 'Google', '7-zip', 'Oracle', 'IBM'];
        const matchingVendor = vendors.find(v => 
          v.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        let searchVendors: string[] = [];
        
        if (matchingVendor) {
          // If search term matches a vendor, search that vendor specifically
          searchVendors = [matchingVendor];
        } else {
          // Otherwise search across multiple vendors for product/summary matches
          searchVendors = vendors;
        }
        
        const searchPromises = searchVendors.map(async (vendor) => {
          try {
            const apiResponse = await apiService.searchVulnerabilities({
              vendorName: vendor,
              publishDateStart: "2024-01-01",
              resultsPerPage: matchingVendor ? 20 : 5 // More results if searching specific vendor
            });

            if (matchingVendor) {
              // If searching for a specific vendor, return all results
              return (apiResponse as any).data || [];
            } else {
              // Otherwise filter by search term in summary/product
              return (apiResponse as any).data?.filter((item: any) =>
                item.securityAdvisories?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.productsAffected?.some((product: string) => 
                  product.toLowerCase().includes(searchTerm.toLowerCase()))
              ) || [];
            }
          } catch (error) {
            console.warn(`Failed to search ${vendor}`, error);
            return [];
          }
        });

        const allResults = await Promise.all(searchPromises);
        const flatResults = allResults.flat();

        const results: SearchResult[] = await Promise.all(
          flatResults.slice(0, 20).map(async (item: any) => {
            const vendorUrl = await apiService.googleSearchVendorAdvisory(item.cve, item.vendor);
            return {
              cve: item.cve,
              vendor: item.vendor,
              product: item.productsAffected?.[0] || 'Unknown',
              severity: item.severity as "Critical" | "High" | "Medium" | "Low",
              publishedDate: item.publishedDate,
              description: item.securityAdvisories || 'No description available',
              cvssScore: item.cvssScore || 0,
              vendorUrl,
              cveDetailsUrl: `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${item.cve}`
            };
          })
        );

        console.log("Search completed for:", searchTerm);
        console.log("Results found:", results.length);
        console.log("Results:", results);
        
        setSearchResults(results);
        
        toast({
          title: "Search Complete",
          description: `Found ${results.length} results for "${searchTerm}"`,
        });
      }

    } catch (error) {
      toast({
        title: "Search Failed",
        description: "Unable to search CVE database. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "Critical":
        return "severity-critical";
      case "High":
        return "severity-high";
      case "Medium":
        return "severity-medium";
      case "Low":
        return "severity-low";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Search className="h-5 w-5" />
            CVE Search Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search CVE IDs, vendors, products, or descriptions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
                className="pl-10 bg-input border-border text-foreground"
              />
            </div>
            <Button 
              onClick={handleSearch}
              disabled={searching}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {searching ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-foreground">
              Search Results ({searchResults.length} found)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {searchResults.map((result, index) => (
                <div 
                  key={result.cve}
                  className="p-4 rounded-lg border border-border bg-accent/30 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="border-primary/30 text-primary font-mono">
                        {result.cve}
                      </Badge>
                      <Badge className={getSeverityColor(result.severity)}>
                        {result.severity}
                      </Badge>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Shield className="h-3 w-3" />
                        CVSS {result.cvssScore}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {result.publishedDate}
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="font-medium text-foreground mb-1">
                      {result.vendor} - {result.product}
                    </div>
                    <p className="text-sm text-foreground/80">
                      {result.description}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(result.cveDetailsUrl, "_blank")}
                      className="border-border hover:bg-secondary"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      CVE Details
                    </Button>
                    {result.vendorUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(result.vendorUrl, "_blank")}
                        className="border-border hover:bg-secondary"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Vendor Advisory
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Results */}
      {searchTerm && searchResults.length === 0 && !searching && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="text-center py-12">
            <div className="text-muted-foreground">
              No results found for "{searchTerm}". Try different keywords or CVE IDs.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Initial State */}
      {!searchTerm && searchResults.length === 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="text-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <div className="text-muted-foreground">
              Enter a CVE ID, vendor name, product, or keywords to search our CVE database.
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Example: CVE-2025-12345, Adobe, Windows, or "remote code execution"
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}