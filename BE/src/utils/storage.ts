import fs from "fs";
import path from "path";
import axios from "axios";
import { v4 as uuid } from "uuid";
import ffmpeg from "fluent-ffmpeg";

export const uploadsDir = path.join(process.cwd(), "uploads");

export const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
};

/**
 * Download a video from URL and save it locally
 * Returns the filename of the saved video
 */
export const downloadAndSaveVideo = async (
  videoUrl: string,
  apiKey?: string
): Promise<string> => {
  try {
    const headers: any = {};
    if (apiKey && videoUrl.includes("generativelanguage.googleapis.com")) {
      headers["x-goog-api-key"] = apiKey;
    }

    const response = await axios.get(videoUrl, {
      responseType: "arraybuffer",
      headers,
      timeout: 120000
    });

    const filename = `${uuid()}.mp4`;
    const filepath = path.join(uploadsDir, filename);

    ensureUploadsDir();

    fs.writeFileSync(filepath, Buffer.from(response.data));

    return filename;
  } catch (error: any) {
    throw new Error(`Failed to download video: ${error.message}`);
  }
};

/**
 * Download a thumbnail from URL and save it locally
 * Returns the filename of the saved thumbnail
 */
export const downloadAndSaveThumbnail = async (
  thumbnailUrl: string,
  apiKey?: string
): Promise<string> => {
  try {
    const headers: any = {};
    if (apiKey && thumbnailUrl.includes("generativelanguage.googleapis.com")) {
      headers["x-goog-api-key"] = apiKey;
    }

    const response = await axios.get(thumbnailUrl, {
      responseType: "arraybuffer",
      headers,
      timeout: 60000
    });

    const contentType = response.headers["content-type"] || "image/jpeg";
    const ext = contentType.includes("png") ? ".png" : ".jpg";

    const filename = `${uuid()}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    ensureUploadsDir();

    fs.writeFileSync(filepath, Buffer.from(response.data));

    return filename;
  } catch (error: any) {
    throw new Error(`Failed to download thumbnail: ${error.message}`);
  }
};

/**
 * Delete a file from the uploads directory
 * Extracts filename from URL and deletes the file if it exists locally
 */
export const deleteFile = (fileUrl: string): boolean => {
  try {
    const urlParts = fileUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    
    if (!filename || fileUrl.includes("generativelanguage.googleapis.com")) {
      return false;
    }

    const filepath = path.join(uploadsDir, filename);
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    
    return false;
  } catch (error: any) {
    return false;
  }
};

/**
 * Generate a thumbnail from a video file using ffmpeg
 * Returns the filename of the generated thumbnail
 */
export const generateVideoThumbnail = async (
  videoFilename: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const videoPath = path.join(uploadsDir, videoFilename);
      
      if (!fs.existsSync(videoPath)) {
        reject(new Error(`Video file not found: ${videoPath}`));
        return;
      }

      const thumbnailFilename = `${uuid()}.jpg`;
      const thumbnailPath = path.join(uploadsDir, thumbnailFilename);

      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['00:00:00.500'], // Extract frame at 0.5 seconds
          filename: thumbnailFilename,
          folder: uploadsDir,
          size: '1280x720' // HD thumbnail
        })
        .on('end', () => {
          resolve(thumbnailFilename);
        })
        .on('error', (err) => {
          reject(new Error(`Failed to generate thumbnail: ${err.message}`));
        });
    } catch (error: any) {
      reject(new Error(`Failed to generate thumbnail: ${error.message}`));
    }
  });
};

/**
 * Convert an image URL to base64.
 *
 * Supports:
 * - Remote URLs (e.g. Cloudinary) – downloads the image in memory
 * - Local URLs pointing to files in the uploads directory
 */
export const imageUrlToBase64 = async (imageUrl: string): Promise<string> => {
  try {
    // Remote URL: download and convert in memory
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 60000
      });

      const imageBuffer = Buffer.from(response.data);
      const base64 = imageBuffer.toString("base64");

      // Prefer content-type header; fall back to extension
      let mimeType = response.headers["content-type"] as string | undefined;
      if (!mimeType || !mimeType.startsWith("image/")) {
        try {
          const url = new URL(imageUrl);
          const ext = path.extname(url.pathname).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif"
          };
          mimeType = mimeTypes[ext] || "image/jpeg";
        } catch {
          mimeType = "image/jpeg";
        }
      }

      return `data:${mimeType};base64,${base64}`;
    }

    // Local URL: treat last path segment as filename in uploads directory
    const urlParts = imageUrl.split("/");
    const filename = urlParts[urlParts.length - 1];

    if (!filename) {
      throw new Error("Invalid image URL: no filename found");
    }

    const filepath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filepath)) {
      throw new Error(`Image file not found: ${filepath}`);
    }

    const imageBuffer = fs.readFileSync(filepath);
    const base64 = imageBuffer.toString("base64");

    // Detect MIME type from file extension
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif"
    };

    const mimeType = mimeTypes[ext] || "image/jpeg";

    return `data:${mimeType};base64,${base64}`;
  } catch (error: any) {
    throw new Error(`Failed to convert image to base64: ${error.message}`);
  }
};

/**
 * Convert a local video file to base64
 * Extracts filename from URL and reads the file
 */
export const videoUrlToBase64 = (videoUrl: string): string => {
  try {
    const urlParts = videoUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    
    if (!filename) {
      throw new Error("Invalid video URL: no filename found");
    }

    const filepath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filepath)) {
      throw new Error(`Video file not found: ${filepath}`);
    }

    const videoBuffer = fs.readFileSync(filepath);
    const base64 = videoBuffer.toString("base64");
    
    // Detect MIME type from file extension
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska"
    };
    
    const mimeType = mimeTypes[ext] || "video/mp4";
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error: any) {
    throw new Error(`Failed to convert video to base64: ${error.message}`);
  }
};

/**
 * Merge multiple video files into one using ffmpeg
 * @param videoFilenames - Array of video filenames in uploads directory (in order)
 * @returns Filename of the merged video
 */
export const mergeVideos = async (
  videoFilenames: string[]
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      if (videoFilenames.length === 0) {
        reject(new Error("No videos to merge"));
        return;
      }

      if (videoFilenames.length === 1) {
        // If only one video, return it as-is
        resolve(videoFilenames[0]);
        return;
      }

      ensureUploadsDir();

      // Create a temporary file list for ffmpeg concat
      const listFilename = `${uuid()}.txt`;
      const listPath = path.join(uploadsDir, listFilename);
      
      // Write file list for concat demuxer
      const fileList = videoFilenames
        .map((filename) => {
          const videoPath = path.join(uploadsDir, filename);
          if (!fs.existsSync(videoPath)) {
            throw new Error(`Video file not found: ${videoPath}`);
          }
          // Use absolute path and escape single quotes for ffmpeg
          return `file '${videoPath.replace(/'/g, "'\\''")}'`;
        })
        .join("\n");

      fs.writeFileSync(listPath, fileList);

      // Output filename
      const outputFilename = `merged-${uuid()}.mp4`;
      const outputPath = path.join(uploadsDir, outputFilename);

      // Use concat demuxer for better compatibility
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions([
          "-c", "copy", // Copy codecs (no re-encoding, faster)
          "-movflags", "+faststart" // Optimize for web streaming
        ])
        .output(outputPath)
        .on("start", (commandLine) => {
          console.log(`🎬 Merging ${videoFilenames.length} videos...`);
          console.log(`FFmpeg command: ${commandLine}`);
        })
        .on("end", () => {
          // Clean up temporary list file
          try {
            if (fs.existsSync(listPath)) {
              fs.unlinkSync(listPath);
            }
          } catch (cleanupError) {
            console.warn("Failed to cleanup temp list file:", cleanupError);
          }
          
          console.log(`✅ Successfully merged ${videoFilenames.length} videos into ${outputFilename}`);
          resolve(outputFilename);
        })
        .on("error", (err) => {
          // Clean up temporary list file
          try {
            if (fs.existsSync(listPath)) {
              fs.unlinkSync(listPath);
            }
          } catch (cleanupError) {
            console.warn("Failed to cleanup temp list file:", cleanupError);
          }
          
          reject(new Error(`Failed to merge videos: ${err.message}`));
        })
        .run();
    } catch (error: any) {
      reject(new Error(`Failed to merge videos: ${error.message}`));
    }
  });
};
