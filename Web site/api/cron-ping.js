import { buildStatusPayload, parseBooleanFlag } from "../lib/status-service.js";

export default async function handler(req, res) {
  const instant = parseBooleanFlag(req.query?.instant);
  const trigger = req.headers["x-vercel-cron"] ? "cron" : "manual";
  const { payload, statusCode } = await buildStatusPayload({
    instant,
    trigger
  });

  res.status(statusCode).json(payload);
}
