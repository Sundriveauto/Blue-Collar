import { z } from "zod";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ─── API helpers ──────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Something went wrong");
  return json as T;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Something went wrong");
  return json as T;
}

export const authApi = {
  login: (data: LoginInput) =>
    post<{ data: unknown; token: string }>("/auth/login", data),

  register: (data: Omit<RegisterInput, "confirmPassword">) =>
    post<{ data: unknown }>("/auth/register", data),

  forgotPassword: (data: ForgotPasswordInput) =>
    post<{ message: string }>("/auth/forgot-password", data),

  resetPassword: (token: string, password: string) =>
    put<{ message: string }>("/auth/reset-password", { token, password }),

  verifyAccount: (token: string) =>
    put<{ message: string }>("/auth/verify-account", { token }),

  resendVerification: (email: string) =>
    post<{ message: string }>("/auth/resend-verification", { email }),
};
