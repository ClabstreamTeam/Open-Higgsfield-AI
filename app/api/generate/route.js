export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = process.env.MUAPI_API_KEY;

    if (!apiKey) {
      return Response.json({ error: "Missing MUAPI_API_KEY" }, { status: 500 });
    }

    const endpoint = String(body?.endpoint || "").trim();
    if (!endpoint) {
      return Response.json({ error: "Missing endpoint" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9._/-]+$/.test(endpoint)) {
      return Response.json({ error: "Invalid endpoint" }, { status: 400 });
    }

    const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

    const res = await fetch(`https://api.muapi.ai/api/v1/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
