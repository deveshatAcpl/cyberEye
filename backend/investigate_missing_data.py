#!/usr/bin/env python3
"""
Debug script to investigate missing recent CVE data
Compare what we're fetching vs what's available on CVE Details website
"""

import os
import asyncio
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def test_current_year_data():
    """Test fetching very recent CVE data for Debian"""
    
    from cve_service import CVEApiService
    
    # Get credentials from environment
    api_token = os.getenv("CVE_API_TOKEN")
    base_url = os.getenv("API_BASE_URL", "https://www.cvedetails.com/api/v1")
    
    if not api_token:
        print("❌ No API token found")
        return
        
    # Initialize our CVE service
    cve_service = CVEApiService(api_token, base_url)
    
    print("🔍 Testing Recent CVE Data Fetching for Debian")
    print("Comparing with CVE Details website data")
    print("=" * 70)
    
    # Test different date ranges for 2025
    test_ranges = [
        ("2025-01-01", "2025-12-31", "Full 2025"),
        ("2025-09-01", "2025-09-30", "September 2025"),
        ("2025-03-01", "2025-03-31", "March 2025 (CVE-2025-27516)"),
        ("2025-04-01", "2025-04-30", "April 2025 (CVE-2025-21605)"),
        ("2024-12-01", "2025-12-31", "Dec 2024 - Dec 2025"),
    ]
    
    for date_from, date_to, description in test_ranges:
        print(f"\n📅 Testing {description}: {date_from} to {date_to}")
        
        try:
            # Test both published and updated date filters separately
            print(f"   🔍 Testing PUBLISHED dates...")
            pub_params = {
                "vendorName": "Debian",
                "publishDateStart": date_from,
                "publishDateEnd": date_to,
                "resultsPerPage": 50,
                "pageNumber": 1
            }
            
            pub_response = await cve_service.search_vulnerabilities(pub_params)
            pub_count = len(pub_response.result) if pub_response and pub_response.result else 0
            print(f"      ✅ Found {pub_count} CVEs published in range")
            
            if pub_count > 0:
                print("      📋 Recent published CVEs:")
                for cve in pub_response.result[:3]:
                    cve_id = cve.get('cve_id', 'N/A')
                    pub_date = cve.get('published_date', 'N/A')
                    upd_date = cve.get('last_update_date', 'N/A')
                    print(f"         {cve_id} | Pub: {pub_date} | Upd: {upd_date}")
            
            # Wait a bit to respect rate limits
            await asyncio.sleep(3)
            
            print(f"   🔍 Testing UPDATED dates...")
            upd_params = {
                "vendorName": "Debian", 
                "updateDateStart": date_from,
                "updateDateEnd": date_to,
                "resultsPerPage": 50,
                "pageNumber": 1
            }
            
            upd_response = await cve_service.search_vulnerabilities(upd_params)
            upd_count = len(upd_response.result) if upd_response and upd_response.result else 0
            print(f"      ✅ Found {upd_count} CVEs updated in range")
            
            if upd_count > 0:
                print("      📋 Recent updated CVEs:")
                for cve in upd_response.result[:3]:
                    cve_id = cve.get('cve_id', 'N/A')
                    pub_date = cve.get('published_date', 'N/A')
                    upd_date = cve.get('last_update_date', 'N/A')
                    print(f"         {cve_id} | Pub: {pub_date} | Upd: {upd_date}")
            
            # Check if we're missing the specific CVEs from the website
            target_cves = ["CVE-2025-27516", "CVE-2025-21605", "CVE-2024-46981"]
            print(f"   🎯 Checking for specific CVEs from website...")
            
            all_found_cves = []
            if pub_response and pub_response.result:
                all_found_cves.extend([cve.get('cve_id') for cve in pub_response.result])
            if upd_response and upd_response.result:
                all_found_cves.extend([cve.get('cve_id') for cve in upd_response.result])
            
            for target_cve in target_cves:
                if target_cve in all_found_cves:
                    print(f"      ✅ FOUND: {target_cve}")
                else:
                    print(f"      ❌ MISSING: {target_cve}")
            
            await asyncio.sleep(5)
            
        except Exception as e:
            if "rate limited" in str(e).lower():
                print(f"      ⏰ Rate limited - waiting...")
                await asyncio.sleep(60)
            else:
                print(f"      ❌ Error: {str(e)}")

async def test_pagination_depth():
    """Test if we're missing data due to pagination limits"""
    
    from cve_service import CVEApiService
    
    api_token = os.getenv("CVE_API_TOKEN")
    base_url = os.getenv("API_BASE_URL", "https://www.cvedetails.com/api/v1")
    
    if not api_token:
        print("❌ No API token found")
        return
        
    cve_service = CVEApiService(api_token, base_url)
    
    print(f"\n🔍 Testing Pagination Depth for Debian")
    print("=" * 50)
    
    try:
        # Test with broader date range and more pages
        params = {
            "vendorName": "Debian",
            "publishDateStart": "2024-01-01",
            "publishDateEnd": "2025-12-31", 
            "resultsPerPage": 50,
            "pageNumber": 1
        }
        
        print(f"📊 Fetching multiple pages for Debian (2024-2025)...")
        
        all_results = []
        page = 1
        
        while page <= 10:  # Test up to 10 pages
            params["pageNumber"] = page
            
            response = await cve_service.search_vulnerabilities(params)
            
            if not response or not response.result:
                print(f"   📄 Page {page}: No results - stopping")
                break
                
            page_count = len(response.result)
            all_results.extend(response.result)
            
            print(f"   📄 Page {page}: {page_count} CVEs")
            
            # Show some CVEs from this page
            for i, cve in enumerate(response.result[:2]):
                cve_id = cve.get('cve_id', 'N/A')
                pub_date = cve.get('published_date', 'N/A')
                print(f"      {i+1}. {cve_id} | Published: {pub_date}")
            
            if page_count < 50:  # Less than full page means we've reached the end
                print(f"   ✅ Reached end of results at page {page}")
                break
                
            page += 1
            await asyncio.sleep(2)  # Rate limiting
        
        print(f"\n📊 TOTAL FOUND: {len(all_results)} CVEs across {page-1} pages")
        
        # Check for the specific missing CVEs
        found_cve_ids = [cve.get('cve_id') for cve in all_results]
        target_cves = ["CVE-2025-27516", "CVE-2025-21605", "CVE-2024-46981"]
        
        print(f"\n🎯 Checking for specific website CVEs in all results:")
        for target_cve in target_cves:
            if target_cve in found_cve_ids:
                print(f"   ✅ FOUND: {target_cve}")
            else:
                print(f"   ❌ STILL MISSING: {target_cve}")
        
        # Show the most recent CVEs we found
        print(f"\n📋 Most Recent CVEs Found:")
        recent_cves = sorted(all_results, 
                           key=lambda x: x.get('published_date', ''), 
                           reverse=True)[:5]
        
        for cve in recent_cves:
            cve_id = cve.get('cve_id', 'N/A')
            pub_date = cve.get('published_date', 'N/A')
            upd_date = cve.get('last_update_date', 'N/A')
            print(f"   📋 {cve_id} | Pub: {pub_date} | Upd: {upd_date}")
            
    except Exception as e:
        print(f"❌ Error during pagination test: {str(e)}")

async def main():
    """Main investigation function"""
    print("🚀 CVE Data Investigation: Debian Missing Data")
    print("Investigating why recent 2025 CVEs are not being fetched")
    print("=" * 70)
    
    await test_current_year_data()
    await test_pagination_depth()
    
    print(f"\n💡 INVESTIGATION SUMMARY:")
    print("=" * 50)
    print("1. Check if API returns 2025 data at all")
    print("2. Verify pagination is fetching all available pages") 
    print("3. Compare API results with website display")
    print("4. Identify if there are API limitations vs website data")

if __name__ == "__main__":
    asyncio.run(main())