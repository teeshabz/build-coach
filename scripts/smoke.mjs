// Quick check that the key, model, and response schema all work.
//   node scripts/smoke.mjs
import Anthropic from "@anthropic-ai/sdk";
try { process.loadEnvFile(".env"); } catch {}

const started = Date.now();
const client = new Anthropic();
const r = await client.messages.create({
  model: process.env.MODEL || "claude-opus-5",
  max_tokens: 300,
  system: "Reply with JSON only.",
  messages: [{ role: "user", content: "Say hello in the field 'speech'." }],
  output_config: {
    effort: process.env.EFFORT || "low",
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: { speech: { type: "string" } },
        required: ["speech"],
        additionalProperties: false,
      },
    },
  },
});
console.log(`ok in ${Date.now() - started}ms:`, r.content.find((b) => b.type === "text").text);
