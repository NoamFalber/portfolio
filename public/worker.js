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
  [
    "/builds/project-two/Build/0819aaffc34ffef870244d502b9827e0.framework.js.br",
    "application/javascript",
  ],
  [
    "/builds/project-two/Build/ae5343883c6e10953b2c9a124e38e37f.wasm.br",
    "application/wasm",
  ],
]);

const projectTwoDataPath =
  "/builds/project-two/Build/35b4782e8b3134512369376ea3056728.data.br";
const projectTwoDataParts = [
  `${projectTwoDataPath}.part-00`,
  `${projectTwoDataPath}.part-01`,
];
const projectTwoDataLength = 47798498;

function brotliHeaders(contentType, contentLength) {
  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable, no-transform",
    "Content-Encoding": "br",
    "Content-Type": contentType,
    Vary: "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
  });

  if (contentLength) {
    headers.set("Content-Length", String(contentLength));
  }

  return headers;
}

function concatenateBodies(responses) {
  let responseIndex = 0;
  let activeReader = null;

  return new ReadableStream({
    async pull(controller) {
      while (responseIndex < responses.length || activeReader) {
        if (!activeReader) {
          activeReader = responses[responseIndex].body.getReader();
          responseIndex += 1;
        }

        const { done, value } = await activeReader.read();

        if (done) {
          activeReader = null;
          continue;
        }

        controller.enqueue(value);
        return;
      }

      controller.close();
    },
    async cancel(reason) {
      if (activeReader) {
        await activeReader.cancel(reason);
      }
    },
  });
}

async function projectTwoDataResponse(request, environment) {
  if (request.method === "HEAD") {
    return new Response(null, {
      headers: brotliHeaders("application/octet-stream", projectTwoDataLength),
    });
  }

  const partResponses = await Promise.all(
    projectTwoDataParts.map((partPath) => {
      const partUrl = new URL(request.url);
      partUrl.pathname = partPath;

      return environment.ASSETS.fetch(
        new Request(partUrl, {
          headers: { "Accept-Encoding": "identity" },
        }),
      );
    }),
  );

  const failedPart = partResponses.find((response) => response.status !== 200);

  if (failedPart) {
    return new Response("A Unity build data chunk could not be loaded.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(concatenateBodies(partResponses), {
    headers: brotliHeaders("application/octet-stream", projectTwoDataLength),
    encodeBody: "manual",
  });
}

export default {
  async fetch(request, environment) {
    const pathname = new URL(request.url).pathname;

    if (
      pathname === projectTwoDataPath &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return projectTwoDataResponse(request, environment);
    }

    const assetResponse = await environment.ASSETS.fetch(request);
    const contentType = unityBrotliTypes.get(pathname);

    if (!contentType || assetResponse.status !== 200) {
      return assetResponse;
    }

    const headers = new Headers(assetResponse.headers);
    brotliHeaders(contentType).forEach((value, key) => {
      headers.set(key, value);
    });

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
      encodeBody: "manual",
    });
  },
};
