import { NextResponse } from "next/server";

type Person = {
  name: string;
  email?: string;
};

type Match = {
  key: string;
  linkedinUrl: string | null;
  reason?: string;
};

type CacheEntry = {
  linkedinUrl: string | null;
  expiresAt: number;
};

type GoogleCseResponse = {
  items?: Array<{ link?: string }>;
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PEOPLE_PER_REQUEST = 25;
const DEFAULT_DAILY_LIMIT = 0;

function personKey(person: Person) {
  return `${person.name}|${person.email || ""}`;
}

function getCache() {
  const globalAny = globalThis as unknown as { __linkedinResolveCache?: Map<string, CacheEntry> };
  if (!globalAny.__linkedinResolveCache) {
    globalAny.__linkedinResolveCache = new Map<string, CacheEntry>();
  }
  return globalAny.__linkedinResolveCache;
}

type DailyUsage = { count: number; expiresAt: number };

function getDailyUsage() {
  const globalAny = globalThis as unknown as { __linkedinResolveDailyUsage?: Map<string, DailyUsage> };
  if (!globalAny.__linkedinResolveDailyUsage) {
    globalAny.__linkedinResolveDailyUsage = new Map<string, DailyUsage>();
  }
  return globalAny.__linkedinResolveDailyUsage;
}

function getDayKeyUtc() {
  return new Date().toISOString().slice(0, 10);
}

function bumpDailyUsageOrThrow(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return;
  const usage = getDailyUsage();
  const dayKey = getDayKeyUtc();
  const now = Date.now();
  const entry = usage.get(dayKey);
  if (entry && now >= entry.expiresAt) {
    usage.delete(dayKey);
  }
  const current = usage.get(dayKey) || { count: 0, expiresAt: now + 24 * 60 * 60 * 1000 };
  if (current.count >= limit) {
    throw new Error(`Daily resolve limit reached (${limit}).`);
  }
  usage.set(dayKey, { ...current, count: current.count + 1 });
}

function getCachedMatch(key: string): CacheEntry | null {
  const cache = getCache();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function setCachedMatch(key: string, linkedinUrl: string | null) {
  const cache = getCache();
  cache.set(key, { linkedinUrl, expiresAt: Date.now() + CACHE_TTL_MS });
}

function buildQuery(person: Person) {
  const domain = person.email && person.email.includes("@") ? person.email.split("@")[1] : "";
  return ["site:linkedin.com/in", person.name, domain].filter(Boolean).join(" ");
}

function pickLinkedInProfileUrlFromGoogle(json: GoogleCseResponse): string | null {
  const items = json.items || [];
  for (const item of items) {
    const link = item?.link;
    if (typeof link !== "string") continue;
    if (!link.includes("linkedin.com/in/")) continue;
    return link;
  }
  return null;
}

async function resolveWithGoogleCse(person: Person, apiKey: string, cx: string): Promise<string | null> {
  const query = buildQuery(person);
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
    apiKey
  )}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=5`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google CSE search failed with status ${res.status}`);
  }
  const json = (await res.json()) as GoogleCseResponse;
  return pickLinkedInProfileUrlFromGoogle(json);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const peopleUnknown = (body as { people?: unknown })?.people;
  if (!Array.isArray(peopleUnknown)) {
    return NextResponse.json({ error: "Body must be { people: Person[] }." }, { status: 400 });
  }
  if (peopleUnknown.length > MAX_PEOPLE_PER_REQUEST) {
    return NextResponse.json({ error: `Max ${MAX_PEOPLE_PER_REQUEST} people per request.` }, { status: 400 });
  }

  const googleApiKey = process.env.GOOGLE_CSE_API_KEY;
  const googleCx = process.env.GOOGLE_CSE_CX;
  const dailyLimitRaw = process.env.LINKEDIN_RESOLVE_DAILY_LIMIT;
  const dailyLimit = dailyLimitRaw ? Number.parseInt(dailyLimitRaw, 10) : DEFAULT_DAILY_LIMIT;
  const matches: Match[] = [];

  for (const entry of peopleUnknown) {
    const person = entry as Partial<Person>;
    if (!person?.name || typeof person.name !== "string") continue;
    const key = personKey(person);

    const cached = getCachedMatch(key);
    if (cached) {
      matches.push({ key, linkedinUrl: cached.linkedinUrl, reason: "cache" });
      continue;
    }

    if (!googleApiKey || !googleCx) {
      matches.push({ key, linkedinUrl: null, reason: "missing_google_cse_env" });
      continue;
    }

    try {
      bumpDailyUsageOrThrow(dailyLimit);
      const linkedinUrl = await resolveWithGoogleCse(person as Person, googleApiKey, googleCx);
      setCachedMatch(key, linkedinUrl);
      matches.push({ key, linkedinUrl, reason: linkedinUrl ? "google_cse" : "not_found" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "google_cse_error";
      matches.push({ key, linkedinUrl: null, reason: message });
    }
  }

  return NextResponse.json({ matches });
}
