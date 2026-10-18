import type { db as defaultDb } from "@andes-hack/db";
import { user } from "@andes-hack/db/schema/auth";
import { communityMember } from "@andes-hack/db/schema/community";
import { and, eq, inArray } from "drizzle-orm";

export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_PHOTO_INVALID_MESSAGE = "Usa una imagen JPG, PNG o WebP de hasta 2 MB.";

export type ProfilePhotoStorage = Pick<
  typeof import("./lib/storage"),
  "getUploadUrl" | "getFileMetadata" | "downloadFileAsBuffer" | "getDownloadUrl" | "deleteFile"
>;
export type ProfilePhotoStorageResolver = () => Promise<ProfilePhotoStorage>;

type Database = typeof defaultDb;

export function profilePhotoKey(userId: string, id: string, extension: "jpg" | "png" | "webp") {
  return `profile-photos/${userId}/${id}.${extension}`;
}

export function isProfilePhotoKey(key: string, userId: string) {
  return (
    key.startsWith(`profile-photos/${userId}/`) &&
    /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key.slice(`profile-photos/${userId}/`.length))
  );
}

export function matchesImageType(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    );
  }
  return (
    contentType === "image/webp" &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  );
}

export async function getCommunityProfilePhotos(
  database: Database,
  storageForPhotos: ProfilePhotoStorageResolver | undefined,
  communityId: string,
  userIds: string[],
) {
  if (userIds.length === 0) return new Map<string, string>();
  const members = await database
    .select({ id: user.id, image: user.image })
    .from(communityMember)
    .innerJoin(user, eq(communityMember.userId, user.id))
    .where(and(eq(communityMember.communityId, communityId), inArray(user.id, userIds)));
  const photos = members.filter(({ id, image }) => image && isProfilePhotoKey(image, id));
  if (photos.length === 0 || !storageForPhotos) return new Map<string, string>();
  const storage = await storageForPhotos();
  const urls = await Promise.all(
    photos.map(
      async ({ id, image }) =>
        [id, await storage.getDownloadUrl(image!, { expiresIn: 300 })] as const,
    ),
  );
  return new Map(urls);
}

export async function getMyCommunityProfilePhoto(
  database: Database,
  storageForPhotos: ProfilePhotoStorageResolver,
  communityId: string,
  userId: string,
) {
  return (
    (await getCommunityProfilePhotos(database, storageForPhotos, communityId, [userId])).get(
      userId,
    ) ?? null
  );
}
