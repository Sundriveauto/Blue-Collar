"use client";

import { useEffect, useState, useCallback } from "react";
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
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { formatDate } from "@/lib/utils";
import { AdminDashboardSkeleton } from "@/components/Skeleton";
import type { Category } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";
const TOKEN_KEY = "bc_token";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  createdAt: string;
  verified?: boolean;
}

type Tab = "overview" | "users" | "categories";

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  // Users tab state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMeta, setUsersMeta] = useState<{ page: number; pages: number } | null>(null);
  const [usersPage, setUsersPage] = useState(1);

  // Categories tab state
  const [categories, setCategories] = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);

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
        const res = await fetch(`${API}/admin/stats`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("Failed to fetch stats");
        const json = await res.json();
        setStats(json.data);
      } catch {
        toast("Failed to load dashboard stats", "error");
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
  const fetchUsers = useCallback(async (page: number) => {
    setUsersLoading(true);
    try {
      const res = await fetch(`${API}/admin/users?page=${page}&limit=20`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setUsers(json.data);
      setUsersMeta(json.meta ?? null);
    } catch {
      toast("Failed to load users", "error");
    } finally {
      setUsersLoading(false);
    }
  }, [toast]);

  const fetchCategories = useCallback(async () => {
    setCatsLoading(true);
    try {
      const res = await fetch(`${API}/categories`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setCategories(json.data);
    } catch {
      toast("Failed to load categories", "error");
    } finally {
      setCatsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (tab === "users" && users.length === 0) fetchUsers(1);
    if (tab === "categories" && categories.length === 0) fetchCategories();
  }, [tab, users.length, categories.length, fetchUsers, fetchCategories]);

  if (!user || user.role !== "admin") return null;
  if (isLoading) return <AdminDashboardSkeleton />;
  if (!stats) return <div className="p-8 text-center text-gray-500">Failed to load stats</div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">Admin Dashboard</h1>

      {/* Tabs */}
      <div className="mb-8 flex gap-1 border-b">
        {(["overview", "users", "categories"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab stats={stats} />
      )}

      {tab === "users" && (
        <UsersTab
          users={users}
          loading={usersLoading}
          meta={usersMeta}
          page={usersPage}
          onPageChange={(p) => {
            setUsersPage(p);
            fetchUsers(p);
          }}
        />
      )}

      {tab === "categories" && (
        <CategoriesTab categories={categories} loading={catsLoading} />
      )}
    </div>
  );
}

function OverviewTab({ stats }: { stats: Stats }) {
  return (
    <>
      {/* Stat Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Workers" value={stats.totalWorkers} />
        <StatCard label="Active Workers" value={stats.activeWorkers} />
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Total Curators" value={stats.totalCurators} />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatCard label="Workers This Month" value={stats.workersThisMonth} />
        <StatCard label="Users This Month" value={stats.usersThisMonth} />
      </div>

      {/* Top Categories Chart */}
      <div className="mb-8 rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Categories</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.topCategories}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Worker Registrations</h2>
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

        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent User Signups</h2>
          <div className="space-y-3">
            {data.recentUsers.length > 0 ? (
              data.recentUsers.map((u) => (
            {stats.recentUsers.length > 0 ? (
              stats.recentUsers.map((u) => (
                <div key={u.id} className="flex items-start justify-between border-b pb-3 last:border-b-0">
                  <div>
                    <p className="font-medium text-gray-900">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="text-sm text-gray-500">{u.email}</p>
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                      {u.role}
                    </span>
                    <RoleBadge role={u.role} />
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
    </>
  );
}

function UsersTab({
  users,
  loading,
  meta,
  page,
  onPageChange,
}: {
  users: AdminUser[];
  loading: boolean;
  meta: { page: number; pages: number } | null;
  page: number;
  onPageChange: (p: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {formatDate(new Date(u.createdAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {meta.pages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= meta.pages}
              onClick={() => onPageChange(page + 1)}
              className="rounded border px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriesTab({
  categories,
  loading,
}: {
  categories: Category[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Categories ({categories.length})</h2>
      </div>
      <div className="divide-y">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
            {cat.icon && <span className="text-xl">{cat.icon}</span>}
            <span className="font-medium text-gray-800">{cat.name}</span>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-gray-400">No categories found</p>
        )}
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
    <div className="rounded-lg border bg-white p-6">
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
      <p className="mt-2 text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-red-50 text-red-600",
    curator: "bg-purple-50 text-purple-600",
    user: "bg-blue-50 text-blue-600",
  };
  return (
    <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${colors[role] ?? "bg-gray-100 text-gray-600"}`}>
      {role}
    </span>
  );
}
