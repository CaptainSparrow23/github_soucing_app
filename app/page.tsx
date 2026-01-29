
"use client";

import { useState, useEffect } from "react";
import LightRays from "../components/LightRays";

export default function Home() {
  // Auth is no longer required; removed auth check and login handler.
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState("");
  const [mode, setMode] = useState<'api' | 'clone'>("api");
  const [authStatus, setAuthStatus] = useState<{
    signedIn: boolean;
    user?: {
      displayName?: string;
      mail?: string;
      userPrincipalName?: string;
    };
  } | null>(null);
  const [authError, setAuthError] = useState("");
  const [emailTabs, setEmailTabs] = useState<{
    id: string;
    to: string;
    subject: string;
    body: string;
    attachments: File[];
    status?: string;
  }[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const signatureHtml = `
    <p style="margin: 16px 0 0;">Best regards,</p>
    <p style="margin: 4px 0;">C++ Developer Sourcing Team</p>
    <p style="margin: 4px 0;">
      <a href="https://www.microsoft.com" target="_blank" rel="noreferrer">Visit our site</a>
    </p>
    <p style="margin: 8px 0 0;">
      <img src="/globe.svg" alt="Company logo" style="width: 120px; height: auto;" />
    </p>
  `;

  const buildDefaultBody = (name?: string) => `
    <p>Hi ${name || "there"},</p>
    <p>I found your C++ contributions and wanted to reach out about opportunities.</p>
    ${signatureHtml}
  `;

  const createEmailTab = (seed?: Partial<{ to: string; subject: string; body: string }>) => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
    const newTab = {
      id,
      to: seed?.to || "",
      subject: seed?.subject || "C++ Opportunities",
      body: seed?.body || buildDefaultBody(),
      attachments: [] as File[],
      status: ""
    };
    setEmailTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  };

  const updateEmailTab = (
    id: string,
    updates: Partial<{ to: string; subject: string; body: string; attachments: File[]; status: string }>
  ) => {
    setEmailTabs((prev) => prev.map((tab) => (tab.id === id ? { ...tab, ...updates } : tab)));
  };

  const removeEmailTab = (id: string) => {
    setEmailTabs((prev) => {
      const remaining = prev.filter((tab) => tab.id !== id);
      setActiveTabId((current) => {
        if (current !== id) return current;
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      });
      return remaining;
    });
  };

  useEffect(() => {
    const loadAuthStatus = async () => {
      try {
        const res = await fetch("/api/microsoft/status");
        if (!res.ok) {
          const data = await res.json();
          setAuthError(data.error || "Unable to load Microsoft status.");
          setAuthStatus({ signedIn: false });
          return;
        }
        const data = await res.json();
        setAuthStatus(data);
      } catch (err) {
        setAuthError("Unable to load Microsoft status.");
        setAuthStatus({ signedIn: false });
      }
    };

    loadAuthStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResults([]);
    setLogs("");
    try {
      let res: Response | undefined = undefined, data;
      if (mode === "api") {
        res = await fetch("/api/cpp-committers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl })
        });
      } else if (mode === "clone") {
        res = await fetch("/api/clone-and-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl })
        });
      }
      if (!res) {
        setError("No response from server");
        setLoading(false);
        return;
      }
      data = await res.json();
      setLogs(data.logs || "");
      if (!res.ok) {
        setError(data.error || "Failed to fetch data");
      } else {
        setResults(data.results || []);
      }
    } catch (err: any) {
      setError("Failed to fetch data");
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    setAuthError("");
    try {
      await fetch("/api/auth/microsoft/logout", { method: "POST" });
    } catch (err) {
      setAuthError("Unable to sign out right now.");
    }
    setAuthStatus({ signedIn: false });
  };

  const handleSendEmail = async (tabId: string) => {
    const tab = emailTabs.find((entry) => entry.id === tabId);
    if (!tab) return;
    updateEmailTab(tabId, { status: "" });
    setAuthError("");
    try {
      const attachments = await Promise.all(
        tab.attachments.map(
          (file) =>
            new Promise<{ name: string; contentType: string; contentBytes: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = typeof reader.result === "string" ? reader.result : "";
                const base64 = result.split(",")[1] || "";
                resolve({
                  name: file.name,
                  contentType: file.type || "application/octet-stream",
                  contentBytes: base64
                });
              };
              reader.onerror = () => reject(new Error("Failed to read attachment"));
              reader.readAsDataURL(file);
            })
        )
      );
      const res = await fetch("/api/microsoft/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: tab.to,
          subject: tab.subject,
          body: tab.body,
          attachments
        })
      });
      const data = await res.json();
      if (!res.ok) {
        updateEmailTab(tabId, { status: data.error || "Failed to send email." });
        return;
      }
      updateEmailTab(tabId, { status: "Email sent successfully." });
    } catch (err) {
      updateEmailTab(tabId, { status: "Failed to send email." });
    }
  };

  const activeTab = emailTabs.find((tab) => tab.id === activeTabId) || null;

  return (
    <div className="relative min-h-screen bg-zinc-900 font-sans overflow-hidden">
      {/* Light rays background effect */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <LightRays
          raysOrigin="top-center"
          raysColor="#ffffff"
          raysSpeed={1}
          lightSpread={0.5}
          rayLength={3}
          followMouse={true}
          mouseInfluence={0.1}
          noiseAmount={0}
          distortion={0}
          className="custom-rays"
          pulsating={false}
          fadeDistance={1}
          saturation={1}
        />
      </div>
      <div className="relative z-10 flex min-h-screen w-full flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-extrabold text-blue-300">C++ Developer Sourcing Portal</h1>
          <p className="text-blue-200 max-w-3xl">
            Paste a repository URL on the left, review the contributors table below, and open multiple email tabs on the
            right for outreach.
          </p>
        </div>
        <div className="w-full max-w-3xl bg-zinc-800 rounded-lg shadow-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-blue-300">Microsoft Email</p>
              {authStatus?.signedIn ? (
                <p className="text-blue-100 text-sm">
                  Signed in as{" "}
                  <span className="font-semibold">
                    {authStatus.user?.displayName || authStatus.user?.mail || authStatus.user?.userPrincipalName}
                  </span>
                </p>
              ) : (
                <p className="text-blue-100 text-sm">Connect a Microsoft account to send emails.</p>
              )}
            </div>
            {authStatus?.signedIn ? (
              <button
                onClick={handleLogout}
                className="px-3 py-2 rounded bg-zinc-900 text-blue-200 border border-blue-700 hover:bg-blue-800 transition-colors"
              >
                Sign out
              </button>
            ) : (
              <a
                href="/api/auth/microsoft"
                className="px-3 py-2 rounded bg-blue-700 text-white font-semibold hover:bg-blue-800 transition-colors"
              >
                Sign in with Microsoft
              </a>
            )}
          </div>
          {authError && <p className="text-xs text-red-400">{authError}</p>}
        </div>
        <div className="flex w-full flex-1 flex-col gap-6 lg:flex-row">
          <div className="w-full lg:w-3/5">
            <div className="flex gap-4">
              <button
                onClick={() => setMode('api')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition-colors ${
                  mode === 'api' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-blue-300 hover:bg-blue-800'
                }`}
              >
                GitHub API
              </button>
              <button
                onClick={() => setMode('clone')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition-colors ${
                  mode === 'clone' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-blue-300 hover:bg-blue-800'
                }`}
              >
                Local Git
              </button>
            </div>
            <div className="w-full p-6 mb-4 bg-zinc-800 rounded-lg shadow-lg">
              {mode === 'api' && (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <input
                    type="text"
                    placeholder="Paste GitHub repo URL..."
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    className="border-2 border-blue-700 rounded px-4 py-2 text-lg focus:outline-none focus:border-blue-400 bg-zinc-900 text-blue-100 placeholder:text-blue-400"
                    required
                  />
                  <button
                    type="submit"
                    className="bg-blue-700 text-white rounded px-4 py-2 font-semibold hover:bg-blue-800 disabled:bg-blue-300 transition-colors"
                    disabled={loading}
                  >
                    {loading ? "Generating..." : "Generate"}
                  </button>
                </form>
              )}
              {mode === 'clone' && (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <input
                    type="text"
                    placeholder="Paste GitHub repo URL to analyze (will use local if exists)"
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    className="border-2 border-blue-700 rounded px-4 py-2 text-lg focus:outline-none focus:border-blue-400 bg-zinc-900 text-blue-100 placeholder:text-blue-400"
                    required
                  />
                  <button
                    type="submit"
                    className="bg-blue-700 text-white rounded px-4 py-2 font-semibold hover:bg-blue-800 disabled:bg-blue-300 transition-colors"
                    disabled={loading}
                  >
                    {loading ? "Analyzing..." : "Analyze"}
                  </button>
                </form>
              )}
            </div>
            {error && <p className="text-red-400 mt-2">{error}</p>}
            {logs && (
              <div
                className="mt-4 w-full bg-zinc-800 border border-blue-900 rounded p-4 text-xs overflow-auto text-blue-200"
                style={{ maxHeight: 200 }}
              >
                <pre>{logs}</pre>
              </div>
            )}
            {results.length > 0 && (
              <table className="mt-8 w-full border-collapse bg-zinc-900 rounded shadow-lg">
                <thead>
                  <tr className="bg-blue-900">
                    <th className="border px-2 py-2 text-blue-200">Name</th>
                    <th className="border px-2 py-2 text-blue-200">Email</th>
                    <th className="border px-2 py-2 text-blue-200">C++ Commits</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-zinc-800" : "bg-zinc-900"}>
                      <td className="border px-2 py-2 text-blue-100">{row.name}</td>
                      <td className="border px-2 py-2 text-blue-100">
                        {row.email ? (
                          <button
                            type="button"
                            onClick={() => createEmailTab({ to: row.email, body: buildDefaultBody(row.name) })}
                            className="text-blue-300 hover:text-blue-200 underline"
                          >
                            {row.email}
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="border px-2 py-2 text-blue-100">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="w-full lg:w-2/5 bg-zinc-800 border border-blue-900 rounded-lg p-4 flex flex-col gap-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-blue-200">Email tabs</h2>
              <button
                type="button"
                onClick={() => createEmailTab()}
                className="px-3 py-1.5 rounded bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors"
              >
                New email
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {emailTabs.length === 0 && (
                <p className="text-sm text-blue-300">Select an email from the table to open a tab.</p>
              )}
              {emailTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                    tab.id === activeTabId
                      ? "bg-blue-700 text-white border-blue-500"
                      : "bg-zinc-900 text-blue-200 border-blue-800 hover:bg-blue-900"
                  }`}
                >
                  <span className="max-w-[140px] truncate">{tab.to || "New email"}</span>
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      removeEmailTab(tab.id);
                    }}
                    className="text-xs text-blue-200 hover:text-white"
                  >
                    ✕
                  </span>
                </button>
              ))}
            </div>
            {activeTab && authStatus?.signedIn ? (
              <div className="flex flex-col gap-3">
                <label className="text-sm text-blue-200" htmlFor="email-to">
                  To
                </label>
                <input
                  id="email-to"
                  type="text"
                  list="recipient-suggestions"
                  placeholder="Recipient email(s), comma separated"
                  value={activeTab.to}
                  onChange={(e) => updateEmailTab(activeTab.id, { to: e.target.value })}
                  className="border border-blue-700 rounded px-3 py-2 bg-zinc-900 text-blue-100 placeholder:text-blue-400"
                  required
                />
                <datalist id="recipient-suggestions">
                  <option value="Singapore">Singapore</option>
                  <option value="singapore-team@example.com">Singapore team</option>
                </datalist>
                <label className="text-sm text-blue-200" htmlFor="email-subject">
                  Subject
                </label>
                <input
                  id="email-subject"
                  type="text"
                  placeholder="Subject"
                  value={activeTab.subject}
                  onChange={(e) => updateEmailTab(activeTab.id, { subject: e.target.value })}
                  className="border border-blue-700 rounded px-3 py-2 bg-zinc-900 text-blue-100 placeholder:text-blue-400"
                  required
                />
                <label className="text-sm text-blue-200">Email body (HTML supported)</label>
                <div
                  key={activeTab.id}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => updateEmailTab(activeTab.id, { body: (e.target as HTMLDivElement).innerHTML })}
                  className="min-h-[220px] rounded border border-blue-700 bg-zinc-900 px-3 py-2 text-blue-100 focus:outline-none focus:border-blue-400"
                  dangerouslySetInnerHTML={{ __html: activeTab.body }}
                />
                <label className="text-sm text-blue-200" htmlFor="email-attachments">
                  Attachments
                </label>
                <input
                  id="email-attachments"
                  type="file"
                  multiple
                  onChange={(e) => updateEmailTab(activeTab.id, { attachments: Array.from(e.target.files || []) })}
                  className="text-sm text-blue-200"
                />
                {activeTab.attachments.length > 0 && (
                  <ul className="text-xs text-blue-200">
                    {activeTab.attachments.map((file) => (
                      <li key={file.name}>{file.name}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => handleSendEmail(activeTab.id)}
                  className="bg-blue-700 text-white rounded px-4 py-2 font-semibold hover:bg-blue-800 disabled:bg-blue-300 transition-colors"
                >
                  Send email
                </button>
                {activeTab.status && <p className="text-sm text-blue-200">{activeTab.status}</p>}
              </div>
            ) : (
              <p className="text-sm text-blue-200">
                {authStatus?.signedIn ? "Select an email tab to start composing." : "Sign in to Microsoft to send emails."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
