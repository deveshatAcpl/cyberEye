#!/usr/bin/env python3
"""
Debug script to inspect the actual CVE Details API response structure
"""

import os
import asyncio
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def inspect_api_response():
    """Inspect the raw API response to understand the data structure"""
    
    from cve_service import CVEApiService
    
    # Get credentials from environment
    api_token = os.getenv("CVE_API_TOKEN")
    base_url = os.getenv("API_BASE_URL", "https://www.cvedetails.com/api/v1")
    
    if not api_token:
        print("❌ No API token found")
        return
        
    # Initialize our CVE service
    cve_service = CVEApiService(api_token, base_url)
    
    print("🔍 RAW API Response Structure Inspection")
    print("=" * 60)
    
    try:
        # Get a small sample from Debian
        params = {
            "vendorName": "Debian",
            "publishDateStart": "2025-03-01",
            "publishDateEnd": "2025-03-31",
            "resultsPerPage": 2,  # Just get 2 results for inspection
            "pageNumber": 1
        }
        
        print("📤 Making API call with params:", params)
        
        response = await cve_service.search_vulnerabilities(params)
        
        if response and response.result:
            print(f"\n✅ Got {len(response.result)} results")
            print("\n🔍 RAW API RESPONSE STRUCTURE:")
            print("=" * 40)
            
            # Print the raw structure of the first result
            if response.result:
                first_result = response.result[0]
                print("📋 FIRST RESULT RAW DATA:")
                print(json.dumps(first_result, indent=2, default=str))
                
                print(f"\n📋 AVAILABLE FIELDS:")
                print("-" * 30)
                for key, value in first_result.items():
                    print(f"   {key}: {type(value).__name__} = {value}")
                
                # If there's a second result, compare
                if len(response.result) > 1:
                    second_result = response.result[1]
                    print(f"\n📋 SECOND RESULT (for comparison):")
                    print(json.dumps(second_result, indent=2, default=str))
        else:
            print("❌ No results returned")
            
        # Also test the response object structure
        print(f"\n🔍 RESPONSE OBJECT STRUCTURE:")
        print(f"   Type: {type(response)}")
        print(f"   Total Results: {getattr(response, 'totalResults', 'N/A')}")
        print(f"   Current Page: {getattr(response, 'currentPage', 'N/A')}")
        print(f"   Results Per Page: {getattr(response, 'resultsPerPage', 'N/A')}")
        
    except Exception as e:
        print(f"❌ Error during API inspection: {str(e)}")
        import traceback
        traceback.print_exc()

async def test_direct_api_call():
    """Make a direct HTTP call to see the raw response without our processing"""
    
    import httpx
    
    api_token = os.getenv("CVE_API_TOKEN")
    if not api_token:
        print("❌ No API token found")
        return
        
    print(f"\n🔍 DIRECT HTTP API CALL TEST")
    print("=" * 40)
    
    try:
        url = "https://www.cvedetails.com/api/v1/vulnerability/search"
        
        params = {
            "vendorName": "Debian",
            "publishDateStart": "2025-03-01",
            "publishDateEnd": "2025-03-31",
            "resultsPerPage": 2,
            "pageNumber": 1,
            "outputFormat": "json"
        }
        
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Accept": "application/json"
        }
        
        print("📤 Direct HTTP call:")
        print(f"   URL: {url}")
        print(f"   Params: {params}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params, headers=headers)
            
            print(f"\n📋 HTTP Response:")
            print(f"   Status: {response.status_code}")
            print(f"   Headers: {dict(response.headers)}")
            
            if response.status_code == 200:
                raw_data = response.json()
                print(f"\n📋 RAW JSON RESPONSE:")
                print(json.dumps(raw_data, indent=2, default=str))
            else:
                print(f"   Error Body: {response.text}")
                
    except Exception as e:
        print(f"❌ Error during direct API call: {str(e)}")
        import traceback
        traceback.print_exc()

async def main():
    """Main debug function"""
    await inspect_api_response()
    await test_direct_api_call()

if __name__ == "__main__":
    asyncio.run(main())