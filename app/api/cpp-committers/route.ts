import { NextResponse } from "next/server";

// Use process.env for GitHub token
const GITHUB_TOKEN = process.env.GITHUB_SECRET_TOKEN;

const MAX_COMMITS_PAGES = 10;

type GitHubCommitListItem = {
  sha: string;
  author?: { login?: string | null } | null;
  commit: { author?: { name?: string | null; email?: string | null } | null };
};

type GitHubCommitDetails = {
  files?: Array<{ filename: string }>;
};

function getGitHubAuthHeader(token: string): string {
  // Classic PATs usually start with `ghp_` and expect the `token` scheme.
  // Fine-grained PATs start with `github_pat_` and use the `Bearer` scheme.
  if (token.startsWith("ghp_")) return `token ${token}`;
  return `Bearer ${token}`;
}

function buildGitHubHeaders(opts?: { token?: string; includeAuth?: boolean }) {
  const token = opts?.token;
  const includeAuth = opts?.includeAuth ?? true;

  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-sourcing-service",
    ...(token && includeAuth ? { Authorization: getGitHubAuthHeader(token) } : {}),
  };
}

// Helper to extract owner/repo from URL
function parseRepoUrl(url: string) {
  const match = url.match(/github.com\/(.+?)\/(.+?)(?:\.git|\/|$)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function getNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(',').map(part => part.trim());
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

export async function POST(req: Request) {
  try {
  
  const { repoUrl } = await req.json();
  let logs = "";
  const log = (line: string) => {
    logs += `${line}\n`;
  };

  log(`Input repoUrl: ${repoUrl}`);
  const repo = parseRepoUrl(repoUrl);
  log(`Parsed repo: ${JSON.stringify(repo)}`);
   if (!repo) {
    log("Repo parsing failed.");
    return NextResponse.json({ error: "Invalid GitHub repo URL", logs }, { status: 400 });
  }
  
  // Get commits from GitHub API
  const headers = buildGitHubHeaders({ token: GITHUB_TOKEN, includeAuth: true });
  const unauthHeaders = buildGitHubHeaders({ token: GITHUB_TOKEN, includeAuth: false });

  const fetchGitHub = async (url: string) => {
    const res = await fetch(url, { headers });
    if (res.status !== 401 || !GITHUB_TOKEN) return res;

    log("GitHub returned 401 with Authorization; retrying once without Authorization (public access).");
    return fetch(url, { headers: unauthHeaders });
  };

  let commitsUrl: string | null = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?per_page=100`;
  const commits: GitHubCommitListItem[] = [];
  let pageCount = 0;
  while (commitsUrl && pageCount < MAX_COMMITS_PAGES) {
    log(`Commits API URL: ${commitsUrl}`);
    const commitsRes = await fetchGitHub(commitsUrl);
    log(`Commits API status: ${commitsRes.status}`);
    if (!commitsRes.ok) {
      log(`Commits API error: ${await commitsRes.text()}`);
      return NextResponse.json({ error: "Commit response error", logs }, { status: 500 });
    }
    const pageCommits: unknown = await commitsRes.json();
    log(`Commits fetched: ${Array.isArray(pageCommits) ? pageCommits.length : 0}`);
    if (Array.isArray(pageCommits)) {
      commits.push(...(pageCommits as GitHubCommitListItem[]));
    }
    commitsUrl = getNextPageUrl(commitsRes.headers.get('link'));
    pageCount++;
  }
  log(`Total commits collected: ${commits.length}`);

  // Map committer to C++ commit count and email
  const committerMap: Record<string, { name: string, email: string, count: number }> = {};
  let commitDetailsFetched = 0;
  for (const commit of commits) {
    const sha = commit.sha;
    const authorName = commit.commit.author?.name || commit.author?.login || "Unknown";
    const authorEmail = commit.commit.author?.email || "Unknown";
    // Get files for each commit
    const commitDetailsUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${sha}`;
    log(`Fetching commit details: ${commitDetailsUrl}`);
    const commitRes = await fetchGitHub(commitDetailsUrl);
    log(`Commit details status: ${commitRes.status}`);
    if (!commitRes.ok) {
      log(`Commit details error: ${await commitRes.text()}`);
      continue;
    }
    commitDetailsFetched++;
    const commitData = (await commitRes.json()) as GitHubCommitDetails;
    const files = commitData.files ?? [];
    log(`Files in commit: ${files.length}`);
    const cppFiles = files.filter(
      (file) =>
        file.filename.endsWith(".cpp") ||
        file.filename.endsWith(".hpp") ||
        file.filename.endsWith(".cc") ||
        file.filename.endsWith(".cxx"),
    );
    log(`C++ files in commit: ${cppFiles.length}`);
    if (cppFiles.length > 0) {
      const key = authorName + '|' + authorEmail;
      if (!committerMap[key]) {
        committerMap[key] = { name: authorName, email: authorEmail, count: 0 };
      }
      committerMap[key].count += 1;
    }
  }
  log(`Commit details fetched: ${commitDetailsFetched}`);

  // Sort and return top C++ committers only
  const sorted = Object.values(committerMap)
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  log(`Final C++ committers: ${sorted.length}`);


  return NextResponse.json({ results: sorted, logs });
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ error: message, logs: "" }, { status: 500 });
}
}
