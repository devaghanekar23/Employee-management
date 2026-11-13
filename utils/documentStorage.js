const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'documents');

/**
 * Save document either to S3 (if AWS credentials set) or locally to public/uploads/documents/
 * @param {Object} opts
 * @param {string} opts.base64 - Data URL or raw base64 string
 * @param {string} opts.originalName - e.g. "aadhaar_card.pdf"
 * @param {string} opts.docType - e.g. "Aadhaar", "PAN", "Offer Letter", "Resume"
 * @param {number} opts.employeeId
 * @returns {Promise<{ file_url: string, file_name: string, file_size: number, storage_type: string }>}
 */
async function saveDocument({ base64, originalName, docType, employeeId }) {
  if (!base64) throw new Error('Document content is required.');

  // Extract base64 and mime
  let mimeType = 'application/octet-stream';
  let buffer;

  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    buffer = Buffer.from(match[2], 'base64');
  } else {
    buffer = Buffer.from(base64, 'base64');
  }

  const fileSize = buffer.length;
  const ext = path.extname(originalName || '').toLowerCase() || (mimeType.includes('pdf') ? '.pdf' : mimeType.includes('png') ? '.png' : '.jpg');
  const cleanDocType = (docType || 'Document').replace(/[^a-zA-Z0-9]/g, '_');
  const safeFilename = `emp_${employeeId}_${cleanDocType}_${Date.now()}${ext}`;

  // Check if AWS S3 is configured in environment
  const bucket = process.env.AWS_BUCKET_NAME;
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (bucket && accessKey && secretKey) {
    try {
      // Optional AWS SDK if installed
      let AWS;
      try { AWS = require('aws-sdk'); } catch (_) {}
      if (AWS) {
        const s3 = new AWS.S3({ accessKeyId: accessKey, secretAccessKey: secretKey, region });
        const s3Key = `documents/emp_${employeeId}/${safeFilename}`;
        const uploadRes = await s3.upload({
          Bucket: bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: mimeType,
          ACL: 'public-read'
        }).promise();

        return {
          file_url: uploadRes.Location || `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`,
          file_name: originalName || safeFilename,
          file_size: fileSize,
          storage_type: 's3'
        };
      }
    } catch (err) {
      console.warn('AWS S3 upload attempt failed, falling back to local storage:', err.message);
    }
  }

  // Fallback / Default: Local filesystem storage
  await fs.promises.mkdir(DOCS_DIR, { recursive: true });
  const localPath = path.join(DOCS_DIR, safeFilename);
  await fs.promises.writeFile(localPath, buffer);

  return {
    file_url: `/uploads/documents/${safeFilename}`,
    file_name: originalName || safeFilename,
    file_size: fileSize,
    storage_type: 'local'
  };
}

module.exports = { saveDocument };

