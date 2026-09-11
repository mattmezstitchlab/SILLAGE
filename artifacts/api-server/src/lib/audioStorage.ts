import { randomUUID } from "crypto";
import type { Response } from "express";
import { objectStorageClient, signPrivateUploadURL } from "./objectStorage";

const UPLOAD_URL_TTL_SEC = 15 * 60;

function privateLocation() {
  const location = process.env.PRIVATE_OBJECT_DIR;
  if (!location) throw new Error("Le stockage privé App Storage n'est pas configuré.");
  const [bucket, ...parts] = location.replace(/^\//, "").split("/");
  if (!bucket || !parts.length) throw new Error("Configuration App Storage invalide.");
  return { bucket, prefix: parts.join("/").replace(/\/$/, "") };
}

function pathParts(objectPath: string) {
  if (!objectPath.startsWith("/objects/sillage/")) throw new Error("Chemin audio invalide.");
  const { bucket, prefix } = privateLocation();
  return { bucket, objectName: `${prefix}/${objectPath.slice("/objects/".length)}` };
}

export async function requestPrivateAudioUpload() {
  const { bucket, prefix } = privateLocation();
  const objectName = `${prefix}/sillage/${randomUUID()}`;
  // Signing goes through the shared storage layer: the Replit sidecar on
  // Replit, plain Google credentials (v4 signed URL) everywhere else.
  const uploadUrl = await signPrivateUploadURL(
    bucket,
    objectName,
    UPLOAD_URL_TTL_SEC,
  );
  return { uploadUrl, objectPath: `/objects/${objectName.slice(prefix.length + 1)}` };
}

export async function verifyPrivateAudio(objectPath: string, expectedSize: number, expectedMime: string) {
  const { bucket, objectName } = pathParts(objectPath);
  const file = objectStorageClient.bucket(bucket).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Le fichier envoyé est introuvable.");
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== expectedSize) throw new Error("La taille du fichier envoyé ne correspond pas.");
  if (metadata.contentType !== expectedMime) throw new Error("Le type du fichier envoyé ne correspond pas.");
}

export async function streamPrivateAudio(objectPath: string, range: string | undefined, res: Response) {
  const { bucket, objectName } = pathParts(objectPath);
  const file = objectStorageClient.bucket(bucket).file(objectName);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  const contentType = String(metadata.contentType || "audio/mpeg");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", contentType);
  if (!range) {
    res.status(200).setHeader("Content-Length", size);
    file.createReadStream().on("error", () => res.destroy()).pipe(res);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
    return;
  }
  if (!match[1] && !match[2]) {
    res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
    return;
  }
  const suffix = !match[1] ? Number(match[2]) : null;
  const start = suffix == null ? Number(match[1]) : Math.max(0, size - suffix);
  const end = suffix == null ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (start >= size || end < start) {
    res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
    return;
  }
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", end - start + 1);
  file.createReadStream({ start, end }).on("error", () => res.destroy()).pipe(res);
}

/**
 * Opens a private object for an authenticated attachment response.
 *
 * DJ transfers intentionally use a full-body response instead of exposing
 * object URLs or implementing byte ranges. The returned stream is owned by
 * the caller and must be destroyed when the client disconnects.
 */
export async function openPrivateAudioDownload(objectPath: string) {
  const { bucket, objectName } = pathParts(objectPath);
  const file = objectStorageClient.bucket(bucket).file(objectName);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("Les métadonnées du fichier audio sont invalides.");
  }

  const stream = file.createReadStream();
  return {
    stream,
    size,
    contentType: String(metadata.contentType || "application/octet-stream"),
    cancel: () => stream.destroy(),
  };
}
