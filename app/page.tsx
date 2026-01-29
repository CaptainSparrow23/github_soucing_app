
"use client";

import { useState, useEffect, useRef } from "react";
import {
  Button,
  Card,
  CardFooter,
  CardHeader,
  FluentProvider,
  Input,
  Tab,
  TabList,
  webDarkTheme
} from "@fluentui/react-components";
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
  const [signatureHtml, setSignatureHtml] = useState("");
  const [templateHtml, setTemplateHtml] = useState("");

  const buildDefaultBody = (name?: string) => {
    const signature = signatureHtml?.trim();
    const template = templateHtml?.trim();
    if (template) {
      let body = template.replace(/{{\s*name\s*}}/gi, name || "there");
      if (signature) {
        const hasSignatureToken = /{{\s*signature\s*}}/gi.test(body);
        body = body.replace(/{{\s*signature\s*}}/gi, signature);
        if (!hasSignatureToken) {
          body = `${body}\n${signature}`;
        }
      }
      return body;
    }
    return `
      <p>Hi ${name || "there"},</p>
      <p>I found your C++ contributions and wanted to reach out about opportunities.</p>
      ${signature || ""}
    `;
  };

  // Hydration-safe ID generation for email tabs
  const generateTabId = () => {
    if (typeof window !== "undefined" && typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  };

  const createEmailTab = (seed?: Partial<{ to: string; subject: string; body: string }>) => {
    const id = generateTabId();
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSignature = localStorage.getItem("sourcing-signature-html");
      const savedTemplate = localStorage.getItem("sourcing-template-html");
      if (savedSignature) {
        setSignatureHtml(savedSignature);
      }
      if (savedTemplate) {
        setTemplateHtml(savedTemplate);
      }
    }
  }, []);

  const persistSignature = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sourcing-signature-html", signatureHtml);
    }
  };

  const persistTemplate = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sourcing-template-html", templateHtml);
    }
  };

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
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-extrabold text-blue-300">C++ Developer Sourcing Portal</h1>
          <p className="text-blue-200 max-w-3xl text-base leading-relaxed">
            Paste a repository URL on the left, review the contributors table below, and open multiple email tabs on the
            right for outreach.
          </p>
        </div>
        <div className="w-full max-w-3xl rounded-2xl border border-blue-900/60 bg-zinc-900/80 p-5 shadow-xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-blue-400">Microsoft Email</p>
              {authStatus?.signedIn ? (
                <p className="text-blue-100 text-sm">
                  Signed in as{" "}
                  <span className="font-semibold">
                    {authStatus.user?.displayName || authStatus.user?.mail || authStatus.user?.userPrincipalName}
                  </span>
                ) : (
                  <span className="text-xs text-blue-200">Connect a Microsoft account to send emails.</span>
                )
              }
            />
            <CardFooter className="flex flex-wrap items-center justify-between gap-4">
              {authError && <p className="text-xs text-red-300">{authError}</p>}
              {authStatus?.signedIn ? (
                <Button appearance="secondary" onClick={handleLogout}>
                  Sign out
                </Button>
              ) : (
                <Button appearance="primary" as="a" href="/api/auth/microsoft">
                  Sign in with Microsoft
                </Button>
              )}
            </div>
            {authStatus?.signedIn ? (
              <button
                onClick={handleLogout}
                className="rounded-lg border border-blue-800/60 bg-zinc-950 px-4 py-2 text-sm font-semibold text-blue-200 transition-colors hover:bg-blue-900"
              >
                Sign out
              </button>
            ) : (
              <a
                href="/api/auth/microsoft"
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-blue-600"
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
                className={`rounded-t-xl px-4 py-2 font-semibold transition-colors ${
                  mode === 'api'
                    ? 'bg-blue-700 text-white shadow-lg shadow-blue-900/30'
                    : 'bg-zinc-900 text-blue-300 hover:bg-blue-900'
                }`}
              >
                GitHub API
              </button>
              <button
                onClick={() => setMode('clone')}
                className={`rounded-t-xl px-4 py-2 font-semibold transition-colors ${
                  mode === 'clone'
                    ? 'bg-blue-700 text-white shadow-lg shadow-blue-900/30'
                    : 'bg-zinc-900 text-blue-300 hover:bg-blue-900'
                }`}
              >
                Local Git
              </button>
            </div>
            <div className="w-full rounded-b-2xl rounded-tr-2xl border border-blue-900/60 bg-zinc-900/80 p-6 shadow-xl">
              {mode === 'api' && (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <input
                    type="text"
                    placeholder="Paste GitHub repo URL..."
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    className="rounded-lg border border-blue-700/70 bg-zinc-950 px-4 py-2 text-base text-blue-100 placeholder:text-blue-400 focus:border-blue-400 focus:outline-none"
                    required
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-blue-600 disabled:bg-blue-300"
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
                    className="rounded-lg border border-blue-700/70 bg-zinc-950 px-4 py-2 text-base text-blue-100 placeholder:text-blue-400 focus:border-blue-400 focus:outline-none"
                    required
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-blue-600 disabled:bg-blue-300"
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
                className="mt-4 w-full rounded-xl border border-blue-900/60 bg-zinc-900/70 p-4 text-xs text-blue-200"
                style={{ maxHeight: 200 }}
              >
                <pre>{logs}</pre>
              </div>
            )}
            {results.length > 0 && (
              <div className="mt-8 overflow-hidden rounded-2xl border border-blue-900/60 bg-zinc-900/90 shadow-xl">
                <table className="w-full border-collapse">
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
              </div>
            )}
          </div>
          <div className="w-full lg:w-2/5 flex flex-col gap-5">
            <div className="rounded-2xl border border-blue-900/60 bg-zinc-900/80 p-4 shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-blue-200">Email defaults</h2>
                  <p className="text-xs text-blue-300">
                    Saved locally. Use {"{{name}}"} and {"{{signature}}"} tokens.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={persistTemplate}
                    className="rounded-lg border border-blue-800/60 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-blue-200 transition-colors hover:bg-blue-900"
                  >
                    Save template
                  </button>
                  <button
                    type="button"
                    onClick={persistSignature}
                    className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
                  >
                    Save signature
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-4">
                <div className="grid gap-2">
                  <label className="text-sm text-blue-200" htmlFor="email-template">
                    Email template (HTML)
                  </label>
                  <textarea
                    id="email-template"
                    value={templateHtml}
                    onChange={(e) => setTemplateHtml(e.target.value)}
                    placeholder="<p>Hi {{name}},</p><p>...</p>{{signature}}"
                    className="min-h-[140px] rounded-lg border border-blue-800/70 bg-zinc-950 px-3 py-2 text-sm text-blue-100 placeholder:text-blue-500 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-blue-200" htmlFor="email-signature">
                    Signature (HTML)
                  </label>
                  <textarea
                    id="email-signature"
                    value={signatureHtml}
                    onChange={(e) => setSignatureHtml(e.target.value)}
                    placeholder="<p>Best regards,<br/>Your Name</p>"
                    className="min-h-[100px] rounded-lg border border-blue-800/70 bg-zinc-950 px-3 py-2 text-sm text-blue-100 placeholder:text-blue-500 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-blue-900/60 bg-zinc-900/80 p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-blue-200">Email tabs</h2>
                <button
                  type="button"
                  onClick={() => createEmailTab()}
                  className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
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
                        ? "border-blue-500 bg-blue-700 text-white"
                        : "border-blue-800 bg-zinc-950 text-blue-200 hover:bg-blue-900"
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
                    className="rounded-lg border border-blue-800/70 bg-zinc-950 px-3 py-2 text-blue-100 placeholder:text-blue-400 focus:border-blue-400 focus:outline-none"
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
                    className="rounded-lg border border-blue-800/70 bg-zinc-950 px-3 py-2 text-blue-100 placeholder:text-blue-400 focus:border-blue-400 focus:outline-none"
                    required
                  />
                  <label className="text-sm text-blue-200">Email body (HTML supported)</label>
                  <div
                    key={activeTab.id}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => updateEmailTab(activeTab.id, { body: (e.target as HTMLDivElement).innerHTML })}
                    className="min-h-[220px] rounded-lg border border-blue-800/70 bg-zinc-950 px-3 py-2 text-blue-100 focus:border-blue-400 focus:outline-none"
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
                    className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-600 disabled:bg-blue-300"
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
    </FluentProvider>
  );
}
