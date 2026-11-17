import type { NextApiRequest, NextApiResponse } from "next";
import { getRealtimeTrains } from "@/lib/server/mta";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const snapshot = await getRealtimeTrains();
    return res
      .status(snapshot.status === "unavailable" ? 503 : 200)
      .json(snapshot);
  } catch {
    return res.status(502).json({
      mode: "live",
      status: "unavailable",
      error: "Unable to load MTA feeds",
      trains: [],
    });
  }
}
