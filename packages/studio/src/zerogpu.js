/**
 * Adaptateur ZeroGPU — génération vidéo gratuite via un Space Hugging Face.
 *
 * Remplace un provider payant (Muapi / fal / Replicate) sans changer la
 * signature publique du client : `generateVideo(apiKey, params) -> { url }`.
 *
 * Le Space est appelé côté serveur par `/api/zerogpu/generate` (voir
 * `app/api/zerogpu/generate/route.js`) : le token HF ne descend jamais dans
 * le navigateur.
 *
 * Contraintes :
 *   - quota gratuit ZeroGPU : 5 min de GPU par jour (~9 clips courts)
 *   - nécessite un serveur Node (Next) : pas disponible dans le build Electron
 *     ni derrière le proxy Vite `/api`, qui pointe vers muapi.ai
 */

export const ZEROGPU_MODEL_PREFIX = "zerogpu:";

const API_BASE =
  typeof window !== "undefined" && window.__ZEROGPU_API_BASE__
    ? String(window.__ZEROGPU_API_BASE__).replace(/\/$/, "")
    : "";

/** Un identifiant de modèle pilote-t-il l'adaptateur gratuit ? */
export function isZeroGpuModel(modelId) {
  return typeof modelId === "string" && modelId.startsWith(ZEROGPU_MODEL_PREFIX);
}

/**
 * Lance une génération text-to-video sur le Space ZeroGPU.
 * @param {Object} params
 * @param {string} params.prompt
 * @param {'16:9'|'9:16'|'1:1'} [params.aspect_ratio]
 * @param {number} [params.duration]  en secondes (2 à 5)
 * @param {number} [params.steps]
 * @param {number} [params.seed]
 * @returns {Promise<{url: string, provider: 'zerogpu'}>}
 */
export async function generateZeroGpuVideo(params = {}) {
  const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
  if (!prompt) throw new Error("Un prompt est requis pour la génération gratuite.");

  let response;
  try {
    response = await fetch(`${API_BASE}/api/zerogpu/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        aspect_ratio: params.aspect_ratio || "16:9",
        duration: params.duration || 2,
        steps: params.steps || 30,
        seed: params.seed,
      }),
    });
  } catch (err) {
    throw new Error(
      `ZeroGPU injoignable (${err.message}). Ce mode nécessite le serveur Next ; ` +
        "il n'est pas disponible dans le build Electron."
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail || data.error || `ZeroGPU a répondu ${response.status}`
    );
  }

  if (!data.url) throw new Error("ZeroGPU n'a renvoyé aucune URL de vidéo.");

  return { ...data, url: data.url, provider: "zerogpu" };
}
