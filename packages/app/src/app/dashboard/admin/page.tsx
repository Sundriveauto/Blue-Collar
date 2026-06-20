"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Users,
  Briefcase,
  Eye,
  MessageSquare,
  Star,
  TrendingUp,
  TrendingDown,
  Download,
  DollarSign,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { formatDate } from "@/lib/utils";
import { AdminDashboardSkeleton } from "@/components/Skeleton";
import type { PlatformAnalytics } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/");
      return;
    }

    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`${API}/analytics/platform`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? localStorage.getItem("bc_token")}` },
        });

        if (!res.ok) throw new Error("Failed to fetch analytics");

        const json = await res.json();
        setData(json.data);
      } catch (error) {
        console.error("[AdminDashboard] error:", error);
        toast({
          title: "Error",
          description: "Failed to load dashboard analytics",
          type: "error",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [user, router, toast]);

  const handleExportCsv = () => {
    const token = localStorage.getItem("token") ?? localStorage.getItem("bc_token");
    if (!token) return;
    const link = document.createElement("a");
    link.href = `${API}/analytics/export/platform`;
    link.setAttribute("download", "platform-analytics.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!user || user.role !== "admin") return null;
  if (isLoading) return <AdminDashboardSkeleton />;
  if (!data) return <div className="p-8 text-center">Failed to load analytics</div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Briefcase size={20} />}
          label="Total Workers"
          value={data.overview.totalWorkers}
          sub={`${data.overview.activeWorkers} active`}
        />
        <StatCard
          icon={<Users size={20} />}
          label="Total Users"
          value={data.overview.totalUsers}
          sub={`${data.overview.totalCurators} curators`}
        />
        <StatCard
          icon={<Eye size={20} />}
          label="Profile Views"
          value={data.engagement.totalViews}
          sub={`${data.engagement.viewsThisMonth.toLocaleString()} this month`}
        />
        <StatCard
          icon={<DollarSign size={20} />}
          label="Total Tips"
          value={`${data.revenue.totalTips.toLocaleString()} XLM`}
          sub={`${data.revenue.totalTipCount} transactions`}
        />
      </div>

      {/* Growth Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <GrowthCard
          label="Workers This Month"
          value={data.growth.workersThisMonth}
          pct={data.growth.workerGrowthPct}
        />
        <GrowthCard
          label="Users This Month"
          value={data.growth.usersThisMonth}
          pct={data.growth.userGrowthPct}
        />
        <StatCard
          icon={<Star size={20} />}
          label="Reviews"
          value={data.engagement.totalReviews}
          sub={`${data.engagement.reviewsThisMonth} this month`}
        />
        <StatCard
          icon={<MessageSquare size={20} />}
          label="Contact Requests"
          value={data.engagement.totalContacts}
          sub={`${data.engagement.contactsThisMonth} this month`}
        />
      </div>

      {/* Growth Trends Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">User Growth (6 months)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.trends.userGrowth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} name="New Users" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Worker Growth (6 months)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.trends.workerGrowth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#16a34a" strokeWidth={2} name="New Workers" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Categories Chart */}
      <div className="bg-white rounded-lg border p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Categories</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.topCategories}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Workers */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Worker Registrations</h2>
          <div className="space-y-3">
            {data.recentWorkers.length > 0 ? (
              data.recentWorkers.map((worker) => (
                <div key={worker.id} className="flex items-start justify-between border-b pb-3 last:border-b-0">
                  <div>
                    <p className="font-medium text-gray-900">{worker.name}</p>
                    <p className="text-sm text-gray-500">{worker.category.name}</p>
                  </div>
                  <p className="text-xs text-gray-400">{formatDate(new Date(worker.createdAt))}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400">No recent registrations</p>
            )}
          </div>
        </div>

        {/* Recent Users */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent User Signups</h2>
          <div className="space-y-3">
            {data.recentUsers.length > 0 ? (
              data.recentUsers.map((u) => (
                <div key={u.id} className="flex items-start justify-between border-b pb-3 last:border-b-0">
                  <div>
                    <p className="font-medium text-gray-900">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="text-sm text-gray-500">{u.email}</p>
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                      {u.role}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{formatDate(new Date(u.createdAt))}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400">No recent signups</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        {icon}
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>
      <p className="text-3xl font-bold text-gray-900 mt-1">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function GrowthCard({
  label,
  value,
  pct,
}: {
  label: string;
  value: number;
  pct: number;
}) {
  const isPositive = pct >= 0;
  return (
    <div className="bg-white rounded-lg border p-6">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <div className="flex items-end gap-2 mt-2">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        <span
          className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
            isPositive ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
          }`}
        >
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(pct)}%
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-1">vs last month</p>
    </div>
  );
}
