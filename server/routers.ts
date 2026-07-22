import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { passwordAdminProcedure, publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getUserCredits,
  deductCredits,
  addCredits,
  saveUserPhoto,
  getUserPhotos,
  saveTryOnHistory,
  getTryOnHistory,
  getAdminUserProfile,
  getAdminUsers,
  getUserGallery,
  updateTryOnHistory,
} from "./db";
import { storagePut, storageGetSignedUrl } from "./storage";
import { generateImage } from "./_core/imageGeneration";
import { clearAdminSession, createAdminSession, hasAdminSession, isAdminLoginConfigured, verifyAdminCredentials } from "./adminAuth";

// Shirt styles available for try-on
const SHIRT_STYLES = [
  { id: "classic-white", name: "Classic White", color: "#FFFFFF" },
  { id: "neon-pink", name: "Neon Pink", color: "#FF006E" },
  { id: "electric-cyan", name: "Electric Cyan", color: "#00D9FF" },
  { id: "dark-black", name: "Dark Black", color: "#0A0E27" },
  { id: "holographic", name: "Holographic", color: "#FF00FF" },
];

function getImageMimeType(fileKey: string): string {
  const extension = fileKey.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

class SourceImageAccessError extends Error {
  constructor() {
    super("The selected source image could not be retrieved from storage.");
    this.name = "SourceImageAccessError";
  }
}

async function readSourceImageForGeneration(photoKey: string) {
  let sourceImageUrl: string;
  try {
    sourceImageUrl = await storageGetSignedUrl(photoKey);
    const parsedUrl = new URL(sourceImageUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new SourceImageAccessError();
    }
  } catch {
    throw new SourceImageAccessError();
  }

  try {
    const sourceResponse = await fetch(sourceImageUrl);
    if (!sourceResponse.ok) throw new SourceImageAccessError();
    const imageBytes = Buffer.from(await sourceResponse.arrayBuffer());
    if (!imageBytes.length) throw new SourceImageAccessError();
    const contentType = sourceResponse.headers.get("content-type")?.split(";")[0];
    return {
      b64Json: imageBytes.toString("base64"),
      mimeType: contentType?.startsWith("image/") ? contentType : getImageMimeType(photoKey),
    };
  } catch (error) {
    if (error instanceof SourceImageAccessError) throw error;
    throw new SourceImageAccessError();
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  gallery: router({
    list: protectedProcedure.query(({ ctx }) => getUserGallery(ctx.user.id)),
  }),

  admin: router({
    session: publicProcedure.query(({ ctx }) => ({ authenticated: hasAdminSession(ctx.req), configured: isAdminLoginConfigured() })),
    login: publicProcedure
      .input(z.object({ username: z.string().min(1).max(128), password: z.string().min(1).max(256) }))
      .mutation(({ ctx, input }) => {
        if (!verifyAdminCredentials(input.username, input.password)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Invalid administrator credentials." });
        }
        createAdminSession(ctx.req, ctx.res);
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearAdminSession(ctx.req, ctx.res);
      return { success: true } as const;
    }),
    listUsers: passwordAdminProcedure.query(() => getAdminUsers()),
    userProfile: passwordAdminProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ input }) => getAdminUserProfile(input.userId)),
    userGallery: passwordAdminProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ input }) => getUserGallery(input.userId)),
  }),

  // Credits management
  credits: router({
    getBalance: protectedProcedure.query(async ({ ctx }) => {
      const balance = await getUserCredits(ctx.user.id);
      return { balance };
    }),
  }),

  // Photo management
  photos: router({
    upload: protectedProcedure
      .input(
        z.object({
          file: z.any(), // Accept any file-like object
          filename: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const startTime = Date.now();
          console.log('[Upload] Starting file upload for user:', ctx.user.id);
          console.log('[Upload] File received:', typeof input.file, input.file?.constructor?.name, 'Size:', input.file?.length || 'unknown');
          
          // Handle both Blob and File objects
          let buffer: Buffer;
          
          if (input.file instanceof Blob || input.file instanceof File) {
            const arrayBuffer = await input.file.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
          } else if (typeof input.file === 'string') {
            // Handle base64 string
            buffer = Buffer.from(input.file, 'base64');
          } else if (Buffer.isBuffer(input.file)) {
            buffer = input.file;
          } else if (input.file instanceof Uint8Array) {
            buffer = Buffer.from(input.file);
          } else if (Array.isArray(input.file)) {
            // Handle array of bytes
            buffer = Buffer.from(input.file);
          } else if (typeof input.file === 'object' && input.file !== null) {
            // Handle object with data property
            if (input.file.data) {
              buffer = Buffer.from(input.file.data);
            } else {
              throw new Error('Invalid file format: no data property');
            }
          } else {
            throw new Error('Invalid file format: ' + typeof input.file);
          }

          console.log('[Upload] Buffer created, size:', buffer.length, 'bytes');
          
          // Upload to S3
          console.log('[Upload] Starting S3 upload...');
          let mimeType = 'application/octet-stream';
          if (input.file instanceof Blob || input.file instanceof File) {
            mimeType = input.file.type || 'application/octet-stream';
          } else if (input.filename.endsWith('.jpg') || input.filename.endsWith('.jpeg')) {
            mimeType = 'image/jpeg';
          } else if (input.filename.endsWith('.png')) {
            mimeType = 'image/png';
          } else if (input.filename.endsWith('.gif')) {
            mimeType = 'image/gif';
          } else if (input.filename.endsWith('.webp')) {
            mimeType = 'image/webp';
          }
          
          const result = await storagePut(
            `photos/${ctx.user.id}/${Date.now()}-${input.filename}`,
            buffer,
            mimeType
          );
          const s3Time = Date.now() - startTime;
          console.log('[Upload] S3 upload complete. Time:', s3Time, 'ms, URL:', result?.url);

          if (!result) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to upload photo to storage",
            });
          }

          // Save photo metadata to database
          await saveUserPhoto({
            userId: ctx.user.id,
            photoUrl: result.url,
            photoKey: result.key,
          });

          return {
            success: true,
            photoUrl: result.url,
            photoKey: result.key,
          };
        } catch (error) {
          console.error("Photo upload error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to upload photo",
          });
        }
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const photos = await getUserPhotos(ctx.user.id);
      return photos;
    }),
  }),

  // Shirt styles
  shirts: router({
    list: publicProcedure.query(() => {
      return SHIRT_STYLES;
    }),
  }),

  // Try-on feature
  tryOn: router({
    process: protectedProcedure
      .input(
        z.object({
          photoId: z.number(),
          shirtStyle: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let creditsDeducted = false;
        try {
          // Check the balance before resolving the selected record so a user who
          // cannot afford a try-on receives the correct actionable response.
          const balance = await getUserCredits(ctx.user.id);
          if (balance < 1) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Insufficient credits. You need at least 1 credit to try on a shirt.",
            });
          }

          const shirtInfo = SHIRT_STYLES.find(style => style.id === input.shirtStyle);
          if (!shirtInfo) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "The selected shirt style is not available.",
            });
          }

          // Resolve the selected ID against the signed-in user's own photos before
          // creating history or charging a credit. Browser-provided paths are never
          // trusted as the source of truth for a photo selection.
          const userPhotos = await getUserPhotos(ctx.user.id);
          const selectedPhoto = userPhotos.find(photo => photo.id === input.photoId);
          if (!selectedPhoto?.photoKey) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "The selected photo was not found in your account. Upload a photo and try again.",
            });
          }

          // Create try-on history record with pending status
          const historyRecord = await saveTryOnHistory({
            userId: ctx.user.id,
            photoId: input.photoId,
            shirtStyle: input.shirtStyle,
            status: "pending",
            creditsDeducted: 0,
          });

          if (!historyRecord) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create try-on record",
            });
          }

          // Deduct credits from user (server-side enforcement)
          const creditDeducted = await deductCredits(ctx.user.id, 1);
          if (!creditDeducted) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to deduct credits",
            });
          }
          creditsDeducted = true;

          // Generate shirt try-on image using AI image generation
          try {
            // Create a detailed prompt for AI image generation
            const prompt = `You are an expert fashion photo editor. Take this photo and realistically edit the person's shirt to be a ${shirtInfo.name} shirt with color ${shirtInfo.color}. 
            
Instructions:
- Only change the shirt/top clothing item
- Keep the person's face, body pose, arms, and background exactly the same
- Make the shirt look natural and realistic with proper lighting and shadows
- Ensure the shirt fits the person's body naturally
- Maintain the same photo quality and style as the original
- Do not change anything else in the image

The new shirt should be ${shirtInfo.name} with a ${shirtInfo.color} color.`;

            console.log("[Shirt Try-On] Processing shirt change for:", shirtInfo.name);
            console.log("[Shirt Try-On] Using AI image generation to create realistic shirt change");
            
            // Read the signed source privately on this server and pass image bytes to
            // the provider. The provider never receives the signed storage URL.
            const sourceImage = await readSourceImageForGeneration(selectedPhoto.photoKey);
            
            // Call the Manus image generation API with the original image for editing
            const result = await generateImage({
              prompt: prompt,
              originalImages: [
                {
                  b64Json: sourceImage.b64Json,
                  mimeType: sourceImage.mimeType,
                }
              ],
              model: "MODEL_GPT_IMAGE_2",
              quality: "high",
            });
            
            if (!result.url) {
              throw new Error("Image generation did not return a URL");
            }
            
            console.log("[Shirt Try-On] Success! Generated image URL:", result.url);
            const historyId = Number((historyRecord as { insertId?: number }).insertId);
            if (Number.isFinite(historyId) && historyId > 0) {
              await updateTryOnHistory(historyId, {
                status: "success",
                resultImageUrl: result.url,
                creditsDeducted: 1,
              });
            }
            return {
              success: true,
              resultImageUrl: result.url,
              creditsRemaining: balance - 1,
              shirtApplied: shirtInfo.name,
            }
          } catch (genError) {
            const isSourceImageAccessError = genError instanceof SourceImageAccessError;
            console.error("[Shirt Try-On] Generation failed", {
              category: isSourceImageAccessError ? "source_image_access" : "provider_or_processing",
            });
            if (creditsDeducted) {
              const refunded = await addCredits(ctx.user.id, 1);
              if (!refunded) {
                console.error("[Shirt Try-On] Failed to refund the credit after generation failure");
              }
            }
            const historyId = Number((historyRecord as { insertId?: number }).insertId);
            if (Number.isFinite(historyId) && historyId > 0) {
              await updateTryOnHistory(historyId, { status: "failed", creditsDeducted: 0 });
            }
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: isSourceImageAccessError
                ? "We couldn't access the selected photo for the AI edit. Your credit has been returned. Please upload that photo again and retry."
                : "We couldn't complete the AI try-on this time. Your credit has been returned. Please try again in a moment.",
            });
          }
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          console.error("Try-on error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process try-on request",
          });
        }
      }),

    history: protectedProcedure.query(async ({ ctx }) => {
      const history = await getTryOnHistory(ctx.user.id, 20);
      return history;
    }),
  }),
});

export type AppRouter = typeof appRouter;
