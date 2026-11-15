import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  withCredentials: true,
  timeout: 10000
});

api.interceptors.response.use(undefined, error => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    window.dispatchEvent(new Event("resolvex:unauthorized"));
  }
  return Promise.reject(error);
});

export function getApiError(error) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;
    return typeof message === "string" ? message : "Unable to reach the ResolveX API.";
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export default api;
