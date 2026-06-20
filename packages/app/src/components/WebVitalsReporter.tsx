"use client";

import { useReportWebVitals } from "next/web-vitals";

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify(metric);

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }));
      return;
    }

    fetch("/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  });

  return null;
}
