import { NextResponse } from "next/server";

// Use process.env for GitHub token
const GITHUB_TOKEN = process.env.GITHUB_SECRET_TOKEN;

// Helper to extract owner/repo from URL
function parseRepoUrl(url: string) {
  const match = url.match(/github.com\/(.+?)\/(.+?)(?:\.|\/|$)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function POST(req: Request) {
  const { repoUrl } = await req.json();
  let logs = "";
  function parseRepoUrl(url: string) {
    const match = url.match(/github.com\/(.+?)\/(.+?)(?:\.|\/|$)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }
  logs += `Input repoUrl: ${repoUrl}\n`;
  const repo = parseRepoUrl(repoUrl);
  logs += `Parsed repo: ${JSON.stringify(repo)}\n`;
  if (!repo) {
    logs += "Repo parsing failed.\n";
    return NextResponse.json({ error: "Invalid GitHub repo URL", logs }, { status: 400 });
  }

  // Get commits from GitHub API
  const commitsUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?per_page=100`;
  logs += `Commits API URL: ${commitsUrl}\n`;
  const commitsRes = await fetch(commitsUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      ...(GITHUB_TOKEN ? { 'Authorization': `Bearer ${GITHUB_TOKEN}` } : {})
    }
  });
  logs += `Commits API status: ${commitsRes.status}\n`;
  if (!commitsRes.ok) {
    logs += `Commits API error: ${await commitsRes.text()}\n`;
    return NextResponse.json({ error: "Failed to fetch commits", logs }, { status: 500 });
  }
  const commits = await commitsRes.json();
  logs += `Commits fetched: ${Array.isArray(commits) ? commits.length : 0}\n`;

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
    const commitRes = await fetch(commitDetailsUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(GITHUB_TOKEN ? { 'Authorization': `Bearer ${GITHUB_TOKEN}` } : {})
      }
    });
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
}
