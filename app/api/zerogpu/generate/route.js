/**
 * Génération vidéo gratuite via un Space Hugging Face (ZeroGPU).
 *
 * POST /api/zerogpu/generate
 *   { prompt, aspect_ratio?, duration?, steps?, seed? }
 *   -> { url, provider: "zerogpu", request_id, width, height, num_frames }
 *
 * Variables d'environnement :
 *   HF_SPACE_URL  https://owner-space.hf.space
 *                 (défaut : le Space de ce projet)
 *   HF_TOKEN      token Hugging Face, rôle read suffit
 *                 sans lui, quota anonyme : quelques générations puis échec
 *
 * Protocole Gradio (2 appels, vérifié) :
 *   POST {SPACE}/gradio_api/call/generate        -> { event_id }
 *   GET  {SPACE}/gradio_api/call/generate/{id}   -> SSE, event final "complete"
 *
 * Deux pièges codés ici volontairement :
 *   1. l'événement final s'appelle "complete", pas "completed" ;
 *   2. `data` n'est pas plat : l'URL doit être extraite récursivement.
 */

export const runtime = "nodejs";
// Une génération prend ~30 s à chaud, plus au réveil du Space.
// Vercel Hobby plafonne à 60 s : héberger sur Node ou passer en Pro.
export const maxDuration = 300;

const SPACE = (process.env.HF_SPACE_URL || "https://ali1974x-ltx-video-api.hf.space").replace(/\/$/, "");
const TOKEN = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN || "";
const FN = "/generate";

const FPS = 24;
const DEFAULT_STEPS = 30;
const MIN_DURATION = 2;
const MAX_DURATION = 5;

// LTX exige des dimensions multiples de 32.
const SIZES = {
  "16:9": { width: 704, height: 480 },
  "9:16": { width: 480, height: 704 },
  "1:1": { width: 512, height: 512 },
};

function authHeaders(extra = {}) {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}`, ...extra } : extra;
}

/** LTX exige num_frames = 8k + 1. 24 fps => 49 / 73 / 97 / 121. */
function framesForDuration(seconds) {
  const frames = Math.round((FPS * seconds - 1) / 8) * 8 + 1;
  return Math.max(25, Math.min(121, frames));
}

/** Cherche récursivement la première URL de fichier dans un payload Gradio. */
function extractFileUrl(node) {
  if (!node) return null;

  if (typeof node === "string") {
    if (node.startsWith("http")) return node;
    if (node.startsWith("/tmp/")) {
      return `${SPACE}/gradio_api/file=${encodeURIComponent(node)}`;
    }
    return null;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractFileUrl(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof node === "object") {
    if (node.url) return node.url;
    if (node.path) {
      return `${SPACE}/gradio_api/file=${encodeURIComponent(node.path)}`;
    }
    for (const value of Object.values(node)) {
      const found = extractFileUrl(value);
      if (found) return found;
    }
  }

  return null;
}

/** Découpe un flux SSE en blocs `{ event, data }`. */
function parseSseBlock(block) {
  const lines = block.split("\n");
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  return { event, data };
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ error: "missing_prompt" }, { status: 400 });
  }
  if (prompt.length > 1200) {
    return Response.json({ error: "prompt_too_long" }, { status: 400 });
  }

  const aspectRatio = Object.hasOwn(SIZES, body?.aspect_ratio) ? body.aspect_ratio : "16:9";
  const { width, height } = SIZES[aspectRatio];

  const requestedDuration = Number(body?.duration);
  const duration = Number.isFinite(requestedDuration)
    ? Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(requestedDuration)))
    : MIN_DURATION;

  const requestedSteps = Number(body?.steps);
  const steps = Number.isFinite(requestedSteps)
    ? Math.min(50, Math.max(10, Math.round(requestedSteps)))
    : DEFAULT_STEPS;

  const seed = Number.isFinite(Number(body?.seed))
    ? Math.floor(Number(body.seed))
    : Math.floor(Math.random() * 1_000_000);

  const numFrames = framesForDuration(duration);

  const payload = {
    data: [
      prompt,
      "worst quality, inconsistent motion, blurry, jittery, distorted",
      `${width}x${height}`,
      numFrames,
      steps,
      seed,
    ],
  };

  try {
    const submit = await fetch(`${SPACE}/gradio_api/call${FN}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!submit.ok) {
      const text = await submit.text().catch(() => "");
      return Response.json(
        { error: "space_unreachable", detail: `submit_${submit.status} ${text.slice(0, 160)}` },
        { status: 502 }
      );
    }

    const { event_id: eventId } = await submit.json();
    if (!eventId) {
      return Response.json({ error: "no_event_id" }, { status: 502 });
    }

    const stream = await fetch(`${SPACE}/gradio_api/call${FN}/${eventId}`, {
      headers: authHeaders({ Accept: "text/event-stream" }),
      cache: "no-store",
    });

    if (!stream.ok) {
      return Response.json(
        { error: "stream_failed", detail: `stream_${stream.status}` },
        { status: 502 }
      );
    }

    const text = await stream.text();
    let fileUrl = null;
    let jobError = null;

    for (const block of text.split("\n\n")) {
      if (!block.trim()) continue;
      const { event, data } = parseSseBlock(block);

      if (event === "complete") {
        try {
          fileUrl = extractFileUrl(JSON.parse(data));
        } catch {
          fileUrl = null;
        }
        break;
      }

      // `error` + data null en ~1 s = quota GPU épuisé, pas une erreur de payload.
      if (event === "error") {
        jobError = !data || data === "null" ? "quota" : data;
        break;
      }
    }

    if (fileUrl) {
      return Response.json({
        url: fileUrl,
        provider: "zerogpu",
        request_id: eventId,
        width,
        height,
        num_frames: numFrames,
        duration,
        steps,
        seed,
      });
    }

    if (jobError === "quota") {
      return Response.json(
        {
          error: "quota_exhausted",
          detail:
            "Le quota ZeroGPU gratuit est épuisé (5 min de GPU par jour). " +
            "Réessaie après le reset (24 h) ou utilise un autre provider.",
        },
        { status: 429 }
      );
    }

    return Response.json(
      { error: "generation_failed", detail: jobError || "aucun événement complete reçu" },
      { status: 502 }
    );
  } catch (err) {
    console.error("[zerogpu]", err);
    return Response.json({ error: "generation_failed", detail: err.message }, { status: 502 });
  }
}

export async function GET() {
  return Response.json({
    provider: "zerogpu",
    space: SPACE,
    authenticated: Boolean(TOKEN),
    endpoint: FN,
    note: TOKEN ? undefined : "HF_TOKEN absent : quota anonyme, très limité.",
  });
}
