import { env } from 'cloudflare:workers';
import { getChatGPTUser, requireChatGPTUser, type ChatGPTUser } from '@/app/chatgpt-auth';

export type OwnerAccess = { allowed: boolean; configured: boolean; email: string };

function accessFor(user: ChatGPTUser): OwnerAccess {
  // The starter helper requires both platform-forwarded user ID and email.
  const configuredEmail = (env as unknown as { OWNER_EMAIL?: string }).OWNER_EMAIL?.trim().toLowerCase();
  const configured = Boolean(configuredEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail));
  return {
    configured,
    allowed: Boolean(configured && user.userId && user.email.trim().toLowerCase() === configuredEmail),
    email: user.email,
  };
}

export async function requireOwner(returnTo: string): Promise<OwnerAccess> {
  return accessFor(await requireChatGPTUser(returnTo));
}

export async function getOwnerAccess(): Promise<OwnerAccess | null> {
  const user = await getChatGPTUser();
  return user ? accessFor(user) : null;
}
