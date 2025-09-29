# CyberEye

**CVE Intelligence Automation Platform** - A comprehensive security vulnerability tracking and analysis dashboard that provides real-time CVE intelligence, automated vendor data processing, and advanced search capabilities for cybersecurity professionals.

## Features

### 🔍 Core Intelligence Features
- **Real-time CVE Search Engine** - Advanced search and filtering across multiple vulnerability databases
- **Automated Vendor Processing** - Batch processing of CVE data for major technology vendors (50+ vendors supported)
- **CVE Data Intelligence** - Comprehensive vulnerability analysis with severity mapping and risk assessment
- **URL Improvement System** - Automated enhancement of CVE reference URLs for better tracking

### 📊 Dashboard & Visualization
- **Interactive Dashboard** - Modern, responsive web interface with real-time statistics
- **File System Viewer** - Visual representation of stored CVE data with hierarchical browsing
- **Terminal Logs** - Real-time API and system logging with filterable output
- **Error Monitoring** - Dedicated error tracking and debugging interface

### 🛠 Data Management
- **JSON Data Storage** - Structured storage system for CVE records with metadata
- **Import/Export Functionality** - Bulk data operations with JSON format support
- **Automated Data Migration** - Tools for upgrading and migrating stored data
- **Storage Analytics** - File system statistics and storage optimization

### 🔗 API Integration
- **CVE Details API Integration** - Official CVE database connectivity
- **RESTful Backend API** - Comprehensive REST endpoints for all operations
- **Rate Limiting & Token Management** - Smart API usage optimization
- **CORS Support** - Cross-origin resource sharing for web applications

## Project Structure

```
cyberEye/
├── backend/                    # Python FastAPI backend
│   ├── main.py                # Main FastAPI application entry point
│   ├── models.py              # Pydantic data models and schemas
│   ├── cve_service.py         # CVE API service layer
│   ├── data_service.py        # Data storage and management
│   ├── requirements.txt       # Python dependencies
│   ├── .env                   # Environment configuration
│   └── README.md              # Backend-specific documentation
├── frontend/                  # React TypeScript frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── Dashboard.tsx  # Main dashboard component
│   │   │   ├── CVESearchEngine.tsx    # Search interface
│   │   │   ├── CVEIntelligence.tsx    # Intelligence dashboard
│   │   │   ├── FileSystemViewer.tsx   # Data browser
│   │   │   └── CyberEyeLogo.tsx       # Brand component
│   │   ├── services/          # API service clients
│   │   ├── types/             # TypeScript type definitions
│   │   ├── utils/             # Utility functions
│   │   └── hooks/             # Custom React hooks
│   ├── package.json           # Node.js dependencies
│   ├── vite.config.ts         # Vite build configuration
│   └── tailwind.config.ts     # Tailwind CSS configuration
└── README.md                  # This file
```

## Requirements

### Backend Requirements
- **Python**: 3.12+ (tested with Python 3.12.3)
- **Dependencies**: FastAPI, Uvicorn, Pydantic 2.0+, httpx, aiofiles
- **Environment**: Linux/macOS/Windows with Python support
- **API Access**: CVE Details API token (required for data fetching)

### Frontend Requirements
- **Node.js**: 20.19+ (tested with Node.js 20.19.5)
- **npm**: 10.8+ (tested with npm 10.8.2)
- **Browser**: Modern browsers supporting ES2020+ features
- **Dependencies**: React 18, TypeScript 5, Vite 5, Tailwind CSS 3

### System Requirements
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free space for CVE data storage
- **Network**: Internet connection for CVE API access
- **Ports**: 8000 (backend), 8080 (frontend development)

## Installation

### Prerequisites
1. Ensure Python 3.12+ and Node.js 20+ are installed
2. Obtain a CVE Details API token from [cvedetails.com](https://www.cvedetails.com/api/)

### Backend Setup
```bash
# Clone the repository
git clone https://github.com/deveshatAcpl/cyberEye.git
cd cyberEye/backend

# Install Python dependencies
pip install -r requirements.txt

# Create environment configuration
cp .env.example .env
# Edit .env and add your CVE_API_TOKEN

# Start the backend server
python main.py
```

The backend API will be available at `http://localhost:8000`

### Frontend Setup
```bash
# Navigate to frontend directory
cd ../frontend

# Install Node.js dependencies
npm install

# Start the development server
npm run dev
```

The frontend application will be available at `http://localhost:8080`

### Production Build
```bash
# Build frontend for production
cd frontend
npm run build

# Serve built files (optional, for testing)
npm run preview
```

## Usage

### Starting the Application
1. **Start Backend**: `cd backend && python main.py`
2. **Start Frontend**: `cd frontend && npm run dev`
3. **Access Dashboard**: Open `http://localhost:8080` in your browser

### Basic Operations

#### CVE Search
- Navigate to the "Search" tab in the dashboard
- Use filters to narrow down results by vendor, severity, date range
- Export search results as JSON for further analysis

#### Automated Processing
- Access the "Intelligence" tab for vendor automation
- Select vendors for batch processing
- Monitor progress through real-time status updates
- Review completed data in the File System viewer

#### Data Management
- Use the "File System" tab to browse stored CVE data
- Import/export data using the provided JSON format
- Monitor storage statistics and cleanup old data

### API Endpoints
The backend provides these key endpoints:
- `GET /api/cve/search` - Search CVE vulnerabilities
- `GET /api/cve/test` - Test API connection
- `GET /api/data/list` - List stored JSON files
- `POST /api/data/save` - Save CVE data
- `GET /api/data/export` - Export all data
- `POST /api/data/import` - Import data from JSON

Full API documentation is available at `http://localhost:8000/docs` when the backend is running.

## Contributing

We welcome contributions to CyberEye! Here's how you can help:

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Set up both backend and frontend development environments
4. Make your changes with appropriate tests
5. Submit a pull request with a detailed description

### Code Standards
- **Python**: Follow PEP 8, use type hints, write docstrings
- **TypeScript**: Use strict TypeScript, follow React best practices
- **Testing**: Add tests for new features and bug fixes
- **Documentation**: Update README and inline documentation

### Reporting Issues
- Use GitHub Issues for bug reports and feature requests
- Include detailed reproduction steps for bugs
- Provide system information and error logs when applicable

### Feature Requests
- Check existing issues before creating new ones
- Provide clear use cases and expected behavior
- Consider contributing the feature yourself!

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### MIT License Summary
- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Private use allowed
- ❌ No warranty provided
- ❌ No liability assumed

---

**Made with ❤️ for the cybersecurity community**

For support, feature requests, or contributions, please visit our [GitHub repository](https://github.com/deveshatAcpl/cyberEye).