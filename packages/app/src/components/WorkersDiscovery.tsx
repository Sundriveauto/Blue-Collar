"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import WorkerCard from "@/components/WorkerCard";
import { WorkerCardSkeleton } from "@/components/Skeleton";
import Pagination from "@/components/Pagination";
import SearchInput from "@/components/Search/SearchInput";
import FilterPanel, {
  EMPTY_FILTERS,
  type FilterValues,
} from "@/components/Filters/FilterPanel";
import ActiveFilters from "@/components/Filters/ActiveFilters";
import MobileFilterSheet from "@/components/Filters/MobileFilterSheet";
import { useDebounce } from "@/hooks/useDebounce";
import { getWorkers, getCategories } from "@/lib/api";
import type { Worker, Category, Meta } from "@/types";

const LIMIT = 20;

function filtersFromParams(sp: URLSearchParams): FilterValues {
  return {
    category: sp.get("category") ?? "",
    city: sp.get("city") ?? "",
    state: sp.get("state") ?? "",
  };
}

function paramsFromState(
  search: string,
  filters: FilterValues,
  page: number
): Record<string, string> {
  const p: Record<string, string> = {
    page: String(page),
    limit: String(LIMIT),
  };
  if (search) p.search = search;
  if (filters.category) p.category = filters.category;
  if (filters.city) p.city = filters.city;
  if (filters.state) p.state = filters.state;
  return p;
}

export default function WorkersDiscovery() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [filters, setFilters] = useState<FilterValues>(
    filtersFromParams(searchParams)
  );
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  // Load categories once
  useEffect(() => {
    getCategories()
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  // Sync URL whenever debounced search, filters, or page change
  const syncUrl = useCallback(
    (s: string, f: FilterValues, p: number) => {
      const params = paramsFromState(s, f, p);
      const qs = new URLSearchParams(params).toString();
      router.replace(`/workers?${qs}`, { scroll: false });
    },
    [router]
  );

  // Fetch workers
  useEffect(() => {
    let cancelled = false;
    const params = paramsFromState(debouncedSearch, filters, page);

    setLoading(true);
    setError(null);

    syncUrl(debouncedSearch, filters, page);

    getWorkers(params)
      .then((res) => {
        if (cancelled) return;
        setWorkers(res.data);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load workers");
        setWorkers([]);
        setMeta(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, filters, page, syncUrl]);

  // Reset to page 1 when search or filters change
  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleFilterChange = useCallback((f: FilterValues) => {
    setFilters(f);
    setPage(1);
  }, []);

  const handleFilterReset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const handleRemoveFilter = useCallback(
    (key: keyof FilterValues) => {
      setFilters((prev) => ({ ...prev, [key]: "" }));
      setPage(1);
    },
    []
  );

  const resultCount = meta?.total ?? 0;

  // Min-height on results to prevent layout shift during page transitions
  const gridMinHeight = useMemo(() => {
    if (loading) return "min-h-[600px]";
    return workers.length > 0 ? "min-h-[200px]" : "";
  }, [loading, workers.length]);

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-24">
          <FilterPanel
            filters={filters}
            categories={categories}
            onChange={handleFilterChange}
            onReset={handleFilterReset}
            loading={loading}
          />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1">
        {/* Search bar + mobile filter toggle */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <SearchInput
              value={search}
              onChange={handleSearch}
              placeholder="Search workers by name or skill..."
            />
          </div>
          <MobileFilterSheet
            filters={filters}
            categories={categories}
            onChange={handleFilterChange}
            onReset={handleFilterReset}
            loading={loading}
          />
        </div>

        {/* Active filter chips */}
        <ActiveFilters
          filters={filters}
          search={debouncedSearch}
          categories={categories}
          onRemoveFilter={handleRemoveFilter}
          onClearSearch={() => handleSearch("")}
        />

        {/* Result count */}
        {!loading && !error && (
          <p className="mb-4 mt-2 text-sm text-gray-500">
            {resultCount === 0
              ? "No results"
              : `${resultCount} worker${resultCount !== 1 ? "s" : ""} found`}
          </p>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-16 text-center">
            <p className="text-lg font-semibold text-red-700">
              Something went wrong
            </p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => setPage(page)}
              className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${gridMinHeight}`}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <WorkerCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && workers.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-20 text-center shadow-sm">
            <p className="text-lg font-semibold text-gray-700">
              No workers found
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Try broadening your search or removing some filters.
            </p>
            <button
              type="button"
              onClick={() => {
                handleSearch("");
                handleFilterReset();
              }}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Clear all filters
            </button>
          </div>
        )}

        {/* Results grid */}
        {!loading && !error && workers.length > 0 && (
          <>
            <div
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${gridMinHeight}`}
            >
              {workers.map((w) => (
                <WorkerCard key={w.id} worker={w} />
              ))}
            </div>

            {/* Pagination */}
            {meta && meta.pages > 1 && (
              <div className="mt-8">
                <Pagination
                  page={meta.page}
                  pages={meta.pages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
