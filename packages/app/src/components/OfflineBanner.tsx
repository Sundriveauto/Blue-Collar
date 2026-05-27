"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Shows a banner at the top of the page when the user is offline. */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-yellow-500 px-4 py-2 text-sm font-medium text-white shadow"
    >
      <WifiOff size={15} className="shrink-0" />
      You&apos;re offline — showing cached content
    </div>
  );
}
