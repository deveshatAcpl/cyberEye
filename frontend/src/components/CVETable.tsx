import { useState } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink, 
  ArrowUpDown,
  Download
} from "lucide-react";
import { CVEData } from "@/types/cve";
import { formatDate } from "@/lib/utils";

interface CVETableProps {
  data: CVEData[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function CVETable({ data, currentPage, totalPages, onPageChange }: CVETableProps) {
  const [sortField, setSortField] = useState<keyof CVEData>("publishedDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: keyof CVEData) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "Critical":
        return "severity-critical";
      case "High":
        return "severity-high";
      case "Medium":
        return "severity-medium";
      case "Low":
        return "severity-low";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const exportToCSV = () => {
    const headers = [
      "Sr. No.",
      "Vendor",
      "Security Advisories", 
      "Published Date",
      "Updated Date",
      "CVE",
      "Products Affected",
      "Severity",
      "URL Link",
      "SAN Release Date",
      "Implementation Date",
      "Patch Deadline",
      "Implementation Targets"
    ];

    const csvContent = [
      headers.join(","),
      ...data.map(row => [
        row.srNo,
        `"${row.vendor}"`,
        `"${row.securityAdvisories.replace(/"/g, '""')}"`,
        row.publishedDate,
        row.updatedDate || "",
        row.cve,
        `"${row.productsAffected.join("; ")}"`,
        row.severity,
        row.urlLink,
        row.sanReleaseDate,
        row.implementationDate,
        row.patchDeadline,
        row.implementationTargets
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `cybereye_cve_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground">
          No CVE data found. Apply filters and submit to fetch data.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Export Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={exportToCSV}
          className="border-border hover:bg-secondary"
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border bg-card/30 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-muted/50">
                <TableHead className="w-16 text-foreground font-medium">Sr.</TableHead>
                <TableHead 
                  className="cursor-pointer text-foreground font-medium hover:text-primary"
                  onClick={() => handleSort("vendor")}
                >
                  <div className="flex items-center gap-1">
                    Vendor
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="min-w-[300px] text-foreground font-medium">
                  Security Advisories
                </TableHead>
                <TableHead 
                  className="cursor-pointer text-foreground font-medium hover:text-primary"
                  onClick={() => handleSort("publishedDate")}
                >
                  <div className="flex items-center gap-1">
                    Published
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer text-foreground font-medium hover:text-primary"
                  onClick={() => handleSort("updatedDate")}
                >
                  <div className="flex items-center gap-1">
                    Updated
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer text-foreground font-medium hover:text-primary"
                  onClick={() => handleSort("cve")}
                >
                  <div className="flex items-center gap-1">
                    CVE
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="text-foreground font-medium">Products</TableHead>
                <TableHead 
                  className="cursor-pointer text-foreground font-medium hover:text-primary"
                  onClick={() => handleSort("severity")}
                >
                  <div className="flex items-center gap-1">
                    Severity
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="text-foreground font-medium">URL</TableHead>
                <TableHead className="text-foreground font-medium">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, index) => (
                <TableRow 
                  key={row.cve || index} 
                  className="border-border hover:bg-accent/50 transition-colors"
                >
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {row.srNo}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {row.vendor}
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    <div className="max-w-md">
                      <div className="truncate" title={row.securityAdvisories}>
                        {row.securityAdvisories}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-mono text-foreground">
                    {formatDate(row.publishedDate)}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-foreground">
                    {row.updatedDate ? formatDate(row.updatedDate) : "-"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      {row.cve}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    <div className="max-w-xs">
                      <div className="truncate" title={row.productsAffected.join(", ")}>
                        {row.productsAffected.join(", ")}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getSeverityColor(row.severity)}>
                      {row.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.urlLink ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(row.urlLink, "_blank")}
                        className="text-primary hover:text-primary-hover"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.implementationTargets === "Pass" ? "default" :
                        row.implementationTargets === "Fail" ? "destructive" :
                        "secondary"
                      }
                    >
                      {row.implementationTargets}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="border-border hover:bg-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="border-border hover:bg-secondary"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}