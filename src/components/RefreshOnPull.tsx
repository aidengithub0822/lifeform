"use client";

import { useRouter } from "next/navigation";
import PullToRefresh from "@/components/PullToRefresh";

/**
 * Pull-to-refresh for a Server Component page: there's no client-side
 * `load()` to re-run, so pulling down calls router.refresh() instead, which
 * re-runs the page's server-side data fetch on the same route.
 */
export default function RefreshOnPull({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <PullToRefresh
      onRefresh={async () => {
        router.refresh();
        // Give the refreshed server payload a moment to land before hiding the spinner.
        await new Promise((resolve) => setTimeout(resolve, 500));
      }}
    >
      {children}
    </PullToRefresh>
  );
}
