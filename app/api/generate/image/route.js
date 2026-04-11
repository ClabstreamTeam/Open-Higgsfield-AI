export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = process.env.HUGGINGFACE_API_KEY;

    if (!apiKey) {
      return Response.json({ error: "Missing HUGGINGFACE_API_KEY" }, { status: 500 });
    }

    const prompt = body?.prompt;
    if (!prompt || !String(prompt).trim()) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    const candidateModels = [
      "black-forest-labs/FLUX.1-schnell",
      "ByteDance/SDXL-Lightning",
      "stabilityai/stable-diffusion-xl-base-1.0",
      "runwayml/stable-diffusion-v1-5",
      "stabilityai/stable-diffusion-2-1",
    ];

    let response = null;
    let lastErrorMessage = "Hugging Face image generation failed";
    const attemptedModels = [];
    const attemptDetails = [];

    for (const modelId of candidateModels) {
      attemptedModels.push(modelId);
      response = await fetch(
        `https://router.huggingface.co/hf-inference/models/${modelId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,
            options: {
              wait_for_model: true,
            },
          }),
        }
      );

      if (response.ok) break;

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errJson = await response.json().catch(() => ({}));
        lastErrorMessage =
          errJson?.error || errJson?.message || errJson?.detail || lastErrorMessage;
      } else {
        const errText = await response.text().catch(() => "");
        if (errText) lastErrorMessage = errText;
      }

      attemptDetails.push({
        model: modelId,
        status: response.status,
        error: String(lastErrorMessage || "Unknown error").slice(0, 200),
      });

      const normalizedError = String(lastErrorMessage || "").toLowerCase();
      const shouldTryNextModel =
        [404, 410, 422, 424, 429, 503].includes(response.status) ||
        normalizedError.includes("deprecated") ||
        normalizedError.includes("not supported by provider") ||
        normalizedError.includes("model is loading") ||
        normalizedError.includes("not found");

      if (shouldTryNextModel) {
        continue;
      }

      if (response.status >= 400) {
        return Response.json({ error: lastErrorMessage }, { status: response.status });
      }
    }

    if (!response || !response.ok) {
      return Response.json(
        {
          error: `No supported Hugging Face model succeeded. ${lastErrorMessage}`,
          attempts: attemptDetails,
        },
        { status: 502 }
      );
    }

    // Hugging Face returns image binary
    const imageBuffer = await response.arrayBuffer();

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/png",
      },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}