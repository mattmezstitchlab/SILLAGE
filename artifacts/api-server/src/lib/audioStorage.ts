import { randomUUID } from "crypto";
import type { Response } from "express";
import { objectStorageClient } from "./objectStorage";

const SIDECAR = "http://127.0.0.1:1106";

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
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Impossible de signer l'envoi audio (${response.status}).`);
  const body = await response.json() as { signed_url: string };
  return { uploadUrl: body.signed_url, objectPath: `/objects/${objectName.slice(prefix.length + 1)}` };
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