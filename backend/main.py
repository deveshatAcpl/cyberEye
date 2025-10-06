from fastapi import FastAPI, HTTPException, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from typing import List, Optional, Dict, Any
import os
import json
import tempfile
from datetime import datetime
from dotenv import load_dotenv

from models import (
    CVEData, FilterState, CVESearchRequest, LogEntry, 
    ApiStatus, DataStorageInfo, VENDORS
)
from cve_service import CVEApiService
from data_service import DataStorageService

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="CVE Dashboard API",
    description="Backend API for CVE Dashboard Explorer",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:8081").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Initialize services
cve_service = CVEApiService(
    api_token=os.getenv("CVE_API_TOKEN"),
    base_url=os.getenv("API_BASE_URL", "https://www.cvedetails.com/api/v1")
)

data_service = DataStorageService(
    data_directory=os.getenv("DATA_DIRECTORY", "./data")
)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "CVE Dashboard API",
        "version": "1.0.0",
        "endpoints": {
            "cve_search": "/api/cve/search",
            "test_api": "/api/cve/test",
            "data_list": "/api/data/list",
            "logs": "/api/logs"
        }
    }

@app.get("/api/cve/test")
async def test_cve_api():
    """Test CVE Details API connection"""
    try:
        is_connected = await cve_service.test_connection()
        
        # Get the last log entry for detailed error information
        logs = cve_service.get_logs()
        last_log = logs[-1] if logs else None
        
        if is_connected:
            return ApiStatus(
                status="connected",
                message="API connection successful",
                lastTested=datetime.now().isoformat()
            )
        else:
            # Provide detailed error message from logs
            error_detail = last_log.message if last_log and last_log.type == "error" else "API connection failed"
            return ApiStatus(
                status="error",
                message=error_detail,
                lastTested=datetime.now().isoformat()
            )
    except Exception as e:
        return ApiStatus(
            status="error",
            message=f"API test failed: {str(e)}",
            lastTested=datetime.now().isoformat()
        )

@app.get("/api/cve/token-status")
async def get_token_status():
    """Get status of all API tokens"""
    try:
        status = cve_service.get_token_status()
        return {
            "success": True,
            "data": status
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/cve/search")
async def search_cve(search_params: CVESearchRequest):
    """Search for CVE vulnerabilities"""
    try:
        # Convert to dict for API call
        params = search_params.model_dump(exclude_none=True)
        
        # Call CVE API
        api_response = await cve_service.search_vulnerabilities(params)
        
        # Transform to CVE data format
        vendor = params.get("vendorName")
        cve_data = await cve_service.transform_api_response_to_cve_data(api_response.result, vendor)
        
        # Save data if we got results and have a vendor
        if cve_data and vendor:
            date_key = params.get("publishDateEnd", datetime.now().strftime('%Y-%m-%d'))
            await data_service.save_data(vendor, date_key, cve_data)
        
        return {
            "success": True,
            "data": cve_data,
            "totalResults": api_response.totalResults,
            "currentPage": api_response.currentPage,
            "resultsPerPage": api_response.resultsPerPage
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CVE search failed: {str(e)}")

@app.post("/api/cve/fetch-and-store")
async def fetch_and_store_cve_data(request: Dict[str, Any]):
    """Fetch CVE data for vendor and date range, then store it"""
    try:
        vendor = request.get("vendor")
        date_from = request.get("dateFrom")
        date_to = request.get("dateTo")
        
        if not vendor:
            raise HTTPException(status_code=400, detail="Vendor is required")
            
        # Check if data already exists for the EXACT date range requested
        target_date = date_to or datetime.now().strftime('%Y-%m-%d')
        
        # Only return existing data if we have COMPREHENSIVE data for the exact date range
        # For now, we'll always fetch fresh data to ensure we get the latest CVEs
        # This can be optimized later with proper date range checking
        
        # TODO: Implement proper date range checking logic:
        # 1. Check if existing data covers the ENTIRE requested date range
        # 2. Check if existing data is recent (not stale)
        # 3. Only return cached data if it's complete and fresh
        
        # For now, comment out the existing data check to always fetch fresh data
        # existing_data = await data_service.load_data(vendor, target_date)
        # if existing_data:
        #     return {"success": True, "message": f"Found {len(existing_data)} existing records for {vendor}", "data": existing_data, "cached": True}
        
        # NEW APPROACH: Make TWO separate API calls for comprehensive data
        # Call 1: CVEs published in the date range
        # Call 2: CVEs updated in the date range (might be published earlier)
        
        all_data = []
        
        print(f"🔍 Fetching comprehensive CVE data for {vendor}...")
        
        # Call 1: Published in date range
        print(f"📅 Call 1: CVEs published between {date_from} and {date_to}")
        published_params = {
            "vendorName": vendor,
            "publishDateStart": date_from,
            "publishDateEnd": date_to,
            "resultsPerPage": 50
        }
        
        published_data = await cve_service.fetch_paginated_data(published_params)
        print(f"   ✅ Found {len(published_data)} CVEs published in range")
        
        # Call 2: Updated in date range (may include older CVEs with recent updates)
        print(f"🔄 Call 2: CVEs updated between {date_from} and {date_to}")
        updated_params = {
            "vendorName": vendor,
            "updateDateStart": date_from,
            "updateDateEnd": date_to,
            "resultsPerPage": 50
        }
        
        updated_data = await cve_service.fetch_paginated_data(updated_params)
        print(f"   ✅ Found {len(updated_data)} CVEs updated in range")
        
        # Combine and deduplicate by CVE ID
        combined_data = {}
        
        # Add published data
        for cve_dict in published_data:
            cve_data = await cve_service.transform_single_cve_to_cve_data(cve_dict, vendor)
            if cve_data and cve_data.cve:
                combined_data[cve_data.cve] = cve_data
        
        # Add updated data (newer data overwrites if duplicate)
        for cve_dict in updated_data:
            cve_data = await cve_service.transform_single_cve_to_cve_data(cve_dict, vendor)
            if cve_data and cve_data.cve:
                if cve_data.cve in combined_data:
                    # Keep the one with more recent update date
                    existing = combined_data[cve_data.cve]
                    if (hasattr(cve_data, 'updatedDate') and hasattr(existing, 'updatedDate') and 
                        cve_data.updatedDate and existing.updatedDate and 
                        cve_data.updatedDate > existing.updatedDate):
                        combined_data[cve_data.cve] = cve_data
                else:
                    combined_data[cve_data.cve] = cve_data
        
        all_data = list(combined_data.values())
        duplicates_avoided = len(published_data) + len(updated_data) - len(all_data)
        
        print(f"📊 SUMMARY:")
        print(f"   📋 Published CVEs: {len(published_data)}")
        print(f"   🔄 Updated CVEs: {len(updated_data)}")
        print(f"   🎯 Unique CVEs: {len(all_data)}")
        print(f"   ♻️  Duplicates merged: {duplicates_avoided}")
        
        # Save data
        if all_data:
            await data_service.save_data(vendor, target_date, all_data)
        
        # NEW: Auto-trigger URL improvement automation after data fetch
        try:
            # Check if automation is not already running
            automation_status = cve_service.get_automation_progress()
            if not automation_status["progress"]["isRunning"]:
                # Start automation for this vendor only
                automation_result = await cve_service.start_automated_vendor_processing([vendor])
                automation_message = f" | Automation started for URL improvements"
            else:
                automation_message = f" | Automation already running"
        except Exception as e:
            automation_message = f" | Automation trigger failed: {str(e)}"
        
        return {
            "success": True,
            "message": f"Fetched and stored {len(all_data)} records for {vendor}{automation_message}",
            "data": all_data,
            "cached": False,
            "automationTriggered": True
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fetch and store failed: {str(e)}")

@app.get("/api/data/list")
async def list_stored_data():
    """List all stored data information"""
    try:
        stats = data_service.get_storage_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list data: {str(e)}")

@app.get("/api/data/all")
async def get_all_stored_data():
    """Get all stored CVE data"""
    try:
        all_data = await data_service.get_all_stored_data()
        return {
            "success": True,
            "data": all_data,
            "totalRecords": len(all_data)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get data: {str(e)}")

@app.get("/api/data/vendor/{vendor}")
async def get_vendor_data(vendor: str, date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Get stored data for a specific vendor and date range"""
    try:
        if date_from and date_to:
            data = await data_service.get_data_for_date_range(vendor, date_from, date_to)
        else:
            # Get all data for vendor
            dates = data_service.get_stored_dates_for_vendor(vendor)
            data = []
            for date in dates:
                vendor_data = await data_service.load_data(vendor, date)
                if vendor_data:
                    data.extend(vendor_data)
        
        return {
            "success": True,
            "vendor": vendor,
            "data": data,
            "totalRecords": len(data)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get vendor data: {str(e)}")

@app.get("/api/data/export")
async def export_all_data():
    """Export all stored data as JSON"""
    try:
        export_data = await data_service.export_all_data()
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
            temp_path = f.name
            
        return FileResponse(
            path=temp_path,
            filename=f"cve-dashboard-export-{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
            media_type="application/json"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@app.post("/api/data/import")
async def import_data(file: UploadFile = File(...)):
    """Import data from JSON file"""
    try:
        content = await file.read()
        import_data = json.loads(content.decode('utf-8'))
        
        await data_service.import_data(import_data)
        
        return {
            "success": True,
            "message": f"Successfully imported {import_data.get('total_files', 0)} files"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@app.delete("/api/data/clear")
async def clear_all_data():
    """Clear all stored data"""
    try:
        await data_service.clear_all_data()
        return {
            "success": True,
            "message": "All data cleared successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Clear failed: {str(e)}")

@app.get("/api/logs")
async def get_logs():
    """Get API logs"""
    try:
        logs = cve_service.get_logs()
        return {
            "success": True,
            "logs": logs,
            "totalLogs": len(logs)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get logs: {str(e)}")

@app.get("/api/vendors")
async def get_vendors():
    """Get list of all supported vendors"""
    return {
        "success": True,
        "vendors": VENDORS
    }

@app.post("/api/data/save")
async def save_data(request: Request):
    """Save CVE data for a vendor and date"""
    try:
        body = await request.json()
        vendor = body.get("vendor")
        date = body.get("date")
        data = body.get("data", [])
        
        if not vendor or not date:
            raise HTTPException(status_code=400, detail="Vendor and date are required")
        
        print(f"Attempting to save {len(data)} records for {vendor} on {date}")
        
        # Check if we're trying to overwrite good data with empty data
        if len(data) == 0:
            existing_data = await data_service.load_data(vendor, date)
            if existing_data and len(existing_data) > 0:
                print(f"Preventing overwrite: existing data has {len(existing_data)} records, new data has 0 records")
                return {
                    "success": True,
                    "message": f"Preserved existing {len(existing_data)} CVE records for {vendor} on {date} (prevented empty overwrite)",
                    "preserved": True
                }
        
        # Convert data to CVEData objects
        cve_data = []
        for i, item in enumerate(data):
            try:
                cve_data.append(CVEData(**item))
            except Exception as validation_error:
                print(f"Validation error for item {i}: {validation_error}")
                raise HTTPException(status_code=400, detail=f"Invalid data format at item {i}: {validation_error}")
        
        await data_service.save_data(vendor, date, cve_data)
        
        return {
            "success": True,
            "message": f"Saved {len(cve_data)} CVE records for {vendor} on {date}"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Save endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save data: {str(e)}")

@app.get("/api/data/load")
async def load_data(vendor: str, date: str):
    """Load CVE data for a specific vendor and date"""
    try:
        data = await data_service.load_data(vendor, date)
        
        if data is None:
            return {
                "success": False,
                "message": f"No data found for {vendor} on {date}",
                "data": None
            }
        
        return {
            "success": True,
            "message": f"Loaded {len(data)} CVE records for {vendor} on {date}",
            "data": {"data": data}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load data: {str(e)}")

@app.get("/api/data/date-range")
async def get_data_for_date_range(vendor: str, start_date: str, end_date: str):
    """Get CVE data for a vendor within a date range"""
    try:
        data = await data_service.get_data_for_date_range(vendor, start_date, end_date)
        
        return {
            "success": True,
            "message": f"Found {len(data)} CVE records for {vendor} from {start_date} to {end_date}",
            "data": data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get date range data: {str(e)}")

@app.get("/api/data/all-date-range")
async def get_all_data_for_date_range(start_date: str, end_date: str):
    """Get CVE data for ALL vendors within a date range"""
    try:
        data = await data_service.get_all_data_for_date_range(start_date, end_date)
        
        return {
            "success": True,
            "message": f"Found {len(data)} total CVE records from {start_date} to {end_date}",
            "data": data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get date range data for all vendors: {str(e)}")

@app.get("/api/data/storage-info")
async def get_storage_info():
    """Get storage information and statistics"""
    try:
        vendors = data_service.get_stored_vendors()
        all_files = data_service.get_all_stored_files()
        
        total_size = 0
        for file_info in all_files:
            if os.path.exists(file_info["path"]):
                total_size += os.path.getsize(file_info["path"])
        
        return {
            "success": True,
            "total_files": len(all_files),
            "total_directories": len(vendors),
            "total_size": total_size,
            "vendors": len(vendors)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get storage info: {str(e)}")

@app.get("/api/data/vendors")
async def get_stored_vendors():
    """Get list of vendors with stored data"""
    try:
        vendors = data_service.get_stored_vendors()
        return {
            "success": True,
            "vendors": vendors
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get vendors: {str(e)}")

@app.get("/api/data/vendors-with-counts")
async def get_vendors_with_counts():
    """Get list of vendors with their CVE record counts"""
    try:
        vendors_info = data_service.get_vendors_with_counts()
        return {
            "success": True,
            "vendors": vendors_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get vendor counts: {str(e)}")

@app.get("/api/data/dates")
async def get_dates_for_vendor(vendor: str):
    """Get list of dates with data for a specific vendor"""
    try:
        dates = data_service.get_stored_dates_for_vendor(vendor)
        return {
            "success": True,
            "dates": dates
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get dates: {str(e)}")

@app.get("/api/data/all-dates")
async def get_all_dates():
    """Get list of all dates with stored data"""
    try:
        dates = data_service.get_all_stored_dates()
        return {
            "success": True,
            "dates": dates
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get all dates: {str(e)}")

@app.get("/api/data/exists")
async def check_data_exists(vendor: str, date: str):
    """Check if data exists for a specific vendor and date"""
    try:
        exists = await data_service.data_exists(vendor, date)
        return {
            "success": True,
            "exists": exists
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check data existence: {str(e)}")

@app.delete("/api/data/clear-all")
async def clear_all_data():
    """Clear all stored CVE data"""
    try:
        await data_service.clear_all_data()
        return {
            "success": True,
            "message": "All data cleared successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear data: {str(e)}")

@app.get("/api/stats")
async def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        all_data = await data_service.get_all_stored_data()
        
        # Calculate stats
        total_cves = len(all_data)
        critical_cves = len([item for item in all_data if item.severity == "Critical"])
        high_cves = len([item for item in all_data if item.severity == "High"])
        
        # Recent CVEs (last 7 days)
        recent_date = datetime.now().strftime('%Y-%m-%d')
        recent_cves = len([item for item in all_data if item.publishedDate >= recent_date])
        
        vendors_monitored = len(data_service.get_stored_vendors())
        
        return {
            "success": True,
            "stats": {
                "totalCVEs": total_cves,
                "criticalCVEs": critical_cves,
                "highCVEs": high_cves,
                "recentCVEs": recent_cves,
                "vendorsMonitored": vendors_monitored,
                "lastUpdate": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")

@app.post("/api/cve/improve-urls")
async def improve_cve_urls(request: Request):
    """Improve URLs for existing CVE data by fetching actual references"""
    try:
        body = await request.json()
        vendor = body.get("vendor")
        limit = body.get("limit", 10)  # Limit to prevent overload
        
        if not vendor:
            raise HTTPException(status_code=400, detail="Vendor name is required")
        
        # Get existing data for vendor
        all_data = await data_service.get_all_stored_data()
        vendor_data = [item for item in all_data if item.vendor.lower() == vendor.lower()]
        
        improved_count = 0
        
        # Process limited number of CVEs
        for cve_item in vendor_data[:limit]:
            try:
                # Get enhanced URL using detailed CVE information
                enhanced_url = await cve_service.get_best_vendor_url_enhanced(cve_item.cve, vendor)
                
                # Update URL if it's different and better
                if enhanced_url != cve_item.urlLink and enhanced_url != f"https://www.cve.org/CVERecord?id={cve_item.cve}":
                    old_url = cve_item.urlLink
                    cve_item.urlLink = enhanced_url
                    improved_count += 1
                    print(f"🎯 Enhanced URL for {cve_item.cve}: {old_url} -> {enhanced_url}")
                
            except Exception as e:
                print(f"❌ Failed to enhance URL for {cve_item.cve}: {str(e)}")
                continue
        
        # Save updated data back
        if improved_count > 0:
            # Group by date and save
            from collections import defaultdict
            date_groups = defaultdict(list)
            
            for item in vendor_data:
                # Extract date from publishedDate and convert to proper format
                try:
                    if "-" in item.publishedDate and len(item.publishedDate.split("-")) == 3:
                        date_parts = item.publishedDate.split("-")
                        if len(date_parts[2]) == 2:  # "18-Sep-25" format
                            day, month_str, year = date_parts
                            year = "20" + year
                            month_map = {
                                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                                'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                                'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
                            }
                            month = month_map.get(month_str, '01')
                            date_key = f"{year}-{month}-{day.zfill(2)}"
                        else:
                            date_key = item.publishedDate
                    else:
                        date_key = datetime.now().strftime('%Y-%m-%d')
                        
                    date_groups[date_key].append(item)
                except:
                    date_key = datetime.now().strftime('%Y-%m-%d')
                    date_groups[date_key].append(item)
            
            # Save each date group
            for date_key, items in date_groups.items():
                await data_service.save_data(vendor, date_key, items)
        
        return {
            "success": True,
            "message": f"Improved URLs for {improved_count} CVEs",
            "improved_count": improved_count,
            "processed": min(len(vendor_data), limit)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to improve URLs: {str(e)}")

@app.post("/api/automation/start")
async def start_automation(request: Request):
    """Start automated vendor processing with intelligent rate limiting and optional date range"""
    try:
        body = await request.json()
        vendor_list = body.get("vendors")  # Optional list of specific vendors
        date_from = body.get("dateFrom")   # Optional date range start
        date_to = body.get("dateTo")       # Optional date range end
        
        result = await cve_service.start_automated_vendor_processing(vendor_list, date_from, date_to)
        
        if result["success"]:
            return {
                "success": True,
                "message": result["message"],
                "progress": result.get("progress")
            }
        else:
            raise HTTPException(status_code=400, detail=result["message"])
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start automation: {str(e)}")

@app.get("/api/automation/progress")
async def get_automation_progress():
    """Get current automation progress and status"""
    try:
        result = cve_service.get_automation_progress()
        
        return {
            "success": True,
            "progress": result["progress"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get automation progress: {str(e)}")

@app.post("/api/automation/stop")
async def stop_automation():
    """Stop the automation process"""
    try:
        result = cve_service.stop_automation()
        
        if result["success"]:
            return {
                "success": True,
                "message": result["message"]
            }
        else:
            raise HTTPException(status_code=400, detail=result["message"])
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop automation: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    
    # SSL configuration
    ssl_keyfile = os.getenv("SSL_KEYFILE")
    ssl_certfile = os.getenv("SSL_CERTFILE")
    
    # Check if SSL certificates exist
    if os.path.exists(ssl_keyfile) and os.path.exists(ssl_certfile):
        print(f"🔒 Starting server with HTTPS on port 8000")
        print(f"   SSL Key: {ssl_keyfile}")
        print(f"   SSL Cert: {ssl_certfile}")
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=8000, 
            log_level="info",
            ssl_keyfile=ssl_keyfile,
            ssl_certfile=ssl_certfile
        )
    else:
        print(f"⚠️  SSL certificates not found. Starting with HTTP on port 8000")
        print(f"   Expected key: {ssl_keyfile}")
        print(f"   Expected cert: {ssl_certfile}")
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")