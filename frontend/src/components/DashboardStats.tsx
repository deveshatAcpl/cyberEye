import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  AlertTriangle, 
  TrendingUp, 
  Database,
  Clock,
  Eye
} from "lucide-react";
import { CVEApiService } from "@/services/cveApi";
import { DataStorage } from "@/utils/dataStorage";
import { VENDORS } from "@/types/cve";

interface DashboardStatsProps {}

export function DashboardStats({}: DashboardStatsProps) {
  const [stats, setStats] = useState({
    totalCVEs: 0,
    criticalCVEs: 0,
    recentCVEs: 0,
    vendorsMonitored: VENDORS.length,
    lastUpdate: new Date().toISOString(),
    activeFetches: 0
  });
  const [loading, setLoading] = useState(true);

  const apiService = CVEApiService.getInstance();
  const dataStorage = DataStorage.getInstance();

  useEffect(() => {
    loadRealStats();
    
    // Update stats every 30 seconds
    const interval = setInterval(loadRealStats, 30000);
    
    // Subscribe to active fetch count changes
    const unsubscribe = apiService.onActiveCountChange((count) => {
      setStats(prev => ({ ...prev, activeFetches: count }));
    });
    
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const loadRealStats = async () => {
    try {
      setLoading(true);
      
      // Get stored data for stats
      const storedData = await dataStorage.getAllStoredData();
      const currentWeek = new Date();
      currentWeek.setDate(currentWeek.getDate() - 7);
      
      // Get recent CVEs from API for the last week
      const recentResponse = await apiService.searchVulnerabilities({
        publishDateStart: currentWeek.toISOString().split('T')[0],
        resultsPerPage: 50
      });

      const recentCVEs = recentResponse.result?.length || 0;
      const criticalCVEs = recentResponse.result?.filter(cve => 
        apiService.mapSeverity(cve.cvss3_base_score || cve.cvss2_base_score) === "Critical"
      ).length || 0;

      setStats(prev => ({
        ...prev,
        totalCVEs: storedData.length + recentCVEs,
        criticalCVEs: criticalCVEs,
        recentCVEs: recentCVEs,
        vendorsMonitored: VENDORS.length,
        lastUpdate: new Date().toISOString(),
        // activeFetches is managed by the subscription
      }));

    } catch (error) {
      console.error("Failed to load real stats:", error);
      // Fallback to stored data only
      const storedData = await dataStorage.getAllStoredData();
      setStats(prev => ({
        ...prev,
        totalCVEs: storedData.length,
        criticalCVEs: storedData.filter(cve => cve.severity === "Critical").length,
        lastUpdate: new Date().toISOString()
      }));
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Total CVEs",
      value: loading ? "..." : stats.totalCVEs.toLocaleString(),
      description: "Vulnerabilities tracked",
      icon: Shield,
      color: "bg-info/10 text-info border-info/20"
    },
    {
      title: "Critical CVEs",
      value: loading ? "..." : stats.criticalCVEs.toLocaleString(),
      description: "Require immediate attention",
      icon: AlertTriangle,
      color: "bg-critical/10 text-critical border-critical/20"
    },
    {
      title: "Recent CVEs",
      value: loading ? "..." : stats.recentCVEs.toLocaleString(),
      description: "Last 7 days",
      icon: TrendingUp,
      color: "bg-warning/10 text-warning border-warning/20"
    },
    {
      title: "Vendors Monitored",
      value: stats.vendorsMonitored.toString(),
      description: "Active vendor tracking",
      icon: Database,
      color: "bg-success/10 text-success border-success/20"
    },
    {
      title: "Last Update",
      value: new Date(stats.lastUpdate).toLocaleTimeString(),
      description: "Real-time sync",
      icon: Clock,
      color: "bg-primary/10 text-primary border-primary/20"
    },
    {
      title: "Active Fetches",
      value: stats.activeFetches.toString(),
      description: "Background operations",
      icon: Eye,
      color: stats.activeFetches > 0 ? "bg-warning/10 text-warning border-warning/20" : "bg-muted/10 text-muted-foreground border-muted/20"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {statCards.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className={`${stat.color} transition-all duration-300 hover:shadow-glow`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <Icon className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
              {stat.title === "Active Fetches" && stats.activeFetches > 0 && (
                <Badge variant="secondary" className="mt-1 pulse-red">
                  Processing
                </Badge>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}