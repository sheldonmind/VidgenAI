import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MODELS = [
  // Google Veo 3 Models
  {
    name: "Veo 3",
    category: "GENERAL"
  },
  {
    name: "Veo 3.1",
    category: "GENERAL"
  },
  {
    name: "Veo 3 Fast",
    category: "GENERAL"
  },
  // KLing AI Models
  {
    name: "Kling 2.6",
    category: "GENERAL"
  },
  {
    name: "Kling 2.5 Turbo",
    category: "GENERAL"
  },
  {
    name: "Kling O1",
    category: "GENERAL"
  },
  {
    name: "Kling Motion Control",
    category: "MOTION"
  }
];

async function main() {
  console.log("🌱 Starting seed...");

  // Insert models
  for (const modelData of MODELS) {
    const model = await prisma.model.upsert({
      where: {
        name_category: {
          name: modelData.name,
          category: modelData.category
        }
      },
      update: {},
      create: modelData
    });
    console.log(`✅ Model created/updated: ${model.name} (${model.category})`);
  }

  console.log("🎉 Seed completed!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
