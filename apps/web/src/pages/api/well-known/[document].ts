import type { NextApiRequest, NextApiResponse } from "next";

import { auth } from "../auth/[...all]";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const metadata =
    req.query.document === "openid-configuration"
      ? await auth.api.getOpenIdConfig({ asResponse: false })
      : req.query.document === "oauth-authorization-server"
        ? await auth.api.getOAuthServerConfig({ asResponse: false })
        : null;
  if (!metadata) return res.status(404).end();

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).json(metadata);
}
