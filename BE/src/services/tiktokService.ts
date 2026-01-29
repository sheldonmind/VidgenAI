import axios from "axios";
import fs from "fs";
import path from "path";
import prisma from "../prisma";

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
}

interface TikTokCreatorInfo {
  creator_avatar_url: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

interface TikTokPostResponse {
  data: {
    publish_id: string;
    upload_url?: string;
  };
  error: {
    code: string;
    message: string;
    log_id: string;
  };
}

interface TikTokPostStatusResponse {
  data: {
    status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED";
    fail_reason?: string;
    publicaly_available_post_id?: string[];
    uploaded_bytes?: number;
  };
  error: {
    code: string;
    message: string;
    log_id: string;
  };
}

class TikTokService {
  private clientKey: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientKey = process.env.TIKTOK_CLIENT_KEY || "";
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";
    this.redirectUri = process.env.TIKTOK_REDIRECT_URI || "";
  }

  isConfigured(): boolean {
    return !!(this.clientKey && this.clientSecret && this.redirectUri);
  }

  /**
   * Generate OAuth authorization URL for TikTok login
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      response_type: "code",
      scope: "user.info.basic,video.publish",
      redirect_uri: this.redirectUri,
      state: state
    });

    return `${TIKTOK_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<TikTokTokenResponse> {
    const response = await axios.post(
      TIKTOK_TOKEN_URL,
      new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    if (response.data.error?.code && response.data.error.code !== "ok") {
      throw new Error(`TikTok OAuth error: ${response.data.error.message}`);
    }

    return response.data;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TikTokTokenResponse> {
    const response = await axios.post(
      TIKTOK_TOKEN_URL,
      new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    if (response.data.error?.code && response.data.error.code !== "ok") {
      throw new Error(`TikTok refresh token error: ${response.data.error.message}`);
    }

    return response.data;
  }

  /**
   * Get creator info to check posting capabilities
   */
  async getCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/creator_info/query/`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
        }
      }
    );

    if (response.data.error?.code && response.data.error.code !== "ok") {
      throw new Error(`TikTok API error: ${response.data.error.message}`);
    }

    return response.data.data;
  }

  /**
   * Initialize video upload to TikTok using FILE_UPLOAD method
   */
  async initVideoUpload(
    accessToken: string,
    videoPath: string,
    options: {
      title?: string;
      privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
      disableDuet?: boolean;
      disableComment?: boolean;
      disableStitch?: boolean;
      videoCoverTimestampMs?: number;
    }
  ): Promise<TikTokPostResponse> {
    // Get file size
    const stats = fs.statSync(videoPath);
    const videoSize = stats.size;

    // Calculate chunk size (max 64MB per chunk, we'll use 10MB)
    const chunkSize = Math.min(10 * 1024 * 1024, videoSize);
    const totalChunkCount = Math.ceil(videoSize / chunkSize);

    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/video/init/`,
      {
        post_info: {
          title: options.title || "Video created with AI",
          privacy_level: options.privacyLevel || "PUBLIC_TO_EVERYONE",
          disable_duet: options.disableDuet ?? false,
          disable_comment: options.disableComment ?? false,
          disable_stitch: options.disableStitch ?? false,
          video_cover_timestamp_ms: options.videoCoverTimestampMs || 1000
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
        }
      }
    );

    if (response.data.error?.code && response.data.error.code !== "ok") {
      throw new Error(`TikTok init upload error: ${response.data.error.message}`);
    }

    return response.data;
  }

  /**
   * Upload video chunks to TikTok
   */
  async uploadVideoChunks(
    uploadUrl: string,
    videoPath: string
  ): Promise<void> {
    const videoBuffer = fs.readFileSync(videoPath);
    const videoSize = videoBuffer.length;

    // Upload in chunks (10MB each)
    const chunkSize = 10 * 1024 * 1024;
    let offset = 0;

    while (offset < videoSize) {
      const end = Math.min(offset + chunkSize, videoSize);
      const chunk = videoBuffer.slice(offset, end);

      const response = await axios.put(uploadUrl, chunk, {
        headers: {
          "Content-Range": `bytes ${offset}-${end - 1}/${videoSize}`,
          "Content-Type": "video/mp4"
        }
      });

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Failed to upload chunk: ${response.status}`);
      }

      offset = end;
    }
  }

  /**
   * Initialize video post using PULL_FROM_URL method
   * (Requires domain verification on TikTok)
   */
  async initVideoPostFromUrl(
    accessToken: string,
    videoUrl: string,
    options: {
      title?: string;
      privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
      disableDuet?: boolean;
      disableComment?: boolean;
      disableStitch?: boolean;
      videoCoverTimestampMs?: number;
    }
  ): Promise<TikTokPostResponse> {
    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/video/init/`,
      {
        post_info: {
          title: options.title || "Video created with AI",
          privacy_level: options.privacyLevel || "PUBLIC_TO_EVERYONE",
          disable_duet: options.disableDuet ?? false,
          disable_comment: options.disableComment ?? false,
          disable_stitch: options.disableStitch ?? false,
          video_cover_timestamp_ms: options.videoCoverTimestampMs || 1000
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: videoUrl
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
        }
      }
    );

    if (response.data.error?.code && response.data.error.code !== "ok") {
      throw new Error(`TikTok post from URL error: ${response.data.error.message}`);
    }

    return response.data;
  }

  /**
   * Check post status
   */
  async checkPostStatus(accessToken: string, publishId: string): Promise<TikTokPostStatusResponse> {
    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/status/fetch/`,
      {
        publish_id: publishId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
        }
      }
    );

    return response.data;
  }

  /**
   * Post video to TikTok (complete flow with file upload)
   */
  async postVideoToTikTok(
    accessToken: string,
    videoPath: string,
    options: {
      title?: string;
      privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
    }
  ): Promise<{ publishId: string; status: string }> {
    // 1. Get creator info to verify capabilities
    const creatorInfo = await this.getCreatorInfo(accessToken);

    // 2. Determine privacy level
    const availablePrivacyLevels = creatorInfo.privacy_level_options;
    let privacyLevel = options.privacyLevel || "PUBLIC_TO_EVERYONE";
    
    if (!availablePrivacyLevels.includes(privacyLevel)) {
      privacyLevel = availablePrivacyLevels[0] as any;
    }

    // 3. Initialize video upload
    const initResponse = await this.initVideoUpload(accessToken, videoPath, {
      title: options.title,
      privacyLevel: privacyLevel
    });

    const { publish_id, upload_url } = initResponse.data;

    // 4. Upload video chunks
    if (upload_url) {
      await this.uploadVideoChunks(upload_url, videoPath);
    }

    // 5. Poll for post status
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max
    const pollInterval = 5000; // 5 seconds

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const statusResponse = await this.checkPostStatus(accessToken, publish_id);
      const status = statusResponse.data.status;

      if (status === "PUBLISH_COMPLETE") {
        return { publishId: publish_id, status: "completed" };
      }

      if (status === "FAILED") {
        throw new Error(`TikTok post failed: ${statusResponse.data.fail_reason}`);
      }

      attempts++;
    }

    throw new Error("TikTok post timed out");
  }

  /**
   * Get stored TikTok token for a user (from database)
   */
  async getStoredToken(): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
    const token = await prisma.tiktokToken.findFirst({
      orderBy: { createdAt: "desc" }
    });

    if (!token) return null;

    // Check if token is expired and refresh if needed
    if (new Date() > token.expiresAt) {
      try {
        const refreshed = await this.refreshAccessToken(token.refreshToken);
        
        // Update stored token
        await prisma.tiktokToken.update({
          where: { id: token.id },
          data: {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
            openId: refreshed.open_id
          }
        });

        return {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000)
        };
      } catch (error) {
        return null;
      }
    }

    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt
    };
  }

  /**
   * Store TikTok token in database
   */
  async storeToken(tokenData: TikTokTokenResponse): Promise<void> {
    await prisma.tiktokToken.upsert({
      where: { openId: tokenData.open_id },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scope: tokenData.scope
      },
      create: {
        openId: tokenData.open_id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scope: tokenData.scope
      }
    });
  }
}

export const tiktokService = new TikTokService();
