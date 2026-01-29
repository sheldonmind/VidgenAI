import fs from 'fs';
import path from 'path';

/**
 * Script to clean up the uploads directory
 * This removes all temporary files that have been uploaded to Cloudinary
 */

const uploadsDir = path.join(process.cwd(), 'uploads');

function cleanUploads() {
  if (!fs.existsSync(uploadsDir)) {
    console.log('⚠️  Uploads directory does not exist');
    return;
  }

  const files = fs.readdirSync(uploadsDir);
  
  if (files.length === 0) {
    console.log('✅ Uploads directory is already empty');
    return;
  }

  console.log(`🗑️  Found ${files.length} files in uploads directory`);
  
  let deletedCount = 0;
  let totalSize = 0;

  files.forEach(file => {
    const filePath = path.join(uploadsDir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isFile()) {
      totalSize += stats.size;
      fs.unlinkSync(filePath);
      deletedCount++;
      console.log(`   ✓ Deleted: ${file}`);
    }
  });

  const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ Successfully deleted ${deletedCount} files`);
  console.log(`💾 Freed up ${sizeMB} MB of disk space`);
}

// Run the cleanup
try {
  console.log('🧹 Starting uploads cleanup...\n');
  cleanUploads();
} catch (error: any) {
  console.error('❌ Error during cleanup:', error.message);
  process.exit(1);
}
