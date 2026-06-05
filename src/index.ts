import { loadConfig, loadEnvFile } from "./config.js";
import { createApp } from "./app.js";

async function main(): Promise<void> {
  loadEnvFile();
  const cfg = loadConfig();
  const app = await createApp({ config: cfg });

  await app.listen({ port: cfg.port, host: cfg.host });
  console.log(`llm-wiki listening on http://${cfg.host}:${cfg.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
