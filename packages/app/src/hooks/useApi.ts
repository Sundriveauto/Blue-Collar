"use client";

import { useState, useCallback } from "react";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Generic hook for API calls with loading/error state management.
 *
 * @example
 * const { data, loading, error, execute } = useApi(getWorkers)
 * useEffect(() => { execute() }, [execute])
 */
export function useApi<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>
) {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args) => {
      setState({ data: null, loading: true, error: null });
      try {
        const data = await fn(...args);
        setState({ data, loading: false, error: null });
        return data;
      } catch (err) {
        const error = err instanceof Error ? err.message : "An error occurred";
        setState({ data: null, loading: false, error });
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn]
  );

  return { ...state, execute };
}
