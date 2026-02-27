import { NextResponse } from "next/server";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";

export const runtime = "nodejs";

function isGitRepo(dir: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: dir,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const { repoUrl } = await req.json();
  let logs = "";
  if (!repoUrl) {
    logs += "No repo URL provided.\n";
    return NextResponse.json({ error: "Missing repo URL", logs }, { status: 400 });
  }

  // Parse repo name from URL
  const match = repoUrl.match(/github.com\/(.+?)\/(.+?)(?:\.git|\/|$)/);
  if (!match) {
    logs += "Invalid GitHub repo URL.\n";
    return NextResponse.json({ error: "Invalid GitHub repo URL", logs }, { status: 400 });
  }
  const owner = match[1];
  const repo = match[2];
  const baseDir = process.env.CLONE_BASE_DIR || join(tmpdir(), "cloned_repos");
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  const targetDir = join(baseDir, `${owner}__${repo}`);

  // Clone if not already present
  const log = (line: string) => {
    logs += `${line}\n`;
  };

  const targetExists = existsSync(targetDir);
  if (targetExists && !isGitRepo(targetDir)) {
    log(`Existing folder is not a git repo; deleting and recloning: ${targetDir}`);
    rmSync(targetDir, { recursive: true, force: true });
  }

  if (!existsSync(targetDir)) {
    logs += `Cloning repo to ${targetDir}...\n`;
    try {
      execFileSync("git", ["clone", repoUrl, targetDir], { stdio: "pipe" });
      logs += "Clone successful.\n";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logs += `Clone failed: ${message}\n`;
      return NextResponse.json({ error: "Failed to clone repo", logs }, { status: 500 });
    }
  } else {
    logs += "Repo already cloned.\n";
  }

  // Run git log analysis
  try {
    logs += `Running git log in: ${targetDir}\n`;
    const output = execFileSync(
      "git",
      ["log", "--pretty=%an|%ae", "--", "*.cpp", "*.hpp", "*.cc", "*.cxx"],
      { cwd: targetDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logs += `Error: ${message}\n`;
    return NextResponse.json({ error: "Failed to run git command", logs }, { status: 500 });
  }
}
