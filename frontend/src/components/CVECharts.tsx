import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer
} from "recharts";
import { CVEData } from "@/types/cve";

interface CVEChartsProps {
  data: CVEData[];
}

export function CVECharts({ data }: CVEChartsProps) {
  const chartData = useMemo(() => {
    // Severity distribution
    const severityCount = data.reduce((acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const severityData = Object.entries(severityCount).map(([severity, count]) => ({
      severity,
      count,
      fill: severity === "Critical" ? "#dc2626" :
            severity === "High" ? "#ea580c" :
            severity === "Medium" ? "#d97706" :
            "#16a34a"
    }));

    // Vendor distribution (top 10)
    const vendorCount = data.reduce((acc, item) => {
      acc[item.vendor] = (acc[item.vendor] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const vendorData = Object.entries(vendorCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([vendor, count]) => ({
        vendor: vendor.length > 15 ? vendor.substring(0, 15) + "..." : vendor,
        count
      }));

    // Timeline data (by month)
    const timelineCount = data.reduce((acc, item) => {
      if (item.publishedDate) {
        const month = item.publishedDate.substring(0, 7); // YYYY-MM
        acc[month] = (acc[month] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const timelineData = Object.entries(timelineCount)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({
        month,
        count
      }));

    return { severityData, vendorData, timelineData };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-card/30 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-foreground">No Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Apply filters to view charts
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {/* Severity Distribution */}
      <Card className="bg-card/30 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground">CVE Severity Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData.severityData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="count"
                label={({ severity, count }) => `${severity}: ${count}`}
              >
                {chartData.severityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  color: 'hsl(var(--foreground))'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Vendors */}
      <Card className="bg-card/30 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground">Top Affected Vendors</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData.vendorData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                type="number" 
                tick={{ fill: 'hsl(var(--foreground))' }}
              />
              <YAxis 
                type="category" 
                dataKey="vendor" 
                width={80}
                tick={{ fill: 'hsl(var(--foreground))' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  color: 'hsl(var(--foreground))'
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card className="bg-card/30 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground">CVE Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData.timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="month" 
                tick={{ fill: 'hsl(var(--foreground))' }}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--foreground))' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  color: 'hsl(var(--foreground))'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}