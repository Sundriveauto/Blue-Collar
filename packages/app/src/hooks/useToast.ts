/**
 * Thin wrapper around sonner so callers don't import sonner directly.
 * Supports success, error, warning, and info variants.
 */
import { toast as sonnerToast } from "sonner";

export type ToastType = "success" | "error" | "warning" | "info";

export function useToast() {
  const toast = (message: string, type: ToastType = "success") => {
    sonnerToast[type](message);
  };

  return { toast };
}
