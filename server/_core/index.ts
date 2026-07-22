import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  
  // Direct file upload endpoint (bypasses tRPC serialization limits)
  app.post('/api/upload', async (req, res) => {
    try {
      // Use SDK authentication to get user
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch (error) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const { file: base64Data, filename } = req.body;
      if (!base64Data || !filename) {
        return res.status(400).json({ error: 'Missing file or filename' });
      }
      
      const buffer = Buffer.from(base64Data, 'base64');
      
      let mimeType = 'application/octet-stream';
      if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (filename.endsWith('.png')) {
        mimeType = 'image/png';
      } else if (filename.endsWith('.gif')) {
        mimeType = 'image/gif';
      } else if (filename.endsWith('.webp')) {
        mimeType = 'image/webp';
      }
      
      const { storagePut } = await import('../storage');
      const { saveUserPhoto } = await import('../db');
      
      const photoKey = `photos/${user.id}/${Date.now()}-${filename}`;
      const result = await storagePut(photoKey, buffer, mimeType);
      
      if (!result) {
        return res.status(500).json({ error: 'Failed to upload to storage' });
      }
      
      await saveUserPhoto({
        userId: user.id,
        photoUrl: result.url,
        photoKey: result.key,
      });
      
      res.json({
        success: true,
        photoUrl: result.url,
        photoKey: result.key,
      });
    } catch (error) {
      console.error('[Upload] Error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
