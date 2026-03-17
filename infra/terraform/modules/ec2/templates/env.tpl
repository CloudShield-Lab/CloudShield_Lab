NODE_ENV=production
PORT=3000

JWT_SECRET=${jwt_secret}
JWT_EXPIRES_IN=1h

DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=sentinelshare
DB_USER=sentinelshare
DB_PASSWORD=${db_password}

AWS_REGION=${aws_region}
S3_BUCKET_NAME=${s3_bucket_name}

PRESIGNED_URL_TTL=300
MAX_FILE_SIZE_MB=100
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/zip,application/x-zip-compressed

CORS_ORIGIN=${cors_origin}
