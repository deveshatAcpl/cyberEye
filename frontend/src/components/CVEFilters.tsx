import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { FilterState, VENDORS } from "@/types/cve";
import { CalendarIcon, Search, X } from "lucide-react";
import { format } from "date-fns";

interface CVEFiltersProps {
  onFilterSubmit: (filters: FilterState) => void;
  loading?: boolean;
}

export function CVEFilters({ onFilterSubmit, loading = false }: CVEFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    vendors: [],
    dateFrom: "",
    dateTo: "",
    severity: [],
    searchTerm: ""
  });

  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);

  const severityOptions = ["Critical", "High", "Medium", "Low"];

  const handleVendorChange = (vendor: string, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      vendors: checked 
        ? [...prev.vendors, vendor]
        : prev.vendors.filter(v => v !== vendor)
    }));
  };

  const handleSelectAllVendors = () => {
    setFilters(prev => ({
      ...prev,
      vendors: prev.vendors.includes("All") ? [] : ["All"]
    }));
  };

  const handleSeverityChange = (severity: string, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      severity: checked 
        ? [...prev.severity, severity]
        : prev.severity.filter(s => s !== severity)
    }));
  };

  const handleDateFromSelect = (date: Date | undefined) => {
    if (date) {
      setFilters(prev => ({
        ...prev,
        dateFrom: format(date, "yyyy-MM-dd")
      }));
    }
    setDateFromOpen(false);
  };

  const handleDateToSelect = (date: Date | undefined) => {
    if (date) {
      setFilters(prev => ({
        ...prev,
        dateTo: format(date, "yyyy-MM-dd")
      }));
    }
    setDateToOpen(false);
  };

  const handleSubmit = () => {
    onFilterSubmit(filters);
  };

  const clearFilters = () => {
    setFilters({
      vendors: [],
      dateFrom: "",
      dateTo: "",
      severity: [],
      searchTerm: ""
    });
  };

  return (
    <div className="space-y-6">
      {/* Vendor Selection */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-foreground">Vendors</Label>
        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            variant={filters.vendors.includes("All") ? "default" : "outline"}
            size="sm"
            onClick={handleSelectAllVendors}
            className="text-xs"
          >
            All Vendors
          </Button>
          {filters.vendors.filter(v => v !== "All").map(vendor => (
            <Badge
              key={vendor}
              variant="secondary"
              className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => handleVendorChange(vendor, false)}
            >
              {vendor} <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
        </div>
        
        <Select onValueChange={(value) => handleVendorChange(value, true)}>
          <SelectTrigger className="bg-input border-border">
            <SelectValue placeholder="Select vendors to monitor" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {VENDORS.filter(vendor => !filters.vendors.includes(vendor)).map(vendor => (
              <SelectItem key={vendor} value={vendor}>
                {vendor}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">From Date</Label>
          <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-start text-left font-normal bg-input border-border"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateFrom ? filters.dateFrom : "Select start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                onSelect={handleDateFromSelect}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">To Date</Label>
          <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-start text-left font-normal bg-input border-border"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateTo ? filters.dateTo : "Select end date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                onSelect={handleDateToSelect}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Severity Filter */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-foreground">Severity</Label>
        <div className="flex flex-wrap gap-3">
          {severityOptions.map(severity => (
            <div key={severity} className="flex items-center space-x-2">
              <Checkbox
                id={severity}
                checked={filters.severity.includes(severity)}
                onCheckedChange={(checked) => 
                  handleSeverityChange(severity, checked as boolean)
                }
              />
              <Label 
                htmlFor={severity} 
                className={`text-sm cursor-pointer ${
                  severity === "Critical" ? "text-critical" :
                  severity === "High" ? "text-high" :
                  severity === "Medium" ? "text-medium" :
                  "text-low"
                }`}
              >
                {severity}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Search Term */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">Search CVE / Product</Label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search CVE IDs, products, or descriptions..."
            value={filters.searchTerm}
            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
            className="pl-10 bg-input border-border"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button 
          onClick={handleSubmit}
          disabled={loading}
          className="bg-primary hover:bg-primary-hover text-primary-foreground"
        >
          {loading ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
              Fetching...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Submit Query
            </>
          )}
        </Button>
        
        <Button 
          variant="outline" 
          onClick={clearFilters}
          disabled={loading}
          className="border-border hover:bg-secondary"
        >
          Clear Filters
        </Button>
      </div>
    </div>
  );
}