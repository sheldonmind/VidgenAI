import { veo3Service } from './src/services/veo3Service';

/**
 * Test script to manually check Veo 3 generation status
 * Usage: ts-node test-veo3-polling.ts <operation-name>
 * 
 * Example:
 * ts-node test-veo3-polling.ts models/veo-3.0-generate-001/operations/cvksj480yqqp
 */

async function testVeo3Polling() {
  const operationName = process.argv[2];

  if (!operationName) {
    console.error('❌ Please provide an operation name as argument');
    console.log('Usage: ts-node test-veo3-polling.ts <operation-name>');
    console.log('Example: ts-node test-veo3-polling.ts models/veo-3.0-generate-001/operations/cvksj480yqqp');
    process.exit(1);
  }

  console.log(`🔍 Testing Veo 3 polling for operation: ${operationName}`);
  console.log(`⚙️  Google API Key configured: ${veo3Service.isConfigured()}`);

  try {
    const status = await veo3Service.checkGenerationStatus(operationName);
    
    console.log('\n✅ Status check successful!');
    console.log(`📊 Status response:`, JSON.stringify(status, null, 2));
    console.log(`\n🎬 Done: ${status.done}`);
    
    if (status.done) {
      if (status.error) {
        console.log(`❌ Error: ${status.error.message}`);
      } else {
        const videoUrl = veo3Service.extractVideoUrl(status);
        const thumbnailUrl = veo3Service.extractThumbnailUrl(status);
        console.log(`📹 Video URL: ${videoUrl}`);
        console.log(`🖼️  Thumbnail URL: ${thumbnailUrl}`);
      }
    } else {
      console.log(`⏳ Still processing...`);
    }
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

testVeo3Polling();
