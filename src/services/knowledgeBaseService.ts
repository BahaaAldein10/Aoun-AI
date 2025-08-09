import { KnowledgeBase } from "@prisma/client";

// Simulate async DB/API call
export async function getKnowledgeBase(
  userId: string,
): Promise<KnowledgeBase | null> {
  // For now, return a mock KB if the userId matches something
  if (userId === "user_placeholder_id") {
    return {
      id: "kb_123",
      userId,
      botProfile: {
        name: "HelperBot",
        personality: "Friendly and helpful",
        voiceName: "en-US-Wavenet-D",
        primaryColor: "#4F46E5",
        accentColor: "#22C55E",
      },
      company: {
        name: "Acme Corp",
        description: "We provide innovative solutions for your business.",
        location: "San Francisco, CA",
      },
      services: [
        {
          name: "Consulting",
          description: "Expert advice tailored to your needs.",
        },
        { name: "Development", description: "Custom software built to scale." },
      ],
      pricing: [
        {
          tier: "Basic",
          price: "$99/mo",
          details: "Essential features for small teams.",
        },
        {
          tier: "Pro",
          price: "$299/mo",
          details: "Advanced tools for growing businesses.",
        },
      ],
      faq: [
        {
          question: "How do I get started?",
          answer: "Sign up and create your first project.",
        },
        {
          question: "Do you offer support?",
          answer: "Yes, 24/7 support is included in all plans.",
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as KnowledgeBase;
  }

  // Simulate "no KB" for unknown user
  return null;
}
