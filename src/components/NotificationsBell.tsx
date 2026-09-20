"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BellIcon } from "@/components/icons";

// Bell with an unread badge that links to /notifications — where tags
// (@mentions) and replies land, whether or not push notifications are on.
export default function NotificationsBell({ className }: { className?: string }) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const supabase = createClient();
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      setUnread(count ?? 0);
    } catch {
      // table not created yet — just show no badge
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount
    refresh();
    const timer = setInterval(refresh, 45000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 active:opacity-60 ${className ?? ""}`}
    >
      <BellIcon className="h-[22px] w-[22px]" />
      {unread > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
