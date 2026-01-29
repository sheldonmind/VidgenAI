import prisma from "./src/prisma";

async function checkGenerations() {
  const gens = await prisma.generation.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      status: true,
      videoUrl: true,
      thumbnailUrl: true,
      providerJobId: true,
      createdAt: true
    }
  });
  console.log(JSON.stringify(gens, null, 2));
  await prisma.$disconnect();
}

checkGenerations();
