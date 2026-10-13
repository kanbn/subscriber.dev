import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import { UploadsService } from "../../uploads/uploads.service.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

const UploadImageSchema = z.object({
  environmentId: z.string(),
  data: z
    .string()
    .describe(
      "The image file, base64-encoded. PNG, JPEG, GIF or WebP, up to 5 MB.",
    ),
});

const AddVideoSchema = z.object({
  environmentId: z.string(),
  url: z.string().describe("A YouTube, Vimeo or Loom link."),
});

@Injectable()
export class UploadsTools {
  constructor(private readonly uploadsService: UploadsService) {}

  @Tool({
    name: "upload_image",
    description:
      "Upload an image to use in emails and get back its public URL, for an `<img src>` in an email step's HTML. If the image is already online, you can use its URL directly instead. For a local file, the `subscriber uploads image <path>` CLI command avoids encoding it.",
    parameters: UploadImageSchema,
    annotations: { openWorldHint: false },
  })
  async uploadImage(
    args: z.infer<typeof UploadImageSchema>,
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );
    return this.uploadsService.uploadImage(
      environment,
      Buffer.from(args.data.replace(/^data:[^,]*,/, ""), "base64"),
    );
  }

  @Tool({
    name: "add_video",
    description:
      'Email clients can\'t play video, so emails show a thumbnail with a play button that links to the video. Give a YouTube, Vimeo or Loom link and this stores the thumbnail. Put it in the email as `<a href="{href}"><img src="{src}" alt="{title}"></a>`.',
    parameters: AddVideoSchema,
    annotations: { openWorldHint: true },
  })
  async addVideo(
    args: z.infer<typeof AddVideoSchema>,
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );
    return this.uploadsService.addVideo(environment, args.url);
  }
}
