import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { objectStorageClient } from "./objectStorage";

const THEME_PREFIX = "sillage-themes";
const THEME_PATH = `/objects/${THEME_PREFIX}/`;

export interface ThemeImageObject {
  stream: Readable;
  size: number;
  contentType: string;
}

export interface ThemeImageStorage {
  put(bytes: Buffer, contentType: string): Promise<{
    imageId: string;
    objectPath: string;
  }>;
  open(objectPath: string): Promise<ThemeImageObject>;
  remove(objectPath: string): Promise<void>;
}

function privateLocation(): { bucket: string; prefix: string } {
  const location = process.env.PRIVATE_OBJECT_DIR;
  if (!location) {
    throw new Error("Le stockage privé App Storage n’est pas configuré.");
  }
  const [bucket, ...parts] = location.replace(/^\/+/, "").split("/");
  const prefix = parts.join("/").replace(/\/+$/, "");
  if (!bucket || !prefix) {
    throw new Error("Configuration App Storage invalide.");
  }
  return { bucket, prefix };
}

function objectLocation(objectPath: string): {
  bucket: string;
  objectName: string;
} {
  if (!/^\/objects\/sillage-themes\/[0-9a-f-]{36}$/i.test(objectPath)) {
    throw new Error("Objet image de thème invalide.");
  }
  const { bucket, prefix } = privateLocation();
  return {
    bucket,
    objectName: `${prefix}/${THEME_PREFIX}/${objectPath.slice(THEME_PATH.length)}`,
  };
}

function ensureImageId(imageId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(imageId)) {
    throw new Error("Identifiant image invalide.");
  }
  return imageId;
}

export class AppStorageThemeImageStorage implements ThemeImageStorage {
  async put(bytes: Buffer, contentType: string) {
    const imageId = ensureImageId(randomUUID());
    const { bucket, prefix } = privateLocation();
    const objectName = `${prefix}/${THEME_PREFIX}/${imageId}`;
    const file = objectStorageClient.bucket(bucket).file(objectName);
    await file.save(bytes, {
      resumable: false,
      validation: "crc32c",
      metadata: {
        contentType,
        cacheControl: "private, no-store",
      },
    });
    return { imageId, objectPath: `${THEME_PATH}${imageId}` };
  }

  async open(objectPath: string): Promise<ThemeImageObject> {
    const { bucket, objectName } = objectLocation(objectPath);
    const file = objectStorageClient.bucket(bucket).file(objectName);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size < 1) {
      throw new Error("Métadonnées de l’image de thème invalides.");
    }
    return {
      stream: file.createReadStream(),
      size,
      contentType: String(metadata.contentType || "image/webp"),
    };
  }

  async remove(objectPath: string): Promise<void> {
    const { bucket, objectName } = objectLocation(objectPath);
    await objectStorageClient.bucket(bucket).file(objectName).delete({
      ignoreNotFound: true,
    });
  }
}

export const themeImageStorage = new AppStorageThemeImageStorage();