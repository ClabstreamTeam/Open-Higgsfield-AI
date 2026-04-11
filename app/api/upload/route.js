export async function POST(req) {
  try {
    const apiKey = process.env.MUAPI_API_KEY;

    if (!apiKey) {
      return Response.json({ error: "Missing MUAPI_API_KEY" }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json({ error: "Missing file" }, { status: 400 });
    }

    const forwardForm = new FormData();
    forwardForm.append("file", file);

    const res = await fetch("https://api.muapi.ai/api/v1/upload_file", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
      },
      body: forwardForm,
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
