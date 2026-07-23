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
  updateTryOnTaskStages,
  getActiveTryOnTask,
  getUserTryOnTask,
  type TryOnTaskStage,
} from "./db";
import { storagePut } from "./storage";
import { generateImage, ImageGenerationRequestError } from "./_core/imageGeneration";
import { clearAdminSession, createAdminSession, hasAdminSession, isAdminLoginConfigured, verifyAdminCredentials } from "./adminAuth";
import { createTryOnSourceUrl } from "./tryOnSource";
import { ENV } from "./_core/env";
import {
  claimNextBridgeTask,
  completeBridgeTaskLease,
  consumeBridgePairing,
  createBridgePairing,
  failBridgeTaskLease,
  getBridgeDeviceFromCredential,
  getBridgeTaskById,
  getLatestActiveBridgeDevice,
  touchBridgeDevice,
  updateBridgeTaskProgress,
  validateBridgeTaskLease,
} from "./bridgeDb";
import {
  buildCompletedBridgeStages,
  failLocalBridgeTaskForUser,
  parseLocalBridgeStages,
  refreshLocalBridgeQwenTask,
  startLocalBridgeQwenTask,
} from "./localBridgeQwenTask";
import { ComfyUiPocError, runComfyUIPOC } from "./comfyuiPoc";

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

/**
 * mysql2 deployments can return either a ResultSetHeader or a tuple whose
 * first value is the ResultSetHeader. Normalize that transport difference at
 * the boundary before task-stage persistence depends on the new record ID.
 */
function getInsertedHistoryId(result: unknown): number | null {
  const candidates = Array.isArray(result) ? result : [result];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const insertId = Number((candidate as { insertId?: unknown }).insertId);
    if (Number.isSafeInteger(insertId) && insertId > 0) return insertId;
  }
  return null;
}

function requireProjectOwner(user: { openId: string }) {
  if (!ENV.ownerOpenId || user.openId !== ENV.ownerOpenId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the project owner can pair a local ComfyUI workstation." });
  }
}

const bridgeCredentialSchema = z.string().min(32).max(256);
const bridgeLeaseSchema = z.string().min(32).max(256);
const bridgeOutputMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

export const appRouter = router({
  comfyui: router({
    startQwenEdit: protectedProcedure
      .input(z.object({ photoId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => startLocalBridgeQwenTask(ctx.user.id, input.photoId)),
    qwenEditStatus: protectedProcedure
      .input(z.object({ taskId: z.number().int().positive() }))
      .query(({ ctx, input }) => refreshLocalBridgeQwenTask(ctx.user.id, input.taskId)),
  }),
  bridge: router({
    /** Owner-only status used to guide pairing in the Dashboard. */
    ownerStatus: protectedProcedure.query(async ({ ctx }) => {
      requireProjectOwner(ctx.user);
      return getLatestActiveBridgeDevice(ctx.user.id);
    }),
    createPairing: protectedProcedure.mutation(async ({ ctx }) => {
      requireProjectOwner(ctx.user);
      return createBridgePairing(ctx.user.id);
    }),
    pair: publicProcedure
      .input(z.object({ code: z.string().min(20).max(128), label: z.string().min(1).max(120) }))
      .mutation(async ({ input }) => {
        const paired = await consumeBridgePairing(input.code, input.label);
        if (!paired) throw new TRPCError({ code: "FORBIDDEN", message: "This pairing code is invalid, expired, or has already been used." });
        return paired;
      }),
    heartbeat: publicProcedure
      .input(z.object({ credential: bridgeCredentialSchema }))
      .mutation(async ({ input }) => {
        const device = await getBridgeDeviceFromCredential(input.credential);
        if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "The local Bridge credential is invalid or revoked." });
        await touchBridgeDevice(device.id);
        return { deviceId: device.id, status: "active" as const };
      }),
    claim: publicProcedure
      .input(z.object({ credential: bridgeCredentialSchema }))
      .mutation(async ({ ctx, input }) => {
        const device = await getBridgeDeviceFromCredential(input.credential);
        if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "The local Bridge credential is invalid or revoked." });
        await touchBridgeDevice(device.id);
        const task = await claimNextBridgeTask(device.id);
        if (!task) return { task: null };
        let sourceImageUrl: string;
        try {
          sourceImageUrl = createTryOnSourceUrl(ctx.req, task.photoKey);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A secure source image URL could not be created." });
        }
        return {
          task: {
            id: task.id,
            historyId: task.historyId,
            workflowId: task.workflowId,
            sourceImageUrl,
            leaseCredential: task.leaseCredential,
            leaseExpiresAt: task.leaseExpiresAt,
          },
        };
      }),
    progress: publicProcedure
      .input(z.object({
        credential: bridgeCredentialSchema,
        taskId: z.number().int().positive(),
        leaseCredential: bridgeLeaseSchema,
        status: z.enum(["leased", "processing"]).optional(),
        progressKey: z.string().min(1).max(100),
        progressLabel: z.string().min(1).max(255),
        progressDetail: z.string().max(2_000).optional(),
        promptId: z.string().max(128).optional(),
      }))
      .mutation(async ({ input }) => {
        const device = await getBridgeDeviceFromCredential(input.credential);
        if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "The local Bridge credential is invalid or revoked." });
        await touchBridgeDevice(device.id);
        const updated = await updateBridgeTaskProgress({
          taskId: input.taskId,
          deviceId: device.id,
          leaseCredential: input.leaseCredential,
          status: input.status,
          progressKey: input.progressKey,
          progressLabel: input.progressLabel,
          progressDetail: input.progressDetail,
          promptId: input.promptId,
        });
        if (!updated) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The Bridge task lease is no longer valid." });
        return { success: true };
      }),
    complete: publicProcedure
      .input(z.object({
        credential: bridgeCredentialSchema,
        taskId: z.number().int().positive(),
        leaseCredential: bridgeLeaseSchema,
        outputBase64: z.string().min(4).max(35 * 1024 * 1024),
        mimeType: bridgeOutputMimeSchema,
      }))
      .mutation(async ({ input }) => {
        const device = await getBridgeDeviceFromCredential(input.credential);
        if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "The local Bridge credential is invalid or revoked." });
        await touchBridgeDevice(device.id);

        const task = await validateBridgeTaskLease(input.taskId, device.id, input.leaseCredential);
        if (!task) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The Bridge task lease is no longer valid." });
        const imageBytes = Buffer.from(input.outputBase64, "base64");
        if (!imageBytes.length || imageBytes.length > 25 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The Bridge output image is missing or exceeds the 25 MB limit." });
        }

        const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
        const result = await storagePut(`try-on-results/${task.userId}/qwen-bridge-${task.historyId}.${extension}`, imageBytes, input.mimeType);
        const history = await getUserTryOnTask(task.userId, task.historyId);
        if (!history || history.status !== "pending") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The associated XXX task cannot receive a result." });
        }
        const completed = await completeBridgeTaskLease(input.taskId, device.id, input.leaseCredential);
        if (!completed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The Bridge task lease is no longer valid." });
        await updateTryOnHistory(task.historyId, {
          status: "success",
          resultImageUrl: result.url,
          resultImageKey: result.key,
          creditsDeducted: 1,
        });
        await updateTryOnTaskStages(task.historyId, buildCompletedBridgeStages(parseLocalBridgeStages(history.bubbleApiResponse)));
        return { success: true };
      }),
    fail: publicProcedure
      .input(z.object({
        credential: bridgeCredentialSchema,
        taskId: z.number().int().positive(),
        leaseCredential: bridgeLeaseSchema,
        message: z.string().min(1).max(500),
      }))
      .mutation(async ({ input }) => {
        const device = await getBridgeDeviceFromCredential(input.credential);
        if (!device) throw new TRPCError({ code: "UNAUTHORIZED", message: "The local Bridge credential is invalid or revoked." });
        await touchBridgeDevice(device.id);
        const accepted = await failBridgeTaskLease({
          taskId: input.taskId,
          deviceId: device.id,
          leaseCredential: input.leaseCredential,
          message: input.message,
        });
        if (!accepted) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The Bridge task lease is no longer valid." });
        const task = await getBridgeTaskById(input.taskId);
        if (task) await failLocalBridgeTaskForUser(task.userId, task.historyId, "The local Qwen workstation could not complete this edit. Your credit has been returned.");
        return { success: true };
      }),
  }),
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

  // ComfyUI POC
  comfyuiPoc: router({
    processImage: protectedProcedure
      .input(
        z.object({
          imageBase64: z.string().min(4).max(35 * 1024 * 1024),
          imageName: z.string().min(1).max(255),
          positivePrompt: z.string().max(2_000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const imageBuffer = Buffer.from(input.imageBase64, 'base64');
          if (!imageBuffer.length || imageBuffer.length > 25 * 1024 * 1024) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Select a non-empty image no larger than 25 MB for this POC." });
          }

          const result = await runComfyUIPOC(
            imageBuffer,
            input.imageName,
            input.positivePrompt || ''
          );

          return {
            success: true,
            promptId: result.promptId,
            outputBase64: result.outputBuffer.toString("base64"),
            outputMimeType: result.outputMimeType,
            diagnostics: result.diagnostics,
            message: result.message,
          } as const;
        } catch (error) {
          if (error instanceof ComfyUiPocError) {
            return {
              success: false,
              promptId: null,
              outputBase64: null,
              outputMimeType: null,
              diagnostics: error.diagnostics,
              message: error.message,
            } as const;
          }
          console.error("[ComfyUI POC] Unexpected error", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The ComfyUI POC could not be started. Please retry the request.",
          });
        }
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
        let historyId: number | null = null;
        let taskFinalized = false;
        const taskStages: TryOnTaskStage[] = [];

        const persistTaskStages = async () => {
          if (historyId) await updateTryOnTaskStages(historyId, taskStages);
        };

        const beginTaskStage = async (key: string, label: string, detail?: string) => {
          for (let index = taskStages.length - 1; index >= 0; index -= 1) {
            if (taskStages[index].state === "active") {
              taskStages[index] = { ...taskStages[index], state: "completed" };
              break;
            }
          }
          taskStages.push({ key, label, state: "active", detail, timestamp: Date.now() });
          await persistTaskStages();
        };

        const completeActiveTaskStage = async () => {
          for (let index = taskStages.length - 1; index >= 0; index -= 1) {
            if (taskStages[index].state === "active") {
              taskStages[index] = { ...taskStages[index], state: "completed" };
              break;
            }
          }
          await persistTaskStages();
        };

        const failActiveTaskStage = async (detail: string) => {
          for (let index = taskStages.length - 1; index >= 0; index -= 1) {
            if (taskStages[index].state === "active") {
              taskStages[index] = { ...taskStages[index], state: "error", detail };
              break;
            }
          }
          taskStages.push({ key: "failed", label: "Try-on request failed", state: "error", detail, timestamp: Date.now() });
          await persistTaskStages();
        };

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

          taskStages.push({
            key: "photo_verified",
            label: "Photo ownership verified",
            state: "completed",
            timestamp: Date.now(),
          });

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

          historyId = getInsertedHistoryId(historyRecord);
          if (!historyId) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create try-on record" });
          }
          await beginTaskStage("task_created", "Processing task created");

          // Deduct credits from user (server-side enforcement)
          const creditDeducted = await deductCredits(ctx.user.id, 1);
          if (!creditDeducted) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to deduct credits",
            });
          }
          creditsDeducted = true;
          await beginTaskStage("credit_reserved", "One credit reserved");

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
            
            // The provider receives a short-lived application relay URL, not the
            // original signed storage URL or an unsupported inline binary payload.
            await beginTaskStage("source_image", "Preparing selected photo securely");
            let sourceImageUrl: string;
            try {
              sourceImageUrl = createTryOnSourceUrl(ctx.req, selectedPhoto.photoKey);
            } catch {
              throw new SourceImageAccessError();
            }
            await completeActiveTaskStage();
            
            // Call the Manus image generation API with the original image for editing
            await beginTaskStage("image_generation", "AI shirt generation in progress", "This can take a while. The live log will keep updating while the provider works.");
            const result = await generateImage({
              prompt: prompt,
              originalImages: [
                {
                  url: sourceImageUrl,
                  mimeType: getImageMimeType(selectedPhoto.photoKey),
                }
              ],
              model: "MODEL_GPT_IMAGE_2",
              quality: "high",
              onRetry: ({ fromQuality, toQuality }) => beginTaskStage(
                "image_generation_retry",
                "Retrying AI generation",
                `The provider rejected the ${fromQuality}-quality edit request, so we are retrying at ${toQuality} quality.`,
              ),
            });
            
            if (!result.url) {
              throw new Error("Image generation did not return a URL");
            }
            
            console.log("[Shirt Try-On] Success! Generated image URL:", result.url);
            await beginTaskStage("result_saving", "Saving generated result");
            await updateTryOnHistory(historyId, {
              status: "success",
              resultImageUrl: result.url,
              creditsDeducted: 1,
            });
            await completeActiveTaskStage();
            taskStages.push({ key: "completed", label: "Try-on complete", state: "completed", timestamp: Date.now() });
            await persistTaskStages();
            taskFinalized = true;
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
              providerStatus: genError instanceof ImageGenerationRequestError ? genError.status : undefined,
            });
            if (creditsDeducted) {
              const refunded = await addCredits(ctx.user.id, 1);
              if (!refunded) {
                console.error("[Shirt Try-On] Failed to refund the credit after generation failure");
              }
            }
            const safeMessage = isSourceImageAccessError
              ? "We couldn't access the selected photo for the AI edit. Your credit has been returned. Please upload that photo again and retry."
              : "We couldn't complete the AI try-on this time. Your credit has been returned. Please try again in a moment.";
            await failActiveTaskStage(safeMessage);
            await updateTryOnHistory(historyId, { status: "failed", creditsDeducted: 0 });
            taskFinalized = true;
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: safeMessage,
            });
          }
        } catch (error) {
          if (historyId && !taskFinalized) {
            const safeMessage = "We couldn't complete the AI try-on this time. Your credit has been returned. Please try again in a moment.";
            if (creditsDeducted) {
              await addCredits(ctx.user.id, 1);
              creditsDeducted = false;
            }
            await failActiveTaskStage(safeMessage);
            await updateTryOnHistory(historyId, { status: "failed", creditsDeducted: 0 });
            taskFinalized = true;
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: safeMessage });
          }
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

    activeTask: protectedProcedure.query(({ ctx }) => getActiveTryOnTask(ctx.user.id)),
  }),
});

export type AppRouter = typeof appRouter;
