#!/bin/bash

# Command for if Postgres gets nuked:
# psql $DATABASE_URL < backups/db_backup_<DATE HERE>.sql

# === CONFIG ===
# Make sure your Railway DATABASE_URL is set as an ENV VAR
# (.env locally, GitHub Secret in Actions)

# Local backup folder
BACKUP_DIR="./backups/db"
mkdir -p $BACKUP_DIR

# Timestamped filename
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="db_backup_$DATE.sql"

# === Run pg_dump ===
echo "📀 Dumping database..."
pg_dump $DATABASE_URL > $BACKUP_DIR/$FILENAME

if [ $? -eq 0 ]; then
  echo "✅ DB backup saved: $BACKUP_DIR/$FILENAME"
else
  echo "❌ DB backup FAILED."
  exit 1
fi