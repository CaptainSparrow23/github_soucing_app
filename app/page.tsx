"use client"
import { useState } from "react";
import  LightRays  from "../components/LightRays";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState("");
  const [mode, setMode] = useState<'api' | 'clone'>("api");

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
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen w-full px-4 py-16">
        <h1 className="text-4xl font-extrabold mb-2 text-blue-300">C++ Developer Sourcing Portal</h1>
        <div className="flex gap-4">
          <button onClick={() => setMode('api')} className={`px-4 py-2 rounded-t-lg font-semibold transition-colors ${mode === 'api' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-blue-300 hover:bg-blue-800'}`}>GitHub API</button>
          <button onClick={() => setMode('clone')} className={`px-4 py-2 rounded-t-lg font-semibold transition-colors ${mode === 'clone' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-blue-300 hover:bg-blue-800'}`}>Local Git</button>
        </div>
        <div className="w-full max-w-lg p-6 mb-4 bg-zinc-800 rounded-lg shadow-lg">
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
          <div className="mt-4 w-full max-w-lg bg-zinc-800 border border-blue-900 rounded p-4 text-xs overflow-auto text-blue-200" style={{ maxHeight: 200 }}>
            <pre>{logs}</pre>
          </div>
        )}
        {results.length > 0 && (
          <table className="mt-8 border-collapse bg-zinc-900 rounded shadow-lg">
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
                  <td className="border px-2 py-2 text-blue-100">{row.email}</td>
                  <td className="border px-2 py-2 text-blue-100">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
