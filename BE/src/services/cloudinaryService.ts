import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file to Cloudinary
 * @param filePath - Local file path
 * @param resourceType - 'image' or 'video'
 * @param folder - Optional folder name in Cloudinary
 * @returns Public URL of uploaded file
 */
export async function uploadToCloudinary(
  filePath: string,
  resourceType: 'image' | 'video' = 'video',
  folder: string = 'createai'
): Promise<string> {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: resourceType,
      folder: folder,
      use_filename: true,
      unique_filename: true,
    });

    return result.secure_url;
  } catch (error: any) {
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
}

/**
 * Upload a file from local uploads folder to Cloudinary
 * @param filename - Filename in uploads folder
 * @param resourceType - 'image' or 'video'
 * @returns Public URL of uploaded file
 */
export async function uploadLocalFileToCloudinary(
  filename: string,
  resourceType: 'image' | 'video' = 'video'
): Promise<string> {
  const uploadsDir = path.join(__dirname, '../../uploads');
  const filePath = path.join(uploadsDir, filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  return await uploadToCloudinary(filePath, resourceType);
}

/**
 * Delete a file from Cloudinary
 * @param publicId - Public ID of the file (from URL)
 * @param resourceType - 'image' or 'video'
 */
export async function deleteFromCloudinary(
  publicId: string,
  resourceType: 'image' | 'video' = 'video'
): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (error: any) {
    // Don't throw error, silent fail
  }
}

/**
 * Extract public ID from Cloudinary URL
 * @param url - Cloudinary URL
 * @returns Public ID
 */
export function extractPublicId(url: string): string | null {
  try {
    // Example URL: https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg
    // Public ID: sample
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export default {
  uploadToCloudinary,
  uploadLocalFileToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
};
