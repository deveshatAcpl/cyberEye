import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CVEFilters } from "./CVEFilters";
import { CVETable } from "./CVETable";
import { CVECharts } from "./CVECharts";
import { CVEUrlImprovement } from "./CVEUrlImprovement";
import { ApiStatusCard } from "./ApiStatusCard";
import AutomatedVendorProcessing from "./AutomatedVendorProcessing";
import { FilterState, CVEData, VENDORS } from "@/types/cve";
import { CVEApiService } from "@/services/cveApi";
import { DataStorage } from "@/utils/dataStorage";
import { useToast } from "@/hooks/use-toast";

export function CVEIntelligence() {
  const [cveData, setCveData] = useState<CVEData[]>([]);
  const [filteredData, setFilteredData] = useState<CVEData[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    vendors: [],
    dateFrom: "",
    dateTo: "",
    severity: [],
    searchTerm: ""
  });
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  const { toast } = useToast();
  const apiService = CVEApiService.getInstance();
  const dataStorage = DataStorage.getInstance();

  const testApiConnection = async () => {
    setLoading(true);
    try {
      const isConnected = await apiService.testApiConnection();
      if (isConnected) {
        toast({
          title: "API Connection Successful",
          description: "CVE Details API is accessible and working correctly",
        });
      } else {
        toast({
          title: "API Connection Failed",
          description: "Unable to connect to CVE Details API",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "API Test Error",
        description: `Error testing API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load any existing data on component mount
    loadExistingData();
  }, []);

  useEffect(() => {
    // Apply filters whenever filters or data change
    applyFilters();
  }, [filters, cveData]);

  const loadExistingData = async () => {
    try {
      setLoading(true);
      console.log("Loading existing data...");
      const existingData = await dataStorage.getAllStoredData();
      console.log("Loaded existing data:", existingData.length, "records");
      if (existingData.length > 0) {
        setCveData(existingData);
        console.log("Set CVE data with", existingData.length, "records");
        toast({
          title: "Data Loaded",
          description: `Loaded ${existingData.length} existing CVE records from cache`,
        });
      } else {
        console.log("No existing data found");
        toast({
          title: "No Cached Data",
          description: "No existing CVE data found. Use filters to fetch new data.",
        });
      }
    } catch (error) {
      console.error("Failed to load existing data:", error);
      toast({
        title: "Error",
        description: "Failed to load existing data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const normalizeDateString = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    
    // Handle different date formats
    if (dateStr.match(/^\d{2}-\w{3}-\d{2}$/)) {
      // Handle "18-Sep-25" format
      const parts = dateStr.split('-');
      const day = parts[0];
      const monthStr = parts[1];
      const year = '20' + parts[2]; // Convert "25" to "2025"
      
      const monthMap: {[key: string]: string} = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
      };
      
      const month = monthMap[monthStr];
      if (month) {
        return new Date(`${year}-${month}-${day}`);
      }
    }
    
    // Default to standard Date parsing
    return new Date(dateStr);
  };

  const applyFilters = () => {
    console.log("Applying filters to", cveData.length, "records with filters:", filters);
    let filtered = [...cveData];

    // Vendor filter
    if (filters.vendors.length > 0 && !filters.vendors.includes("All")) {
      const beforeVendorFilter = filtered.length;
      filtered = filtered.filter(item => 
        filters.vendors.some(vendor => 
          item.vendor.toLowerCase().includes(vendor.toLowerCase())
        )
      );
      console.log(`Vendor filter: ${beforeVendorFilter} -> ${filtered.length} records`);
    }

    // Date filter
    if (filters.dateFrom) {
      const beforeDateFromFilter = filtered.length;
      const filterFromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(item => {
        const itemDate = normalizeDateString(item.publishedDate);
        return itemDate && itemDate >= filterFromDate;
      });
      console.log(`Date From filter (${filters.dateFrom}): ${beforeDateFromFilter} -> ${filtered.length} records`);
    }
    if (filters.dateTo) {
      const beforeDateToFilter = filtered.length;
      const filterToDate = new Date(filters.dateTo);
      filtered = filtered.filter(item => {
        const itemDate = normalizeDateString(item.publishedDate);
        return itemDate && itemDate <= filterToDate;
      });
      console.log(`Date To filter (${filters.dateTo}): ${beforeDateToFilter} -> ${filtered.length} records`);
    }

    // Severity filter
    if (filters.severity.length > 0) {
      filtered = filtered.filter(item => 
        filters.severity.includes(item.severity)
      );
    }

    // Search term filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.cve.toLowerCase().includes(searchLower) ||
        item.securityAdvisories.toLowerCase().includes(searchLower) ||
        item.productsAffected.some(product => 
          product.toLowerCase().includes(searchLower)
        )
      );
    }

    console.log(`Final filtered data: ${filtered.length} records`);
    setFilteredData(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleFilterSubmit = async (newFilters: FilterState) => {
    console.log("Filter submit triggered with:", newFilters);
    setFilters(newFilters);
    setLoading(true);

    try {
      let allData: CVEData[] = [];
      
      // Determine which vendors to fetch
      const isAllVendorsSelected = newFilters.vendors.includes("All") || newFilters.vendors.length === 0;
      const vendorsToProcess = isAllVendorsSelected ? [...VENDORS] : newFilters.vendors;
      
      console.log("Vendors to process:", vendorsToProcess);

      if (isAllVendorsSelected && !newFilters.dateFrom && !newFilters.dateTo) {
        // No filters applied, use all existing data
        const existingData = await dataStorage.getAllStoredData();
        console.log("Loading all existing data:", existingData.length, "records");
        setCveData(existingData);
        toast({
          title: "Loaded Stored Data",
          description: `Displaying ${existingData.length} records from cache`,
        });
        setLoading(false);
        return;
      }

      // Enhanced data fetching with improved date range logic
      if (newFilters.dateFrom && newFilters.dateTo) {
        // Enhanced data fetching with new single-file-per-vendor approach
        if (isAllVendorsSelected) {
          // Get all data for date range across all vendors - much faster now!
          try {
            allData = await dataStorage.getAllDataForDateRange(newFilters.dateFrom, newFilters.dateTo);
            
            if (allData.length > 0) {
              console.log(`Found ${allData.length} cached records for ALL vendors in date range ${newFilters.dateFrom} to ${newFilters.dateTo}`);
            } else {
              console.log(`No cached data for date range ${newFilters.dateFrom} to ${newFilters.dateTo}, fetching fresh data`);
              // Fetch fresh data for all vendors
              for (const vendor of vendorsToProcess) {
                try {
                  const vendorData = await apiService.fetchAndStoreCVEData(
                    vendor,
                    newFilters.dateFrom,
                    newFilters.dateTo
                  );
                  allData.push(...vendorData);
                } catch (error) {
                  console.error(`API error for ${vendor}:`, error);
                }
              }
            }
          } catch (error) {
            console.error('Error fetching all data for date range:', error);
            // Fallback to individual vendor fetching
            for (const vendor of vendorsToProcess) {
              try {
                const vendorData = await dataStorage.getDataForDateRange(
                  vendor, 
                  newFilters.dateFrom, 
                  newFilters.dateTo
                );
                allData.push(...vendorData);
              } catch (error) {
                console.error(`Error for ${vendor}:`, error);
              }
            }
          }
        } else {
          // For specific vendors - now much faster with single file per vendor
          for (const vendor of vendorsToProcess) {
            let vendorData: CVEData[] = [];
            
            try {
              // Check cached data - now reads single vendor file and filters in memory
              vendorData = await dataStorage.getDataForDateRange(
                vendor, 
                newFilters.dateFrom, 
                newFilters.dateTo
              );
              
              if (vendorData.length === 0) {
                console.log(`No cached data for ${vendor} in range ${newFilters.dateFrom} to ${newFilters.dateTo}, fetching from API`);
                vendorData = await apiService.fetchAndStoreCVEData(
                  vendor,
                  newFilters.dateFrom,
                  newFilters.dateTo
                );
              } else {
                console.log(`Found ${vendorData.length} cached records for ${vendor} in date range`);
              }
            } catch (error) {
              console.error(`Error processing ${vendor}:`, error);
              vendorData = [];
            }
            
            allData.push(...vendorData);
          }
        }
      } else {
        // No date filter - get all available data
        for (const vendor of vendorsToProcess) {
          try {
            const today = new Date().toISOString().split('T')[0];
            let vendorData = await dataStorage.loadData(vendor, today) || [];
            
            if (vendorData.length === 0) {
              // Try to get any available data for this vendor
              const allStoredData = await dataStorage.getAllStoredData();
              vendorData = allStoredData.filter(item => 
                item.vendor.toLowerCase().includes(vendor.toLowerCase())
              );
            }
            
            allData.push(...vendorData);
          } catch (error) {
            console.error(`Error loading data for ${vendor}:`, error);
          }
        }
      }

      // Remove duplicates by CVE ID
      const uniqueData = Array.from(
        new Map(allData.map(item => [item.cve, item])).values()
      );

      setCveData(uniqueData);
      
        // Get file system stats for display
        const stats = await dataStorage.getFileSystemStats();
        
        // Automatically trigger automation after successful data fetch
        try {
          const automationResponse = await fetch('/api/automation/start', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              vendors: vendorsToProcess
            }),
          });
          
          if (automationResponse.ok) {
            toast({
              title: "Automation Started",
              description: `Data loaded successfully (${uniqueData.length} CVE records). Automation started for ${vendorsToProcess.length} vendors.`,
            });
          } else {
            toast({
              title: "Data Loaded, Automation Failed",
              description: `Loaded ${uniqueData.length} CVE records but failed to start automation. Files: ${stats.totalFiles}, Size: ${(stats.totalSize / 1024).toFixed(1)}KB`,
              variant: "destructive",
            });
          }
        } catch (automationError) {
          console.error("Failed to start automation:", automationError);
          toast({
            title: "Data Loaded Successfully",
            description: `Loaded ${uniqueData.length} CVE records for ${vendorsToProcess.length} vendors. Files: ${stats.totalFiles}, Size: ${(stats.totalSize / 1024).toFixed(1)}KB. Automation failed to start.`,
          });
        }    } catch (error) {
      console.error("Filter submission error:", error);
      toast({
        title: "Error",
        description: `Failed to fetch CVE data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  return (
    <div className="space-y-6">
      {/* API Status Card */}
      <ApiStatusCard />

      {/* Charts Section */}
      <CVECharts data={filteredData} />

      {/* URL Improvement Section */}
      <CVEUrlImprovement />

      {/* Automated Vendor Processing */}
      <AutomatedVendorProcessing currentFilters={filters} />

      {/* Filters Section */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <span>Intelligence Filters</span>
            {loading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CVEFilters 
            onFilterSubmit={handleFilterSubmit}
            loading={loading}
          />
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground">
            CVE Intelligence Data ({filteredData.length} records)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CVETable 
            data={paginatedData}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}