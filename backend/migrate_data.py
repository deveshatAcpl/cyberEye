#!/usr/bin/env python3
"""
Migration script to convert from date-folder structure to single JSON per vendor
Run this to migrate existing CVE data to the new storage format
"""

import os
import json
import asyncio
from pathlib import Path
from datetime import datetime
from data_service import DataStorageService
from models import CVEData

async def migrate_data():
    """Migrate existing date-folder structure to single JSON per vendor"""
    
    # Initialize services
    old_data_dir = Path("./data/data")  # Old structure location
    new_service = DataStorageService("./data")  # New structure
    
    if not old_data_dir.exists():
        print("No old data directory found. Nothing to migrate.")
        return
    
    print("🔄 Starting migration from date-folder structure to single JSON per vendor...")
    
    migrated_vendors = 0
    total_cves = 0
    
    # Process each vendor directory
    for vendor_dir in old_data_dir.iterdir():
        if not vendor_dir.is_dir():
            continue
            
        vendor_name = vendor_dir.name
        print(f"\n📁 Processing vendor: {vendor_name}")
        
        all_vendor_cves = []
        
        # Collect all CVEs from all date folders for this vendor
        for date_dir in vendor_dir.iterdir():
            if not date_dir.is_dir():
                continue
                
            san_report_file = date_dir / "SanReport.json"
            if not san_report_file.exists():
                continue
            
            try:
                with open(san_report_file, 'r', encoding='utf-8') as f:
                    file_content = json.load(f)
                
                # Extract CVE data
                if 'data' in file_content:
                    cve_list = file_content['data']
                elif 'cves' in file_content:
                    cve_list = file_content['cves']
                else:
                    # Assume the whole file is CVE data
                    cve_list = file_content if isinstance(file_content, list) else []
                
                # Convert to CVEData objects
                for cve_dict in cve_list:
                    try:
                        cve_obj = CVEData(**cve_dict)
                        all_vendor_cves.append(cve_obj)
                    except Exception as e:
                        print(f"  ⚠️  Error processing CVE {cve_dict.get('cve', 'unknown')}: {e}")
                        continue
                
                print(f"  ✅ Loaded {len(cve_list)} CVEs from {date_dir.name}")
                
            except Exception as e:
                print(f"  ❌ Error reading {san_report_file}: {e}")
                continue
        
        if all_vendor_cves:
            # Save using new service (this will automatically merge and deduplicate)
            await new_service.save_data(vendor_name, datetime.now().strftime('%Y-%m-%d'), all_vendor_cves)
            
            migrated_vendors += 1
            total_cves += len(all_vendor_cves)
            print(f"  🎉 Migrated {len(all_vendor_cves)} CVEs for {vendor_name}")
        else:
            print(f"  📭 No CVEs found for {vendor_name}")
    
    print(f"\n🎯 Migration Summary:")
    print(f"   📊 Migrated {migrated_vendors} vendors")
    print(f"   📋 Total CVEs migrated: {total_cves}")
    print(f"   📁 New storage location: ./data/vendors/")
    print(f"\n✅ Migration completed successfully!")
    
    # Display new structure
    print(f"\n📂 New file structure:")
    vendors_dir = Path("./data/vendors")
    if vendors_dir.exists():
        for vendor_file in vendors_dir.glob("*.json"):
            try:
                with open(vendor_file, 'r', encoding='utf-8') as f:
                    content = json.load(f)
                    cve_count = content.get('totalCVEs', 0)
                    last_updated = content.get('lastUpdated', 'Unknown')
                    print(f"   📄 {vendor_file.name}: {cve_count} CVEs (Updated: {last_updated[:19]})")
            except:
                print(f"   📄 {vendor_file.name}: Error reading file")

async def cleanup_old_data():
    """Optional: Remove old data structure after successful migration"""
    import shutil
    
    old_data_dir = Path("./data/data")
    if old_data_dir.exists():
        backup_dir = Path("./data/backup_old_structure")
        
        print(f"\n🗂️  Moving old data structure to backup folder...")
        if backup_dir.exists():
            shutil.rmtree(backup_dir)
        
        shutil.move(str(old_data_dir), str(backup_dir))
        print(f"   ✅ Old data moved to: {backup_dir}")
        print(f"   🗑️  You can delete the backup folder if migration looks good")

async def main():
    """Main migration function"""
    print("🚀 CVE Data Migration Tool")
    print("=" * 50)
    
    # Run migration
    await migrate_data()
    
    # Ask if user wants to cleanup
    response = input("\n🤔 Do you want to move old data to backup folder? (y/N): ").lower()
    if response in ['y', 'yes']:
        await cleanup_old_data()
    else:
        print("📁 Old data structure preserved in ./data/data/")
    
    print("\n🎉 All done! You can now delete this migration script.")

if __name__ == "__main__":
    asyncio.run(main())