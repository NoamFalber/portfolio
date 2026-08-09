"use strict";

const unityBrotliTypes = new Map([
  [
    "/builds/project-one/Build/game-one-webgpu-20260809.data.br",
    "application/octet-stream",
  ],
  [
    "/builds/project-one/Build/game-one-webgpu-20260809.framework.js.br",
    "application/javascript",
  ],
  [
    "/builds/project-one/Build/game-one-webgpu-20260809.wasm.br",
    "application/wasm",
  ],
]);

export default {
  async fetch(request, environment) {
    const assetResponse = await environment.ASSETS.fetch(request);
    const contentType = unityBrotliTypes.get(new URL(request.url).pathname);

    if (!contentType || assetResponse.status !== 200) {
      return assetResponse;
    }

    const headers = new Headers(assetResponse.headers);
    headers.set("Content-Encoding", "br");
    headers.set("Content-Type", contentType);
    headers.set(
      "Cache-Control",
      "public, max-age=0, must-revalidate, no-transform",
    );
    headers.set("Vary", "Accept-Encoding");

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
      encodeBody: "manual",
    });
  },
};
