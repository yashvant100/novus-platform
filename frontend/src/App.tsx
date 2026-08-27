import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Globe2,
  LogOut,
  Menu,
  Moon,
  Plus,
  Pencil,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  createEmailProvider,
  createEmailRecipient,
  createMonitor,
  deleteMonitor,
  disableMonitor,
  enableMonitor,
  getAccessToken,
  getCurrentUser,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  enableAdminUser,
  disableAdminUser,
  deleteAdminUser,
  getEmailProviders,
  getEmailRecipients,
  getMonitorHistory,
  getMonitors,
  login,
  setAccessToken,
  updateMonitor,
  type EmailProvider,
  type EmailProviderCreate,
  type EmailRecipient,
  type EmailRecipientCreate,
  type AdminUser,
  type Monitor,
  type MonitorCreate,
} from "./services/api";

type Theme = "dark" | "light";

type User = {
  id?: number | string;
  email?: string;
  name?: string;
  role?: string;
};

type Page =
  | "Dashboard"
  | "Monitors"
  | "Incidents"
  | "Alert Monitoring"
  | "Alerts"
  | "Email Providers"
  | "Recipients"
  | "Settings"
  | "Users";

type ModalMode = "create" | "edit" | "history" | null;

type FormState = {
  name: string;
  url: string;
  method: "GET" | "HEAD";
  expected_status: number;
  timeout_seconds: number;
  interval_seconds: number;
  ssl_enabled: boolean;

  // Optional fields supported if the backend starts returning them.
  status_code?: number | null;
  http_status_code?: number | null;
  response_status?: number | null;
  ssl_days_remaining?: number | null;
  ssl_days?: number | null;
  ssl_expires_in_days?: number | null;
};

const emptyForm: FormState = {
  name: "",
  url: "",
  method: "GET",
  expected_status: 200,
  timeout_seconds: 10,
  interval_seconds: 60,
  ssl_enabled: true,
};

function normalizeStatusCode(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 100 && n <= 599 ? n : null;
}

function getStatusLabel(status: unknown): string {
  const value = String(status ?? "").toUpperCase();
  if (value === "UP") return "UP";
  if (value === "DOWN") return "DOWN";
  return value || "UNKNOWN";
}

function getStatusCode(monitor: Monitor): number | null {
  // Backend MonitorResponse currently returns http_status.
  // Keep the older aliases as fallbacks for compatibility.
  const candidate = (monitor as Monitor & {
    http_status?: unknown;
    status_code?: unknown;
    http_status_code?: unknown;
    response_status?: unknown;
  });

  return normalizeStatusCode(
    candidate.http_status ??
      candidate.status_code ??
      candidate.http_status_code ??
      candidate.response_status,
  );
}

function formatSslDays(days: number | null): string {
  if (days === null) return "SSL days unavailable";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  return `${days} days left`;
}

function getSslDays(monitor: Monitor): number | null {
  const candidate = (monitor as Monitor & {
    ssl_days_remaining?: unknown;
    ssl_days?: unknown;
    ssl_expires_in_days?: unknown;
  });

  const value =
    candidate.ssl_days_remaining ??
    candidate.ssl_days ??
    candidate.ssl_expires_in_days;

  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : null;
}


function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("novus-theme");
    return saved === "light" ? "light" : "dark";
  });

  const [token, setToken] = useState<string | null>(
    getAccessToken(),
  );
  const [user, setUser] = useState<User | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [emailProviders, setEmailProviders] = useState<EmailProvider[]>([]);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [userActionLoading, setUserActionLoading] = useState<number | null>(null);
  const [userSaving, setUserSaving] = useState(false);
  const [userError, setUserError] = useState("");
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    role: "VIEWER",
  });

  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<Page>("Dashboard");

  const [modal, setModal] = useState<ModalMode>(null);
  const [selectedMonitor, setSelectedMonitor] =
    useState<Monitor | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] =
    useState<number | null>(null);
  const [history, setHistory] = useState<unknown>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("novus-theme", theme);
  }, [theme]);

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    const savedToken = getAccessToken();

    if (!savedToken) {
      setInitializing(false);
      return;
    }

    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      setToken(savedToken);
      await loadMonitors();
      await loadNotificationData();
      if (String(currentUser?.role || "").toUpperCase() === "ADMIN") {
        await loadAdminUsers();
      }
    } catch {
      logout();
    } finally {
      setInitializing(false);
    }
  }

  async function loadMonitors() {
    try {
      setLoading(true);
      setError("");

      const data = await getMonitors();

      if (!Array.isArray(data)) {
        throw new Error("Invalid monitor response from API.");
      }

      setMonitors(data);
    } catch (err: any) {
      console.error(err);

      if (err?.response?.status === 401) {
        logout();
        return;
      }

      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to load monitors.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadNotificationData() {
    try {
      setNotificationLoading(true);
      setNotificationError("");

      const [providers, recipientList] = await Promise.all([
        getEmailProviders(),
        getEmailRecipients(),
      ]);

      setEmailProviders(Array.isArray(providers) ? providers : []);
      setRecipients(Array.isArray(recipientList) ? recipientList : []);
    } catch (err: any) {
      console.error(err);

      if (err?.response?.status === 401) {
        logout();
        return;
      }

      setNotificationError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to load email configuration.",
      );
    } finally {
      setNotificationLoading(false);
    }
  }

  async function handleLogin(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setLoginError("");

    if (!email.trim()) {
      setLoginError("Please enter your email.");
      return;
    }

    if (!password) {
      setLoginError("Please enter your password.");
      return;
    }

    try {
      setLoggingIn(true);

      const response = await login(
        email.trim(),
        password,
      );

      setToken(response.access_token);

      const currentUser = await getCurrentUser();
      setUser(currentUser);

      await loadMonitors();
      await loadNotificationData();
      if (String(currentUser?.role || "").toUpperCase() === "ADMIN") {
        await loadAdminUsers();
      }
      setPassword("");
    } catch (err: any) {
      console.error(err);

      setLoginError(
        err?.response?.data?.detail ||
          "Invalid email or password.",
      );
    } finally {
      setLoggingIn(false);
    }
  }

  async function loadAdminUsers() {
    try {
      setUserError("");
      const data = await getAdminUsers();
      setAdminUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setUserError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to load users.",
      );
    }
  }

  function openCreateUser() {
    setEditingUser(null);
    setUserForm({ email: "", password: "", role: "VIEWER" });
    setUserError("");
    setShowUserForm(true);
  }

  function openEditUser(adminUser: AdminUser) {
    setEditingUser(adminUser);
    setUserForm({
      email: adminUser.email,
      password: "",
      role: adminUser.role || "VIEWER",
    });
    setUserError("");
    setShowUserForm(true);
  }

  async function handleSaveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserError("");

    if (!userForm.email.trim()) {
      setUserError("Email is required.");
      return;
    }

    if (!editingUser && userForm.password.length < 12) {
      setUserError("Password must be at least 12 characters.");
      return;
    }

    try {
      setUserSaving(true);

      if (editingUser) {
        await updateAdminUser(editingUser.id, {
          email: userForm.email.trim(),
          ...(userForm.password ? { password: userForm.password } : {}),
          role: userForm.role,
        });
      } else {
        await createAdminUser({
          email: userForm.email.trim(),
          password: userForm.password,
          role: userForm.role,
        });
      }

      setShowUserForm(false);
      setEditingUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      console.error(err);
      setUserError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to save user.",
      );
    } finally {
      setUserSaving(false);
    }
  }

  async function handleToggleUser(adminUser: AdminUser) {
    if (adminUser.id === user?.id && adminUser.is_active) {
      setUserError("You cannot disable your own account.");
      return;
    }

    try {
      setUserActionLoading(adminUser.id);
      setUserError("");

      if (adminUser.is_active) {
        await disableAdminUser(adminUser.id);
      } else {
        await enableAdminUser(adminUser.id);
      }

      await loadAdminUsers();
    } catch (err: any) {
      console.error(err);
      setUserError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to update user status.",
      );
    } finally {
      setUserActionLoading(null);
    }
  }

  async function handleDeleteUser(adminUser: AdminUser) {
    if (adminUser.id === user?.id) {
      setUserError("You cannot delete your own account.");
      return;
    }

    const confirmed = window.confirm(
      `Delete user "${adminUser.email}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      setUserActionLoading(adminUser.id);
      setUserError("");
      await deleteAdminUser(adminUser.id);
      await loadAdminUsers();
    } catch (err: any) {
      console.error(err);
      setUserError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to delete user.",
      );
    } finally {
      setUserActionLoading(null);
    }
  }

  function logout() {
    setAccessToken(null);
    setToken(null);
    setUser(null);
    setMonitors([]);
    setActivePage("Dashboard");
    setModal(null);
    setSelectedMonitor(null);
  }

  function toggleTheme() {
    setTheme((current) =>
      current === "dark" ? "light" : "dark",
    );
  }

  function openCreate() {
    setForm(emptyForm);
    setSelectedMonitor(null);
    setModal("create");
  }

  function openEdit(monitor: Monitor) {
    setSelectedMonitor(monitor);

    setForm({
      name: monitor.name,
      url: monitor.url,
      method: "GET",
      expected_status: monitor.expected_status,
      timeout_seconds: 10,
      interval_seconds: 60,
      ssl_enabled: monitor.ssl_enabled,
    });

    setModal("edit");
  }

  async function handleSaveMonitor(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form.name.trim() || !form.url.trim()) {
      setError("Monitor name and URL are required.");
      return;
    }

    const payload: MonitorCreate = {
      name: form.name.trim(),
      url: form.url.trim(),
      method: form.method,
      expected_status: Number(form.expected_status),
      timeout_seconds: Number(form.timeout_seconds),
      interval_seconds: Number(form.interval_seconds),
      ssl_enabled: form.ssl_enabled,
    };

    try {
      setSaving(true);
      setError("");

      if (modal === "create") {
        await createMonitor(payload);
      } else if (
        modal === "edit" &&
        selectedMonitor
      ) {
        await updateMonitor(
          selectedMonitor.id,
          payload,
        );
      }

      setModal(null);
      setSelectedMonitor(null);
      await loadMonitors();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.detail ||
          "Unable to save monitor.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(monitor: Monitor) {
    const confirmed = window.confirm(
      `Delete monitor "${monitor.name}"?`,
    );

    if (!confirmed) return;

    try {
      setActionLoading(monitor.id);
      setError("");

      await deleteMonitor(monitor.id);
      await loadMonitors();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.detail ||
          "Unable to delete monitor.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleMonitor(
    monitor: Monitor,
  ) {
    try {
      setActionLoading(monitor.id);
      setError("");

      if (monitor.is_active) {
        await disableMonitor(monitor.id);
      } else {
        await enableMonitor(monitor.id);
      }

      await loadMonitors();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.detail ||
          "Unable to update monitor status.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function openHistory(monitor: Monitor) {
    try {
      setActionLoading(monitor.id);
      setError("");
      setSelectedMonitor(monitor);

      const data = await getMonitorHistory(monitor.id);
      setHistory(data);
      setModal("history");
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.detail ||
          "Unable to load monitor history.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  const total = monitors.length;

  const up = useMemo(
    () =>
      monitors.filter(
        (monitor) =>
          String(monitor.status).toUpperCase() ===
          "UP",
      ).length,
    [monitors],
  );

  const down = useMemo(
    () =>
      monitors.filter(
        (monitor) =>
          String(monitor.status).toUpperCase() ===
          "DOWN",
      ).length,
    [monitors],
  );

  const active = useMemo(
    () =>
      monitors.filter(
        (monitor) => monitor.is_active,
      ).length,
    [monitors],
  );

  const sslEnabled = useMemo(
    () =>
      monitors.filter(
        (monitor) => monitor.ssl_enabled,
      ).length,
    [monitors],
  );

  const availability =
    total > 0
      ? ((up / total) * 100).toFixed(1)
      : "0.0";

  const filteredMonitors = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return monitors;

    return monitors.filter(
      (monitor) =>
        monitor.name.toLowerCase().includes(query) ||
        monitor.url.toLowerCase().includes(query) ||
        String(monitor.id).includes(query) ||
        monitor.status.toLowerCase().includes(query) ||
        String((monitor as Monitor & { http_status?: unknown }).http_status ?? "")
          .includes(query),
    );
  }, [monitors, search]);

  if (initializing) {
    return <LoadingScreen />;
  }

  if (!token) {
    return (
      <LoginScreen
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        error={loginError}
        loading={loggingIn}
        onSubmit={handleLogin}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    );
  }

  const navigation = [
    {
      section: "Monitoring",
      items: [
        { label: "Dashboard" as Page, icon: Activity },
        { label: "Monitors" as Page, icon: Globe2 },
        {
          label: "Incidents" as Page,
          icon: AlertTriangle,
          badge: down > 0 ? down : undefined,
        },
        {
          label: "Alert Monitoring" as Page,
          icon: Bell,
        },
      ],
    },
    {
      section: "Notifications",
      items: [
        { label: "Email Providers" as Page,
          icon: Server,
        },
        { label: "Recipients" as Page, icon: Bell },
      ],
    },
    {
      section: "System",
      items: [
        ...(String(user?.role || "").toUpperCase() === "ADMIN"
          ? [{ label: "Users" as Page, icon: Users }]
          : []),
        { label: "Settings" as Page, icon: Settings },
      ],
    },
  ];

  return (
    <div className="min-h-screen theme-bg-deep theme-text">
      {sidebarOpen && (
        <button
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 theme-overlay lg:hidden"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-[270px]
          flex-col border-r theme-border
          theme-bg-deep transition-transform duration-300
          lg:translate-x-0
          ${
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }
        `}
      >
        <div className="flex h-[76px] items-center justify-between border-b theme-border px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20">
              <Activity size={21} strokeWidth={2.6} />
            </div>

            <div>
              <div className="text-[17px] font-bold theme-text">
                Novus
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] theme-text-muted">
                Loyalty
              </div>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 theme-text-muted hover:theme-hover hover:theme-text lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          {navigation.map((group) => (
            <div
              key={group.section}
              className="mb-7"
            >
              <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] theme-text-muted">
                {group.section}
              </div>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    activePage === item.label;

                  return (
                    <button
                      key={item.label}
                      onClick={() => {
                        setActivePage(item.label);
                        setSidebarOpen(false);
                      }}
                      className={`
                        group flex w-full items-center justify-between
                        rounded-xl px-3 py-2.5 text-sm transition
                        ${
                          isActive
                            ? "bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-transparent text-cyan-600 shadow-sm"
                            : "theme-text-muted hover:theme-hover hover:theme-text-secondary"
                        }
                      `}
                    >
                      <span className="flex items-center gap-3">
                        <Icon
                          size={17}
                          className={
                            isActive
                              ? "text-cyan-600"
                              : "theme-text-muted"
                          }
                        />
                        {item.label}
                      </span>

                      {item.badge !== undefined && (
                        <span className="rounded-full bg-red-400/10 px-2 py-0.5 text-[10px] font-bold text-red-300">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t theme-border p-3">
          <div className="flex items-center justify-between gap-3 rounded-xl theme-surface-soft p-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm font-bold text-cyan-600">
                {(user?.name ||
                  user?.email ||
                  "A")
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="min-w-0">
                <div className="truncate text-sm font-medium theme-text-secondary">
                  {user?.name ||
                    user?.email ||
                    "Administrator"}
                </div>
                <div className="text-[10px] uppercase tracking-wider theme-text-muted">
                  {user?.role || "Admin"}
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Logout"
              className="rounded-lg p-2 theme-text-muted hover:bg-red-400/10 hover:text-red-300"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="lg:pl-[270px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b theme-border theme-header px-4 backdrop-blur-xl shadow-sm sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border theme-border theme-surface-soft p-2 theme-text-muted lg:hidden"
            >
              <Menu size={19} />
            </button>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-600">
                Novus
              </div>
              <h1 className="mt-0.5 text-lg font-semibold theme-text">
                {activePage}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-3 py-1.5 text-xs font-medium text-emerald-300 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              API Connected
            </div>

            <button
              onClick={toggleTheme}
              title="Toggle theme"
              className="rounded-xl border theme-border theme-surface-soft p-2.5 theme-text-muted hover:theme-text"
            >
              {theme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>

            <button
              onClick={() => setActivePage("Alert Monitoring")}
              className="relative rounded-xl border theme-border theme-surface-soft p-2.5 theme-text-muted hover:theme-text"
            >
              <Bell size={18} />
              {down > 0 && (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-400" />
              )}
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
          {error && (
            <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-300">
              <div className="flex items-center gap-3">
                <AlertCircle size={18} />
                {error}
              </div>

              <button
                onClick={() => setError("")}
                className="rounded-lg p-1 hover:bg-red-400/10"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {activePage === "Dashboard" && (
            <DashboardPage
              user={user}
              total={total}
              up={up}
              down={down}
              active={active}
              sslEnabled={sslEnabled}
              availability={availability}
              monitors={monitors}
              loading={loading}
              onRefresh={loadMonitors}
              onAdd={openCreate}
              onMonitorClick={openEdit}
            />
          )}

          {activePage === "Monitors" && (
            <MonitorsPage
              monitors={filteredMonitors}
              search={search}
              setSearch={setSearch}
              loading={loading}
              actionLoading={actionLoading}
              onRefresh={loadMonitors}
              onAdd={openCreate}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggle={handleToggleMonitor}
              onHistory={openHistory}
            />
          )}

          {activePage === "Incidents" && (
            <SimplePage
              title="Incidents"
              description="Monitor endpoints currently reporting a DOWN state."
              icon={<AlertTriangle size={22} />}
            >
              {down === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={32} />}
                  title="No active incidents"
                  description="All monitored endpoints are currently operational."
                />
              ) : (
                <div className="space-y-3">
                  {monitors
                    .filter(
                      (m) =>
                        String(m.status).toUpperCase() ===
                        "DOWN",
                    )
                    .map((monitor) => (
                      <div
                        key={monitor.id}
                        className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-4"
                      >
                        <div className="font-semibold text-red-300">
                          {monitor.name}
                        </div>
                        <div className="mt-1 text-xs theme-text-muted">
                          {monitor.url}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                          {getStatusCode(monitor) !== null ? (
                            <span className="rounded-md border border-red-400/20 bg-red-400/10 px-2 py-1 font-mono text-red-300">
                              HTTP {getStatusCode(monitor)}
                            </span>
                          ) : (
                            <span className="rounded-md border theme-border px-2 py-1 theme-text-faint">
                              HTTP unavailable
                            </span>
                          )}
                          {monitor.error_message ? (
                            <span className="theme-text-muted">
                              {monitor.error_message}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </SimplePage>
          )}

          {activePage === "Alert Monitoring" && (
            <AlertMonitoringPage monitors={monitors} />
          )}

          {activePage === "Email Providers" && (
            <EmailProvidersPage
              user={user}
              providers={emailProviders}
              loading={notificationLoading}
              saving={notificationSaving}
              error={notificationError}
              onRefresh={loadNotificationData}
              onCreate={async (data) => {
                try {
                  setNotificationSaving(true);
                  setNotificationError("");
                  await createEmailProvider(data);
                  await loadNotificationData();
                } catch (err: any) {
                  console.error(err);
                  setNotificationError(
                    err?.response?.data?.detail ||
                      err?.message ||
                      "Unable to create email provider.",
                  );
                } finally {
                  setNotificationSaving(false);
                }
              }}
            />
          )}

          {activePage === "Recipients" && (
            <RecipientsPage
              recipients={recipients}
              loading={notificationLoading}
              saving={notificationSaving}
              error={notificationError}
              onRefresh={loadNotificationData}
              onCreate={async (data) => {
                try {
                  setNotificationSaving(true);
                  setNotificationError("");
                  await createEmailRecipient(data);
                  await loadNotificationData();
                } catch (err: any) {
                  console.error(err);
                  setNotificationError(
                    err?.response?.data?.detail ||
                      err?.message ||
                      "Unable to create recipient.",
                  );
                } finally {
                  setNotificationSaving(false);
                }
              }}
            />
          )}

          {activePage === "Users" &&
            String(user?.role || "").toUpperCase() === "ADMIN" && (
              <AdminUsersPage
                users={adminUsers}
                currentUserId={user?.id}
                loading={userActionLoading}
                saving={userSaving}
                error={userError}
                showForm={showUserForm}
                editingUser={editingUser}
                form={userForm}
                setForm={setUserForm}
                onRefresh={loadAdminUsers}
                onAdd={openCreateUser}
                onEdit={openEditUser}
                onSave={handleSaveUser}
                onCancel={() => {
                  setShowUserForm(false);
                  setEditingUser(null);
                }}
                onToggle={handleToggleUser}
                onDelete={handleDeleteUser}
              />
            )}

          {activePage === "Settings" && (
            <SimplePage
              title="Settings"
              description="Application settings."
              icon={<Settings size={22} />}
            >
              <div className="rounded-2xl border theme-border theme-surface p-5">
                <div className="text-sm font-semibold theme-text">
                  Appearance
                </div>

                <button
                  onClick={toggleTheme}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border theme-border theme-surface-soft px-4 py-2.5 text-sm theme-text-secondary hover:theme-hover"
                >
                  {theme === "dark" ? (
                    <Sun size={16} />
                  ) : (
                    <Moon size={16} />
                  )}
                  Switch to{" "}
                  {theme === "dark" ? "light" : "dark"} mode
                </button>
              </div>
            </SimplePage>
          )}
        </div>
      </main>

      {modal === "create" || modal === "edit" ? (
        <MonitorModal
          mode={modal}
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={handleSaveMonitor}
        />
      ) : null}

      {modal === "history" && selectedMonitor ? (
        <HistoryModal
          monitor={selectedMonitor}
          history={history}
          onClose={() => {
            setModal(null);
            setHistory(null);
            setSelectedMonitor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DashboardPage({
  user,
  total,
  up,
  down,
  active,
  sslEnabled,
  availability,
  monitors,
  loading,
  onRefresh,
  onAdd,
  onMonitorClick,
}: {
  user: User | null;
  total: number;
  up: number;
  down: number;
  active: number;
  sslEnabled: number;
  availability: string;
  monitors: Monitor[];
  loading: boolean;
  onRefresh: () => void;
  onAdd: () => void;
  onMonitorClick: (monitor: Monitor) => void;
}) {
  return (
    <>
      <div className="mb-7">
        <div className="text-sm theme-text-muted">
          Real-time infrastructure overview
        </div>

        <div className="mt-1 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-bold tracking-tight theme-text sm:text-3xl">
              Good morning,{" "}
              {user?.name ||
                user?.email?.split("@")[0] ||
                "Administrator"}
            </h2>

            <p className="mt-2 text-sm theme-text-muted">
              Monitor your endpoints, uptime and alert activity.
            </p>
          </div>

          <button
            onClick={onAdd}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110"
          >
            <Plus size={17} />
            Add Monitor
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Globe2 size={20} />}
          label="Total Monitors"
          value={total}
          description={`${active} active endpoints`}
          tone="cyan"
        />

        <StatCard
          icon={<CheckCircle2 size={20} />}
          label="Operational"
          value={up}
          description={`${availability}% current availability`}
          tone="green"
        />

        <StatCard
          icon={<AlertCircle size={20} />}
          label="Active Alerts"
          value={down}
          description={
            down > 0
              ? "Immediate attention required"
              : "No active endpoint alerts"
          }
          tone="red"
        />

        <StatCard
          icon={<ShieldCheck size={20} />}
          label="SSL Enabled"
          value={sslEnabled}
          description="Monitors with SSL checks enabled"
          tone="violet"
        />
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border theme-border theme-surface">
        <div className="flex flex-col gap-4 border-b theme-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold theme-text">
              Monitor Health
            </h3>
            <p className="mt-1 text-xs theme-text-muted">
              Live data from Novus API
            </p>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border theme-border theme-surface-soft px-3 py-2 text-xs font-medium theme-text-muted hover:theme-text disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={
                loading ? "animate-spin" : ""
              }
            />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {monitors.length === 0 ? (
          <EmptyState
            icon={<Globe2 size={32} />}
            title="No monitors found"
            description="Create your first monitor to start monitoring."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b theme-border-soft text-left">
                  <TableHeader>Monitor</TableHeader>
                  <TableHeader>Expected</TableHeader>
                  <TableHeader>SSL</TableHeader>
                  <TableHeader>Active</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader />
                </tr>
              </thead>

              <tbody>
                {monitors.map((monitor) => (
                  <MonitorRow
                    key={monitor.id}
                    monitor={monitor}
                    onClick={() =>
                      onMonitorClick(monitor)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border theme-border theme-surface p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold theme-text">
                Availability
              </h3>
              <p className="mt-1 text-xs theme-text-muted">
                Current status based on monitored endpoints
              </p>
            </div>
            <Activity
              size={18}
              className="text-cyan-600"
            />
          </div>

          <div className="mt-7 flex items-end gap-2">
            <span className="text-4xl font-bold theme-text">
              {availability}%
            </span>
            <span className="mb-1 text-xs theme-text-muted">
              current
            </span>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full theme-surface-soft">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{
                width: `${availability}%`,
              }}
            />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <MiniMetric
              label="UP"
              value={up}
              tone="green"
            />
            <MiniMetric
              label="DOWN"
              value={down}
              tone="red"
            />
            <MiniMetric
              label="ALERTS"
              value={down}
              tone="cyan"
            />
          </div>
        </section>

        <section className="rounded-2xl border theme-border theme-surface p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold theme-text">
                Alert Monitoring
              </h3>
              <p className="mt-1 text-xs theme-text-muted">
                Endpoints currently requiring attention
              </p>
            </div>
            <Bell
              size={18}
              className="text-violet-500"
            />
          </div>

          <div className="mt-5 space-y-2">
            {monitors.filter((m) => String(m.status).toUpperCase() === "DOWN")
              .map((monitor) => (
                <div
                  key={monitor.id}
                  className="flex items-center justify-between rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-red-500">
                      {monitor.name}
                    </div>
                    <div className="mt-1 truncate text-[10px] theme-text-muted">
                      {monitor.url}
                    </div>
                  </div>

                  <span className="rounded-full bg-red-400/10 px-2.5 py-1 text-[9px] font-bold text-red-500">
                    DOWN
                  </span>
                </div>
              ))}

            {down === 0 && (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4 text-xs text-emerald-600">
                No active alerts. All monitored endpoints are operational.
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function MonitorsPage({
  monitors,
  search,
  setSearch,
  loading,
  actionLoading,
  onRefresh,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  onHistory,
}: {
  monitors: Monitor[];
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
  actionLoading: number | null;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (monitor: Monitor) => void;
  onDelete: (monitor: Monitor) => void;
  onToggle: (monitor: Monitor) => void;
  onHistory: (monitor: Monitor) => void;
}) {
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="text-sm theme-text-muted">
            Endpoint management
          </div>
          <h2 className="mt-1 text-2xl font-bold theme-text">
            Monitors
          </h2>
          <p className="mt-2 text-sm theme-text-muted">
            Create, update, enable, disable and delete monitors.
          </p>
        </div>

        <button
          onClick={onAdd}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110"
        >
          <Plus size={17} />
          Add Monitor
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border theme-border theme-surface">
        <div className="flex flex-col gap-3 border-b theme-border p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 theme-text-muted"
            />
            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search monitors..."
              className="w-full rounded-xl border theme-border theme-surface-soft py-2.5 pl-9 pr-4 text-sm theme-text outline-none focus:border-blue-500/40"
            />
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border theme-border px-3 py-2 text-xs theme-text-muted hover:theme-text disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={
                loading ? "animate-spin" : ""
              }
            />
            Refresh
          </button>
        </div>

        {monitors.length === 0 ? (
          <EmptyState
            icon={<Globe2 size={32} />}
            title="No monitors found"
            description="Create a monitor or change your search."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px]">
              <thead>
                <tr className="border-b theme-border-soft text-left">
                  <TableHeader>Monitor</TableHeader>
                  <TableHeader>Expected</TableHeader>
                  <TableHeader>SSL</TableHeader>
                  <TableHeader>Active</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>

              <tbody>
                {monitors.map((monitor) => {
                  const busy =
                    actionLoading === monitor.id;

                  return (
                    <tr
                      key={monitor.id}
                      className="border-b theme-border-soft hover:theme-hover"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              String(
                                monitor.status,
                              ).toUpperCase() ===
                              "UP"
                                ? "bg-emerald-400"
                                : "bg-red-400"
                            }`}
                          />

                          <div>
                            <div className="text-sm font-medium theme-text-secondary">
                              {monitor.name}
                            </div>
                            <div className="mt-1 max-w-[350px] truncate text-[11px] theme-text-muted">
                              {monitor.url}
                            </div>
                            <div className="mt-1 text-[10px] theme-text-faint">
                              ID #{monitor.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-md border theme-border px-2 py-1 font-mono text-[11px] theme-text-muted">
                          {monitor.expected_status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        {monitor.ssl_enabled ? (
                          <div className="flex flex-col">
                            <span className="text-xs text-emerald-300">
                              Enabled
                            </span>
                            <span className="mt-1 text-[10px] theme-text-muted">
                              {formatSslDays(getSslDays(monitor))}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs theme-text-muted">
                            Disabled
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                            monitor.is_active
                              ? "bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-transparent text-cyan-600 shadow-sm"
                              : "theme-disabled theme-text-muted"
                          }`}
                        >
                          {monitor.is_active
                            ? "ACTIVE"
                            : "DISABLED"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                              String(
                                monitor.status,
                              ).toUpperCase() ===
                              "UP"
                                ? "bg-emerald-400/10 text-emerald-300"
                                : "bg-red-400/10 text-red-300"
                            }`}
                          >
                            {getStatusLabel(monitor.status)}
                          </span>

                          {getStatusCode(monitor) !== null ? (
                            <span className="font-mono text-[10px] theme-text-muted">
                              HTTP {getStatusCode(monitor)}
                            </span>
                          ) : (
                            <span className="text-[10px] theme-text-faint">
                              HTTP code unavailable
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            disabled={busy}
                            onClick={() =>
                              onToggle(monitor)
                            }
                            className="rounded-lg px-2.5 py-2 text-[10px] font-semibold text-cyan-600 hover:brightness-110/10 disabled:opacity-50"
                          >
                            {busy
                              ? "..."
                              : monitor.is_active
                                ? "Disable"
                                : "Enable"}
                          </button>

                          <button
                            onClick={() =>
                              onHistory(monitor)
                            }
                            className="rounded-lg p-2 theme-text-muted hover:theme-hover hover:theme-text"
                            title="History"
                          >
                            <ChevronRight size={16} />
                          </button>

                          <button
                            onClick={() =>
                              onEdit(monitor)
                            }
                            className="rounded-lg px-2.5 py-2 text-[10px] font-semibold theme-text-muted hover:theme-hover hover:theme-text"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() =>
                              onDelete(monitor)
                            }
                            disabled={busy}
                            className="rounded-lg p-2 theme-text-muted hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function MonitorModal({
  mode,
  form,
  setForm,
  saving,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  form: FormState;
  setForm: React.Dispatch<
    React.SetStateAction<FormState>
  >;
  saving: boolean;
  onClose: () => void;
  onSubmit: (
    event: React.FormEvent<HTMLFormElement>,
  ) => void;
}) {
  return (
    <Modal
      title={
        mode === "create"
          ? "Create Monitor"
          : "Edit Monitor"
      }
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name">
          <input
            required
            value={form.name}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                name: e.target.value,
              }))
            }
            className="input"
            placeholder="Google Production"
          />
        </Field>

        <Field label="URL">
          <input
            required
            type="url"
            value={form.url}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                url: e.target.value,
              }))
            }
            className="input"
            placeholder="https://example.com"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Method">
            <select
              value={form.method}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  method: e.target.value as
                    | "GET"
                    | "HEAD",
                }))
              }
              className="input"
            >
              <option value="GET">GET</option>
              <option value="HEAD">HEAD</option>
            </select>
          </Field>

          <Field label="Expected Status">
            <input
              type="number"
              min={100}
              max={599}
              value={form.expected_status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  expected_status: Number(
                    e.target.value,
                  ),
                }))
              }
              className="input"
            />
          </Field>

          <Field label="Timeout Seconds">
            <input
              type="number"
              min={1}
              max={120}
              value={form.timeout_seconds}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  timeout_seconds: Number(
                    e.target.value,
                  ),
                }))
              }
              className="input"
            />
          </Field>

          <Field label="Interval Seconds">
            <input
              type="number"
              min={10}
              max={86400}
              value={form.interval_seconds}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  interval_seconds: Number(
                    e.target.value,
                  ),
                }))
              }
              className="input"
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border theme-border theme-surface-soft p-4">
          <div>
            <div className="text-sm font-medium theme-text">
              SSL Monitoring
            </div>
            <div className="mt-1 text-xs theme-text-muted">
              Monitor SSL configuration for this URL.
            </div>
          </div>

          <input
            type="checkbox"
            checked={form.ssl_enabled}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                ssl_enabled: e.target.checked,
              }))
            }
            className="h-5 w-5 accent-cyan-400"
          />
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border theme-border px-4 py-2.5 text-sm theme-text-muted hover:theme-text"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 disabled:opacity-50"
          >
            {saving && (
              <RefreshCw
                size={15}
                className="animate-spin"
              />
            )}
            {saving
              ? "Saving..."
              : mode === "create"
                ? "Create Monitor"
                : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryModal({
  monitor,
  history,
  onClose,
}: {
  monitor: Monitor;
  history: unknown;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`History — ${monitor.name}`}
      onClose={onClose}
    >
      <div className="max-h-[65vh] overflow-auto rounded-xl border theme-border theme-surface-deep">
        {!Array.isArray(history) || history.length === 0 ? (
          <div className="p-6 text-center text-sm theme-text-muted">
            No history available for this monitor.
          </div>
        ) : (
          <div className="divide-y theme-border-soft">
            {(history as Array<Record<string, unknown>>).map((item, index) => {
              const httpStatus = normalizeStatusCode(item.http_status);
              const responseTime =
                item.response_time_ms == null
                  ? null
                  : Number(item.response_time_ms);
              const sslDays =
                item.ssl_days_remaining == null
                  ? null
                  : Number(item.ssl_days_remaining);

              const status = String(item.status ?? "UNKNOWN").toUpperCase();

              return (
                <div key={String(item.id ?? index)} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          status === "UP"
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-red-400/10 text-red-300"
                        }`}
                      >
                        {status}
                      </span>

                      {httpStatus !== null ? (
                        <span className="rounded-md border theme-border px-2 py-1 font-mono text-[10px] theme-text-muted">
                          HTTP {httpStatus}
                        </span>
                      ) : (
                        <span className="text-[10px] theme-text-faint">
                          HTTP unavailable
                        </span>
                      )}

                      {responseTime != null &&
                      Number.isFinite(responseTime) ? (
                        <span className="text-[10px] theme-text-muted">
                          {Math.round(responseTime)} ms
                        </span>
                      ) : null}
                    </div>

                    <span className="text-[10px] theme-text-faint">
                      {String(item.checked_at ?? "Unknown time")}
                    </span>
                  </div>

                  {item.error_message ? (
                    <div className="mt-3 rounded-lg border border-red-400/15 bg-red-400/[0.05] p-3 text-xs text-red-300">
                      {String(item.error_message)}
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <HistoryMetric
                      label="SSL"
                      value={
                        item.ssl_valid == null
                          ? "N/A"
                          : item.ssl_valid
                            ? "Valid"
                            : "Invalid"
                      }
                    />
                    <HistoryMetric
                      label="SSL Days"
                      value={
                        sslDays != null && Number.isFinite(sslDays)
                          ? formatSslDays(Math.floor(sslDays))
                          : "N/A"
                      }
                    />
                    <HistoryMetric
                      label="TLS"
                      value={String(item.ssl_tls_version ?? "N/A")}
                    />
                    <HistoryMetric
                      label="Issuer"
                      value={String(item.ssl_issuer ?? "N/A")}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function HistoryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border theme-border-soft theme-surface-soft p-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider theme-text-faint">
        {label}
      </div>
      <div className="mt-1 truncate text-[11px] theme-text-secondary" title={value}>
        {value}
      </div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center theme-overlay p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border theme-border theme-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold theme-text">
            {title}
          </h2>

          <button
            onClick={onClose}
            className="rounded-lg p-2 theme-text-muted hover:theme-hover hover:theme-text"
          >
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium theme-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}


function EmailProvidersPage({
  user,
  providers,
  loading,
  saving,
  error,
  onRefresh,
  onCreate,
}: {
  user: User | null;
  providers: EmailProvider[];
  loading: boolean;
  saving: boolean;
  error: string;
  onRefresh: () => void;
  onCreate: (data: EmailProviderCreate) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const canManageProviders = String(user?.role || "").toUpperCase() === "ADMIN";

  const denyProviderManagement = () => {
    setPermissionError("Permission denied. Only administrators can add or manage email providers.");
    setShowForm(false);
  };

  if (!canManageProviders) {
    return (
      <>
        <div className="mb-6">
          <div className="flex items-center gap-3 text-blue-600">
            <Server size={22} />
            <span className="text-sm theme-text-muted">Notification configuration</span>
          </div>
          <h2 className="mt-2 text-2xl font-bold theme-text">Email Providers</h2>
          <p className="mt-2 text-sm theme-text-muted">Manage notification email delivery configuration.</p>
        </div>

        <section className="rounded-2xl border theme-border theme-surface p-8 shadow-sm">
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
              <AlertCircle size={30} />
            </div>
            <h3 className="text-lg font-semibold theme-text">Permission denied</h3>
            <p className="mt-2 max-w-md text-sm theme-text-muted">
              Only administrators can access or manage email provider configuration.
            </p>
            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs font-medium text-amber-700">
              Administrator access required
            </div>
          </div>
        </section>
      </>
    );
  }

  const [form, setForm] = useState<EmailProviderCreate>({
    name: "",
    provider_type: "smtp",
    host: "",
    port: 587,
    username: "",
    secret: "",
    from_email: "",
    from_name: "Novus",
    tls_enabled: true,
    is_default: false,
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageProviders) {
      denyProviderManagement();
      return;
    }
    if (!form.name.trim() || !form.host?.trim() || !form.from_email.trim()) return;
    await onCreate({
      ...form,
      name: form.name.trim(),
      host: form.host?.trim() || null,
      username: form.username?.trim() || null,
      secret: form.secret || null,
      from_email: form.from_email.trim(),
      from_name: form.from_name?.trim() || "Novus",
      port: Number(form.port) || 587,
    });
    setForm({
      name: "", provider_type: "smtp", host: "", port: 587,
      username: "", secret: "", from_email: "", from_name: "Novus",
      tls_enabled: true, is_default: false,
    });
    setShowForm(false);
  }

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-3 text-cyan-600">
            <Server size={22} />
            <span className="text-sm theme-text-muted">Notification configuration</span>
          </div>
          <h2 className="mt-2 text-2xl font-bold theme-text">Email Providers</h2>
          <p className="mt-2 text-sm theme-text-muted">Configure SMTP providers used for alert notifications.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border theme-border theme-surface-soft px-4 py-2.5 text-sm theme-text-muted disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canManageProviders) {
                denyProviderManagement();
                return;
              }
              setPermissionError("");
              setShowForm((v) => !v);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110"
          >
            <Plus size={17} /> Add Provider
          </button>
        </div>
      </div>

      {(error || permissionError) && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle size={17} />
            <span>{permissionError || error}</span>
          </div>
          {permissionError && (
            <button type="button" onClick={() => setPermissionError("")} className="rounded-lg p-1 hover:bg-red-400/10" aria-label="Dismiss permission error">
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="mb-5 rounded-2xl border theme-border theme-surface p-5">
          <div className="mb-5 flex items-center justify-between">
            <div><h3 className="text-sm font-semibold theme-text">Add SMTP Provider</h3><p className="mt-1 text-xs theme-text-muted">Enter the SMTP connection details.</p></div>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 theme-text-muted hover:theme-hover"><X size={17}/></button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Provider Name"><input required className="input" value={form.name} onChange={e => setForm(f => ({...f,name:e.target.value}))} placeholder="Microsoft 365 SMTP" /></Field>
            <Field label="Provider Type"><input className="input" value={form.provider_type || "smtp"} onChange={e => setForm(f => ({...f,provider_type:e.target.value}))} /></Field>
            <Field label="SMTP Host"><input required className="input" value={form.host || ""} onChange={e => setForm(f => ({...f,host:e.target.value}))} placeholder="smtp.office365.com" /></Field>
            <Field label="SMTP Port"><input required type="number" min={1} max={65535} className="input" value={form.port ?? 587} onChange={e => setForm(f => ({...f,port:Number(e.target.value)}))} /></Field>
            <Field label="Username"><input className="input" value={form.username || ""} onChange={e => setForm(f => ({...f,username:e.target.value}))} /></Field>
            <Field label="SMTP Secret / Password"><input type="password" className="input" value={form.secret || ""} onChange={e => setForm(f => ({...f,secret:e.target.value}))} /></Field>
            <Field label="From Email"><input required type="email" className="input" value={form.from_email} onChange={e => setForm(f => ({...f,from_email:e.target.value}))} placeholder="alerts@example.com" /></Field>
            <Field label="From Name"><input className="input" value={form.from_name || ""} onChange={e => setForm(f => ({...f,from_name:e.target.value}))} placeholder="Novus Alerts" /></Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm theme-text-secondary"><input type="checkbox" checked={!!form.tls_enabled} onChange={e => setForm(f => ({...f,tls_enabled:e.target.checked}))} className="h-4 w-4 accent-cyan-400"/> TLS Enabled</label>
            <label className="flex items-center gap-2 text-sm theme-text-secondary"><input type="checkbox" checked={!!form.is_default} onChange={e => setForm(f => ({...f,is_default:e.target.checked}))} className="h-4 w-4 accent-cyan-400"/> Set as Default</label>
          </div>
          <div className="mt-5 flex justify-end"><button type="submit" disabled={saving || !canManageProviders} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 disabled:opacity-50">{saving && <RefreshCw size={15} className="animate-spin"/>}{saving ? "Saving..." : "Save Provider"}</button></div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border theme-border theme-surface">
        <div className="border-b theme-border p-5"><h3 className="text-sm font-semibold theme-text">Configured Providers</h3><p className="mt-1 text-xs theme-text-muted">Providers returned by the Novus API.</p></div>
        {providers.length === 0 ? <EmptyState icon={<Server size={32}/>} title="No email providers" description={canManageProviders ? "Add an SMTP provider to enable notification delivery." : "No email provider is configured for notification delivery."}/> :
          <div className="overflow-x-auto"><table className="w-full min-w-[850px]"><thead><tr className="border-b theme-border-soft text-left"><TableHeader>Name</TableHeader><TableHeader>Type</TableHeader><TableHeader>Host</TableHeader><TableHeader>From</TableHeader><TableHeader>TLS</TableHeader><TableHeader>Default</TableHeader></tr></thead><tbody>
            {providers.map(p => <tr key={p.id} className="border-b theme-border-soft hover:theme-hover"><td className="px-5 py-4 text-sm font-medium theme-text-secondary">{p.name}</td><td className="px-5 py-4 text-xs theme-text-muted">{p.provider_type}</td><td className="px-5 py-4 text-xs theme-text-muted">{p.host || "—"}{p.port ? `:${p.port}` : ""}</td><td className="px-5 py-4 text-xs theme-text-muted">{p.from_email}</td><td className="px-5 py-4 text-xs">{p.tls_enabled ? <span className="text-emerald-300">Enabled</span> : <span className="theme-text-muted">Disabled</span>}</td><td className="px-5 py-4">{p.is_default ? <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-cyan-600">DEFAULT</span> : <span className="text-xs theme-text-faint">—</span>}</td></tr>)}
          </tbody></table></div>}
      </section>
    </>
  );
}

function RecipientsPage({
  recipients, loading, saving, error, onRefresh, onCreate,
}: {
  recipients: EmailRecipient[];
  loading: boolean;
  saving: boolean;
  error: string;
  onRefresh: () => void;
  onCreate: (data: EmailRecipientCreate) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    await onCreate({ email: email.trim(), name: name.trim() || null });
    setName(""); setEmail(""); setShowForm(false);
  }

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><div className="flex items-center gap-3 text-cyan-600"><Bell size={22}/><span className="text-sm theme-text-muted">Notification configuration</span></div><h2 className="mt-2 text-2xl font-bold theme-text">Recipients</h2><p className="mt-2 text-sm theme-text-muted">Manage email addresses that receive monitoring alerts.</p></div>
        <div className="flex gap-2"><button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border theme-border theme-surface-soft px-4 py-2.5 text-sm theme-text-muted disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Refresh</button><button onClick={() => setShowForm(v => !v)} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110"><Plus size={17}/> Add Recipient</button></div>
      </div>
      {error && <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-300">{error}</div>}
      {showForm && <form onSubmit={submit} className="mb-5 rounded-2xl border theme-border theme-surface p-5"><div className="grid gap-4 md:grid-cols-2"><Field label="Name"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Operations Team"/></Field><Field label="Email"><input required type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="ops@example.com"/></Field></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border theme-border px-4 py-2.5 text-sm theme-text-muted">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 disabled:opacity-50">{saving && <RefreshCw size={15} className="animate-spin"/>}{saving ? "Saving..." : "Save Recipient"}</button></div></form>}
      <section className="overflow-hidden rounded-2xl border theme-border theme-surface"><div className="border-b theme-border p-5"><h3 className="text-sm font-semibold theme-text">Alert Recipients</h3><p className="mt-1 text-xs theme-text-muted">Recipients returned by the Novus API.</p></div>{recipients.length === 0 ? <EmptyState icon={<Bell size={32}/>} title="No recipients" description="Add an email recipient to receive alerts."/> : <div className="overflow-x-auto"><table className="w-full min-w-[600px]"><thead><tr className="border-b theme-border-soft text-left"><TableHeader>Name</TableHeader><TableHeader>Email</TableHeader><TableHeader>ID</TableHeader></tr></thead><tbody>{recipients.map(r => <tr key={r.id} className="border-b theme-border-soft hover:theme-hover"><td className="px-5 py-4 text-sm theme-text-secondary">{r.name || "—"}</td><td className="px-5 py-4 text-sm theme-text-muted">{r.email}</td><td className="px-5 py-4 text-xs theme-text-faint">#{r.id}</td></tr>)}</tbody></table></div>}</section>
    </>
  );
}

function AdminUsersPage({
  users,
  currentUserId,
  loading,
  saving,
  error,
  showForm,
  editingUser,
  form,
  setForm,
  onRefresh,
  onAdd,
  onEdit,
  onSave,
  onCancel,
  onToggle,
  onDelete,
}: {
  users: AdminUser[];
  currentUserId?: number | string;
  loading: number | null;
  saving: boolean;
  error: string;
  showForm: boolean;
  editingUser: AdminUser | null;
  form: { email: string; password: string; role: string };
  setForm: React.Dispatch<React.SetStateAction<{ email: string; password: string; role: string }>>;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (user: AdminUser) => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onToggle: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}) {
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-3 text-cyan-600">
            <Users size={22} />
            <span className="text-sm theme-text-muted">Access management</span>
          </div>
          <h2 className="mt-2 text-2xl font-bold theme-text">Users</h2>
          <p className="mt-2 text-sm theme-text-muted">
            Create, update, enable, disable and delete Novus users.
          </p>
        </div>
        <button
          onClick={onAdd}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <UserPlus size={17} />
          Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <section className="mb-5 rounded-2xl border theme-border theme-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold theme-text">
                {editingUser ? "Edit User" : "Add User"}
              </h3>
              <p className="mt-1 text-xs theme-text-muted">
                {editingUser
                  ? "Update account email, role or password."
                  : "Create a new Novus account."}
              </p>
            </div>
            <button onClick={onCancel} className="rounded-lg p-2 theme-text-muted hover:theme-hover">
              <X size={17} />
            </button>
          </div>

          <form onSubmit={onSave}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-1">
                <label className="mb-1.5 block text-xs font-medium theme-text-secondary">
                  Email
                </label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="input"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium theme-text-secondary">
                  {editingUser ? "New Password (optional)" : "Password"}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  minLength={12}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="input"
                  placeholder="Minimum 12 characters"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium theme-text-secondary">
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="input"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="URL_MANAGER">URL_MANAGER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border theme-border px-4 py-2.5 text-sm theme-text-secondary hover:theme-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <RefreshCw size={15} className="animate-spin" />}
                {saving ? "Saving..." : editingUser ? "Update User" : "Create User"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border theme-border theme-surface">
        <div className="flex items-center justify-between border-b theme-border p-5">
          <div>
            <h3 className="text-sm font-semibold theme-text">User Accounts</h3>
            <p className="mt-1 text-xs theme-text-muted">
              {users.length} account{users.length === 1 ? "" : "s"} configured.
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-lg border theme-border px-3 py-2 text-xs theme-text-muted hover:theme-text"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {users.length === 0 ? (
          <EmptyState
            icon={<Users size={32} />}
            title="No users found"
            description="Create the first user account."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b theme-border-soft text-left">
                  <TableHeader>User</TableHeader>
                  <TableHeader>Role</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody>
                {users.map((adminUser) => {
                  const busy = loading === adminUser.id;
                  const isSelf = String(adminUser.id) === String(currentUserId);

                  return (
                    <tr
                      key={adminUser.id}
                      className="border-b theme-border-soft hover:theme-hover"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10 text-sm font-bold text-cyan-600">
                            {adminUser.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium theme-text-secondary">
                              {adminUser.email}
                              {isSelf && (
                                <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold text-cyan-600">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[10px] theme-text-faint">
                              ID #{adminUser.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-cyan-600">
                          {adminUser.role}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                            adminUser.is_active
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-slate-500/10 theme-text-muted"
                          }`}
                        >
                          {adminUser.is_active ? "ACTIVE" : "DISABLED"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onEdit(adminUser)}
                            disabled={busy}
                            title="Edit user"
                            className="inline-flex items-center gap-1.5 rounded-lg border theme-border px-3 py-2 text-xs theme-text-secondary hover:theme-hover disabled:opacity-50"
                          >
                            <Pencil size={14} />
                            Edit
                          </button>

                          <button
                            onClick={() => onToggle(adminUser)}
                            disabled={busy || isSelf}
                            title={isSelf ? "You cannot disable your own account" : adminUser.is_active ? "Disable user" : "Enable user"}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                              adminUser.is_active
                                ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"
                            }`}
                          >
                            {busy ? "Working..." : adminUser.is_active ? "Disable" : "Enable"}
                          </button>

                          <button
                            onClick={() => onDelete(adminUser)}
                            disabled={busy || isSelf}
                            title={isSelf ? "You cannot delete your own account" : "Delete user"}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function AlertMonitoringPage({
  monitors,
}: {
  monitors: Monitor[];
}) {
  const alertMonitors = monitors.filter(
    (monitor) => String(monitor.status).toUpperCase() === "DOWN",
  );

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm theme-text-muted">
            <Bell size={18} className="text-cyan-600" />
            Alert center
          </div>
          <h2 className="mt-1 text-2xl font-bold theme-text">
            Alert Monitoring
          </h2>
          <p className="mt-2 text-sm theme-text-muted">
            Monitor endpoint alerts and quickly identify services that need attention.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.08] px-4 py-2 text-xs font-semibold text-cyan-600">
          <span className="h-2 w-2 rounded-full bg-cyan-500" />
          {alertMonitors.length} active alert{alertMonitors.length === 1 ? "" : "s"}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border theme-border theme-surface shadow-sm">
        <div className="border-b theme-border p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-500/10 p-2.5 text-red-500">
              <AlertTriangle size={19} />
            </div>
            <div>
              <h3 className="text-sm font-semibold theme-text">
                Current Alerts
              </h3>
              <p className="mt-1 text-xs theme-text-muted">
                Active DOWN endpoints from the latest monitoring checks.
              </p>
            </div>
          </div>
        </div>

        {alertMonitors.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center px-5 text-center">
            <div className="rounded-full bg-emerald-500/10 p-4 text-emerald-500">
              <CheckCircle2 size={34} />
            </div>
            <h3 className="mt-4 text-sm font-semibold theme-text-secondary">
              No active alerts
            </h3>
            <p className="mt-1 max-w-md text-xs theme-text-muted">
              All monitored endpoints are currently operational.
            </p>
          </div>
        ) : (
          <div className="divide-y theme-border-soft">
            {alertMonitors.map((monitor) => {
              const code = getStatusCode(monitor);
              return (
                <div
                  key={monitor.id}
                  className="flex flex-col gap-4 p-5 transition hover:theme-hover sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.45)]" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold theme-text">
                        {monitor.name}
                      </div>
                      <div className="mt-1 truncate text-xs theme-text-muted">
                        {monitor.url}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-500">
                          DOWN
                        </span>
                        {code !== null && (
                          <span className="rounded-md border theme-border px-2 py-1 font-mono text-[10px] theme-text-muted">
                            HTTP {code}
                          </span>
                        )}
                        {monitor.error_message && (
                          <span className="text-[10px] theme-text-muted">
                            {monitor.error_message}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-wider theme-text-faint">
                      Monitor status
                    </div>
                    <div className="mt-1 text-xs font-medium text-red-500">
                      Attention required
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function SimplePage({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3 text-cyan-600">
          {icon}
          <span className="text-sm theme-text-muted">
            Novus configuration
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-bold theme-text">
          {title}
        </h2>
        <p className="mt-2 text-sm theme-text-muted">
          {description}
        </p>
      </div>

      <section className="rounded-2xl border theme-border theme-surface p-5">
        {children}
      </section>
    </>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-5 text-center">
      <div className="theme-text-faint">{icon}</div>
      <h3 className="mt-4 text-sm font-semibold theme-text-secondary">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-xs theme-text-muted">
        {description}
      </p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center theme-bg-deep">
      <div className="flex flex-col items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20">
          <Activity
            size={23}
            className="animate-pulse"
          />
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs theme-text-muted">
          <RefreshCw
            size={14}
            className="animate-spin"
          />
          Loading Novus...
        </div>
      </div>
    </div>
  );
}

function LoginScreen({
  email,
  password,
  setEmail,
  setPassword,
  error,
  loading,
  onSubmit,
  theme,
  toggleTheme,
}: {
  email: string;
  password: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  error: string;
  loading: boolean;
  onSubmit: (
    event: React.FormEvent<HTMLFormElement>,
  ) => void;
  theme: Theme;
  toggleTheme: () => void;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden theme-bg-deep px-4">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />

      <button
        onClick={toggleTheme}
        className="absolute right-5 top-5 z-10 rounded-xl border theme-border theme-surface-soft p-2.5 theme-text-muted hover:theme-text"
        title="Toggle theme"
      >
        {theme === "dark" ? (
          <Sun size={18} />
        ) : (
          <Moon size={18} />
        )}
      </button>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20">
            <Activity
              size={27}
              strokeWidth={2.5}
            />
          </div>

          <h1 className="mt-5 text-2xl font-bold theme-text">
            Novus
          </h1>

          <p className="mt-1 text-xs uppercase tracking-[0.2em] theme-text-muted">
            Loyalty
          </p>
        </div>

        <div className="rounded-2xl border theme-border theme-surface p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold theme-text">
              Welcome back
            </h2>
            <p className="mt-1 text-sm theme-text-muted">
              Sign in to access your monitoring dashboard.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3.5 text-xs text-red-300">
              <AlertCircle
                size={16}
                className="mt-0.5 shrink-0"
              />
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={onSubmit}
            className="space-y-4"
          >
            <Field label="Email address">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
                className="input"
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="••••••••"
                className="input"
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && (
                <RefreshCw
                  size={16}
                  className="animate-spin"
                />
              )}
              {loading
                ? "Signing in..."
                : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[10px] theme-text-faint">
          Novus Loyalty • Secure monitoring platform
        </p>
      </div>
    </div>
  );
}

function TableHeader({
  children,
}: {
  children?: ReactNode;
}) {
  return (
    <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] theme-text-muted">
      {children}
    </th>
  );
}

function StatCard({
  icon,
  label,
  value,
  description,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  description: string;
  tone:
    | "cyan"
    | "green"
    | "red"
    | "violet";
}) {
  const tones = {
    cyan: "bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-transparent text-cyan-600 shadow-sm",
    green: "bg-emerald-400/10 text-emerald-300",
    red: "bg-red-400/10 text-red-300",
    violet: "bg-violet-400/10 text-violet-300",
  };

  return (
    <div className="rounded-2xl border theme-border theme-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium theme-text-muted">
            {label}
          </div>
          <div className="mt-3 text-3xl font-bold theme-text">
            {value}
          </div>
        </div>

        <div
          className={`rounded-xl p-3 ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>

      <div className="mt-4 text-[11px] theme-text-muted">
        {description}
      </div>
    </div>
  );
}

function MonitorRow({
  monitor,
  onClick,
}: {
  monitor: Monitor;
  onClick: () => void;
}) {
  const isUp =
    String(monitor.status).toUpperCase() === "UP";

  return (
    <tr className="border-b theme-border-soft hover:theme-hover">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`h-2 w-2 rounded-full ${
              isUp
                ? "bg-emerald-400"
                : "bg-red-400"
            }`}
          />

          <div className="min-w-0">
            <div className="text-sm font-medium theme-text-secondary">
              {monitor.name}
            </div>
            <div className="mt-1 max-w-[300px] truncate text-[11px] theme-text-muted">
              {monitor.url}
            </div>
            <div className="mt-1 text-[10px] theme-text-faint">
              ID #{monitor.id}
            </div>
          </div>
        </div>
      </td>

      <td className="px-5 py-4">
        <span className="rounded-md border theme-border px-2 py-1 font-mono text-[11px] theme-text-muted">
          {monitor.expected_status}
        </span>
      </td>

      <td className="px-5 py-4">
        {monitor.ssl_enabled ? (
          <span className="text-xs text-emerald-300">
            Enabled
          </span>
        ) : (
          <span className="text-xs theme-text-muted">
            Disabled
          </span>
        )}
      </td>

      <td className="px-5 py-4">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
            monitor.is_active
              ? "bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-transparent text-cyan-600 shadow-sm"
              : "theme-disabled theme-text-muted"
          }`}
        >
          {monitor.is_active
            ? "ACTIVE"
            : "DISABLED"}
        </span>
      </td>

      <td className="px-5 py-4">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
            isUp
              ? "bg-emerald-400/10 text-emerald-300"
              : "bg-red-400/10 text-red-300"
          }`}
        >
          {String(monitor.status).toUpperCase()}
        </span>
      </td>

      <td className="px-5 py-4 text-right">
        <button
          onClick={onClick}
          className="rounded-lg p-1.5 theme-text-muted hover:theme-hover hover:theme-text"
          title="Edit monitor"
        >
          <ChevronRight size={17} />
        </button>
      </td>
    </tr>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "cyan";
}) {
  const colors = {
    green: "text-emerald-400",
    red: "text-red-400",
    cyan: "text-cyan-600",
  };

  return (
    <div className="rounded-xl border theme-border-soft theme-surface-soft p-3">
      <div
        className={`text-[10px] font-semibold ${colors[tone]}`}
      >
        {label}
      </div>
      <div className="mt-1 text-lg font-bold theme-text">
        {value}
      </div>
    </div>
  );
}

export default App;
