import handler from "vinext/server/fetch-handler";

export default {
  async fetch(request: Request, env: Cloudflare.Env, context: ExecutionContext) {
    const result = await handler.fetch(request, env, context);
    const response = new Response(result.body, result);
    // Authenticated HTML and API responses must never enter a shared cache.
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  },
} satisfies ExportedHandler<Cloudflare.Env>;
