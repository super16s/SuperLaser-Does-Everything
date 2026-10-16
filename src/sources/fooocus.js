// Image generation via a separately-run Fooocus-API server
// (https://github.com/mrhan1993/Fooocus-API), a community REST wrapper
// around Fooocus. Fooocus itself only ships a Gradio UI, with no stable
// HTTP API, and needs a GPU, so it runs elsewhere and this app just calls it.

const TIMEOUT_MS = 5 * 60 * 1000; // generation is slow; cold starts slower

export function fooocusConfigured() {
  return Boolean(process.env.FOOOCUS_API_URL);
}

export async function generateImages(prompt, { negativePrompt = "", count = 1 } = {}) {
  const base = process.env.FOOOCUS_API_URL;
  if (!base) {
    return { images: [], error: "FOOOCUS_API_URL is not set — see .env.example." };
  }

  const body = {
    prompt,
    negative_prompt: negativePrompt,
    performance_selection: process.env.FOOOCUS_PERFORMANCE || "Speed",
    aspect_ratios_selection: process.env.FOOOCUS_ASPECT_RATIO || "1152*896",
    image_number: Math.min(Math.max(Number(count) || 1, 1), 4),
    async_process: false,
    require_base64: true,
  };

  let res;
  try {
    res = await fetch(new URL("/v1/generation/text-to-image", base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { images: [], error: `Could not reach Fooocus-API at ${base}: ${err.message}` };
  }

  if (!res.ok) {
    return { images: [], error: `Fooocus-API returned HTTP ${res.status}` };
  }

  const data = await res.json();
  // Sync mode returns a bare array; tolerate a job-shaped wrapper too.
  const results = Array.isArray(data) ? data : data.job_result || [];
  const images = results
    .filter((r) => r.base64 || r.url)
    .map((r) => ({
      src: r.base64 ? `data:image/png;base64,${r.base64}` : r.url,
      seed: r.seed ?? null,
    }));

  if (!images.length) {
    const reason = results[0]?.finish_reason || "no images returned";
    return { images: [], error: `Fooocus-API produced no images (${reason}).` };
  }
  return { images, error: null };
}
