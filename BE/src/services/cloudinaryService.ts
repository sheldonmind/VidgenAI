import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { uploadsDir } from '../utils/storage';

// Check if Cloudinary is configured
const isCloudinaryConfigured = (): boolean => {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

// Configure Cloudinary only if credentials are provided
if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.log('⚠️  Cloudinary not configured - files will be stored locally only');
}

/**
 * Upload a file to Cloudinary (or return local URL if Cloudinary not configured)
 * @param filePath - Local file path
 * @param resourceType - 'image' or 'video'
 * @param folder - Optional folder name in Cloudinary
 * @returns Public URL of uploaded file (Cloudinary URL or local /uploads/ URL)
 */
export async function uploadToCloudinary(
  filePath: string,
  resourceType: 'image' | 'video' = 'video',
  folder: string = 'createai'
): Promise<string> {
  // If Cloudinary is not configured, return local URL
  if (!isCloudinaryConfigured()) {
    const filename = path.basename(filePath);
    return `/uploads/${filename}`;
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: resourceType,
      folder: folder,
      use_filename: true,
      unique_filename: true,
    });

    return result.secure_url;
  } catch (error: any) {
    // Fallback to local URL if Cloudinary upload fails
    console.error(`⚠️  Cloudinary upload failed, using local URL: ${error.message}`);
    const filename = path.basename(filePath);
    return `/uploads/${filename}`;
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
 * Delete a file from Cloudinary (or local storage if Cloudinary not configured)
 * @param publicId - Public ID of the file (from URL) or local filename
 * @param resourceType - 'image' or 'video'
 */
export async function deleteFromCloudinary(
  publicId: string,
  resourceType: 'image' | 'video' = 'video'
): Promise<void> {
  // If Cloudinary is not configured, try to delete local file
  if (!isCloudinaryConfigured()) {
    try {
      // If publicId is a local filename or /uploads/ path
      const filename = publicId.includes('/uploads/') 
        ? publicId.split('/uploads/').pop() 
        : publicId;
      
      if (filename) {
        const filePath = path.join(uploadsDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️  Deleted local file: ${filename}`);
        }
      }
    } catch (error: any) {
      // Silent fail for local deletion
    }
    return;
  }

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

export { isCloudinaryConfigured };

export default {
  uploadToCloudinary,
  uploadLocalFileToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
  isCloudinaryConfigured,
};
