import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * File storage on S3-compatible object storage (Neon Object Storage in production).
 * Private bucket; the server uploads and hands out short-lived signed URLs.
 * When storage is not configured every call is a no-op, so the app still works without files.
 */
const cfg = () => ({
  endpoint: process.env.STORAGE_ENDPOINT,
  bucket: process.env.STORAGE_BUCKET,
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  region: process.env.STORAGE_REGION || "auto",
});

export const isStorageConfigured = () => {
  const c = cfg();
  return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
};

let s3: S3Client | undefined;
function clientAndBucket(): { s3: S3Client; bucket: string } | null {
  if (!isStorageConfigured()) return null;
  const c = cfg();
  s3 ??= new S3Client({ endpoint: c.endpoint, region: c.region, forcePathStyle: true, credentials: { accessKeyId: c.accessKeyId!, secretAccessKey: c.secretAccessKey! } });
  return { s3, bucket: c.bucket! };
}

/** Keys are namespaced by purpose: brand/{workspace}/…, ai-raw/{scan}/…, reports/{workspace}/… */
export async function putObject(key: string, body: Uint8Array | string, contentType: string): Promise<boolean> {
  const c = clientAndBucket();
  if (!c) return false;
  try {
    await c.s3.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: body, ContentType: contentType }));
    return true;
  } catch {
    return false;
  }
}

export async function signedUrl(key: string, seconds = 3600): Promise<string | null> {
  const c = clientAndBucket();
  if (!c) return null;
  try {
    return await getSignedUrl(c.s3, new GetObjectCommand({ Bucket: c.bucket, Key: key }), { expiresIn: seconds });
  } catch {
    return null;
  }
}

export async function getObjectBytes(key: string): Promise<Uint8Array | null> {
  const c = clientAndBucket();
  if (!c) return null;
  try {
    const res = await c.s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: key }));
    return res.Body ? await res.Body.transformToByteArray() : null;
  } catch {
    return null;
  }
}

export async function removeObject(key: string): Promise<void> {
  const c = clientAndBucket();
  if (!c) return;
  try {
    await c.s3.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
  } catch {
    // best effort
  }
}
