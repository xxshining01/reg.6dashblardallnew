import useSWR from "swr";

const fetcher = (url) => fetch(url).then((r) => r.json());

export function useDashboardData() {
  const { data, error, isLoading, mutate } = useSWR("/api/dashboard-data", fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
  });

  return {
    dailyRows: data?.dailyRows ?? [],
    monthlyRows: data?.monthlyRows ?? [],
    rawTargets: data?.rawTargets ?? [],
    isLoading,
    isError: Boolean(error || data?.error),
    mutate,
  };
}
