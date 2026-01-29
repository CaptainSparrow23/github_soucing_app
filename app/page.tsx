
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

type ContributorResult = {
  name: string;
  email?: string;
  count: number;
};

let tabCounter = 0;

const nextTabId = () => {
  tabCounter += 1;
  return `email-tab-${tabCounter}`;
};

export default function Home() {
  // Auth is no longer required; removed auth check and login handler.
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ContributorResult[]>([]);
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
    return nextTabId();
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
      } catch {
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
      let res: Response | undefined;
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
      const data = (await res.json()) as { logs?: string; results?: ContributorResult[]; error?: string };
      setLogs(data.logs || "");
      if (!res.ok) {
        setError(data.error || "Failed to fetch data");
      } else {
        setResults(data.results || []);
      }
    } catch {
      setError("Failed to fetch data");
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    setAuthError("");
    try {
      await fetch("/api/auth/microsoft/logout", { method: "POST" });
    } catch {
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
    } catch {
      updateEmailTab(tabId, { status: "Failed to send email." });
    }
  };

  const activeTab = emailTabs.find((tab) => tab.id === activeTabId) || null;

  return (
    <FluentProvider theme={webDarkTheme}>
      <div className="relative min-h-screen bg-zinc-950 font-sans overflow-hidden text-blue-50">
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
            <p className="text-xs uppercase tracking-[0.4em] text-blue-400">Sourcing workspace</p>
            <h1 className="text-4xl font-extrabold text-blue-100">C++ Developer Sourcing Portal</h1>
            <p className="text-blue-200 max-w-3xl text-base leading-relaxed">
              Paste a repository URL on the left, review the contributors table below, and open multiple email tabs on the
              right for outreach.
            </p>
          </div>
          <Card className="w-full max-w-3xl border border-blue-900/60 bg-zinc-900/80 shadow-xl backdrop-blur">
            <CardHeader
              header={<span className="text-sm font-semibold text-blue-100">Microsoft Email</span>}
              description={
                authStatus?.signedIn ? (
                  <span className="text-xs text-blue-200">
                    Signed in as{" "}
                    <span className="font-semibold text-blue-100">
                      {authStatus.user?.displayName || authStatus.user?.mail || authStatus.user?.userPrincipalName}
                    </span>
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
            </CardFooter>
          </Card>
          <div className="flex w-full flex-1 flex-col gap-6 lg:flex-row">
            <div className="w-full lg:w-3/5 flex flex-col gap-4">
              <Card className="border border-blue-900/60 bg-zinc-900/80 shadow-xl">
                <CardHeader
                  header={<span className="text-sm font-semibold text-blue-100">Repository lookup</span>}
                  description={<span className="text-xs text-blue-200">Choose how to analyze the repo.</span>}
                />
                <div className="px-5 pb-6">
                  <TabList selectedValue={mode} onTabSelect={(_, data) => setMode(data.value as 'api' | 'clone')}>
                    <Tab value="api">GitHub API</Tab>
                    <Tab value="clone">Local Git</Tab>
                  </TabList>
                  <div className="mt-4">
                    {mode === 'api' && (
                      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <Input
                          placeholder="Paste GitHub repo URL..."
                          value={repoUrl}
                          onChange={(_, data) => setRepoUrl(data.value)}
                        />
                        <Button appearance="primary" type="submit" disabled={loading}>
                          {loading ? "Generating..." : "Generate"}
                        </Button>
                      </form>
                    )}
                    {mode === 'clone' && (
                      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <Input
                          placeholder="Paste GitHub repo URL to analyze (will use local if exists)"
                          value={repoUrl}
                          onChange={(_, data) => setRepoUrl(data.value)}
                        />
                        <Button appearance="primary" type="submit" disabled={loading}>
                          {loading ? "Analyzing..." : "Analyze"}
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
              {error && <p className="text-red-300 mt-2">{error}</p>}
              {logs && (
                <Card className="border border-blue-900/60 bg-zinc-900/70">
                  <div className="p-4 text-xs text-blue-200" style={{ maxHeight: 200 }}>
                    <pre>{logs}</pre>
                  </div>
                </Card>
              )}
              {results.length > 0 && (
                <Card className="border border-blue-900/60 bg-zinc-900/90 shadow-xl">
                  <div className="overflow-hidden">
                    <table className="w-full border-collapse text-sm">
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
                                <Button
                                  appearance="subtle"
                                  onClick={() => createEmailTab({ to: row.email, body: buildDefaultBody(row.name) })}
                                >
                                  {row.email}
                                </Button>
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
                </Card>
              )}
            </div>
            <div className="w-full lg:w-2/5 flex flex-col gap-5">
              <Card className="border border-blue-900/60 bg-zinc-900/80 shadow-xl">
                <CardHeader
                  header={<span className="text-lg font-semibold text-blue-100">Email defaults</span>}
                  description={<span className="text-xs text-blue-300">Saved locally. Use {"{{name}}"} and {"{{signature}}"} tokens.</span>}
                />
                <div className="px-5 pb-5 grid gap-4">
                  <div className="flex gap-2">
                    <Button appearance="secondary" onClick={persistTemplate}>
                      Save template
                    </Button>
                    <Button appearance="primary" onClick={persistSignature}>
                      Save signature
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm text-blue-200" htmlFor="email-template">
                      Email template (paste from Outlook)
                    </label>
                    <div
                      id="email-template"
                      ref={templateRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => setTemplateHtml((e.target as HTMLDivElement).innerHTML)}
                      data-placeholder="Paste your HTML email body here (supports hyperlinks/images). Use {{name}} and {{signature}} tokens."
                      className="relative min-h-[160px] rounded-lg border border-blue-800/70 bg-zinc-950 px-3 py-2 text-sm text-blue-100 focus:border-blue-400 focus:outline-none empty:before:absolute empty:before:top-2 empty:before:left-3 empty:before:text-blue-500 empty:before:content-[attr(data-placeholder)]"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm text-blue-200" htmlFor="email-signature">
                      Signature (paste from Outlook)
                    </label>
                    <div
                      id="email-signature"
                      ref={signatureRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => setSignatureHtml((e.target as HTMLDivElement).innerHTML)}
                      data-placeholder="Paste your signature here (supports hyperlinks/images)."
                      className="relative min-h-[120px] rounded-lg border border-blue-800/70 bg-zinc-950 px-3 py-2 text-sm text-blue-100 focus:border-blue-400 focus:outline-none empty:before:absolute empty:before:top-2 empty:before:left-3 empty:before:text-blue-500 empty:before:content-[attr(data-placeholder)]"
                    />
                  </div>
                </div>
              </Card>
              <Card className="border border-blue-900/60 bg-zinc-900/80 shadow-xl">
                <CardHeader
                  header={<span className="text-lg font-semibold text-blue-100">Email tabs</span>}
                  description={<span className="text-xs text-blue-300">Compose, attach files, and send via Microsoft.</span>}
                />
                <div className="px-5 pb-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-200">Active messages</span>
                    <Button appearance="primary" onClick={() => createEmailTab()}>
                      New email
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {emailTabs.length === 0 && (
                      <p className="text-sm text-blue-300">Select an email from the table to open a tab.</p>
                    )}
                    {emailTabs.map((tab) => (
                      <Button
                        key={tab.id}
                        appearance={tab.id === activeTabId ? "primary" : "secondary"}
                        onClick={() => setActiveTabId(tab.id)}
                        className="!rounded-full"
                      >
                        <span className="max-w-[140px] truncate">{tab.to || "New email"}</span>
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            removeEmailTab(tab.id);
                          }}
                          className="ml-2 text-xs"
                        >
                          ✕
                        </span>
                      </Button>
                    ))}
                  </div>
                  {activeTab && authStatus?.signedIn ? (
                    <div className="flex flex-col gap-3">
                      <label className="text-sm text-blue-200" htmlFor="email-to">
                        To
                      </label>
                      <Input
                        id="email-to"
                        list="recipient-suggestions"
                        placeholder="Recipient email(s), comma separated"
                        value={activeTab.to}
                        onChange={(_, data) => updateEmailTab(activeTab.id, { to: data.value })}
                      />
                      <datalist id="recipient-suggestions">
                        <option value="Singapore">Singapore</option>
                        <option value="singapore-team@example.com">Singapore team</option>
                      </datalist>
                      <label className="text-sm text-blue-200" htmlFor="email-subject">
                        Subject
                      </label>
                      <Input
                        id="email-subject"
                        placeholder="Subject"
                        value={activeTab.subject}
                        onChange={(_, data) => updateEmailTab(activeTab.id, { subject: data.value })}
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
                      <Button appearance="primary" onClick={() => handleSendEmail(activeTab.id)}>
                        Send email
                      </Button>
                      {activeTab.status && <p className="text-sm text-blue-200">{activeTab.status}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-blue-200">
                      {authStatus?.signedIn ? "Select an email tab to start composing." : "Sign in to Microsoft to send emails."}
                    </p>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </FluentProvider>
  );
