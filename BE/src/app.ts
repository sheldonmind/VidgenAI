import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import modelsRouter from "./routes/models";
import generationsRouter from "./routes/generations";
import webhooksRouter from "./routes/webhooks";
import tiktokRouter from "./routes/tiktok";
import { errorHandler } from "./middleware/errorHandler";
import { ensureUploadsDir, uploadsDir } from "./utils/storage";

ensureUploadsDir();

const app = express();

const corsOrigins =
  process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()) || "*";

app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.use("/uploads", express.static(path.join(uploadsDir)));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// TikTok verification file
app.get("/tiktokvwmp13WUPKPVAE5iq2LPyUsZ7r1bzRic.txt", (_req, res) => {
  res.type("text/plain");
  res.send("tiktok-developers-site-verification=vwmp13WUPKPVAE5iq2LPyUsZ7r1bzRic");
});

// Terms of Service page (required for TikTok verification)
app.get("/terms", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Terms of Service - Motion Model</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; }
        h1 { color: #111; }
        h2 { color: #444; margin-top: 30px; }
      </style>
    </head>
    <body>
      <h1>Terms of Service</h1>
      <p><strong>Last updated:</strong> January 27, 2026</p>
      
      <h2>1. Acceptance of Terms</h2>
      <p>By accessing and using Motion Model ("the Service"), you accept and agree to be bound by these Terms of Service.</p>
      
      <h2>2. Description of Service</h2>
      <p>Motion Model is an AI-powered video creation platform that enables users to generate motion-controlled videos from images using advanced AI technology.</p>
      
      <h2>3. User Responsibilities</h2>
      <p>Users are responsible for all content they create and share through our Service. Users must not create content that violates any laws or infringes on others' rights.</p>
      
      <h2>4. TikTok Integration</h2>
      <p>Our Service integrates with TikTok's Content Posting API. By using this feature, you also agree to TikTok's Terms of Service.</p>
      
      <h2>5. Intellectual Property</h2>
      <p>Users retain ownership of content they create. By using our Service, you grant us a license to process your content for the purpose of providing the Service.</p>
      
      <h2>6. Limitation of Liability</h2>
      <p>The Service is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the Service.</p>
      
      <h2>7. Contact</h2>
      <p>For questions about these Terms, please contact us at support@motionmodel.ai</p>
    </body>
    </html>
  `);
});

// Privacy Policy page (required for TikTok verification)
app.get("/privacy", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Privacy Policy - Motion Model</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; }
        h1 { color: #111; }
        h2 { color: #444; margin-top: 30px; }
      </style>
    </head>
    <body>
      <h1>Privacy Policy</h1>
      <p><strong>Last updated:</strong> January 27, 2026</p>
      
      <h2>1. Information We Collect</h2>
      <p>We collect information you provide directly, including:</p>
      <ul>
        <li>Account information (when connecting TikTok)</li>
        <li>Content you create (images, videos, prompts)</li>
        <li>Usage data and preferences</li>
      </ul>
      
      <h2>2. How We Use Your Information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Provide and improve our AI video generation service</li>
        <li>Post content to TikTok on your behalf (when authorized)</li>
        <li>Communicate with you about the Service</li>
      </ul>
      
      <h2>3. TikTok Data</h2>
      <p>When you connect your TikTok account, we access:</p>
      <ul>
        <li>Basic profile information (username, avatar)</li>
        <li>Permission to post videos to your account</li>
      </ul>
      <p>We do not access your TikTok messages, followers list, or other private data.</p>
      
      <h2>4. Data Storage</h2>
      <p>Your data is stored securely. Access tokens are encrypted and stored only as long as necessary to provide the Service.</p>
      
      <h2>5. Data Sharing</h2>
      <p>We do not sell your personal information. We only share data with TikTok as necessary to post content on your behalf.</p>
      
      <h2>6. Your Rights</h2>
      <p>You can disconnect your TikTok account at any time, which will delete your stored tokens. You can also request deletion of all your data.</p>
      
      <h2>7. Contact</h2>
      <p>For privacy questions, contact us at privacy@motionmodel.ai</p>
    </body>
    </html>
  `);
});

app.use("/api/v1/models", modelsRouter);
app.use("/api/v1/generations", generationsRouter);
app.use("/api/v1/webhooks", webhooksRouter);
app.use("/api/v1/tiktok", tiktokRouter);

app.use(errorHandler);

export default app;
