import { CVEApiResponse, CVEData, LogEntry } from "@/types/cve";

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || "https://localhost:8000";

export class CVEApiService {
  private static instance: CVEApiService;
  private logs: LogEntry[] = [];
  private logCallbacks: ((log: LogEntry) => void)[] = [];
  private activeFetches: Set<string> = new Set();
  private activeCallbacks: ((count: number) => void)[] = [];

  static getInstance(): CVEApiService {
    if (!CVEApiService.instance) {
      CVEApiService.instance = new CVEApiService();
    }
    return CVEApiService.instance;
  }

  private log(type: LogEntry["type"], message: string, details?: string) {
    const logEntry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    };
    
    this.logs.push(logEntry);
    this.logCallbacks.forEach(callback => callback(logEntry));
  }

  onLog(callback: (log: LogEntry) => void) {
    this.logCallbacks.push(callback);
    return () => {
      this.logCallbacks = this.logCallbacks.filter(cb => cb !== callback);
    };
  }

  onActiveCountChange(callback: (count: number) => void) {
    this.activeCallbacks.push(callback);
    callback(this.activeFetches.size); // Send current count immediately
    return () => {
      this.activeCallbacks = this.activeCallbacks.filter(cb => cb !== callback);
    };
  }

  private startFetch(id: string) {
    this.activeFetches.add(id);
    this.activeCallbacks.forEach(cb => cb(this.activeFetches.size));
  }

  private endFetch(id: string) {
    this.activeFetches.delete(id);
    this.activeCallbacks.forEach(cb => cb(this.activeFetches.size));
  }

  getActiveFetchCount(): number {
    return this.activeFetches.size;
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  async fetchBackendLogs(): Promise<LogEntry[]> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/logs`);
      const data = await response.json();
      return data.logs || [];
    } catch (error) {
      console.error("Failed to fetch backend logs:", error);
      return [];
    }
  }

  private async makeBackendRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const url = `${BACKEND_URL}${endpoint}`;
    
    this.log("info", `Making request to backend: ${method} ${endpoint}`);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.log("success", `Backend request successful`);
      return data;
    } catch (error) {
      this.log("error", `Backend request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, url);
      throw error;
    }
  }

  async searchVulnerabilities(params: {
    vendorName?: string;
    publishDateStart?: string;
    publishDateEnd?: string;
    pageNumber?: number;
    resultsPerPage?: number;
  }): Promise<CVEApiResponse> {
    const response = await this.makeBackendRequest('/api/cve/search', 'POST', params);
    return response;
  }

  async searchVulnerabilitiesByVendor(
    vendor: string, 
    dateFrom?: string, 
    dateTo?: string,
    pageNumber: number = 1,
    resultsPerPage: number = 50
  ): Promise<CVEData[]> {
    this.log("info", `Searching vulnerabilities for ${vendor}...`);
    
    try {
      const apiResponse = await this.searchVulnerabilities({
        vendorName: vendor,
        publishDateStart: dateFrom,
        publishDateEnd: dateTo,
        pageNumber,
        resultsPerPage
      });

      // Transform API response to our CVEData format
      const cveData: CVEData[] = apiResponse.result?.map((item, index) => ({
        srNo: (pageNumber - 1) * resultsPerPage + index + 1,
        vendor: item.vendor_name || vendor,
        securityAdvisories: item.summary || 'N/A',
        publishedDate: item.published_date || '',
        updatedDate: item.last_update_date || '',
        cve: item.cve_id || '',
        productsAffected: [item.product_name || 'Unknown'],
        severity: this.mapSeverity(item.cvss3_base_score || item.cvss2_base_score),
        urlLink: item.url || `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${item.cve_id}`,
        sanReleaseDate: new Date().toISOString().split('T')[0],
        implementationDate: '',
        patchDeadline: this.calculatePatchDeadline(item.published_date, this.mapSeverity(item.cvss3_base_score || item.cvss2_base_score)),
        implementationTargets: 'Pending' as const,
        cvssScore: item.cvss3_base_score || item.cvss2_base_score,
        epssScore: item.epss_score,
        exploitExists: item.exploit_exists === 1,
        isInCISAKEV: item.is_in_cisa_kev === 1
      })) || [];

      this.log("success", `Processed ${cveData.length} CVE records for ${vendor}`);
      return cveData;
    } catch (error) {
      this.log("error", `Failed to fetch CVE data for ${vendor}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  mapSeverity(cvssScore?: number): "Critical" | "High" | "Medium" | "Low" {
    if (!cvssScore) return "Low";
    if (cvssScore >= 9.0) return "Critical";
    if (cvssScore >= 7.0) return "High";
    if (cvssScore >= 4.0) return "Medium";
    return "Low";
  }

  async fetchAndStoreCVEData(
    vendor: string, 
    dateFrom?: string, 
    dateTo?: string
  ): Promise<CVEData[]> {
    const fetchId = `${vendor}-${Date.now()}`;
    this.startFetch(fetchId);
    this.log("info", `Starting CVE data fetch for vendor: ${vendor}, dates: ${dateFrom} to ${dateTo}`);
    
    try {
      const { DataStorage } = await import("@/utils/dataStorage");
      const dataStorage = DataStorage.getInstance();
      
      // Check if data already exists for the date range
      const today = new Date().toISOString().split('T')[0];
      const targetDate = dateTo || today;
      
      const existingData = await dataStorage.loadData(vendor, targetDate);
      if (existingData && existingData.length > 0) {
        this.log("info", `Found ${existingData.length} existing CVE records for ${vendor} on ${targetDate}`);
        return existingData;
      }

      // Fetch new data from API
      let allData: CVEData[] = [];
      let pageNumber = 1;
      const resultsPerPage = 50;
      let hasMoreData = true;

      while (hasMoreData && pageNumber <= 10) { // Limit to 10 pages to prevent infinite loops
        this.log("info", `Fetching page ${pageNumber} for ${vendor}...`);
        
        try {
          const apiResponse = await this.searchVulnerabilities({
            vendorName: vendor,
            publishDateStart: dateFrom,
            publishDateEnd: dateTo,
            pageNumber,
            resultsPerPage
          });

          if (!apiResponse.result || apiResponse.result.length === 0) {
            hasMoreData = false;
            break;
          }

          // Transform API response to our CVEData format
          const pageData: CVEData[] = apiResponse.result.map((item, index) => ({
            srNo: (pageNumber - 1) * resultsPerPage + index + 1,
            vendor: item.vendor_name || vendor,
            securityAdvisories: item.summary || 'N/A',
            publishedDate: item.published_date || '',
            updatedDate: item.last_update_date || '',
            cve: item.cve_id || '',
            productsAffected: [item.product_name || 'Unknown'],
            severity: this.mapSeverity(item.cvss3_base_score || item.cvss2_base_score),
            urlLink: item.url || `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${item.cve_id}`,
            sanReleaseDate: today,
            implementationDate: '',
            patchDeadline: this.calculatePatchDeadline(item.published_date, this.mapSeverity(item.cvss3_base_score || item.cvss2_base_score)),
            implementationTargets: 'Pending' as const,
            cvssScore: item.cvss3_base_score || item.cvss2_base_score,
            epssScore: item.epss_score,
            exploitExists: item.exploit_exists === 1,
            isInCISAKEV: item.is_in_cisa_kev === 1
          }));

          allData.push(...pageData);
          
          // Check if we've reached the end
          if (apiResponse.result.length < resultsPerPage) {
            hasMoreData = false;
          } else {
            pageNumber++;
            // Add delay between pages to prevent rate limiting
            if (hasMoreData) {
              await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay between pages
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.log("error", `Failed to fetch page ${pageNumber} for ${vendor}: ${errorMessage}`);
          
          // If it's a rate limit error, add extra delay and retry once
          if (errorMessage.includes('500') || errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            this.log("warning", `Rate limit detected on page ${pageNumber} for ${vendor}, adding delay and retrying...`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay for rate limits
            continue; // Retry the same page
          } else {
            // For other errors, stop pagination
            hasMoreData = false;
          }
        }
      }

      // Remove duplicates and save data
      const uniqueData = this.removeDuplicatesByCVE(allData);
      await dataStorage.saveData(vendor, targetDate, uniqueData);
      
      this.log("success", `Successfully fetched and stored ${uniqueData.length} CVE records for ${vendor}`);
      return uniqueData;
      
    } catch (error) {
      this.log("error", `Failed to fetch CVE data for ${vendor}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      this.endFetch(fetchId);
    }
  }

  private removeDuplicatesByCVE(data: CVEData[]): CVEData[] {
    const seen = new Set<string>();
    return data.filter(item => {
      if (!item.cve || seen.has(item.cve)) {
        return false;
      }
      seen.add(item.cve);
      return true;
    });
  }

  private calculatePatchDeadline(publishedDate: string, severity: string): string {
    if (!publishedDate) return '';
    
    const published = new Date(publishedDate);
    const daysToAdd = severity === 'Critical' ? 15 : severity === 'High' ? 30 : severity === 'Medium' ? 60 : 90;
    
    published.setDate(published.getDate() + daysToAdd);
    return published.toISOString().split('T')[0];
  }

  async fetchAllVendorsData(
    vendors: string[], 
    dateFrom?: string, 
    dateTo?: string
  ): Promise<CVEData[]> {
    this.log("info", `Starting bulk CVE data fetch for ${vendors.length} vendors`);
    
    const allData: CVEData[] = [];
    
    for (const vendor of vendors) {
      try {
        const vendorData = await this.fetchAndStoreCVEData(vendor, dateFrom, dateTo);
        allData.push(...vendorData);
        
        // Add delay between API calls to respect rate limits and prevent 500 errors
        await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3 seconds
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.log("error", `Failed to fetch data for vendor ${vendor}: ${errorMessage}`);
        
        // If it's a rate limit error, add extra delay before continuing
        if (errorMessage.includes('500') || errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          this.log("warning", `Rate limit detected for ${vendor}, adding extra delay...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Extra 5 second delay for rate limits
        }
        
        continue; // Continue with next vendor even if one fails
      }
    }
    
    const uniqueData = this.removeDuplicatesByCVE(allData);
    this.log("success", `Completed bulk fetch: ${uniqueData.length} total unique CVE records`);
    return uniqueData;
  }

  async testApiConnection(): Promise<boolean> {
    this.log("info", "Testing backend and API connection...");
    
    try {
      const response = await this.makeBackendRequest('/api/cve/test');
      
      if (response && response.status === 'connected') {
        this.log("success", "Backend and API connection test successful");
        return true;
      } else {
        this.log("warning", `API connection test failed: ${response?.message || 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      this.log("error", `Backend connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }



  async googleSearchVendorAdvisory(cve: string, vendor: string): Promise<string> {
    this.log("info", `Searching for vendor advisory: ${cve} site:${vendor.toLowerCase()}.com`);
    
    try {
      const response = await this.makeBackendRequest('/api/cve/vendor-advisory', 'GET', { 
        cve, 
        vendor 
      });
      
      if (response && response.advisory_url) {
        this.log("success", `Found vendor advisory URL: ${response.advisory_url}`);
        return response.advisory_url;
      } else {
        this.log("warning", `No vendor advisory found for ${cve}`);
        return '';
      }
    } catch (error) {
      this.log("error", `Failed to find vendor advisory for ${cve}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return '';
    }
  }
}