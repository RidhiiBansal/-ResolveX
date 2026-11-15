
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Ticket,
  Users,
  BarChart3,
  Settings,
  Search,
  Bell,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  X,
  Headphones,
  Save,
  LogOut
} from "lucide-react";

import api, { getApiError } from "./api.js";
import "./App.css";

const emptyForm = {
  title: "",
  customer: "",
  description: "",
  category: "Technical",
  priority: "Medium"
};

function TicketTable({ tickets, onStatusChange, updatingTicketIds }) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Ticket ID</th>
            <th>Subject</th>
            <th>Customer</th>
            <th>Category</th>
            <th>Priority</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map(ticket => (
            <tr key={ticket.id}>
              <td className="ticket-id">{ticket.id}</td>
              <td>{ticket.title}</td>
              <td>{ticket.customer}</td>
              <td>{ticket.category}</td>
              <td>
                <span className={`priority ${ticket.priority.toLowerCase()}`}>
                  {ticket.priority}
                </span>
              </td>
              <td>
                <select
                  className={`status status-select ${ticket.status.toLowerCase()}`}
                  aria-label={`Update status for ${ticket.id}`}
                  value={ticket.status}
                  onChange={event => onStatusChange(ticket.id, event.target.value)}
                  disabled={updatingTicketIds.has(ticket.id)}
                >
                  <option>Open</option>
                  <option>Pending</option>
                  <option>Resolved</option>
                </select>
              </td>
            </tr>
          ))}
          {tickets.length === 0 && (
            <tr>
              <td colSpan="6" className="empty-state">No tickets found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsView({ tickets }) {
  const statuses = ["Open", "Pending", "Resolved"].map(status => ({
    label: status,
    count: tickets.filter(ticket => ticket.status === status).length
  }));
  const priorities = ["Critical", "High", "Medium", "Low"].map(priority => ({
    label: priority,
    count: tickets.filter(ticket => ticket.priority === priority).length
  }));
  const maxCount = Math.max(1, ...statuses.map(item => item.count), ...priorities.map(item => item.count));

  function renderBreakdown(title, items) {
    return (
      <section className="analysis-card">
        <h2>{title}</h2>
        {items.map(item => (
          <div className="chart-row" key={item.label}>
            <span>{item.label}</span>
            <div className="chart-track">
              <div
                className={`chart-bar ${item.label.toLowerCase()}`}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
            <strong>{item.count}</strong>
          </div>
        ))}
      </section>
    );
  }

  return (
    <>
      <div className="stats-grid analytics-stats">
        <div className="stat-card">
          <p>Total Tickets</p>
          <h2>{tickets.length}</h2>
        </div>
        <div className="stat-card">
          <p>Open Rate</p>
          <h2>{tickets.length ? `${Math.round((statuses[0].count / tickets.length) * 100)}%` : "0%"}</h2>
        </div>
        <div className="stat-card">
          <p>Resolved</p>
          <h2>{statuses[2].count}</h2>
        </div>
      </div>
      <div className="analytics-grid">
        {renderBreakdown("Tickets by status", statuses)}
        {renderBreakdown("Tickets by priority", priorities)}
      </div>
    </>
  );
}

function AuthScreen({ setupRequired, connectionError, onRetry, onAuthenticated }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setIsSubmitting(true);
    try {
      const endpoint = setupRequired ? "/auth/setup" : "/auth/login";
      const body = setupRequired
        ? { displayName: displayName.trim(), email: email.trim(), password }
        : { email: email.trim(), password };
      const response = await api.post(endpoint, body);
      onAuthenticated(response.data.user);
    } catch (error) {
      setFormError(getApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-brand">
        <div className="brand-icon"><Headphones size={23} /></div>
        <div>
          <strong>ResolveX</strong>
          <span>Support Workspace</span>
        </div>
      </div>
      <section className="auth-card">
        {connectionError ? (
          <div className="auth-connection-error" role="alert">
            <h1>Unable to connect</h1>
            <p>{connectionError}</p>
            <button className="primary-button" onClick={onRetry}>Retry</button>
          </div>
        ) : (
          <>
            <h1>{setupRequired ? "Set up your workspace" : "Welcome back"}</h1>
            <p className="auth-intro">
              {setupRequired
                ? "Create the first administrator account to secure this workspace."
                : "Sign in to manage your support workspace."}
            </p>
            <form onSubmit={handleSubmit}>
              {setupRequired && (
                <div className="form-group">
                  <label htmlFor="auth-display-name">Display name</label>
                  <input
                    id="auth-display-name"
                    value={displayName}
                    onChange={event => setDisplayName(event.target.value)}
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete={setupRequired ? "new-password" : "current-password"}
                  minLength={setupRequired ? 12 : 1}
                  maxLength={128}
                  required
                />
                {setupRequired && (
                  <span className="password-hint">Use at least 12 characters.</span>
                )}
              </div>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Please wait…"
                  : setupRequired
                    ? "Create administrator"
                    : "Sign in"}
              </button>
            </form>
            {setupRequired && (
              <p className="auth-note">Initial setup closes after the first account is created.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function WorkspaceApp({ authUser, onAuthUserChange, onLogout }) {
  const [active, setActive] = useState("Overview");
  const [tickets, setTickets] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [profileName, setProfileName] = useState(authUser.displayName);
  const [profileDraft, setProfileDraft] = useState(authUser.displayName);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [actionError, setActionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [updatingTicketIds, setUpdatingTicketIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const [ticketsResponse, profileResponse] = await Promise.all([
          api.get("/tickets"),
          api.get("/profile")
        ]);
        if (cancelled) return;
        setTickets(ticketsResponse.data);
        setProfileName(profileResponse.data.displayName);
        setProfileDraft(profileResponse.data.displayName);
        setLoadError("");
      } catch (error) {
        if (!cancelled) setLoadError(getApiError(error));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!showForm) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setShowForm(false);
        setFormError("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showForm]);

  const openTickets = tickets.filter(t => t.status === "Open").length;
  const pendingTickets = tickets.filter(t => t.status === "Pending").length;
  const resolvedTickets = tickets.filter(t => t.status === "Resolved").length;

  const stats = [
    { label: "Total Tickets", value: tickets.length, icon: Ticket, color: "blue" },
    { label: "Open Tickets", value: openTickets, icon: AlertCircle, color: "orange" },
    { label: "Pending Tickets", value: pendingTickets, icon: Clock, color: "purple" },
    { label: "Resolved Tickets", value: resolvedTickets, icon: CheckCircle, color: "green" }
  ];

  const navigation = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "My Tickets", icon: Ticket },
    { label: "Customers", icon: Users },
    { label: "Analytics", icon: BarChart3 },
    { label: "Settings", icon: Settings }
  ];

  const filteredTickets = tickets.filter(ticket =>
    `${ticket.id} ${ticket.title} ${ticket.customer} ${ticket.description || ""} ${ticket.category} ${ticket.priority} ${ticket.status}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );

  const customerMap = new Map();
  tickets.forEach(ticket => {
    const key = ticket.customer.trim().toLowerCase();
    const customer = customerMap.get(key) || {
      name: ticket.customer,
      ticketCount: 0,
      openCount: 0,
      categories: new Set()
    };
    customer.ticketCount += 1;
    if (ticket.status === "Open") customer.openCount += 1;
    customer.categories.add(ticket.category);
    customerMap.set(key, customer);
  });
  const customers = [...customerMap.values()]
    .filter(customer => customer.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const profileInitials = profileName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("") || "U";

  function handleInputChange(e) {
    const { name, value } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setFormError("");
  }

  async function handleCreateTicket(e) {
    e.preventDefault();

    const title = formData.title.trim();
    const customer = formData.customer.trim();
    const description = formData.description.trim();
    if (!title || !customer || !description) {
      setFormError("Enter a title, customer name, and description.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    try {
      const response = await api.post("/tickets", {
        title,
        customer,
        description,
        category: formData.category,
        priority: formData.priority
      });
      const newTicket = response.data;
      setTickets(prev => [newTicket, ...prev]);
      setNotifications(prev => [`Ticket ${newTicket.id} was created.`, ...prev].slice(0, 5));
      setFormData(emptyForm);
      setShowForm(false);
      setActive("My Tickets");
      setSearch("");
    } catch (error) {
      setFormError(getApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    const name = profileDraft.trim();
    if (!name) {
      setSettingsMessage("Display name cannot be empty.");
      return;
    }
    setIsSavingSettings(true);
    setSettingsError("");
    setSettingsMessage("");
    try {
      const response = await api.put("/profile", { displayName: name });
      setProfileName(response.data.displayName);
      setProfileDraft(response.data.displayName);
      onAuthUserChange({ ...authUser, displayName: response.data.displayName });
      setSettingsMessage("Profile updated.");
    } catch (error) {
      setSettingsError(getApiError(error));
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleStatusChange(ticketId, status) {
    setActionError("");
    setUpdatingTicketIds(prev => new Set(prev).add(ticketId));
    try {
      const response = await api.patch(`/tickets/${encodeURIComponent(ticketId)}`, { status });
      setTickets(prev => prev.map(ticket =>
        ticket.id === ticketId ? response.data : ticket
      ));
      setNotifications(prev => [`Ticket ${ticketId} moved to ${status}.`, ...prev].slice(0, 5));
    } catch (error) {
      setActionError(getApiError(error));
    } finally {
      setUpdatingTicketIds(prev => {
        const next = new Set(prev);
        next.delete(ticketId);
        return next;
      });
    }
  }

  function retryWorkspaceLoad() {
    setLoadError("");
    setIsLoading(true);
    setLoadAttempt(prev => prev + 1);
  }

  async function handleLogout() {
    setActionError("");
    try {
      await api.post("/auth/logout");
      onLogout();
    } catch (error) {
      setActionError(getApiError(error));
    }
  }

  function openCreateForm() {
    setFormData(emptyForm);
    setFormError("");
    setShowForm(true);
  }

  return (
    <div className="app-layout">

      {/* SIDEBAR */}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Headphones size={23} />
          </div>
          <div>
            <h2>ResolveX</h2>
            <span>Support Workspace</span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav>
          {navigation.map(item => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className={`nav-item ${active === item.label ? "active" : ""}`}
                aria-current={active === item.label ? "page" : undefined}
                onClick={() => {
                  setActive(item.label);
                  setNotificationsOpen(false);
                }}
              >
                <Icon size={19} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <Headphones size={21} />
            <h4>Need assistance?</h4>
            <p>Our support team is here to help.</p>
            <button onClick={() => setActive("My Tickets")}>
              Get Support
            </button>
          </div>

          <div className="profile">
            <div className="avatar">{profileInitials}</div>
            <div>
              <strong>{profileName}</strong>
              <span>{authUser.email}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="main-content">

        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace /</span>
            <h2>{active}</h2>
          </div>

          <div className="top-actions">
            <div className="search-box">
              <Search size={18} />
              <input
                aria-label={active === "Customers" ? "Search customers" : "Search tickets"}
                placeholder={active === "Customers" ? "Search customers..." : "Search tickets..."}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="search-clear"
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="notification-wrap">
              <button
                className="icon-button"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen(open => !open)}
              >
                <Bell size={20} />
                {notifications.length > 0 && <span className="notification-dot" />}
              </button>
              {notificationsOpen && (
                <div className="notification-panel" role="status">
                  <div className="notification-heading">
                    <strong>Notifications</strong>
                    {notifications.length > 0 && (
                      <button type="button" onClick={() => setNotifications([])}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length > 0 ? (
                    notifications.map((notification, index) => (
                      <p key={`${notification}-${index}`}>{notification}</p>
                    ))
                  ) : (
                    <p>You're all caught up.</p>
                  )}
                </div>
              )}
            </div>

            <div className="avatar">{profileInitials}</div>
          </div>
        </header>

        {actionError && (
          <div className="action-error" role="alert">{actionError}</div>
        )}

        <section className="dashboard-content">
          {isLoading ? (
            <div className="loading-state" role="status">Loading workspace…</div>
          ) : loadError ? (
            <div className="load-error" role="alert">
              <h1>Unable to load the workspace</h1>
              <p>{loadError}</p>
              <button className="primary-button" onClick={retryWorkspaceLoad}>
                Retry
              </button>
            </div>
          ) : (
            <>
          {active === "Overview" && (
            <>
              <div className="welcome-row">
                <div>
                  <h1>Good morning, {profileName.split(" ")[0]} 👋</h1>
                  <p>Here's what's happening with your support workspace today.</p>
                </div>
                <button className="primary-button" onClick={openCreateForm}>
                  <Plus size={18} />
                  Create Ticket
                </button>
              </div>

              <div className="stats-grid">
                {stats.map(stat => {
                  const Icon = stat.icon;
                  return (
                    <div className="stat-card" key={stat.label}>
                      <div className={`stat-icon ${stat.color}`}>
                        <Icon size={21} />
                      </div>
                      <p>{stat.label}</p>
                      <h2>{stat.value}</h2>
                      <span className="stat-note">Updated from ticket records</span>
                    </div>
                  );
                })}
              </div>

              <section className="tickets-section">
                <div className="section-heading">
                  <div>
                    <h2>Recent Tickets</h2>
                    <p>Monitor and manage your latest support requests.</p>
                  </div>
                  <span className="ticket-count">{Math.min(filteredTickets.length, 5)} tickets</span>
                </div>
                <TicketTable
                  tickets={filteredTickets.slice(0, 5)}
                  onStatusChange={handleStatusChange}
                  updatingTicketIds={updatingTicketIds}
                />
              </section>
            </>
          )}

          {active === "My Tickets" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>My Tickets</h1>
                  <p>Review and manage support requests.</p>
                </div>
                <button className="primary-button" onClick={openCreateForm}>
                  <Plus size={18} />
                  Create Ticket
                </button>
              </div>
              <section className="tickets-section">
                <div className="section-heading">
                  <div>
                    <h2>All Tickets</h2>
                    <p>{filteredTickets.length} matching tickets</p>
                  </div>
                  <span className="ticket-count">{filteredTickets.length} tickets</span>
                </div>
                <TicketTable
                  tickets={filteredTickets}
                  onStatusChange={handleStatusChange}
                  updatingTicketIds={updatingTicketIds}
                />
              </section>
            </>
          )}

          {active === "Customers" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Customers</h1>
                  <p>Customers are grouped from the tickets in this workspace.</p>
                </div>
              </div>
              <section className="tickets-section">
                <div className="section-heading">
                  <div>
                    <h2>Customer directory</h2>
                    <p>{customers.length} matching customers</p>
                  </div>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Tickets</th>
                        <th>Open Tickets</th>
                        <th>Categories</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map(customer => (
                        <tr key={customer.name.toLowerCase()}>
                          <td>{customer.name}</td>
                          <td>{customer.ticketCount}</td>
                          <td>{customer.openCount}</td>
                          <td>{[...customer.categories].join(", ")}</td>
                        </tr>
                      ))}
                      {customers.length === 0 && (
                        <tr>
                          <td colSpan="4" className="empty-state">No customers found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {active === "Analytics" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Analytics</h1>
                  <p>Ticket volume and distribution for this workspace.</p>
                </div>
              </div>
              <AnalyticsView tickets={tickets} />
            </>
          )}

          {active === "Settings" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Settings</h1>
                  <p>Manage your workspace profile.</p>
                </div>
              </div>
              <form className="settings-card" onSubmit={handleSaveSettings}>
                <h2>Profile</h2>
                <p>This display name is used in your workspace.</p>
                <div className="account-email">
                  <strong>Signed in as</strong>
                  <span>{authUser.email}</span>
                </div>
                <label htmlFor="profile-name">Display name</label>
                <input
                  id="profile-name"
                  value={profileDraft}
                  disabled={isSavingSettings}
                  onChange={event => {
                    setProfileDraft(event.target.value);
                    setSettingsMessage("");
                    setSettingsError("");
                  }}
                  required
                />
                {settingsError && (
                  <p className="form-error" role="alert">{settingsError}</p>
                )}
                {settingsMessage && (
                  <p className="settings-message" role="status">{settingsMessage}</p>
                )}
                <button className="primary-button" type="submit" disabled={isSavingSettings}>
                  <Save size={16} />
                  {isSavingSettings ? "Saving…" : "Save changes"}
                </button>
                <button className="cancel-button sign-out-button" type="button" onClick={handleLogout}>
                  <LogOut size={16} />
                  Sign out
                </button>
              </form>
            </>
          )}
            </>
          )}
        </section>
      </main>

      {/* CREATE TICKET MODAL */}

      {showForm && (
        <div
          className="modal-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setShowForm(false);
              setFormError("");
            }
          }}
        >
          <div className="ticket-modal" role="dialog" aria-modal="true" aria-labelledby="create-ticket-title">

            <div className="modal-header">
              <div>
                <h2 id="create-ticket-title">Create New Ticket</h2>
                <p>Enter the details of the customer issue.</p>
              </div>

              <button
                className="close-button"
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormError("");
                }}
                aria-label="Close form"
              >
                <X size={21} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket}>

              <div className="form-group">
                <label htmlFor="ticket-title">Ticket Title</label>
                <input
                  id="ticket-title"
                  type="text"
                  name="title"
                  placeholder="Enter issue title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="ticket-customer">Customer Name</label>
                <input
                  id="ticket-customer"
                  type="text"
                  name="customer"
                  placeholder="Enter customer name"
                  value={formData.customer}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="ticket-description">Description</label>
                <textarea
                  id="ticket-description"
                  name="description"
                  placeholder="Describe the customer's issue..."
                  value={formData.description}
                  onChange={handleInputChange}
                  required
                  rows="4"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ticket-category">Category</label>
                  <select
                    id="ticket-category"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                  >
                    <option>Technical</option>
                    <option>Billing</option>
                    <option>Account</option>
                    <option>General</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="ticket-priority">Priority</label>
                  <select
                    id="ticket-priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Critical</option>
                  </select>
                </div>
              </div>

              {formError && <p className="form-error" role="alert">{formError}</p>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    setShowForm(false);
                    setFormError("");
                  }}
                >
                  Cancel
                </button>

                <button type="submit" className="primary-button" disabled={isSubmitting}>
                  <Plus size={17} />
                  {isSubmitting ? "Submitting…" : "Submit Ticket"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authAttempt, setAuthAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthState() {
      try {
        const response = await api.get("/auth/state");
        if (cancelled) return;
        setAuthUser(response.data.user);
        setSetupRequired(response.data.setupRequired);
        setAuthError("");
      } catch (error) {
        if (!cancelled) setAuthError(getApiError(error));
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    loadAuthState();
    return () => {
      cancelled = true;
    };
  }, [authAttempt]);

  useEffect(() => {
    function handleUnauthorized() {
      setAuthUser(null);
    }

    window.addEventListener("resolvex:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("resolvex:unauthorized", handleUnauthorized);
  }, []);

  if (authLoading) {
    return <main className="auth-screen"><p role="status">Connecting to ResolveX…</p></main>;
  }

  if (!authUser) {
    return (
      <AuthScreen
        setupRequired={setupRequired}
        connectionError={authError}
        onRetry={() => {
          setAuthError("");
          setAuthLoading(true);
          setAuthAttempt(prev => prev + 1);
        }}
        onAuthenticated={user => {
          setAuthUser(user);
          setSetupRequired(false);
          setAuthError("");
        }}
      />
    );
  }

  return (
    <WorkspaceApp
      key={authUser.id}
      authUser={authUser}
      onAuthUserChange={setAuthUser}
      onLogout={() => setAuthUser(null)}
    />
  );
}

export default App;
