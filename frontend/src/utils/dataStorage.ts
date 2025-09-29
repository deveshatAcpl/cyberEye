import { CVEData } from "@/types/cve";

const BACKEND_URL = "http://localhost:8000";

export class DataStorage {
  private static instance: DataStorage;
  private cache: Map<string, CVEData[]> = new Map();

  static getInstance(): DataStorage {
    if (!DataStorage.instance) {
      DataStorage.instance = new DataStorage();
    }
    return DataStorage.instance;
  }

  private async makeRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    if (method === 'GET' && body) {
      const params = new URLSearchParams(body);
      endpoint += `?${params}`;
    }

    const response = await fetch(`${BACKEND_URL}${endpoint}`, config);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async saveData(vendor: string, date: string, data: CVEData[]): Promise<void> {
    try {
      const response = await this.makeRequest('/api/data/save', 'POST', {
        vendor,
        date,
        data
      });
      
      if (response.success) {
        const cacheKey = `${vendor}-${date}`;
        this.cache.set(cacheKey, [...data]);
        console.log(`Successfully saved ${data.length} CVE records for ${vendor} on ${date}`);
      } else {
        throw new Error(response.message || 'Failed to save data');
      }
    } catch (error) {
      console.error(`Failed to save data for ${vendor} on ${date}:`, error);
      throw error;
    }
  }

  async loadData(vendor: string, date: string): Promise<CVEData[] | null> {
    try {
      const cacheKey = `${vendor}-${date}`;
      
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }
      
      const response = await this.makeRequest('/api/data/load', 'GET', {
        vendor,
        date
      });
      
      if (response.success && response.data) {
        const data = response.data.data || [];
        this.cache.set(cacheKey, data);
        return data;
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to load data for ${vendor} on ${date}:`, error);
      return null;
    }
  }

  async getStoredVendors(): Promise<string[]> {
    try {
      const response = await this.makeRequest('/api/data/vendors');
      return response.vendors || [];
    } catch (error) {
      return [];
    }
  }

  async getStoredDatesForVendor(vendor: string): Promise<string[]> {
    try {
      const response = await this.makeRequest('/api/data/dates', 'GET', { vendor });
      return response.dates || [];
    } catch (error) {
      return [];
    }
  }

  async getStoredDates(): Promise<string[]> {
    try {
      const response = await this.makeRequest('/api/data/all-dates');
      return response.dates || [];
    } catch (error) {
      return [];
    }
  }

  async checkDataExists(vendor: string, date: string): Promise<boolean> {
    try {
      const cacheKey = `${vendor}-${date}`;
      if (this.cache.has(cacheKey)) {
        return true;
      }
      
      const response = await this.makeRequest('/api/data/exists', 'GET', {
        vendor,
        date
      });
      
      return response.exists || false;
    } catch (error) {
      return false;
    }
  }

  async clearAllData(): Promise<void> {
    try {
      const response = await this.makeRequest('/api/data/clear-all', 'DELETE');
      if (response.success) {
        this.cache.clear();
      }
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  async getAllStoredData(): Promise<CVEData[]> {
    try {
      const response = await this.makeRequest('/api/data/all');
      return response.data || [];
    } catch (error) {
      console.error('Failed to get all stored data:', error);
      return [];
    }
  }

  async getDataForDateRange(vendor: string, startDate: string, endDate: string): Promise<CVEData[]> {
    try {
      const cacheKey = `${vendor}-range-${startDate}-${endDate}`;
      
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }
      
      const response = await this.makeRequest('/api/data/date-range', 'GET', {
        vendor,
        start_date: startDate,
        end_date: endDate
      });
      
      const data = response.data || [];
      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Failed to get date range data for ${vendor}:`, error);
      return [];
    }
  }

  async getAllDataForDateRange(startDate: string, endDate: string): Promise<CVEData[]> {
    try {
      const cacheKey = `all-vendors-range-${startDate}-${endDate}`;
      
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }
      
      const response = await this.makeRequest('/api/data/all-date-range', 'GET', {
        start_date: startDate,
        end_date: endDate
      });
      
      const data = response.data || [];
      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Failed to get all data for date range:`, error);
      return [];
    }
  }

  async getFileSystemStats(): Promise<{ totalFiles: number; totalDirectories: number; totalSize: number }> {
    try {
      const response = await this.makeRequest('/api/data/storage-info');
      return {
        totalFiles: response.total_files || 0,
        totalDirectories: response.total_directories || 0,
        totalSize: response.total_size || 0
      };
    } catch (error) {
      console.error('Failed to get file system stats:', error);
      return { totalFiles: 0, totalDirectories: 0, totalSize: 0 };
    }
  }
}

const dataStorage = DataStorage.getInstance();
export { dataStorage };
export default dataStorage;
