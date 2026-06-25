"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Category } from "@/types";
import FilterPanel, { type FilterValues } from "./FilterPanel";

interface MobileFilterSheetProps {
  filters: FilterValues;
  categories: Category[];
  onChange: (filters: FilterValues) => void;
  onReset: () => void;
  loading?: boolean;
}

export default function MobileFilterSheet({
  filters,
  categories,
  onChange,
  onReset,
  loading,
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);

  const activeCount = [filters.category, filters.city, filters.state].filter(
    Boolean
  ).length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 lg:hidden"
        >
          <SlidersHorizontal size={15} />
          Filters
          {activeCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
              {activeCount}
            </span>
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] overflow-y-auto bg-gray-50 p-4 shadow-xl">
          <Dialog.Title className="mb-4 text-lg font-bold text-gray-800">
            Filter Workers
          </Dialog.Title>
          <FilterPanel
            filters={filters}
            categories={categories}
            onChange={onChange}
            onReset={onReset}
            loading={loading}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Show Results
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
