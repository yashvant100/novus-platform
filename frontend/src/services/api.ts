import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim();

if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is required in the frontend environment.");
}

const ACCESS_TOKEN_KEY = "novus_access_token";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/* =========================================================
   TYPES
========================================================= */

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface Monitor {
  id: number;
  name: string;
  url: string;
  status: string;
  expected_status: number;
  is_active: boolean;
  ssl_enabled: boolean;
  alert_email: string | null;
  alert_emails: string[];
  can_edit: boolean;
  can_delete: boolean;
  owner_email: string | null;
  assigned_user_emails: string[];

  http_status: number | null;
  response_time_ms: number | null;
  error_message: string | null;

  ssl_valid: boolean | null;
  ssl_expires_at: string | null;
  ssl_days_remaining: number | null;
  ssl_issuer: string | null;
  ssl_tls_version: string | null;
  ssl_error: string | null;
}

export interface MonitorCreate {
  name: string;
  url: string;
  method?: "GET" | "HEAD";
  expected_status?: number;
  timeout_seconds?: number;
  interval_seconds?: number;
  ssl_enabled?: boolean;
  alert_email?: string | null;
  alert_emails?: string[];
}

export interface MonitorHistoryItem {
  id: number;
  checked_at: string;
  status: string;
  http_status: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  ssl_valid: boolean | null;
  ssl_expires_at: string | null;
  ssl_days_remaining: number | null;
  ssl_issuer: string | null;
  ssl_tls_version: string | null;
  ssl_error: string | null;
}

export type MonitorHistoryResponse = MonitorHistoryItem[];

/* =========================================================
   EMAIL PROVIDERS
========================================================= */

export interface EmailProvider {
  id: number;
  name: string;
  provider_type: string;
  host: string | null;
  port: number | null;
  username: string | null;
  from_email: string;
  from_name?: string;
  tls_enabled: boolean;
  is_active: boolean;
  is_default: boolean;
}

export interface EmailProviderCreate {
  name: string;
  provider_type?: string;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  secret?: string | null;
  from_email: string;
  from_name?: string;
  tls_enabled?: boolean;
  is_default?: boolean;
}

/* =========================================================
   EMAIL RECIPIENTS
========================================================= */

export interface EmailRecipient {
  id: number;
  email: string;
  name: string | null;
  is_active: boolean;
}

export interface EmailRecipientCreate {
  email: string;
  name?: string | null;
}

/* =========================================================
   TOKEN
========================================================= */

let accessToken: string | null =
  localStorage.getItem(ACCESS_TOKEN_KEY);

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(
  token: string | null,
): void {
  accessToken = token;

  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

/* =========================================================
   REQUEST INTERCEPTOR
========================================================= */

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

/* =========================================================
   RESPONSE INTERCEPTOR
========================================================= */

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearAccessToken();
    }

    return Promise.reject(error);
  },
);

/* =========================================================
   AUTH
========================================================= */

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>(
    "/api/auth/login",
    { email, password },
  );

  const token = response.data.access_token;

  if (!token) {
    throw new Error(
      "Authentication succeeded but no access token was returned.",
    );
  }

  setAccessToken(token);
  return response.data;
}

export async function getCurrentUser() {
  const response = await api.get("/api/auth/me");
  return response.data;
}

/* =========================================================
   MONITORS - LIST
========================================================= */

export async function getMonitors(): Promise<Monitor[]> {
  const response = await api.get<Monitor[]>(
    "/api/monitors",
  );

  return response.data;
}

/* =========================================================
   MONITORS - CREATE
========================================================= */

export async function createMonitor(
  data: MonitorCreate,
): Promise<Monitor> {
  const response = await api.post<Monitor>(
    "/api/monitors",
    data,
  );

  return response.data;
}

/* =========================================================
   MONITORS - UPDATE
========================================================= */

export async function updateMonitor(
  monitorId: number,
  data: MonitorCreate,
): Promise<Monitor> {
  const response = await api.patch<Monitor>(
    `/api/monitors/${monitorId}`,
    data,
  );

  return response.data;
}

/* =========================================================
   MONITORS - DELETE
========================================================= */

export async function deleteMonitor(monitorId: number) {
  const response = await api.delete(
    `/api/monitors/${monitorId}`,
  );

  return response.data;
}

/* =========================================================
   MONITORS - ENABLE
========================================================= */

export async function enableMonitor(monitorId: number) {
  const response = await api.patch(
    `/api/monitors/${monitorId}/enable`,
  );

  return response.data;
}

/* =========================================================
   MONITORS - DISABLE
========================================================= */

export async function disableMonitor(monitorId: number) {
  const response = await api.patch(
    `/api/monitors/${monitorId}/disable`,
  );

  return response.data;
}

/* =========================================================
   MONITOR HISTORY
========================================================= */

export async function getMonitorHistory(
  monitorId: number,
): Promise<MonitorHistoryResponse> {
  const response = await api.get<MonitorHistoryResponse>(
    `/api/monitors/${monitorId}/history`,
  );

  return response.data;
}

/* =========================================================
   EMAIL PROVIDERS - LIST
========================================================= */

export async function getEmailProviders(): Promise<EmailProvider[]> {
  const response = await api.get<EmailProvider[]>(
    "/api/admin/email-providers",
  );

  return response.data;
}

/* =========================================================
   EMAIL PROVIDERS - CREATE
========================================================= */

export async function createEmailProvider(
  data: EmailProviderCreate,
): Promise<EmailProvider> {
  const response = await api.post<EmailProvider>(
    "/api/admin/email-providers",
    data,
  );

  return response.data;
}

export async function updateEmailProvider(
  providerId: number,
  data: EmailProviderCreate,
): Promise<EmailProvider> {
  const response = await api.patch<EmailProvider>(
    `/api/admin/email-providers/${providerId}`,
    data,
  );
  return response.data;
}

export async function enableEmailProvider(providerId: number) {
  return (await api.patch(`/api/admin/email-providers/${providerId}/enable`)).data;
}

export async function disableEmailProvider(providerId: number) {
  return (await api.patch(`/api/admin/email-providers/${providerId}/disable`)).data;
}

export async function deleteEmailProvider(providerId: number) {
  return (await api.delete(`/api/admin/email-providers/${providerId}`)).data;
}

/* =========================================================
   EMAIL RECIPIENTS - LIST
========================================================= */

export async function getEmailRecipients(): Promise<EmailRecipient[]> {
  const response = await api.get<EmailRecipient[]>(
    "/api/admin/email-providers/recipients",
  );

  return response.data;
}

/* =========================================================
   EMAIL RECIPIENTS - CREATE
========================================================= */

export async function createEmailRecipient(
  data: EmailRecipientCreate,
): Promise<EmailRecipient> {
  const response = await api.post<EmailRecipient>(
    "/api/admin/email-providers/recipients",
    data,
  );

  return response.data;
}

export async function updateEmailRecipient(
  recipientId: number,
  data: EmailRecipientCreate,
): Promise<EmailRecipient> {
  const response = await api.patch<EmailRecipient>(
    `/api/admin/email-providers/recipients/${recipientId}`,
    data,
  );
  return response.data;
}

export async function enableEmailRecipient(recipientId: number) {
  return (await api.patch(`/api/admin/email-providers/recipients/${recipientId}/enable`)).data;
}

export async function disableEmailRecipient(recipientId: number) {
  return (await api.patch(`/api/admin/email-providers/recipients/${recipientId}/disable`)).data;
}

export async function deleteEmailRecipient(recipientId: number) {
  return (await api.delete(`/api/admin/email-providers/recipients/${recipientId}`)).data;
}

export default api;
/* =========================================================
   ADMIN USERS
========================================================= */

export interface AdminUser {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  name?: string | null;
}

export interface AdminUserCreate {
  email: string;
  password: string;
  role?: string;
}

export interface AdminUserUpdate {
  email?: string;
  password?: string;
  role?: string;
}

export interface MonitorPermissionResponse {
  user_id: number;
  monitor_ids: number[];
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const response = await api.get<AdminUser[]>(
    "/api/admin/users",
  );

  return response.data;
}

export async function createAdminUser(
  data: AdminUserCreate,
): Promise<AdminUser> {
  const response = await api.post<AdminUser>(
    "/api/admin/users",
    data,
  );

  return response.data;
}

export async function getAdminUser(
  userId: number,
): Promise<AdminUser> {
  const response = await api.get<AdminUser>(
    `/api/admin/users/${userId}`,
  );

  return response.data;
}

export async function updateAdminUser(
  userId: number,
  data: AdminUserUpdate,
): Promise<AdminUser> {
  const response = await api.patch<AdminUser>(
    `/api/admin/users/${userId}`,
    data,
  );

  return response.data;
}

export async function enableAdminUser(
  userId: number,
) {
  const response = await api.patch(
    `/api/admin/users/${userId}/enable`,
  );

  return response.data;
}

export async function disableAdminUser(
  userId: number,
) {
  const response = await api.patch(
    `/api/admin/users/${userId}/disable`,
  );

  return response.data;
}

export async function deleteAdminUser(
  userId: number,
) {
  const response = await api.delete(
    `/api/admin/users/${userId}`,
  );

  return response.data;
}

export async function getUserMonitorPermissions(
  userId: number,
): Promise<MonitorPermissionResponse> {
  const response = await api.get<MonitorPermissionResponse>(
    `/api/admin/users/${userId}/monitor-permissions`,
  );
  return response.data;
}

export async function updateUserMonitorPermissions(
  userId: number,
  monitorIds: number[],
): Promise<MonitorPermissionResponse> {
  const response = await api.put<MonitorPermissionResponse>(
    `/api/admin/users/${userId}/monitor-permissions`,
    { monitor_ids: monitorIds },
  );
  return response.data;
}