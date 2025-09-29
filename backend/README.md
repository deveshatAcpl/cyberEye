# CVE Dashboard - Python Backend

## Setup
1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Create `.env` file with your API key:
```
CVE_API_TOKEN=f640ec21d2347c50a68e56cc9cd2a1a7abc99b12.eyJzdWIiOjE0NDQ3LCJpYXQiOjE3NTg2ODY4MzksImV4cCI6MjAxODk5NTIwMCwia2lkIjoxLCJjIjoicmZGRWNXRjBaaXhTOXFuNTFsNTlHOFFVK2NJZURXeG9tc2ZlTFVodWliRzVpMGJxNWZ5bFZrYzBkVkwrUFkwalNHVThcL0s4ZFpRPT0ifQ==
```

3. Run the server:
```bash
python main.py
```

The API will be available at `http://localhost:8000`

## Endpoints
- GET `/api/cve/search` - Search CVE vulnerabilities
- GET `/api/cve/test` - Test API connection
- GET `/api/data/list` - List stored JSON files
- POST `/api/data/save` - Save CVE data
- GET `/api/data/export` - Export all data
- POST `/api/data/import` - Import data from JSON
- DELETE `/api/data/clear` - Clear all stored data
- GET `/api/logs` - Get API logs