import prisma from "./src/prisma";

async function checkVideos() {
  const videos = await prisma.generation.findMany({
    where: {
      status: "completed",
      videoUrl: { not: null }
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      videoUrl: true,
      thumbnailUrl: true,
      createdAt: true
    }
  });
  
  console.log("\n📹 Recent completed videos:");
  for (const v of videos) {
    const isCloudinary = v.videoUrl?.includes('cloudinary.com');
    const isOldUrl = v.videoUrl?.includes('trycloudflare.com') || v.videoUrl?.includes('ngrok');
    console.log(`\n${v.id}:`);
    console.log(`  Created: ${v.createdAt.toLocaleString()}`);
    console.log(`  Video: ${isCloudinary ? '☁️  Cloudinary' : isOldUrl ? '❌ Old URL' : '⚠️  Other'}`);
    console.log(`  URL: ${v.videoUrl?.substring(0, 60)}...`);
  }
  
  await prisma.$disconnect();
}

checkVideos();
