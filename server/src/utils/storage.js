import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/uploads at the project root (two levels up from utils/).
export const uploadsDir = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const DRIVER = process.env.STORAGE_DRIVER || 'local';

function makeFilename(originalName) {
  const ext = path.extname(originalName || '').toLowerCase().slice(0, 10);
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

/** Local disk driver — writes to server/uploads, served at /api/files. */
async function saveLocal(buffer, filename) {
  await fs.promises.writeFile(path.join(uploadsDir, filename), buffer);
  return { url: `/api/files/${filename}`, filename, driver: 'local' };
}

/**
 * S3 driver — loaded lazily so the aws-sdk dependency is only required when
 * STORAGE_DRIVER=s3. Configure via S3_BUCKET, S3_REGION, and (optionally)
 * S3_PUBLIC_BASE for the public URL prefix.
 */
async function saveS3(buffer, filename, mimetype) {
  let S3;
  try {
    S3 = await import('@aws-sdk/client-s3');
  } catch {
    throw new Error(
      'STORAGE_DRIVER=s3 requires the "@aws-sdk/client-s3" package. Run: npm i @aws-sdk/client-s3'
    );
  }
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'us-east-1';
  if (!bucket) throw new Error('S3_BUCKET is not set');

  const client = new S3.S3Client({ region });
  const key = `uploads/${filename}`;
  await client.send(
    new S3.PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimetype })
  );

  const base =
    process.env.S3_PUBLIC_BASE || `https://${bucket}.s3.${region}.amazonaws.com`;
  return { url: `${base}/${key}`, filename, driver: 's3' };
}

/**
 * Persist a file buffer using the configured driver.
 * @returns {Promise<{url:string, filename:string, driver:string}>}
 */
export async function saveFile(buffer, originalName, mimetype) {
  const filename = makeFilename(originalName);
  if (DRIVER === 's3') return saveS3(buffer, filename, mimetype);
  return saveLocal(buffer, filename);
}

export const storageDriver = DRIVER;
