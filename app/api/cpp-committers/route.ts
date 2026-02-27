import { NextResponse } from "next/server";

// Use process.env for GitHub token
const GITHUB_TOKEN = process.env.GITHUB_SECRET_TOKEN;

const MAX_COMMITS_PAGES = 10;

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
  logs += `Input repoUrl: ${repoUrl}\n`;
  const repo = parseRepoUrl(repoUrl);
  logs += `Parsed repo: ${JSON.stringify(repo)}\n`;
   if (!repo) {
    logs += "Repo parsing failed.\n";
    return NextResponse.json({ error: "Invalid GitHub repo URL", logs }, { status: 400 });
  }
  
  // Get commits from GitHub API
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    ...(GITHUB_TOKEN ? { 'Authorization': `Bearer ${GITHUB_TOKEN}` } : {})
  };
  let commitsUrl: string | null = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?per_page=100`;
  const commits: any[] = [];
  let pageCount = 0;
  while (commitsUrl && pageCount < MAX_COMMITS_PAGES) {
    logs += `Commits API URL: ${commitsUrl}\n`;
    const commitsRes = await fetch(commitsUrl, { headers });
    logs += `Commits API status: ${commitsRes.status}\n`;
    if (!commitsRes.ok) {
      logs += `Commits API error: ${await commitsRes.text()}\n`;
      return NextResponse.json({ error: "Commit response error", logs }, { status: 500 });
    }
    const pageCommits = await commitsRes.json();
    logs += `Commits fetched: ${Array.isArray(pageCommits) ? pageCommits.length : 0}\n`;
    if (Array.isArray(pageCommits)) {
      commits.push(...pageCommits);
    }
    commitsUrl = getNextPageUrl(commitsRes.headers.get('link'));
    pageCount++;
  }
  logs += `Total commits collected: ${commits.length}\n`;

  // Map committer to C++ commit count and email
  const committerMap: Record<string, { name: string, email: string, count: number }> = {};
  let commitDetailsFetched = 0;
  for (const commit of commits) {
    const sha = commit.sha;
    const authorName = commit.commit.author?.name || commit.author?.login || "Unknown";
    const authorEmail = commit.commit.author?.email || "Unknown";
    // Get files for each commit
    const commitDetailsUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${sha}`;
    logs += `Fetching commit details: ${commitDetailsUrl}\n`;
    const commitRes = await fetch(commitDetailsUrl, { headers });
    logs += `Commit details status: ${commitRes.status}\n`;
    if (!commitRes.ok) {
      logs += `Commit details error: ${await commitRes.text()}\n`;
      continue;
    }
    commitDetailsFetched++;
    const commitData = await commitRes.json();
    const files = commitData.files || [];
    logs += `Files in commit: ${files.length}\n`;
    const cppFiles = files.filter((f: any) => f.filename.endsWith('.cpp') || f.filename.endsWith('.hpp') || f.filename.endsWith('.cc') || f.filename.endsWith('.cxx'));
    logs += `C++ files in commit: ${cppFiles.length}\n`;
    if (cppFiles.length > 0) {
      const key = authorName + '|' + authorEmail;
      if (!committerMap[key]) {
        committerMap[key] = { name: authorName, email: authorEmail, count: 0 };
      }
      committerMap[key].count += 1;
    }
  }
  logs += `Commit details fetched: ${commitDetailsFetched}\n`;

  // Sort and return top C++ committers only
  const sorted = Object.values(committerMap)
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  logs += `Final C++ committers: ${sorted.length}\n`;


  return NextResponse.json({ results: sorted, logs });
} catch (err: any) {
  return NextResponse.json({ error: err.message || "Unexpected error", logs: "" }, { status: 500 });
}
}
