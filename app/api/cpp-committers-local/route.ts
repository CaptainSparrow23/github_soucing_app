import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { repoPath } = await req.json();
  let logs = "";
  if (!repoPath) {
    logs += "No local repo path provided.\n";
    return NextResponse.json({ error: "Missing local repo path", logs }, { status: 400 });
  }
  try {
    const { execSync } = require('child_process');
    logs += `Running git log in: ${repoPath}\n`;
    const output = execSync(
      'git log --pretty="%an|%ae" -- "*.cpp" "*.hpp" "*.cc" "*.cxx"',
      { cwd: repoPath, encoding: 'utf-8' }
    );
    logs += `Raw git output lines: ${output.split('\n').length}\n`;
    const lines = output.split('\n').filter(Boolean);
    const map: { [key: string]: { name: string; email: string; count: number } } = {};
    for (const line of lines) {
      const [name, email] = line.split('|');
      const key = name + '|' + email;
      if (!map[key]) map[key] = { name, email, count: 0 };
      map[key].count += 1;
    }
    const results = Object.values(map).sort((a, b) => b.count - a.count);
    logs += `Final C++ committers: ${results.length}\n`;
    return NextResponse.json({ results, logs });
  } catch (err: any) {
    logs += `Error: ${err.message || err}\n`;
    return NextResponse.json({ error: "Failed to run git command", logs }, { status: 500 });
  }
}
