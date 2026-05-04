import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { buildStatusPayload, parseBooleanFlag } from "./lib/status-service.js";

function createDevStatusMiddleware() {
  return {
    name: "nami-local-status-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/cron-ping", async (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? "/", "http://localhost");
          const instant = parseBooleanFlag(requestUrl.searchParams.get("instant"));
          const { payload, statusCode } = await buildStatusPayload({
            instant,
            trigger: "manual"
          });

          res.statusCode = statusCode;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              ok: false,
              trigger: "manual",
              errorMessage: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString()
            })
          );
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), createDevStatusMiddleware()],
  server: {
    host: "0.0.0.0"
  },
  preview: {
    host: "0.0.0.0"
  }
});
