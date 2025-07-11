#!/bin/bash

# Command for if photos are wiped:
# aws s3 sync backups/s3_photos/ s3://your-new-s3-bucket

# === CONFIG ===
SOURCE_BUCKET="s3://mapjak-uploads-07-09-2025"
DEST_DIR="./backups/s3_photos"
mkdir -p $DEST_DIR

echo "☁️ Syncing S3 bucket to local folder..."
aws s3 sync $SOURCE_BUCKET $DEST_DIR

if [ $? -eq 0 ]; then
  echo "✅ S3 backup complete: $DEST_DIR"
else
  echo "❌ S3 backup FAILED."
  exit 1
fi