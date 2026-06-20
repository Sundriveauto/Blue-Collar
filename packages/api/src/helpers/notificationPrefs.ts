import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedDefaultPreferences(userId: string) {
  return prisma.notificationPreferences.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      newWorkerNearby: true,
      statusChange: true,
      reviewReply: true,
      announcements: true,
    },
  });
}

export async function isNotificationEnabled(
  userId: string,
  type: string
): Promise<boolean> {
  const prefs = await prisma.notificationPreferences.findUnique({
    where: { userId },
  });
  if (!prefs) return true;
  if (!(type in prefs)) throw new Error(`Unknown notification type: ${type}`);
  return (prefs as Record<string, unknown>)[type] as boolean;
}
