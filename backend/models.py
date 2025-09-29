from pydantic import BaseModel
from typing import List, Optional, Union
from datetime import datetime
from enum import Enum

class SeverityEnum(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

class ImplementationTargets(str, Enum):
    PASS = "Pass"
    FAIL = "Fail"
    PENDING = "Pending"

class CVEData(BaseModel):
    srNo: int
    vendor: str
    securityAdvisories: str
    publishedDate: str
    updatedDate: Optional[str] = None  # NEW: Track CVE updates
    cve: str
    productsAffected: List[str]
    severity: SeverityEnum
    urlLink: str
    sanReleaseDate: str
    implementationDate: str
    patchDeadline: str
    implementationTargets: ImplementationTargets
    cvssScore: Optional[float] = None
    epssScore: Optional[float] = None
    exploitExists: Optional[bool] = False
    isInCISAKEV: Optional[bool] = False

class FilterState(BaseModel):
    vendors: List[str] = []
    dateFrom: Optional[str] = None
    dateTo: Optional[str] = None
    severity: List[str] = []
    searchTerm: Optional[str] = ""

class CVESearchRequest(BaseModel):
    vendorName: Optional[str] = None
    publishDateStart: Optional[str] = None
    publishDateEnd: Optional[str] = None
    pageNumber: Optional[int] = 1
    resultsPerPage: Optional[int] = 50

class CVEApiResponseItem(BaseModel):
    cve_id: str
    published_date: str
    last_update_date: Optional[str] = None
    summary: str
    cvss3_base_score: Optional[float] = None
    cvss2_base_score: Optional[float] = None
    epss_score: Optional[float] = None
    epss_percentile: Optional[float] = None
    exploit_exists: int = 0
    is_in_cisa_kev: int = 0
    vendor_name: str
    product_name: str
    version_value: Optional[str] = None
    url: Optional[str] = None

class CVEApiResponse(BaseModel):
    result: List[dict]  # Raw API data, will be transformed later
    totalResults: int
    currentPage: int
    resultsPerPage: int
    _raw_data: Optional[dict] = None  # Store original API response for hasMore flag access

class LogEntry(BaseModel):
    id: str
    timestamp: str
    type: str  # "info", "success", "warning", "error"
    message: str
    details: Optional[str] = None

class DataStorageInfo(BaseModel):
    totalFiles: int
    totalDirectories: int
    totalSize: int
    vendors: List[str]
    files: List[dict]

class JSONFileMetadata(BaseModel):
    vendor: str
    date: str
    filePath: str
    totalRecords: int
    savedAt: str
    version: str = "1.0"

class JSONFileContent(BaseModel):
    metadata: JSONFileMetadata
    data: List[CVEData]

class ApiStatus(BaseModel):
    status: str  # "connected", "error", "cors-error"
    message: str
    lastTested: str

class VendorProgress(BaseModel):
    vendor: str
    status: str  # "pending", "processing", "completed", "error", "rate_limited"
    progress: int = 0  # percentage 0-100
    totalCVEs: int = 0
    processedCVEs: int = 0
    improvedCVEs: int = 0
    errors: List[str] = []
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    estimatedTimeRemaining: Optional[str] = None

class TokenStatus(BaseModel):
    tokenIndex: int
    isActive: bool
    lastUsed: Optional[str] = None
    rateLimitReset: Optional[str] = None
    requestsRemaining: Optional[int] = None
    status: str = "ready"  # "ready", "rate_limited", "error"

class AutomationProgress(BaseModel):
    isRunning: bool = False
    currentVendor: Optional[str] = None
    overallProgress: int = 0
    vendorProgress: List[VendorProgress] = []
    activeTokenIndex: int = 0
    tokenStatuses: List[TokenStatus] = []
    startTime: Optional[str] = None
    estimatedCompletion: Optional[str] = None
    totalVendors: int = 0
    completedVendors: int = 0
    errorVendors: int = 0
    totalCVEsProcessed: int = 0
    totalCVEsImproved: int = 0
    errors: List[str] = []
    lastUpdate: str
    
class AutomationConfig(BaseModel):
    vendors: List[str]
    batchSize: int = 10
    cooldownMinutes: int = 1
    maxRetries: int = 3
    skipExisting: bool = True
    
VENDORS = [
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
]

# Legacy vendor mappings for backward compatibility
VENDOR_MAPPINGS = {
    "Apache httpd": "Apache", 
    "F5 Quarterly advisories": "F5",
    "Google cloud": "Google",
    "PHPmyadmin": "PHPmyadmin",
    "Ruby Rails": "RubyonRails",
    "Tomcat": "Tomcat",
    "VMware": "VMWare"  # Fix the typo - map from VMware to VMWare
}

# Product-specific mappings for vendors with multiple products
VENDOR_PRODUCT_MAPPINGS = {
    "AdAudit Plus": [
        {"vendorName": "Manageengine", "productName": "AdAudit Plus"}
    ],
    "Google cloud": [
        {"vendorName": "Google", "productName": "Google Cloud Platform Service Broker"},
        {"vendorName": "Google", "productName": "Google Cloud Platform Marketplace"}
    ],
    "Google Cloud Platform Service Broker": [
        {"vendorName": "Google", "productName": "Google Cloud Platform Service Broker"}
    ],
    "Google Cloud Platform Marketplace": [
        {"vendorName": "Google", "productName": "Google Cloud Platform Marketplace"}
    ]
}