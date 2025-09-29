import os
import json
import aiofiles
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
from models import CVEData, JSONFileContent, JSONFileMetadata, DataStorageInfo

class DataStorageService:
    def __init__(self, data_directory: str = "./data"):
        self.data_dir = Path(data_directory)
        self.vendors_dir = self.data_dir / "vendors"
        self.metadata_dir = self.data_dir / "metadata"
        
        # Create directories
        self.vendors_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        
    def get_vendor_file_path(self, vendor: str) -> Path:
        """Get the file path for a vendor's data"""
        safe_vendor = vendor.replace(" ", "_").replace("/", "_").lower()
        return self.vendors_dir / f"{safe_vendor}.json"
        
    async def save_data(self, vendor: str, date: str, cve_data: List[CVEData]) -> None:
        """Save CVE data for a vendor - merges with existing data"""
        if not cve_data:
            print(f"No CVE data to save for {vendor}")
            return
            
        vendor_file = self.get_vendor_file_path(vendor)
        
        # Load existing data if file exists
        existing_data = []
        if vendor_file.exists():
            existing_data = await self._load_vendor_data(vendor_file)
        
        # Merge new data with existing (deduplication by CVE ID)
        merged_data = self._merge_cve_data(existing_data, cve_data)
        
        # Sort by published date (newest first)
        merged_data.sort(key=lambda x: self._parse_date(x.publishedDate), reverse=True)
        
        # Create vendor file structure
        vendor_data = {
            "vendor": vendor,
            "lastUpdated": datetime.now().isoformat(),
            "totalCVEs": len(merged_data),
            "dataSource": "CVE Details API",
            "cves": [cve.dict() for cve in merged_data]
        }
        
        # Save atomically (write to temp file, then rename)
        temp_file = vendor_file.with_suffix('.tmp')
        try:
            # Clean up existing temp file if it exists
            if temp_file.exists():
                temp_file.unlink()
                
            async with aiofiles.open(temp_file, 'w', encoding='utf-8') as f:
                content = json.dumps(vendor_data, indent=2, ensure_ascii=False)
                await f.write(content)
            
            # Atomic rename - on Windows, need to remove target first
            if vendor_file.exists():
                vendor_file.unlink()
            temp_file.rename(vendor_file)
            print(f"Saved {len(merged_data)} CVE records for {vendor}")
            
        except Exception as e:
            if temp_file.exists():
                temp_file.unlink()  # Clean up temp file
            raise e
        
    async def load_data(self, vendor: str, date: str = None) -> Optional[List[CVEData]]:
        """Load CVE data for a vendor (date parameter kept for backward compatibility)"""
        return await self.load_vendor_data(vendor)
    
    async def load_vendor_data(self, vendor: str) -> List[CVEData]:
        """Load all CVE data for a specific vendor"""
        vendor_file = self.get_vendor_file_path(vendor)
        
        if not vendor_file.exists():
            return []
            
        return await self._load_vendor_data(vendor_file)
    
    async def _load_vendor_data(self, vendor_file: Path) -> List[CVEData]:
        """Internal method to load vendor data from file"""
        try:
            async with aiofiles.open(vendor_file, 'r', encoding='utf-8') as f:
                content = await f.read()
                
            if not content.strip():
                return []
                
            vendor_data = json.loads(content)
            cves = vendor_data.get('cves', [])
            
            # Convert back to CVEData objects
            return [CVEData(**cve) for cve in cves]
            
        except Exception as e:
            print(f"Error loading vendor data from {vendor_file}: {e}")
            return []
    
    def _normalize_date(self, date_str: str) -> str:
        """Convert any date format to YYYY-MM-DD"""
        dt = self._parse_date(date_str)
        return dt.strftime('%Y-%m-%d') if dt != datetime.min else date_str
    
    def _parse_date(self, date_str: str) -> datetime:
        """Parse various date formats to datetime"""
        if not date_str:
            return datetime.min
        
        try:
            # Handle different formats
            if 'T' in date_str:
                return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            elif ' ' in date_str and len(date_str.split(' ')[0].split('-')) == 3:
                return datetime.strptime(date_str.split(' ')[0], '%Y-%m-%d')
            elif '-' in date_str and len(date_str.split('-')) == 3:
                parts = date_str.split('-')
                if len(parts[2]) == 2:  # dd-MMM-yy format
                    return self._parse_short_date(date_str)
                else:  # YYYY-MM-DD format
                    return datetime.strptime(date_str, '%Y-%m-%d')
            else:
                return datetime.min
        except:
            return datetime.min
    
    def _parse_short_date(self, date_str: str) -> datetime:
        """Parse dd-MMM-yy format"""
        parts = date_str.split('-')
        day = int(parts[0])
        month_str = parts[1]
        year = 2000 + int(parts[2])  # Convert to full year
        
        month_map = {
            'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4,
            'May': 5, 'Jun': 6, 'Jul': 7, 'Aug': 8,
            'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
        }
        
        month = month_map.get(month_str, 1)
        return datetime(year, month, day)
    
    def _merge_cve_data(self, existing: List[CVEData], new: List[CVEData]) -> List[CVEData]:
        """Merge CVE data, preferring newer information for duplicates"""
        cve_dict = {}
        
        # Add existing data
        for cve in existing:
            cve_dict[cve.cve] = cve
        
        # Add/update with new data (newer data wins)
        for cve in new:
            if cve.cve in cve_dict:
                # Compare dates to keep most recent
                existing_cve = cve_dict[cve.cve]
                if self._is_newer_cve(cve, existing_cve):
                    cve_dict[cve.cve] = cve
            else:
                cve_dict[cve.cve] = cve
        
        return list(cve_dict.values())
    
    def _is_newer_cve(self, cve1: CVEData, cve2: CVEData) -> bool:
        """Check if cve1 is newer than cve2"""
        try:
            # Compare by updated date first, then published date
            date1 = cve1.updatedDate if hasattr(cve1, 'updatedDate') and cve1.updatedDate else cve1.publishedDate
            date2 = cve2.updatedDate if hasattr(cve2, 'updatedDate') and cve2.updatedDate else cve2.publishedDate
            
            return self._parse_date(date1) > self._parse_date(date2)
        except:
            return True  # Default to keeping new data
            
    async def get_all_stored_data(self) -> List[CVEData]:
        """Get ALL stored CVE data - now much faster!"""
        all_data = []
        vendors = self.get_stored_vendors()
        
        for vendor in vendors:
            vendor_data = await self.load_vendor_data(vendor)
            all_data.extend(vendor_data)
        
        return self._remove_duplicates(all_data)
    
    async def get_all_data_for_date_range(self, date_from: str, date_to: str) -> List[CVEData]:
        """Get ALL CVE data across vendors for a date range - super fast!"""
        all_data = []
        vendors = self.get_stored_vendors()
        
        # Process vendors in parallel for better performance
        import asyncio
        tasks = [
            self.get_data_for_date_range(vendor, date_from, date_to) 
            for vendor in vendors
        ]
        
        vendor_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in vendor_results:
            if isinstance(result, list):
                all_data.extend(result)
            elif isinstance(result, Exception):
                print(f"Error processing vendor: {result}")
        
        return self._remove_duplicates(all_data)
        
    async def get_data_for_date_range(self, vendor: str, date_from: str, date_to: str) -> List[CVEData]:
        """Get CVE data for a vendor within a date range - much faster now!"""
        vendor_data = await self.load_vendor_data(vendor)
        
        if not vendor_data:
            return []
        
        # Filter by date range - check both published and updated dates
        filtered_data = []
        for cve in vendor_data:
            cve_dates = [cve.publishedDate]
            if hasattr(cve, 'updatedDate') and cve.updatedDate:
                cve_dates.append(cve.updatedDate)
            
            # Check if any date falls within range
            for cve_date in cve_dates:
                try:
                    normalized_date = self._normalize_date(cve_date)
                    if date_from <= normalized_date <= date_to:
                        filtered_data.append(cve)
                        break  # Don't add duplicate
                except (ValueError, AttributeError):
                    continue
        
        return filtered_data
        
    def _get_all_files(self) -> List[Dict[str, str]]:
        """Get all stored vendor files information"""
        files = []
        
        if not self.vendors_dir.exists():
            return files
            
        for vendor_file in self.vendors_dir.glob("*.json"):
            if vendor_file.is_file():
                # Convert filename back to vendor name
                vendor_name = vendor_file.stem.replace("_", " ").title()
                files.append({
                    "vendor": vendor_name,
                    "date": "latest",  # Single file per vendor now
                    "path": str(vendor_file.relative_to(self.data_dir))
                })
                            
        return files
        
    def get_stored_vendors(self) -> List[str]:
        """Get list of vendors with stored data"""
        vendors = []
        
        if not self.vendors_dir.exists():
            return vendors
        
        for vendor_file in self.vendors_dir.glob("*.json"):
            if vendor_file.is_file():
                try:
                    # Quick check if file has data
                    with open(vendor_file, 'r', encoding='utf-8') as f:
                        content = json.load(f)
                        if content.get('totalCVEs', 0) > 0:
                            # Convert filename back to vendor name
                            vendor_name = vendor_file.stem.replace("_", " ").title()
                            vendors.append(vendor_name)
                except:
                    continue
        
        return sorted(vendors)
    
    def get_vendors_with_counts(self) -> List[Dict[str, any]]:
        """Get vendors with their CVE record counts"""
        vendors_info = []
        
        if not self.vendors_dir.exists():
            return vendors_info
        
        for vendor_file in self.vendors_dir.glob("*.json"):
            if vendor_file.is_file():
                try:
                    with open(vendor_file, 'r', encoding='utf-8') as f:
                        content = json.load(f)
                        total_records = content.get('totalCVEs', 0)
                        
                    if total_records > 0:
                        vendor_name = vendor_file.stem.replace("_", " ").title()
                        vendors_info.append({
                            "vendor": vendor_name,
                            "totalRecords": total_records,
                            "lastUpdated": content.get('lastUpdated', 'Unknown')
                        })
                except:
                    continue
                    
        return sorted(vendors_info, key=lambda x: x["vendor"])
        
    def get_stored_dates_for_vendor(self, vendor: str) -> List[str]:
        """Get available date range for a vendor (from CVE data)"""
        vendor_file = self.get_vendor_file_path(vendor)
        
        if not vendor_file.exists():
            return []
        
        try:
            with open(vendor_file, 'r', encoding='utf-8') as f:
                content = json.load(f)
                cves = content.get('cves', [])
                
            if not cves:
                return []
            
            # Extract all unique dates from CVE data
            dates = set()
            for cve in cves:
                if cve.get('publishedDate'):
                    try:
                        normalized = self._normalize_date(cve['publishedDate'])
                        dates.add(normalized)
                    except:
                        pass
                if cve.get('updatedDate'):
                    try:
                        normalized = self._normalize_date(cve['updatedDate'])
                        dates.add(normalized)
                    except:
                        pass
            
            return sorted(list(dates))
        except:
            return []
        
    def get_storage_stats(self) -> DataStorageInfo:
        """Get storage statistics"""
        files = self._get_all_files()
        vendors = self.get_stored_vendors()
        
        # Calculate total directory size
        total_size = 0
        total_cves = 0
        
        for vendor_file in self.vendors_dir.glob("*.json"):
            if vendor_file.exists():
                total_size += vendor_file.stat().st_size
                try:
                    with open(vendor_file, 'r', encoding='utf-8') as f:
                        content = json.load(f)
                        total_cves += content.get('totalCVEs', 0)
                except:
                    pass
                
        return DataStorageInfo(
            totalFiles=len(files),
            totalDirectories=2,  # vendors + metadata dirs
            totalSize=total_size,
            vendors=vendors,
            files=files
        )
        
    async def export_all_data(self) -> Dict:
        """Export all stored data as a single JSON structure"""
        all_vendors = {}
        vendors = self.get_stored_vendors()
        
        for vendor in vendors:
            try:
                vendor_file = self.get_vendor_file_path(vendor)
                async with aiofiles.open(vendor_file, 'r', encoding='utf-8') as f:
                    content = await f.read()
                    all_vendors[vendor] = json.loads(content)
            except Exception as e:
                print(f"Error exporting {vendor}: {e}")
                
        return {
            "exported_at": datetime.now().isoformat(),
            "total_vendors": len(all_vendors),
            "vendors": all_vendors
        }
        
    async def import_data(self, import_data: Dict) -> None:
        """Import data from exported JSON structure"""
        vendors_data = import_data.get("vendors", {})
        
        for vendor, vendor_data in vendors_data.items():
            try:
                vendor_file = self.get_vendor_file_path(vendor)
                async with aiofiles.open(vendor_file, 'w', encoding='utf-8') as f:
                    content = json.dumps(vendor_data, indent=2, ensure_ascii=False)
                    await f.write(content)
            except Exception as e:
                print(f"Error importing {vendor}: {e}")
                
    async def clear_all_data(self) -> None:
        """Clear all stored data"""
        import shutil
        
        if self.vendors_dir.exists():
            shutil.rmtree(self.vendors_dir)
        if self.metadata_dir.exists():
            shutil.rmtree(self.metadata_dir)
            
        # Recreate directories
        self.vendors_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        
    def _remove_duplicates(self, data: List[CVEData]) -> List[CVEData]:
        """Remove duplicate CVE entries by CVE ID"""
        seen = set()
        unique_data = []
        
        for item in data:
            if item.cve and item.cve not in seen:
                seen.add(item.cve)
                unique_data.append(item)
                
        return unique_data

    def get_all_stored_files(self) -> List[Dict[str, str]]:
        """Get list of all stored CVE files"""
        return self._get_all_files()

    def get_all_stored_dates(self) -> List[str]:
        """Get all unique dates from CVE data across all vendors"""
        dates = set()
        vendors = self.get_stored_vendors()
        
        for vendor in vendors:
            vendor_dates = self.get_stored_dates_for_vendor(vendor)
            dates.update(vendor_dates)
        
        return sorted(list(dates))

    async def data_exists(self, vendor: str, date: str = None) -> bool:
        """Check if data exists for a specific vendor"""
        vendor_file = self.get_vendor_file_path(vendor)
        return vendor_file.exists()