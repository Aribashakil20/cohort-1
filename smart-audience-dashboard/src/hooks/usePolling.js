/**
 * usePolling.js — Custom React hook for auto-refreshing data
 *
 * A "hook" in React is a reusable piece of logic you can drop into
 * any component. This one calls a given async function every N
 * milliseconds and gives you back the result + any error.
 *
 * Why do we need this?
 *   The dashboard must stay live — the numbers on screen should update
 *   automatically without the user refreshing the page.
 *   This hook runs a timer that re-fetches data on a fixed interval.
 *
 * How it works:
 *   1. On first render, immediately fetch data.
 *   2. Set up a repeating timer (setInterval) to fetch again every
 *      `intervalMs` milliseconds.
 *   3. When the component is removed from the screen, cancel the timer
 *      so we don't fetch data nobody is looking at (cleanup).
 */

import { useState, useEffect, useCallback } from "react";

export function usePolling(fetchFn, intervalMs = 5000) {
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    load(); // fetch immediately on mount
    const timer = setInterval(load, intervalMs);
    return () => clearInterval(timer); // cleanup on unmount
  }, [load, intervalMs]);

  return { data, error, loading };
}
