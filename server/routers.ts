import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getUserCredits,
  deductCredits,
  saveUserPhoto,
  getUserPhotos,
  saveTryOnHistory,
  getTryOnHistory,
} from "./db";
import { storagePut, storageGet } from "./storage";

// Shirt styles available for try-on
const SHIRT_STYLES = [
  { id: "classic-white", name: "Classic White", color: "#FFFFFF" },
  { id: "neon-pink", name: "Neon Pink", color: "#FF006E" },
  { id: "electric-cyan", name: "Electric Cyan", color: "#00D9FF" },
  { id: "dark-black", name: "Dark Black", color: "#0A0E27" },
  { id: "holographic", name: "Holographic", color: "#FF00FF" },
];

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
          file: z.instanceof(Blob),
          filename: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          // Convert Blob to Buffer
          const arrayBuffer = await input.file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Upload to S3
          const result = await storagePut(
            `photos/${ctx.user.id}/${Date.now()}-${input.filename}`,
            buffer,
            input.file.type
          );

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
          photoUrl: z.string(),
          shirtStyle: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          // Check if user has enough credits
          const balance = await getUserCredits(ctx.user.id);
          if (balance < 1) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Insufficient credits. You need at least 1 credit to try on a shirt.",
            });
          }

          // Create try-on history record with pending status
          const historyRecord = await saveTryOnHistory({
            userId: ctx.user.id,
            photoId: input.photoId,
            shirtStyle: input.shirtStyle,
            status: "pending",
            creditsDeducted: 1,
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

          // Call Bubble.io Workflow API
          const bubbleApiUrl = "https://magic8-78745.bubbleapps.io/version-test/api/1.1/wf/shirt_tryon";
          const bubbleToken = "e2bb203ef7d383766f3d0f4e6d09a77a";

          const bubblePayload = {
            photo_url: input.photoUrl,
            shirt_style: input.shirtStyle,
          };

          try {
            const bubbleResponse = await fetch(bubbleApiUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${bubbleToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(bubblePayload),
            });

            const bubbleData = await bubbleResponse.json();

            // Store the API response for debugging
            if (bubbleData && bubbleData.result && bubbleData.result.image_url) {
              // Update try-on history with result
              // Note: In a real scenario, you'd update the record with the result
              return {
                success: true,
                resultImageUrl: bubbleData.result.image_url,
                creditsRemaining: balance - 1,
              };
            } else {
              throw new Error("Invalid response from Bubble.io API");
            }
          } catch (bubbleError) {
            console.error("Bubble.io API error:", bubbleError);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to process shirt try-on with Bubble.io API",
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
