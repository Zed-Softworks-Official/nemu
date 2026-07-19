import { ApiError, apiErrorBodySchema } from "@nemu/protocol";
import axios, { type AxiosInstance, isAxiosError } from "axios";

export type GetToken = () => string | null;

export function createControllerHttp(
  baseUrl: string,
  getToken: GetToken,
  timeoutMs = 5_000,
): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl.replace(/\/$/, ""),
    timeout: timeoutMs,
    headers: { Accept: "application/json" },
  });

  client.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (res) => res,
    (err: unknown) => {
      throw toApiError(err);
    },
  );

  return client;
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const parsed = apiErrorBodySchema.safeParse(data);
    if (parsed.success) {
      return new ApiError(
        parsed.data.error.code,
        parsed.data.error.message,
        status,
      );
    }
    if (err.code === "ECONNABORTED") {
      return new ApiError("timeout", "Request timed out", status);
    }
    if (!err.response) {
      return new ApiError(
        "network_error",
        err.message || "Network error",
        status,
      );
    }
    return new ApiError(
      "http_error",
      err.message || `HTTP ${status ?? "error"}`,
      status,
    );
  }

  if (err instanceof Error) {
    return new ApiError("unknown", err.message);
  }
  return new ApiError("unknown", "Unknown error");
}
