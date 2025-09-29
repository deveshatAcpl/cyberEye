import os
import json
import httpx
import asyncio
import re
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from models import (
    CVEData, CVEApiResponse, LogEntry, SeverityEnum, ImplementationTargets, 
    AutomationProgress, VendorProgress, TokenStatus, AutomationConfig, VENDORS
)
import logging

logger = logging.getLogger(__name__)

class CVEApiService:
    def __init__(self, api_token: str, base_url: str):
        # Initialize basic properties first
        self.base_url = base_url
        self.logs: List[LogEntry] = []
        self.current_token_index = 0
        self.token_retry_counts = {}
        self.token_cooldown = {}  # Track cooldown periods for rate-limited tokens
        
        # Load all available API tokens (after logs is initialized)
        self.api_tokens = self._load_api_tokens(api_token)
        
        # Initialize retry counts for all tokens
        for token in self.api_tokens:
            self.token_retry_counts[token] = 0
            self.token_cooldown[token] = None
    
    def _load_api_tokens(self, primary_token: str) -> List[str]:
        """Load all available API tokens from environment variables"""
        tokens = []
        
        # Add primary token if provided
        if primary_token and primary_token.strip():
            tokens.append(primary_token.strip())
        
        # Load additional tokens (CVE_API_TOKEN_1, CVE_API_TOKEN_2, etc.)
        token_index = 1
        while True:
            token_key = f"CVE_API_TOKEN_{token_index}"
            token_value = os.getenv(token_key)
            
            if token_value and token_value.strip():
                tokens.append(token_value.strip())
                token_index += 1
            else:
                break
        
        if not tokens:
            raise ValueError("No valid API tokens found. Please set CVE_API_TOKEN or CVE_API_TOKEN_1, etc.")
        
        self.log("info", f"Loaded {len(tokens)} API token(s) for rotation")
        return tokens
    
    def _get_available_token(self) -> Optional[str]:
        """Get the next available API token, considering cooldowns and retry limits"""
        current_time = datetime.now()
        
        # First, check if any tokens are out of cooldown
        for i, token in enumerate(self.api_tokens):
            cooldown_end = self.token_cooldown.get(token)
            
            # If token is in cooldown, check if cooldown has expired
            if cooldown_end and current_time < cooldown_end:
                continue
            
            # If token was in cooldown but now available, reset its retry count
            if cooldown_end and current_time >= cooldown_end:
                self.token_retry_counts[token] = 0
                self.token_cooldown[token] = None
            
            # Check if token hasn't exceeded retry limit
            if self.token_retry_counts[token] < 3:
                self.current_token_index = i
                return token
        
        # If no tokens available, return None
        return None
    
    def _mark_token_rate_limited(self, token: str, cooldown_minutes: int = 5):
        """Mark a token as rate limited and set cooldown period"""
        self.token_retry_counts[token] += 1
        cooldown_end = datetime.now() + timedelta(minutes=cooldown_minutes)
        self.token_cooldown[token] = cooldown_end
        
        self.log("warning", f"API token marked as rate limited. Cooldown until {cooldown_end.strftime('%H:%M:%S')}")
    
    def _reset_token_status(self, token: str):
        """Reset token status after successful request"""
        self.token_retry_counts[token] = 0
        self.token_cooldown[token] = None
        
    def log(self, log_type: str, message: str, details: Optional[str] = None):
        """Add a log entry"""
        log_entry = LogEntry(
            id=f"log_{datetime.now().timestamp()}",
            timestamp=datetime.now().isoformat(),
            type=log_type,
            message=message,
            details=details
        )
        self.logs.append(log_entry)
        logger.info(f"{log_type.upper()}: {message}")
        
    def get_logs(self) -> List[LogEntry]:
        """Get all log entries"""
        return self.logs
        
    async def test_connection(self) -> bool:
        """Test API connection using available tokens"""
        self.log("info", f"Testing CVE Details API connection with {len(self.api_tokens)} token(s)...")
        
        current_token = self._get_available_token()
        if not current_token:
            self.log("error", "No API tokens available for testing")
            return False
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/vulnerability/search",
                    params={"vendorName": "Microsoft", "resultsPerPage": 1},
                    headers={"Authorization": f"Bearer {current_token}"}
                )
                
                if response.status_code == 200:
                    self.log("success", f"API connection test successful using token #{self.current_token_index + 1}")
                    return True
                else:
                    self.log("error", f"API connection failed: HTTP {response.status_code}")
                    return False
                    
        except Exception as e:
            self.log("error", f"API connection test failed: {str(e)}")
            return False
    
    def get_token_status(self) -> Dict[str, Any]:
        """Get status of all API tokens"""
        status = {
            "total_tokens": len(self.api_tokens),
            "tokens": []
        }
        
        current_time = datetime.now()
        
        for i, token in enumerate(self.api_tokens):
            token_info = {
                "index": i + 1,
                "token_preview": f"{token[:20]}..." if len(token) > 20 else token,
                "retry_count": self.token_retry_counts.get(token, 0),
                "is_available": True,
                "cooldown_until": None
            }
            
            cooldown_end = self.token_cooldown.get(token)
            if cooldown_end and current_time < cooldown_end:
                token_info["is_available"] = False
                token_info["cooldown_until"] = cooldown_end.isoformat()
            
            status["tokens"].append(token_info)
        
        status["available_tokens"] = sum(1 for t in status["tokens"] if t["is_available"])
        return status
            
    def _normalize_vendor_name(self, vendor_name: str) -> str:
        """Normalize vendor name for CVE Details API - apply mappings and replace spaces with underscores"""
        if not vendor_name:
            return vendor_name
            
        # Import here to avoid circular imports
        from models import VENDOR_MAPPINGS
        
        # Apply vendor mappings first (e.g., "AdAudit Plus" -> "ManageEngine")
        if vendor_name in VENDOR_MAPPINGS:
            vendor_name = VENDOR_MAPPINGS[vendor_name]
            
        # Then normalize spaces to underscores
        return vendor_name.replace(" ", "_")

    async def search_vulnerabilities_paginated(self, params: Dict[str, Any], max_pages: int = 10) -> List[Dict[str, Any]]:
        """Search for vulnerabilities with full pagination using hasMore flag"""
        all_results = []
        current_page = params.get("pageNumber", 1)
        
        while current_page <= max_pages:
            # Update page number for this iteration
            page_params = params.copy()
            page_params["pageNumber"] = current_page
            
            response = await self.search_vulnerabilities_single_page(page_params)
            
            if response and response.result:
                all_results.extend(response.result)
                self.log("info", f"Page {current_page}: Retrieved {len(response.result)} CVEs")
                
                # Check if there are more pages using hasMore flag
                response_data = getattr(response, '_raw_data', None)
                if response_data and not response_data.get("hasMore", False):
                    self.log("info", f"No more pages available (hasMore: false)")
                    break
                    
                current_page += 1
                
                # Add delay between page requests
                await asyncio.sleep(1.5)
            else:
                self.log("warning", f"No data returned for page {current_page}")
                break
        
        return all_results

    async def search_vulnerabilities_single_page(self, params: Dict[str, Any]) -> CVEApiResponse:
        """Search for vulnerabilities for a single page using CVE Details API with token rotation"""
        url = f"{self.base_url}/vulnerability/search"
        
        # Clean parameters
        clean_params = {k: v for k, v in params.items() if v is not None and v != ""}
        clean_params["outputFormat"] = "json"
        
        # Normalize vendor name if present (replace spaces with underscores)
        if "vendorName" in clean_params and clean_params["vendorName"]:
            original_vendor = clean_params["vendorName"]
            normalized_vendor = self._normalize_vendor_name(original_vendor)
            if original_vendor != normalized_vendor:
                self.log("info", f"Normalized vendor name: '{original_vendor}' → '{normalized_vendor}'")
            clean_params["vendorName"] = normalized_vendor
        
        self.log("info", f"Searching CVE data for vendor: {clean_params.get('vendorName', 'All')} (Page {clean_params.get('pageNumber', 1)})")
        self.log("debug", f"API URL: {url}")
        self.log("debug", f"API Parameters: {clean_params}")
        
        # Try up to 3 times with different tokens or backoff
        for attempt in range(3):
            current_token = self._get_available_token()
            
            if not current_token:
                # No tokens available, wait and try again
                if attempt < 2:
                    wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s
                    self.log("warning", f"No API tokens available. Waiting {wait_time}s before retry...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise Exception("All API tokens are rate limited. Please wait before retrying.")
            
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.get(
                        url,
                        params=clean_params,
                        headers={
                            "Authorization": f"Bearer {current_token}",
                            "Accept": "application/json"
                        }
                    )
                    
                    if response.status_code == 200:
                        # Success! Reset token status and return data
                        self._reset_token_status(current_token)
                        
                        data = response.json()
                        
                        # Transform to our response format and store raw data for hasMore check
                        api_response = CVEApiResponse(
                            result=data.get("results", []),
                            totalResults=len(data.get("results", [])),  # API doesn't return total, use current count
                            currentPage=params.get("pageNumber", 1),
                            resultsPerPage=params.get("resultsPerPage", 50)
                        )
                        
                        # Store raw data for hasMore flag access
                        api_response._raw_data = data
                        
                        self.log("success", f"Successfully fetched {len(api_response.result)} CVE records using token #{self.current_token_index + 1}")
                        return api_response
                    
                    elif response.status_code == 429:
                        # Rate limit hit - mark token and try next one
                        self.log("warning", f"Rate limit hit on token #{self.current_token_index + 1}. Trying next token...")
                        self._mark_token_rate_limited(current_token)
                        continue
                    
                    else:
                        # Other error
                        error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                        self.log("error", f"API request failed: {error_msg}")
                        if attempt == 2:  # Last attempt
                            raise Exception(error_msg)
                        continue
                        
            except httpx.TimeoutException:
                self.log("warning", f"Request timeout on token #{self.current_token_index + 1}")
                if attempt < 2:
                    await asyncio.sleep(1)
                    continue
                else:
                    raise Exception("Request timeout after all retries")
            
            except Exception as e:
                if "429" in str(e) or "Too Many Requests" in str(e):
                    self._mark_token_rate_limited(current_token)
                    self.log("warning", f"Rate limit detected on token #{self.current_token_index + 1}")
                    continue
                else:
                    self.log("error", f"CVE API request failed: {str(e)}")
                    if attempt == 2:  # Last attempt
                        raise e
                    continue
        
        # If we get here, all attempts failed
        raise Exception("All retry attempts failed")

    async def search_vulnerabilities(self, params: Dict[str, Any]) -> CVEApiResponse:
        """Legacy method for backward compatibility - single page search"""
        return await self.search_vulnerabilities_single_page(params)

    async def search_vulnerabilities_dual_dates(self, vendor: str, date_from: str, date_to: str, max_pages: int = 10) -> List[Dict[str, Any]]:
        """
        Comprehensive dual-date search for both published and updated CVEs
        Uses the pattern you specified:
        - publishDateStart/publishDateEnd for CVEs published in date range
        - updateDateStart/updateDateEnd for CVEs updated in date range
        """
        all_results = []
        
        self.log("info", f"Starting dual-date search for {vendor}: {date_from} to {date_to}")
        
        # FIRST API CALL: Get CVEs published in the date range
        self.log("info", f"🔍 First call: CVEs published for {vendor} from {date_from} to {date_to}")
        published_params = {
            "vendorName": vendor,
            "publishDateStart": date_from,
            "publishDateEnd": date_to,
            "resultsPerPage": 50,
            "pageNumber": 1
        }
        
        try:
            published_results = await self.search_vulnerabilities_paginated(published_params, max_pages)
            if published_results:
                all_results.extend(published_results)
                self.log("success", f"✅ Published dates search: Found {len(published_results)} CVEs")
            else:
                self.log("info", f"📝 Published dates search: No CVEs found")
        except Exception as e:
            self.log("error", f"❌ Published dates search failed: {str(e)}")
        
        # Add delay between API call sets
        await asyncio.sleep(2)
        
        # SECOND API CALL: Get CVEs updated in the date range
        self.log("info", f"🔍 Second call: CVEs updated for {vendor} from {date_from} to {date_to}")
        updated_params = {
            "vendorName": vendor,
            "updateDateStart": date_from,
            "updateDateEnd": date_to,
            "resultsPerPage": 50,
            "pageNumber": 1
        }
        
        try:
            updated_results = await self.search_vulnerabilities_paginated(updated_params, max_pages)
            if updated_results:
                # Filter out duplicates by CVE ID
                existing_cve_ids = {result.get("cveId", "") for result in all_results}
                new_results = [result for result in updated_results if result.get("cveId", "") not in existing_cve_ids]
                
                all_results.extend(new_results)
                self.log("success", f"✅ Updated dates search: Found {len(updated_results)} total CVEs, {len(new_results)} new unique CVEs")
            else:
                self.log("info", f"📝 Updated dates search: No CVEs found")
        except Exception as e:
            self.log("error", f"❌ Updated dates search failed: {str(e)}")
        
        # Remove any remaining duplicates (extra safety)
        unique_results = []
        seen_cve_ids = set()
        for result in all_results:
            cve_id = result.get("cveId", "")
            if cve_id and cve_id not in seen_cve_ids:
                unique_results.append(result)
                seen_cve_ids.add(cve_id)
        
        self.log("success", f"🎯 Dual-date search complete for {vendor}: {len(unique_results)} total unique CVEs")
        return unique_results

    async def search_vulnerabilities_with_products(self, vendor: str, date_from: str, date_to: str, max_pages: int = 10) -> List[Dict[str, Any]]:
        """
        Enhanced search that handles product-specific mappings for vendors like Google Cloud
        """
        # Import here to avoid circular imports
        from models import VENDOR_PRODUCT_MAPPINGS
        
        # Check if vendor has product-specific mappings
        if vendor in VENDOR_PRODUCT_MAPPINGS:
            self.log("info", f"🔍 Using product-specific search for {vendor}")
            
            all_results = []
            product_mappings = VENDOR_PRODUCT_MAPPINGS[vendor]
            
            for product_mapping in product_mappings:
                vendor_name = product_mapping["vendorName"]
                product_name = product_mapping["productName"]
                
                self.log("info", f"📦 Searching {vendor_name} - {product_name}")
                
                # FIRST: Published date search with product
                published_params = {
                    "vendorName": vendor_name,
                    "productName": product_name,
                    "publishDateStart": date_from,
                    "publishDateEnd": date_to,
                    "resultsPerPage": 50,
                    "pageNumber": 1
                }
                
                try:
                    published_results = await self.search_vulnerabilities_paginated(published_params, max_pages)
                    if published_results:
                        all_results.extend(published_results)
                        self.log("success", f"✅ Found {len(published_results)} published CVEs for {product_name}")
                except Exception as e:
                    self.log("error", f"❌ Published search failed for {product_name}: {str(e)}")
                
                # Add delay between product searches
                await asyncio.sleep(2)
                
                # SECOND: Updated date search with product
                updated_params = {
                    "vendorName": vendor_name,
                    "productName": product_name,
                    "updateDateStart": date_from,
                    "updateDateEnd": date_to,
                    "resultsPerPage": 50,
                    "pageNumber": 1
                }
                
                try:
                    updated_results = await self.search_vulnerabilities_paginated(updated_params, max_pages)
                    if updated_results:
                        # Filter duplicates from this product search
                        existing_cve_ids = {result.get("cveId", "") for result in all_results}
                        new_results = [result for result in updated_results if result.get("cveId", "") not in existing_cve_ids]
                        all_results.extend(new_results)
                        self.log("success", f"✅ Found {len(updated_results)} updated CVEs for {product_name}, {len(new_results)} new")
                except Exception as e:
                    self.log("error", f"❌ Updated search failed for {product_name}: {str(e)}")
                
                # Add delay between searches
                await asyncio.sleep(2)
            
            # Final deduplication across all products
            unique_results = []
            seen_cve_ids = set()
            for result in all_results:
                cve_id = result.get("cveId", "")
                if cve_id and cve_id not in seen_cve_ids:
                    unique_results.append(result)
                    seen_cve_ids.add(cve_id)
            
            self.log("success", f"🎯 Product-specific search complete for {vendor}: {len(unique_results)} total unique CVEs across {len(product_mappings)} products")
            return unique_results
        
        else:
            # Fall back to regular dual-date search for vendors without product mappings
            return await self.search_vulnerabilities_dual_dates(vendor, date_from, date_to, max_pages)
            
    def map_severity(self, cvss_score) -> SeverityEnum:
        """Map CVSS score to severity level"""
        if not cvss_score:
            return SeverityEnum.LOW
        
        # Convert to float if it's a string
        try:
            score = float(cvss_score)
        except (ValueError, TypeError):
            return SeverityEnum.LOW
            
        if score >= 9.0:
            return SeverityEnum.CRITICAL
        elif score >= 7.0:
            return SeverityEnum.HIGH
        elif score >= 4.0:
            return SeverityEnum.MEDIUM
        else:
            return SeverityEnum.LOW
            
    def calculate_patch_deadline(self, published_date: str, severity: SeverityEnum) -> str:
        """Calculate patch deadline based on severity matching Excel format"""
        try:
            # Return empty if no publish date
            if not published_date or not published_date.strip():
                return ""
                
            # Handle both formats: "2025-09-18 21:28:26" and "2025-09-18"
            date_part = published_date.split(' ')[0] if ' ' in published_date else published_date
            pub_date = datetime.strptime(date_part, '%Y-%m-%d')
            
            # Set deadline based on severity (matching your Excel data pattern)
            if severity == SeverityEnum.CRITICAL:
                deadline = pub_date + timedelta(days=15)
            elif severity == SeverityEnum.HIGH:
                deadline = pub_date + timedelta(days=30)  # 11-Oct-25 for 11-Sep-25
            elif severity == SeverityEnum.MEDIUM:
                deadline = pub_date + timedelta(days=60)  # 10-Nov-25 for 11-Sep-25
            else:
                deadline = pub_date + timedelta(days=90)
                
            return deadline.strftime('%d-%b-%y')  # Format like "11-Oct-25"
        except:
            return ""
            
    async def transform_api_response_to_cve_data(self, data: List[Dict[str, Any]], vendor: str = None, fetch_references: bool = False) -> List[CVEData]:
        """Transform API response items to CVEData format matching Excel structure"""
        cve_data = []
        today = datetime.now().strftime('%d-%b-%y')  # Format like "11-Sep-25"
        
        for i, item in enumerate(data):
            # Use the correct field names from the actual API response
            cvss_score = item.get("maxCvssBaseScore")
            severity = self.map_severity(cvss_score)
            
            # Extract publish date and format it to match Excel format
            publish_date = item.get("publishDate", "")
            formatted_publish_date = ""
            if publish_date and publish_date.strip():
                try:
                    # Convert from "2025-03-05 20:40:07" to "05-Mar-25"
                    date_part = publish_date.split(' ')[0] if ' ' in publish_date else publish_date
                    dt = datetime.strptime(date_part, '%Y-%m-%d')
                    formatted_publish_date = dt.strftime('%d-%b-%y')
                except Exception as e:
                    # If date parsing fails, keep original or use empty
                    formatted_publish_date = ""
                    self.log("warning", f"Failed to parse publish date '{publish_date}': {e}")
            
            # Extract updated date and format it to match Excel format  
            updated_date = item.get("updateDate", "")
            formatted_updated_date = ""
            if updated_date and updated_date.strip():
                try:
                    # Convert from "2025-09-22 18:49:36" to "22-Sep-25"
                    date_part = updated_date.split(' ')[0] if ' ' in updated_date else updated_date
                    dt = datetime.strptime(date_part, '%Y-%m-%d')
                    formatted_updated_date = dt.strftime('%d-%b-%y')
                except Exception as e:
                    # If date parsing fails, use publish date as fallback
                    formatted_updated_date = formatted_publish_date
                    self.log("warning", f"Failed to parse update date '{updated_date}': {e}")
            
            # Extract product information from summary or title
            products_affected = []
            title = item.get("title", "")
            summary = item.get("summary", "")
            
            # Try to extract product names from title or summary
            if title and title.strip():
                # Use the title as the product description
                products_affected = [title.strip()]
            elif summary and summary.strip():
                # Extract product name from first sentence of summary
                first_sentence = summary.split('.')[0].strip()
                if first_sentence:
                    products_affected = [first_sentence]
                else:
                    products_affected = [summary[:100] + "..." if len(summary) > 100 else summary]
            else:
                # Fallback to vendor-specific product
                actual_vendor = item.get("vendor", vendor or "Unknown").strip()
                products_affected = [f"{actual_vendor} Products"]
            
            # Determine the actual vendor name
            actual_vendor = item.get("vendor", "").strip()
            if not actual_vendor and vendor and vendor.strip():
                actual_vendor = vendor.strip()
            elif not actual_vendor:
                actual_vendor = "Unknown"
            
            # Try to get the best vendor-specific URL from CVE references (with timeout)
            cve_id = item.get('cveId', '')
            url_link = f"https://www.cve.org/CVERecord?id={cve_id}"  # Default fallback
            
            if fetch_references:
                try:
                    # Use enhanced URL fetching with detailed CVE information and timeout
                    url_link = await asyncio.wait_for(
                        self.get_best_vendor_url_enhanced(cve_id, actual_vendor),
                        timeout=5.0  # 5 second timeout per CVE for enhanced fetching
                    )
                except asyncio.TimeoutError:
                    self.log("warning", f"Timeout getting enhanced vendor URL for {cve_id}, trying basic method")
                    try:
                        url_link = await asyncio.wait_for(
                            self.get_best_vendor_url(cve_id, actual_vendor),
                            timeout=3.0
                        )
                    except:
                        self.log("warning", f"Basic method also failed for {cve_id}, using fallback")
                except Exception as e:
                    self.log("warning", f"Enhanced URL fetching failed for {cve_id}: {str(e)}, trying basic method")
                    try:
                        url_link = await self.get_best_vendor_url(cve_id, actual_vendor)
                    except:
                        self.log("warning", f"Basic method also failed for {cve_id}, using fallback")
            
            # If no reference fetching or it failed, use generic vendor URLs
            if not fetch_references or url_link == f"https://www.cve.org/CVERecord?id={cve_id}":
                vendor_urls = {
                    "Adobe": "https://helpx.adobe.com/security/products/acrobat.html",
                    "Microsoft": "https://msrc.microsoft.com/security-guidance/",
                    "Oracle": "https://www.oracle.com/security-alerts/",
                    "Cisco": "https://sec.cloudapps.cisco.com/security/center/",
                    "Google": "https://chromereleases.googleblog.com/",
                    "Apple": "https://support.apple.com/security-releases/"
                }
                generic_url = vendor_urls.get(actual_vendor, f"https://www.cve.org/CVERecord?id={cve_id}")
                if not fetch_references:
                    url_link = generic_url
            
            # Convert string values to proper types
            try:
                cvss_float = float(cvss_score) if cvss_score else 0.0
            except (ValueError, TypeError):
                cvss_float = 0.0
                
            try:
                epss_float = float(item.get("epssScore", 0)) if item.get("epssScore") else 0.0
            except (ValueError, TypeError):
                epss_float = 0.0
                
            # Convert string boolean values (API returns "0"/"1" as strings)
            exploit_exists = str(item.get("exploitExists", "0")) == "1"
            is_in_cisa_kev = str(item.get("isInCISAKEV", "0")) == "1"
                
            cve_record = CVEData(
                srNo=i + 1,
                vendor=actual_vendor,
                securityAdvisories=f"{actual_vendor} Security Advisories",
                publishedDate=formatted_publish_date,
                updatedDate=formatted_updated_date,
                cve=item.get("cveId", ""),
                productsAffected=products_affected,
                severity=severity,
                urlLink=url_link,
                sanReleaseDate=today,
                implementationDate="",
                patchDeadline=self.calculate_patch_deadline(publish_date, severity),
                implementationTargets=ImplementationTargets.PENDING,
                cvssScore=cvss_float,
                epssScore=epss_float,
                exploitExists=exploit_exists,
                isInCISAKEV=is_in_cisa_kev
            )
            cve_data.append(cve_record)
            
        return cve_data
    
    async def fetch_paginated_data(self, base_params: Dict[str, Any], max_pages: int = 10) -> List[Dict[str, Any]]:
        """Fetch all pages of data for given search parameters"""
        all_results = []
        page = 1
        
        while page <= max_pages:  # Limit to max_pages to prevent infinite loops
            params = {**base_params, "pageNumber": page}
            
            api_response = await self.search_vulnerabilities(params)
            
            if not api_response.result:
                break
                
            all_results.extend(api_response.result)
            
            # Check if we've reached the end
            if len(api_response.result) < params.get("resultsPerPage", 50):
                break
                
            page += 1
            
            # Add delay between pages to respect rate limits
            await asyncio.sleep(1)  # 1 second delay between pages
        
        return all_results
    
    async def transform_single_cve_to_cve_data(self, cve_dict: Dict[str, Any], vendor: str) -> CVEData:
        """Transform a single CVE dictionary to CVEData object"""
        cve_list = await self.transform_api_response_to_cve_data([cve_dict], vendor)
        return cve_list[0] if cve_list else None
    
    async def fetch_cve_references(self, cve_id: str) -> List[str]:
        """
        Fetch reference URLs from multiple sources for a specific CVE ID
        Returns list of reference URLs, prioritizing vendor-specific advisory URLs
        """
        # Try NVD API first (most reliable)
        try:
            nvd_url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?cveId={cve_id}"
            
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(nvd_url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                })
                
                if response.status_code == 200:
                    data = response.json()
                    reference_urls = []
                    
                    if 'vulnerabilities' in data and len(data['vulnerabilities']) > 0:
                        vuln = data['vulnerabilities'][0]
                        if 'cve' in vuln and 'references' in vuln['cve']:
                            for ref in vuln['cve']['references']:
                                if 'url' in ref:
                                    reference_urls.append(ref['url'])
                    
                    # Score and filter URLs  
                    scored_urls = []
                    
                    for url in reference_urls:
                        if len(url) < 20 or len(url) > 400:
                            continue
                            
                        score = 0
                        url_lower = url.lower()
                        
                        # Skip unwanted domains/paths
                        skip_patterns = [
                            'cve.org', 'nvd.nist.gov', 'mitre.org', 'twitter.com', 'github.com',
                            'facebook.com', 'linkedin.com', 'youtube.com', 'google.com', 'wikipedia.org',
                            'osano.js', 'analytics', 'tracking', 'utm_', 'javascript:', 'mailto:',
                            '.js', '.css', '.png', '.jpg', '.gif', '.pdf', 'exploit-db.com'
                        ]
                        
                        if any(skip in url_lower for skip in skip_patterns):
                            continue
                        
                        # High score for vendor-specific security/advisory domains
                        if 'helpx.adobe.com' in url_lower and ('security' in url_lower or 'apsb' in url_lower):
                            score += 100
                        elif 'msrc.microsoft.com' in url_lower or 'portal.msrc' in url_lower or 'support.microsoft.com' in url_lower:
                            score += 100
                        elif 'sec.cloudapps.cisco.com' in url_lower or 'tools.cisco.com' in url_lower:
                            score += 100
                        elif 'oracle.com' in url_lower and 'security' in url_lower:
                            score += 100
                        elif 'support.apple.com' in url_lower and 'security' in url_lower:
                            score += 100
                        
                        # Medium score for general vendor security pages
                        elif any(vendor in url_lower for vendor in ['adobe.com', 'microsoft.com', 'cisco.com', 'oracle.com', 'apple.com']):
                            if any(keyword in url_lower for keyword in ['security', 'advisory', 'bulletin', 'apsb', 'patch']):
                                score += 70
                            else:
                                score += 30
                        
                        # Lower score for other security-related domains
                        elif any(keyword in url_lower for keyword in ['security', 'advisory', 'bulletin', 'vulnerability']):
                            score += 20
                        
                        # Minimal score for other legitimate domains
                        elif not any(bad in url_lower for bad in ['bit.ly', 'tinyurl', 't.co']):
                            score += 5
                        
                        if score > 0:
                            scored_urls.append((score, url))
                    
                    # Sort by score (highest first) and extract URLs
                    scored_urls.sort(key=lambda x: x[0], reverse=True)
                    final_urls = [url for score, url in scored_urls[:10]]
                    
                    if final_urls:
                        self.log("info", f"Found {len(final_urls)} scored reference URLs for {cve_id} from NVD")
                        self.log("debug", f"Top URL for {cve_id}: {final_urls[0]}")
                        return final_urls
                
                else:
                    self.log("warning", f"NVD API returned status {response.status_code} for {cve_id}")
                    
        except Exception as e:
            self.log("warning", f"Failed to fetch CVE references from NVD for {cve_id}: {str(e)}")
        
        # Try CVE Details with throttling (secondary source)
        try:
            # Add a small delay to be respectful to CVE Details
            await asyncio.sleep(0.5)
            
            cve_details_url = f"https://www.cvedetails.com/cve/{cve_id}/"
            
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                response = await client.get(cve_details_url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://www.cvedetails.com/',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                })
                
                if response.status_code == 200:
                    html_content = response.text
                    reference_urls = []
                    
                    import re
                    
                    # Look for reference URLs in the References section
                    url_patterns = [
                        # Direct vendor advisory URLs
                        r'https?://helpx\.adobe\.com[^\s<>"\']+',
                        r'https?://msrc\.microsoft\.com[^\s<>"\']+', 
                        r'https?://sec\.cloudapps\.cisco\.com[^\s<>"\']+',
                        r'https?://www\.oracle\.com[^\s<>"\']*security[^\s<>"\']*',
                        r'https?://support\.apple\.com[^\s<>"\']*security[^\s<>"\']*',
                    ]
                    
                    for pattern in url_patterns:
                        matches = re.findall(pattern, html_content, re.IGNORECASE)
                        reference_urls.extend(matches)
                    
                    # Remove duplicates and filter
                    reference_urls = list(set(reference_urls))
                    vendor_urls = [url for url in reference_urls if len(url) > 20 and len(url) < 400]
                    
                    if vendor_urls:
                        self.log("info", f"Found {len(vendor_urls)} vendor URLs from CVE Details for {cve_id}")
                        self.log("debug", f"Top CVE Details URL for {cve_id}: {vendor_urls[0]}")
                        return vendor_urls[:10]
                
                else:
                    self.log("warning", f"CVE Details returned status {response.status_code} for {cve_id}")
                    
        except Exception as e:
            self.log("warning", f"Failed to fetch CVE references from CVE Details for {cve_id}: {str(e)}")
        
        # If all methods fail, return empty list
        self.log("warning", f"No reference URLs found for {cve_id} from any source")
        return []
    
    async def get_best_vendor_url(self, cve_id: str, vendor: str) -> str:
        """
        Get the best vendor-specific URL for a CVE
        Returns the most relevant vendor URL or a generic CVE URL as fallback
        """
        try:
            references = await self.fetch_cve_references(cve_id)
            
            if not references:
                return f"https://www.cve.org/CVERecord?id={cve_id}"
            
            vendor_lower = vendor.lower()
            
            # Prioritize vendor-specific advisory URLs
            for url in references:
                url_lower = url.lower()
                
                # High priority vendor-specific advisory patterns
                if vendor_lower == 'adobe':
                    if ('helpx.adobe.com' in url_lower and 'security' in url_lower) or 'apsb' in url_lower:
                        return url
                elif vendor_lower == 'microsoft':
                    if 'msrc.microsoft.com' in url_lower or 'portal.msrc' in url_lower:
                        return url
                elif vendor_lower == 'cisco':
                    if 'sec.cloudapps.cisco.com' in url_lower:
                        return url
                elif vendor_lower == 'oracle':
                    if 'oracle.com' in url_lower and 'security' in url_lower:
                        return url
                elif vendor_lower == 'apple':
                    if 'support.apple.com' in url_lower and 'security' in url_lower:
                        return url
            
            # Second priority: any vendor domain with security keywords
            for url in references:
                url_lower = url.lower()
                if (vendor_lower in url_lower and 
                    any(keyword in url_lower for keyword in ['security', 'advisory', 'bulletin', 'patch'])):
                    return url
            
            # Third priority: any vendor domain
            for url in references:
                if vendor_lower in url.lower():
                    return url
            
            # Fourth priority: any high-quality reference
            for url in references:
                url_lower = url.lower()
                if any(keyword in url_lower for keyword in ['security', 'advisory', 'bulletin']):
                    return url
            
            # Last resort: first reference URL
            return references[0]
            
        except Exception as e:
            self.log("warning", f"Failed to get vendor URL for {cve_id}: {str(e)}")
        
        # Ultimate fallback to CVE.org
        return f"https://www.cve.org/CVERecord?id={cve_id}"

    async def fetch_cve_details(self, cve_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch detailed CVE information using the CVE Details API cve-json endpoint
        Returns rich CVE data including references, metrics, and descriptions
        """
        url = f"{self.base_url}/vulnerability/cve-json"
        params = {"cveId": cve_id}
        
        self.log("debug", f"Fetching detailed CVE data for {cve_id}")
        
        # Try up to 3 times with different tokens
        for attempt in range(3):
            current_token = self._get_available_token()
            
            if not current_token:
                if attempt < 2:
                    wait_time = 2 ** attempt
                    self.log("warning", f"No API tokens available for CVE details. Waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise Exception("All API tokens are rate limited for CVE details fetch")
            
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(
                        url,
                        params=params,
                        headers={
                            "Authorization": f"Bearer {current_token}",
                            "Accept": "application/json"
                        }
                    )
                    
                    if response.status_code == 200:
                        self._reset_token_status(current_token)
                        data = response.json()
                        self.log("success", f"Fetched detailed CVE data for {cve_id}")
                        return data
                    
                    elif response.status_code == 429:
                        self.log("warning", f"Rate limit hit on CVE details fetch. Trying next token...")
                        self._mark_token_rate_limited(current_token)
                        continue
                    
                    elif response.status_code == 404:
                        self.log("warning", f"CVE {cve_id} not found in CVE Details database")
                        return None
                    
                    else:
                        error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                        self.log("error", f"CVE details API request failed: {error_msg}")
                        if attempt == 2:
                            raise Exception(error_msg)
                        continue
                        
            except httpx.TimeoutException:
                self.log("warning", f"CVE details request timeout on token #{self.current_token_index + 1}")
                if attempt < 2:
                    await asyncio.sleep(1)
                    continue
                else:
                    raise Exception("CVE details request timeout after all retries")
            
            except Exception as e:
                if "429" in str(e) or "Too Many Requests" in str(e):
                    self._mark_token_rate_limited(current_token)
                    continue
                else:
                    self.log("error", f"CVE details API request failed: {str(e)}")
                    if attempt == 2:
                        raise e
                    continue
        
        return None

    async def get_best_vendor_url_enhanced(self, cve_id: str, vendor: str) -> str:
        """
        Enhanced vendor URL fetching using detailed CVE information
        Uses the cve-json endpoint for richer reference data with tags
        """
        try:
            # Fetch detailed CVE information
            cve_details = await self.fetch_cve_details(cve_id)
            
            if not cve_details or "references" not in cve_details:
                self.log("warning", f"No detailed references found for {cve_id}, using basic method")
                return await self.get_best_vendor_url(cve_id, vendor)
            
            references = cve_details.get("references", [])
            vendor_lower = vendor.lower()
            
            self.log("info", f"🔍 Analyzing {len(references)} detailed references for {cve_id}")
            
            # Priority 1: Vendor Advisory references
            for ref in references:
                if "tags" in ref and ref["tags"]:
                    url = ref.get("url", "")
                    url_lower = url.lower()
                    tags = [tag.lower() for tag in ref["tags"]]
                    
                    if "vendor advisory" in tags and vendor_lower in url_lower:
                        self.log("success", f"🎯 Found vendor advisory for {vendor}: {url}")
                        return url
            
            # Priority 2: Patch/Fix references from vendor
            for ref in references:
                if "tags" in ref and ref["tags"]:
                    url = ref.get("url", "")
                    url_lower = url.lower()
                    tags = [tag.lower() for tag in ref["tags"]]
                    
                    if "patch" in tags and vendor_lower in url_lower:
                        self.log("success", f"🔧 Found vendor patch for {vendor}: {url}")
                        return url
            
            # Priority 3: Any vendor-specific URL with security keywords
            vendor_specific_urls = []
            
            # Enhanced vendor matching - check multiple vendor formats
            vendor_variations = [
                vendor_lower,
                vendor_lower.replace(" ", ""),
                vendor_lower.replace(" ", "-"),
                vendor_lower.replace(" ", "_"),
                vendor_lower.split()[0] if " " in vendor_lower else vendor_lower  # First word only
            ]
            
            for ref in references:
                url = ref.get("url", "")
                url_lower = url.lower()
                
                # Check if URL matches any vendor variation
                vendor_match = any(var in url_lower for var in vendor_variations if var)
                
                if vendor_match:
                    vendor_specific_urls.append({
                        "url": url,
                        "tags": ref.get("tags", []),
                        "has_security": any(keyword in url_lower for keyword in ['security', 'advisory', 'bulletin', 'patch'])
                    })
            
            # Sort vendor URLs by relevance
            if vendor_specific_urls:
                # Prioritize URLs with security keywords
                security_urls = [u for u in vendor_specific_urls if u["has_security"]]
                if security_urls:
                    best_url = security_urls[0]["url"]
                    self.log("success", f"🔒 Found vendor security URL for {vendor}: {best_url}")
                    return best_url
                else:
                    best_url = vendor_specific_urls[0]["url"]
                    self.log("info", f"📋 Found vendor URL for {vendor}: {best_url}")
                    return best_url
            
            # Priority 4: High-quality reference by tags
            quality_references = []
            for ref in references:
                if "tags" in ref and ref["tags"]:
                    url = ref.get("url", "")
                    tags = [tag.lower() for tag in ref["tags"]]
                    
                    # Score based on tag quality
                    score = 0
                    if "vendor advisory" in tags: score += 10
                    if "patch" in tags: score += 8
                    if "exploit" in tags: score += 6
                    if "third party advisory" in tags: score += 4
                    
                    if score > 0:
                        quality_references.append({"url": url, "score": score, "tags": tags})
            
            if quality_references:
                # Sort by score and return best
                quality_references.sort(key=lambda x: x["score"], reverse=True)
                best_ref = quality_references[0]
                self.log("info", f"📊 Found high-quality reference (score: {best_ref['score']}): {best_ref['url']}")
                return best_ref["url"]
            
            # Fallback to first reference
            if references:
                fallback_url = references[0].get("url", "")
                self.log("info", f"💾 Using first available reference: {fallback_url}")
                return fallback_url
            
        except Exception as e:
            self.log("error", f"Enhanced URL fetching failed for {cve_id}: {str(e)}")
        
        # Ultimate fallback
        fallback = f"https://www.cve.org/CVERecord?id={cve_id}"
        self.log("warning", f"🔄 Using CVE.org fallback: {fallback}")
        return fallback

    async def improve_cve_url(self, cve_data: CVEData) -> CVEData:
        """
        Improve CVE URL using enhanced vendor URL fetching with detailed CVE information
        """
        try:
            # Get enhanced vendor URL using the detailed CVE API
            improved_url = await self.get_best_vendor_url_enhanced(cve_data.cve, cve_data.vendor)
            
            # Create improved CVE data object
            improved_cve = cve_data.model_copy()
            improved_cve.urlLink = improved_url
            
            # Log improvement if URL changed
            if improved_url != cve_data.urlLink:
                self.log("success", f"🎯 Improved URL for {cve_data.cve}: {cve_data.urlLink} → {improved_url}")
            else:
                self.log("info", f"📋 URL unchanged for {cve_data.cve}: {improved_url}")
            
            return improved_cve
            
        except Exception as e:
            self.log("error", f"Failed to improve URL for {cve_data.cve}: {str(e)}")
            return cve_data
    
    # Automation System for Vendor Fetching
    
    def __init_automation_state(self):
        """Initialize automation tracking state"""
        
        if not hasattr(self, 'automation_progress'):
            # Initialize token statuses
            token_statuses = []
            for i, token in enumerate(self.api_tokens):
                token_statuses.append(TokenStatus(
                    tokenIndex=i,
                    isActive=i == self.current_token_index,
                    status="ready"
                ))
            
            self.automation_progress = AutomationProgress(
                tokenStatuses=token_statuses,
                lastUpdate=datetime.now().isoformat()
            )
            
    async def _fetch_fresh_data_for_vendor(self, vendor: str, date_from: str = None, date_to: str = None):
        """Fetch fresh CVE data for vendor using comprehensive dual-date search approach"""
        try:
            from datetime import timedelta
            
            # Use provided date range or default to last 7 days
            if not date_from or not date_to:
                end_date = datetime.now()
                start_date = end_date - timedelta(days=7)
                date_from = start_date.strftime('%Y-%m-%d')
                date_to = end_date.strftime('%Y-%m-%d')
            
            self.log("info", f"🔄 Fetching comprehensive CVE data for {vendor} from {date_from} to {date_to}")
            
            # Use the new product-aware search method (falls back to dual-date if no product mappings)
            all_api_results = await self.search_vulnerabilities_with_products(vendor, date_from, date_to, max_pages=10)
            
            if all_api_results:
                # Transform API results to CVE data format
                cve_data = await self.transform_api_response_to_cve_data(all_api_results, vendor)
                
                # Save the fresh data
                await self.save_vendor_data(vendor, date_to, cve_data)
                
                self.log("success", f"✅ Successfully fetched and saved {len(cve_data)} unique CVEs for {vendor}")
                return cve_data
            else:
                self.log("info", f"📭 No CVE data found for {vendor} in the specified date range")
                return []
                
        except Exception as e:
            self.log("error", f"Failed to fetch fresh data for {vendor}: {str(e)}")
            
    async def get_cve_data_by_vendor(self, vendor: str):
        """Get CVE data for a specific vendor from stored files"""
        from data_service import DataStorageService
        
        try:
            # Get data storage service
            data_service = DataStorageService()
            
            # Get all data for the vendor
            all_data = await data_service.get_all_stored_data()
            vendor_data = [cve for cve in all_data if cve.vendor.lower() == vendor.lower()]
            
            if not vendor_data:
                self.log("warning", f"No stored data found for vendor: {vendor}")
                return None
            
            # Create a mock JSONFileContent structure for compatibility
            from models import JSONFileContent, JSONFileMetadata
            
            metadata = JSONFileMetadata(
                vendor=vendor,
                date=datetime.now().strftime('%Y-%m-%d'),
                filePath=f"data/{vendor}",
                totalRecords=len(vendor_data),
                savedAt=datetime.now().isoformat()
            )
            
            # Return structure similar to what the automation expects
            return type('MockVendorData', (), {
                'metadata': metadata,
                'data': vendor_data
            })()
            
        except Exception as e:
            self.log("error", f"Failed to get CVE data for vendor {vendor}: {str(e)}")
            return None

    async def start_automated_vendor_processing(self, vendor_list: Optional[List[str]] = None, date_from: str = None, date_to: str = None) -> Dict[str, Any]:
        """Start automated processing for all vendors with intelligent rate limiting and optional date range"""
        
        self.__init_automation_state()
        
        if self.automation_progress.isRunning:
            return {"success": False, "message": "Automation is already running"}
        
        # Use provided vendors or all vendors
        vendors_to_process = vendor_list or VENDORS
        
        self.automation_progress.isRunning = True
        self.automation_progress.startTime = datetime.now().isoformat()
        self.automation_progress.totalVendors = len(vendors_to_process)
        self.automation_progress.completedVendors = 0
        self.automation_progress.errorVendors = 0
        self.automation_progress.vendorProgress = []
        self.automation_progress.errors = []
        self.automation_progress.lastUpdate = datetime.now().isoformat()
        
        self.log("info", f"Starting automated vendor processing for {len(vendors_to_process)} vendors")
        
        # Initialize vendor progress tracking
        for vendor in vendors_to_process:
            vendor_progress = VendorProgress(
                vendor=vendor,
                status="pending"
            )
            self.automation_progress.vendorProgress.append(vendor_progress)
        
        try:
            # Process each vendor with intelligent rate limiting
            for vendor_index, vendor in enumerate(vendors_to_process):
                if not self.automation_progress.isRunning:  # Check if stopped
                    break
                    
                self.automation_progress.currentVendor = vendor
                self.automation_progress.overallProgress = int((vendor_index / len(vendors_to_process)) * 100)
                
                vendor_progress = next(vp for vp in self.automation_progress.vendorProgress if vp.vendor == vendor)
                vendor_progress.status = "processing"
                vendor_progress.startTime = datetime.now().isoformat()
                
                self.log("info", f"Processing vendor: {vendor} ({vendor_index + 1}/{len(vendors_to_process)})")
                
                try:
                    # First, fetch fresh CVE data for specified date range (or default last 7 days)
                    await self._fetch_fresh_data_for_vendor(vendor, date_from, date_to)
                    
                    # Then get all CVE data for this vendor (including fresh data)
                    vendor_data = await self.get_cve_data_by_vendor(vendor)
                    
                    if vendor_data and vendor_data.data:
                        vendor_progress.totalCVEs = len(vendor_data.data)
                        
                        # Process CVEs in batches with rate limiting
                        batch_size = 5  # Smaller batches for better rate limiting
                        improved_count = 0
                        
                        for i in range(0, len(vendor_data.data), batch_size):
                            if not self.automation_progress.isRunning:  # Check if stopped
                                break
                                
                            batch = vendor_data.data[i:i+batch_size]
                            batch_results = []
                            
                            for cve_data in batch:
                                if not self.automation_progress.isRunning:
                                    break
                                    
                                try:
                                    # Try to improve URL with rate limiting protection
                                    improved_cve = await self._improve_cve_url_with_rate_protection(cve_data)
                                    
                                    if improved_cve and improved_cve.urlLink != cve_data.urlLink:
                                        improved_count += 1
                                        self.automation_progress.totalCVEsImproved += 1
                                    
                                    batch_results.append(improved_cve)
                                    self.automation_progress.totalCVEsProcessed += 1
                                    vendor_progress.processedCVEs += 1
                                    vendor_progress.improvedCVEs = improved_count
                                    
                                    # Update progress
                                    vendor_progress.progress = int((vendor_progress.processedCVEs / vendor_progress.totalCVEs) * 100)
                                    
                                except Exception as e:
                                    error_msg = f"Error processing CVE {cve_data.cve}: {str(e)}"
                                    vendor_progress.errors.append(error_msg)
                                    self.automation_progress.errors.append(error_msg)
                                    batch_results.append(cve_data)  # Keep original
                            
                            # Save batch results
                            if batch_results:
                                # Update vendor data with improved URLs
                                for j, improved_cve in enumerate(batch_results):
                                    if i + j < len(vendor_data.data):
                                        vendor_data.data[i + j] = improved_cve
                                
                                # Save updated vendor data
                                await self._save_vendor_data(vendor, vendor_data)
                            
                            # Rate limiting: wait between batches
                            if i + batch_size < len(vendor_data.data):  # Don't wait after last batch
                                await asyncio.sleep(2)  # 2 second delay between batches
                        
                        vendor_progress.status = "completed"
                        vendor_progress.progress = 100
                        self.automation_progress.completedVendors += 1
                        
                    else:
                        vendor_progress.status = "completed"
                        vendor_progress.progress = 100
                        vendor_progress.errors.append("No CVE data found for vendor")
                        
                    vendor_progress.endTime = datetime.now().isoformat()
                    
                except Exception as e:
                    error_msg = f"Error processing vendor {vendor}: {str(e)}"
                    vendor_progress.status = "error"
                    vendor_progress.errors.append(error_msg)
                    self.automation_progress.errors.append(error_msg)
                    self.automation_progress.errorVendors += 1
                    self.log("error", error_msg)
                
                # Update overall progress
                self.automation_progress.overallProgress = int(((vendor_index + 1) / len(vendors_to_process)) * 100)
                self.automation_progress.lastUpdate = datetime.now().isoformat()
                
                # Cooldown between vendors to respect rate limits
                if vendor_index < len(vendors_to_process) - 1:  # Don't wait after last vendor
                    await asyncio.sleep(10)  # 10 second cooldown between vendors
            
            # Mark automation as complete
            self.automation_progress.isRunning = False
            self.automation_progress.currentVendor = None
            
            completion_message = f"Automation completed! Processed {self.automation_progress.totalCVEsProcessed} CVEs, improved {self.automation_progress.totalCVEsImproved} URLs across {self.automation_progress.completedVendors}/{self.automation_progress.totalVendors} vendors"
            self.log("success", completion_message)
            
            return {
                "success": True,
                "message": completion_message,
                "progress": self.automation_progress
            }
            
        except Exception as e:
            self.automation_progress.isRunning = False
            error_msg = f"Automation failed: {str(e)}"
            self.log("error", error_msg)
            return {"success": False, "message": error_msg}
    
    async def _improve_cve_url_with_rate_protection(self, cve_data: CVEData) -> CVEData:
        """Improve CVE URL with intelligent rate limit protection and token switching"""
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                # Check if current token is available
                current_token = self._get_available_token()
                if not current_token:
                    # Wait for tokens to become available
                    self.log("warning", "All tokens are rate limited, waiting for cooldown...")
                    await asyncio.sleep(60)  # Wait 1 minute for token reset
                    current_token = self._get_available_token()
                    
                    if not current_token:
                        self.log("error", "No tokens available after cooldown")
                        return cve_data  # Return original data
                
                # Try to improve the CVE URL
                improved_cve = await self.improve_cve_url(cve_data)
                
                # Mark token as successful
                self._reset_token_status(current_token)
                
                return improved_cve
                
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:  # Rate limit exceeded
                    self.log("warning", f"Rate limit hit for token {self.current_token_index + 1}, switching tokens...")
                    
                    # Mark current token as rate limited
                    current_token = self.api_tokens[self.current_token_index]
                    self._mark_token_rate_limited(current_token, cooldown_minutes=1)  # CVE Details resets every minute
                    
                    # Switch to next available token
                    self._switch_to_next_token()
                    
                    retry_count += 1
                    
                    if retry_count < max_retries:
                        self.log("info", f"Retrying with next token (attempt {retry_count + 1}/{max_retries})")
                        await asyncio.sleep(2)  # Short delay before retry
                    else:
                        self.log("warning", f"Max retries reached for CVE {cve_data.cve}, using original URL")
                        return cve_data
                else:
                    self.log("error", f"HTTP error {e.response.status_code} for CVE {cve_data.cve}: {str(e)}")
                    return cve_data
                    
            except Exception as e:
                self.log("error", f"Unexpected error improving CVE {cve_data.cve}: {str(e)}")
                return cve_data
        
        return cve_data
    
    async def _save_vendor_data(self, vendor: str, vendor_data) -> bool:
        """Save updated vendor data back to file"""
        try:
            # Find the most recent vendor directory
            vendor_dirs = []
            if os.path.exists(vendor):
                for date_dir in os.listdir(vendor):
                    date_path = os.path.join(vendor, date_dir)
                    if os.path.isdir(date_path):
                        vendor_dirs.append(date_dir)
            
            if not vendor_dirs:
                self.log("warning", f"No directories found for vendor {vendor}")
                return False
            
            # Use most recent directory (sorted by date)
            most_recent_dir = sorted(vendor_dirs, reverse=True)[0]
            file_path = os.path.join(vendor, most_recent_dir, "SanReport.json")
            
            if not os.path.exists(file_path):
                self.log("warning", f"SanReport.json not found at {file_path}")
                return False
            
            # Convert to dict for JSON serialization
            vendor_data_dict = {
                "metadata": vendor_data.metadata.dict() if hasattr(vendor_data.metadata, 'dict') else vendor_data.metadata,
                "data": [cve.dict() if hasattr(cve, 'dict') else cve for cve in vendor_data.data]
            }
            
            # Save to file
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(vendor_data_dict, f, indent=2, ensure_ascii=False)
            
            self.log("info", f"Saved updated data for vendor {vendor} to {file_path}")
            return True
            
        except Exception as e:
            self.log("error", f"Failed to save vendor data for {vendor}: {str(e)}")
            return False
    
    def get_automation_progress(self) -> Dict[str, Any]:
        """Get current automation progress"""
        self.__init_automation_state()
        
        # Update token statuses
        for i, token_status in enumerate(self.automation_progress.tokenStatuses):
            token_status.isActive = (i == self.current_token_index)
            
            # Check if token is in cooldown
            if i < len(self.api_tokens):
                token = self.api_tokens[i]
                if token in self.token_cooldown and self.token_cooldown[token]:
                    if datetime.now() < self.token_cooldown[token]:
                        token_status.status = "rate_limited"
                        token_status.rateLimitReset = self.token_cooldown[token].isoformat()
                    else:
                        token_status.status = "ready"
                        token_status.rateLimitReset = None
        
        self.automation_progress.lastUpdate = datetime.now().isoformat()
        
        return {
            "success": True,
            "progress": self.automation_progress.dict() if hasattr(self.automation_progress, 'dict') else self.automation_progress
        }
    
    def stop_automation(self) -> Dict[str, Any]:
        """Stop the automation process"""
        self.__init_automation_state()
        
        if not self.automation_progress.isRunning:
            return {"success": False, "message": "Automation is not currently running"}
        
        self.automation_progress.isRunning = False
        self.log("info", "Automation stopped by user request")
        
        return {"success": True, "message": "Automation stopped successfully"}