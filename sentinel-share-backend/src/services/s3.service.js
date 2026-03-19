'use strict';

const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client } = require('../config/s3');
const env = require('../config/env');

/**
 * Uploads a file buffer to S3.
 *
 * @param {string} storedKey  - The S3 object key (e.g. uploads/<uuid>/filename)
 * @param {Buffer} buffer     - File contents
 * @param {string} mimeType   - Content-Type header
 */
async function uploadFile(storedKey, buffer, mimeType) {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: storedKey,
    Body: buffer,
    ContentType: mimeType,
    ...(env.S3_SERVER_SIDE_ENCRYPTION && {
      ServerSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION,
    }),
    ...(env.S3_SSE_KMS_KEY_ID && {
      SSEKMSKeyId: env.S3_SSE_KMS_KEY_ID,
    }),
  });
  await s3Client.send(command);
}

/**
 * Generates a short-lived presigned GET URL for a private S3 object.
 * The backend must verify ownership or share token BEFORE calling this.
 *
 * @param {string} storedKey
 * @param {string} originalName - Used as Content-Disposition filename
 * @returns {string} presigned URL
 */
async function generatePresignedDownloadUrl(storedKey, originalName) {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: storedKey,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(originalName)}"`,
  });

  return getSignedUrl(s3Client, command, { expiresIn: env.PRESIGNED_URL_TTL });
}

/**
 * Permanently deletes an object from S3.
 * Called after soft-delete is confirmed in the database.
 *
 * @param {string} storedKey
 */
async function deleteFile(storedKey) {
  const command = new DeleteObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: storedKey,
  });
  await s3Client.send(command);
}

module.exports = { uploadFile, generatePresignedDownloadUrl, deleteFile };
