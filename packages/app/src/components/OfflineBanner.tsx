"use client";

import { useEffect, useState } from "react";
import { WifiOff, Loader2 } from "lucide-react";
import { getOfflineQueue } from "@/lib/offlineQueue";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    // Listen for sync messages from service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage({
        type: "GET_QUEUE_COUNT",
      });

      navigator.serviceWorker.onmessage = (event) => {
        if (event.data.type === "SYNC_SUCCESS") {
          setQueueCount((prev) => Math.max(0, prev - 1));
        } else if (event.data.type === "SYNC_START") {
          setSyncing(true);
        } else if (event.data.type === "SYNC_END") {
          setSyncing(false);
        }
      };
    }

    // Check queue on mount and periodically
    const checkQueue = async () => {
      try {
        const queue = await getOfflineQueue();
        setQueueCount(queue.length);
      } catch (error) {
        console.warn("[OfflineBanner] Failed to check queue:", error);
      }
    };

    checkQueue();
    const interval = setInterval(checkQueue, 2000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline && queueCount === 0) return null;

  const statusText = offline 
    ? "You're offline"
    : syncing
    ? `Syncing ${queueCount} change${queueCount !== 1 ? "s" : ""}...`
    : queueCount > 0
    ? `${queueCount} change${queueCount !== 1 ? "s" : ""} pending`
    : null;

  if (!statusText) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-yellow-500 px-4 py-2 text-sm font-medium text-white shadow"
    >
      {offline ? (
        <WifiOff size={16} className="shrink-0" />
      ) : syncing ? (
        <Loader2 size={16} className="shrink-0 animate-spin" />
      ) : (
        <WifiOff size={16} className="shrink-0 opacity-50" />
      )}
      <span>{statusText}</span>
    </div>
  );
}
