export interface CVEData {
  srNo: number;
  vendor: string;
  securityAdvisories: string;
  publishedDate: string;
  updatedDate?: string;
  cve: string;
  productsAffected: string[];
  severity: "Critical" | "High" | "Medium" | "Low";
  urlLink: string;
  sanReleaseDate: string;
  implementationDate: string;
  patchDeadline: string;
  implementationTargets: "Pass" | "Fail" | "Pending";
  cvssScore?: number;
  epssScore?: number;
  exploitExists?: boolean;
  isInCISAKEV?: boolean;
}

export interface FilterState {
  vendors: string[];
  dateFrom: string;
  dateTo: string;
  severity: string[];
  searchTerm: string;
}

export interface CVEApiResponse {
  result: Array<{
    cve_id: string;
    published_date: string;
    last_update_date: string;
    summary: string;
    cvss3_base_score?: number;
    cvss2_base_score?: number;
    epss_score?: number;
    epss_percentile?: number;
    exploit_exists: number;
    is_in_cisa_kev: number;
    vendor_name: string;
    product_name: string;
    version_value: string;
    url: string;
  }>;
  totalResults: number;
  currentPage: number;
  resultsPerPage: number;
  _raw_data?: any; // Store original API response for hasMore flag access
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  details?: string;
}

export const VENDORS = [
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
] as const;