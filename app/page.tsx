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
import LetterGlitch from "../components/LetterGlitch";
import { MatrixRainingLetters } from "react-mdr";
import React from "react";

type ContributorResult = {
  name: string;
  email?: string;
  count: number;
  linkedinUrl?: string | null;
};

let tabCounter = 0;

const nextTabId = () => {
  tabCounter += 1;
  return `email-tab-${tabCounter}`;
};


const contributorKey = (row: Pick<ContributorResult, "name" | "email">) => `${row.name}|${row.email || ""}`;

const isFirstLastName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return false;
  const tokenOk = (token: string) => /^[A-Za-z][A-Za-z'-]{1,}$/.test(token);
  return tokenOk(parts[0]) && tokenOk(parts[1]);
};


// LinkedIn resolve helpers (no hooks here)
const toggleSelectedKey = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
};

const setAllEligibleSelected = (rows: ContributorResult[], setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
  const next = new Set<string>();
  for (const row of rows) {
    if (row.name && isFirstLastName(row.name)) next.add(contributorKey(row));
  }
  setter(next);
};

const clearSelected = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => setter(new Set());

const applyLinkedInMatches = (rows: ContributorResult[], matches: Array<{ key: string; linkedinUrl: string | null }>) => {
  const map = new Map(matches.map((m) => [m.key, m.linkedinUrl]));
  return rows.map((row) => {
    const key = contributorKey(row);
    const linkedinUrl = map.get(key);
    if (!linkedinUrl) return row;
    if (row.linkedinUrl === linkedinUrl) return row;
    return { ...row, linkedinUrl };
  });
};

const resolveLinkedInForSelectedRows = async (
  rows: ContributorResult[],
  selected: Set<string>,
  setter: React.Dispatch<React.SetStateAction<ContributorResult[]>>,
  setRowsError: React.Dispatch<React.SetStateAction<string>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
) => {
  setLoading(true);
  setRowsError("");
  try {
    const people = rows.filter((row) => selected.has(contributorKey(row))).map((row) => ({ name: row.name, email: row.email }));
    const res = await fetch("/api/linkedin-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people })
    });
    const data = (await res.json()) as { matches?: Array<{ key: string; linkedinUrl: string | null }>; error?: string };
    if (!res.ok || !data.matches) {
      setRowsError(data.error || "Failed to resolve LinkedIn profiles.");
      setLoading(false);
      return;
    }
    setter((prev) => applyLinkedInMatches(prev, data.matches || []));
  } catch {
    setRowsError("Failed to resolve LinkedIn profiles.");
  }
  setLoading(false);
};



export default function Home() {
    // LinkedIn selection state for both tables
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
    const [linkedinLoading, setLinkedinLoading] = useState(false);
    const [selectedKeys2, setSelectedKeys2] = useState<Set<string>>(() => new Set());
    const [linkedinLoading2, setLinkedinLoading2] = useState(false);
    // Email tabs and related state
    const [emailTabs, setEmailTabs] = useState<Array<{
      id: string;
      to: string;
      subject: string;
      body: string;
      attachments: File[];
      status?: string;
    }>>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [signatureHtml, setSignatureHtml] = useState("");
    const [templateHtml, setTemplateHtml] = useState("");
    const templateRef = useRef<HTMLDivElement | null>(null);
    const signatureRef = useRef<HTMLDivElement | null>(null);
    const [authError, setAuthError] = useState("");

    // Helper for creating email tabs
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

    const createEmailTab = (seed?: Partial<{ to: string; subject: string; body: string }>) => {
      const id = typeof window !== "undefined" && typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto as any).randomUUID() : nextTabId();
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
  // Auth is no longer required; removed auth check and login handler.
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ContributorResult[]>([]);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState("");
  const [mode, setMode] = useState<'api' | 'clone'>("api");
  // Second repo state
  const [repoUrl2, setRepoUrl2] = useState("");
  const [loading2, setLoading2] = useState(false);
  const [results2, setResults2] = useState<ContributorResult[]>([]);
  const [error2, setError2] = useState("");
  const [logs2, setLogs2] = useState("");
  // Separate mode for repo 2
  const [mode2, setMode2] = useState<'api' | 'clone'>("api");
  const [authStatus, setAuthStatus] = useState<{
    signedIn: boolean;
    user?: {
      displayName?: string;
      mail?: string;
      userPrincipalName?: string;
    };
  } | null>(null);

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

  useEffect(() => {
    if (templateRef.current && templateRef.current.innerHTML !== templateHtml) {
      templateRef.current.innerHTML = templateHtml;
    }
  }, [templateHtml]);

  useEffect(() => {
    if (signatureRef.current && signatureRef.current.innerHTML !== signatureHtml) {
      signatureRef.current.innerHTML = signatureHtml;
    }
  }, [signatureHtml]);

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

  // Handler for second repo
  const handleSubmit2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading2(true);
    setError2("");
    setResults2([]);
    setLogs2("");
    try {
      let res: Response | undefined;
      if (mode === "api") {
        res = await fetch("/api/cpp-committers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: repoUrl2 })
        });
      } else if (mode === "clone") {
        res = await fetch("/api/clone-and-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: repoUrl2 })
        });
      }
      if (!res) {
        setError2("No response from server");
        setLoading2(false);
        return;
      }
      const data = (await res.json()) as { logs?: string; results?: ContributorResult[]; error?: string };
      setLogs2(data.logs || "");
      if (!res.ok) {
        setError2(data.error || "Failed to fetch data");
      } else {
        setResults2(data.results || []);
      }
    } catch {
      setError2("Failed to fetch data");
    }
    setLoading2(false);
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
        
  
      {/* <LetterGlitch
         glitchSpeed={50}
         centerVignette={true}
         outerVignette={false}
         smooth={true}
         glitchColors={['#2b4539', '#61dca3', '#61b3dc']}
         characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789"
        
         /> */}
         <React.Fragment>
            <MatrixRainingLetters key="foo-bar" custom_class="m-0 p-0" />
        </React.Fragment>
         
        </div>
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-12">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.4em] text-blue-400">Sourcing workspace</p>
            <h1 className="text-4xl font-extrabold text-blue-100">C++ Developer Sourcing Portal</h1>
            <p className="text-blue-200 max-w-3xl text-base leading-relaxed">
              Paste a repository URL on the left, review the contributors table below, and open multiple email tabs on the
              right for outreach.
            </p>
          </div>
          <Card className="w-356 border border-blue-900/60 bg-zinc-900/80 shadow-xl backdrop-blur">
            <CardHeader
              header={<span className="text-sm font-semibold text-blue-100">Microsoft Email</span>}
              description={
                authStatus?.signedIn ? (
                  <span className="text-xs mt-2 text-blue-200">
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
            <CardFooter className="flex flex-wrap items-end justify-between gap-4">
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
          <div className="flex w-full flex-1 flex-col gap-4 lg:flex-row">
            {/* Side-by-side repo inputs */}
            <div className="w-full flex flex-row gap-6 items-start justify-center lg:justify-start lg:flex-nowrap flex-wrap">
              {/* Repo 1 */}
              <div className="flex flex-col gap-2" style={{ minWidth: 700, maxWidth: 700, width: 700 }}>
                <Card className="border border-blue-900/60 bg-zinc-900/80 shadow-xl">
                  <CardHeader
                    header={<span className="text-sm font-semibold text-blue-100">Repository 1 lookup</span>}
                    description={<span className="text-xs text-blue-200">Analyze the first repo.</span>}
                  />
                  <div className="px-5 pb-6">
                    <TabList selectedValue={mode} onTabSelect={(_, data) => setMode(data.value as 'api' | 'clone')}>
                      <Tab value="api">GitHub API</Tab>
                      <Tab value="clone">Local Git</Tab>
                    </TabList>
                    <div className="mt-4">
                      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <Input
                          placeholder="Paste GitHub repo URL..."
                          value={repoUrl}
                          onChange={(_, data) => setRepoUrl(data.value)}
                        />
                        <Button appearance="primary" type="submit" disabled={loading}>
                          {loading ? (mode === 'api' ? "Generating..." : "Analyzing...") : (mode === 'api' ? "Generate" : "Analyze")}
                        </Button>
                      </form>
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
                      <div className="flex gap-2 mb-2">
                        <Button appearance="secondary" size="small" disabled={linkedinLoading || selectedKeys.size === 0} onClick={() => resolveLinkedInForSelectedRows(results, selectedKeys, setResults, setError, setLinkedinLoading)}>
                          {linkedinLoading ? "Resolving LinkedIn..." : `Resolve LinkedIn (${selectedKeys.size})`}
                        </Button>
                        <Button appearance="secondary" size="small" disabled={linkedinLoading} onClick={() => setAllEligibleSelected(results, setSelectedKeys)}>
                          Select eligible
                        </Button>
                        <Button appearance="secondary" size="small" disabled={linkedinLoading} onClick={() => clearSelected(setSelectedKeys)}>
                          Clear
                        </Button>
                      </div>
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-blue-900">
                            <th></th>
                            <th className="border px-2 py-2 text-blue-200">Name</th>
                            <th className="border px-2 py-2 text-blue-200">Email</th>
                            <th className="border px-2 py-2 text-blue-200">C++ Commits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? "bg-zinc-800" : "bg-zinc-900"}>
                              <td className="border px-2 py-2 text-blue-100">
                                <input type="checkbox" checked={selectedKeys.has(contributorKey(row))} disabled={!row.name || !isFirstLastName(row.name)} title={!row.name || !isFirstLastName(row.name) ? "Only FirstName LastName rows can be resolved." : "Select row"} onChange={() => toggleSelectedKey(setSelectedKeys, contributorKey(row))} />
                              </td>
                              <td className="border px-2 py-2 text-blue-100">
                                {row.linkedinUrl ? (
                                  <a
                                    href={row.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline decoration-blue-400/70 underline-offset-2 hover:text-blue-200"
                                    title="Open LinkedIn profile"
                                  >
                                    {row.name}
                                  </a>
                                ) : (
                                  row.name
                                )}
                              </td>
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
              {/* Repo 2 */}
              <div className="flex flex-col gap-2" style={{ minWidth: 700, maxWidth: 700, width: 700  }}>
                <Card className="border border-blue-900/60 bg-zinc-900/80 shadow-xl">
                  <CardHeader
                    header={<span className="text-sm font-semibold text-blue-100">Repository 2 lookup</span>}
                    description={<span className="text-xs text-blue-200">Analyze a second repo.</span>}
                  />
                  <div className="px-5 pb-6">
                    <TabList selectedValue={mode2} onTabSelect={(_, data) => setMode2(data.value as 'api' | 'clone')}>
                      <Tab value="api">GitHub API</Tab>
                      <Tab value="clone">Local Git</Tab>
                    </TabList>
                    <div className="mt-4">
                      <form onSubmit={handleSubmit2} className="flex flex-col gap-4">
                        <Input
                          placeholder="Paste another GitHub repo URL..."
                          value={repoUrl2}
                          onChange={(_, data) => setRepoUrl2(data.value)}
                        />
                        <Button appearance="primary" type="submit" disabled={loading2}>
                          {loading2 ? (mode2 === 'api' ? "Generating..." : "Analyzing...") : (mode2 === 'api' ? "Generate" : "Analyze")}
                        </Button>
                      </form>
                    </div>
                  </div>
                </Card>
                {error2 && <p className="text-red-300 mt-2">{error2}</p>}
                {logs2 && (
                  <Card className="border border-blue-900/60 bg-zinc-900/70">
                    <div className="p-4 text-xs text-blue-200" style={{ maxHeight: 200 }}>
                      <pre>{logs2}</pre>
                    </div>
                  </Card>
                )}
                {results2.length > 0 && (
                  <Card className="border border-blue-900/60 bg-zinc-900/90 shadow-xl">
                    <div className="overflow-hidden">
                      <div className="flex gap-2 mb-2">
                        <Button appearance="secondary" size="small" disabled={linkedinLoading2 || selectedKeys2.size === 0} onClick={() => resolveLinkedInForSelectedRows(results2, selectedKeys2, setResults2, setError2, setLinkedinLoading2)}>
                          {linkedinLoading2 ? "Resolving LinkedIn..." : `Resolve LinkedIn (${selectedKeys2.size})`}
                        </Button>
                        <Button appearance="secondary" size="small" disabled={linkedinLoading2} onClick={() => setAllEligibleSelected(results2, setSelectedKeys2)}>
                          Select eligible
                        </Button>
                        <Button appearance="secondary" size="small" disabled={linkedinLoading2} onClick={() => clearSelected(setSelectedKeys2)}>
                          Clear
                        </Button>
                      </div>
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-blue-900">
                            <th></th>
                            <th className="border px-2 py-2 text-blue-200">Name</th>
                            <th className="border px-2 py-2 text-blue-200">Email</th>
                            <th className="border px-2 py-2 text-blue-200">C++ Commits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results2.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? "bg-zinc-800" : "bg-zinc-900"}>
                              <td className="border px-2 py-2 text-blue-100">
                                <input type="checkbox" checked={selectedKeys2.has(contributorKey(row))} disabled={!row.name || !isFirstLastName(row.name)} title={!row.name || !isFirstLastName(row.name) ? "Only FirstName LastName rows can be resolved." : "Select row"} onChange={() => toggleSelectedKey(setSelectedKeys2, contributorKey(row))} />
                              </td>
                              <td className="border px-2 py-2 text-blue-100">
                                {row.linkedinUrl ? (
                                  <a
                                    href={row.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline decoration-blue-400/70 underline-offset-2 hover:text-blue-200"
                                    title="Open LinkedIn profile"
                                  >
                                    {row.name}
                                  </a>
                                ) : (
                                  row.name
                                )}
                              </td>
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
            </div>
            {/* <div className="w-full lg:w-2/5 flex flex-col gap-5">
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
        </div> */}
        </div>
        </div>
      </div>
    </FluentProvider>
  );
}
