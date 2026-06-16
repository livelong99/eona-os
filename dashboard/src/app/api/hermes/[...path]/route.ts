// Server-side proxy to the Hermes engine API. The browser calls this same-origin
// route (no secret in the bundle); the dashboard server forwards to the engine
// over the Docker network and attaches the API_SERVER_KEY bearer. Also lets SSE
// (EventSource, which can't set headers) be authenticated server-side.
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const HERMES_URL = (process.env.HERMES_URL ?? "http://127.0.0.1:8642").replace(/\/$/, "");
// The engine's bearer is API_SERVER_KEY (as stored in ~/.hermes/.env).
const API_KEY = process.env.API_SERVER_KEY ?? process.env.HERMES_API_KEY ?? "";

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const search = new URL(req.url).search;
  const target = `${HERMES_URL}/${path.join("/")}${search}`;

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  const accept = req.headers.get("accept");
  if (accept) headers["accept"] = accept;
  if (API_KEY) headers["authorization"] = `Bearer ${API_KEY}`;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  try {
    const res = await fetch(target, init);
    // Stream the body straight back — works for JSON and text/event-stream.
    return new Response(res.body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: `engine unreachable at ${HERMES_URL}` }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}

interface Ctx {
  params: Promise<{ path: string[] }>;
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(req, (await ctx.params).path);
}
