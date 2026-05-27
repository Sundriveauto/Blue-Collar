"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { formatDate } from "@/lib/utils";
import { AdminDashboardSkeleton } from "@/components/Skeleton";
import type { Category } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";
const TOKEN_KEY = "bc_token";

interface Stats {
  totalWorkers: number;
  activeWorkers: number;
  totalUsers: number;
  totalCurators: number;
  workersThisMonth: number;
  usersThisMonth: number;
  topCategories: Array<{ name: string; count: number }>;
  recentWorkers: Array<{
    id: string;
    name: string;
    createdAt: string;
    category: { name: string };
  }>;
  recentUsers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    createdAt: string;
    role: string;
  }>;
}

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
  const [stats, setStats] = useState<Stats | null>(null);
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

    const fetchStats = async () => {
      try {
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

    fetchStats();
  }, [user, router, toast]);

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
          <BarChart data={stats.topCategories}>
            <CartesianGrid strokeDasharray="3 3" />
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
            {stats.recentWorkers.length > 0 ? (
              stats.recentWorkers.map((worker) => (
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
            {stats.recentUsers.length > 0 ? (
              stats.recentUsers.map((u) => (
                <div key={u.id} className="flex items-start justify-between border-b pb-3 last:border-b-0">
                  <div>
                    <p className="font-medium text-gray-900">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="text-sm text-gray-500">{u.email}</p>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-6">
      <p className="text-sm font-medium text-gray-600">{label}</p>
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
