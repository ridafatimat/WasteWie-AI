import axios, { AxiosError } from "axios";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) || "http://127.0.0.1:8000/api/v1";

export const TOKEN_KEY = "wastewise_token";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Clear stale token; route guards will redirect.
      localStorage.removeItem(TOKEN_KEY);
    }
    return Promise.reject(error);
  },
);

export function extractApiError(err: unknown): string {
  const e = err as AxiosError<any>;
  if (!e?.isAxiosError) return "Unexpected error occurred.";
  if (!e.response) return "Server unavailable. Please try again shortly.";
  const data = e.response.data;
  if (typeof data === "string") return data;
  if (data?.detail) {
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((d: any) => {
          const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "field";
          return `${field}: ${d.msg}`;
        })
        .join("; ");
    }
  }
  if (data?.message) return data.message;
  return `Request failed (${e.response.status})`;
}

export function parseFieldErrors(err: unknown): Record<string, string> {
  const e = err as AxiosError<any>;
  const out: Record<string, string> = {};
  const detail = e?.response?.data?.detail;
  if (Array.isArray(detail)) {
    for (const d of detail) {
      if (Array.isArray(d.loc)) {
        const key = d.loc[d.loc.length - 1];
        if (typeof key === "string") out[key] = d.msg;
      }
    }
  }
  return out;
}
