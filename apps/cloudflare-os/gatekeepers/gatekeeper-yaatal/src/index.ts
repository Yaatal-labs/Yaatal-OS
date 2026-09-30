export * from "./yaatal.js";

export default {
  async fetch(): Promise<Response> {
    return new Response("Yaatal catalog Gatekeeper is running.", { headers: { "content-type": "text/plain" } });
  },
};
