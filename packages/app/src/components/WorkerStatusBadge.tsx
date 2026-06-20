"use client";

import { useState, useCallback } from "react";
import { useWorkerEvents } from "../hooks/useWorkerEvents";

interface Props {
  workerId: string;
  initialIsActive: boolean;
}

export function WorkerStatusBadge({ workerId, initialIsActive }: Props) {
  const [isActive, setIsActive] = useState(initialIsActive);

  const handleStatusChange = useCallback(
    (id: string, active: boolean) => {
      if (id === workerId) setIsActive(active);
    },
    [workerId]
  );

  useWorkerEvents(handleStatusChange);

  return (
    <span
      role="status"
      aria-label={isActive ? "Worker is active" : "Worker is offline"}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-gray-400"}`}
      />
      {isActive ? "Active" : "Offline"}
    </span>
  );
}
