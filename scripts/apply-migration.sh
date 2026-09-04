#!/usr/bin/env bash
# Run one SQL migration file on a Supabase project via the Management API,
# using the access token the Supabase CLI stored in the macOS keychain
# (`supabase login`). No DB password needed.
#
#   scripts/apply-migration.sh supabase/migrations/018_lock_spatial_ref_sys.sql
#   PROJECT_REF=... scripts/apply-migration.sh <file.sql>   # override project
#
# Default project is the live one (atalmart-mumbai), NOT whatever the CLI is
# currently linked to.
set -euo pipefail

FILE="${1:?usage: $0 <migration.sql>}"
PROJECT_REF="${PROJECT_REF:-gnrselkepycedynyxwjr}"

TOKEN="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -s "Supabase CLI" -a supabase -w 2>/dev/null || true)}"
if [ -z "$TOKEN" ]; then
  echo "No Supabase access token. Run: supabase login   (or export SUPABASE_ACCESS_TOKEN)" >&2
  exit 1
fi

echo "Applying $FILE to project $PROJECT_REF ..."
node -e 'process.stdout.write(JSON.stringify({query: require("fs").readFileSync(process.argv[1], "utf8")}))' "$FILE" > /tmp/.supa-query.json
STATUS=$(curl -s -o /tmp/.supa-result.json -w '%{http_code}' \
  -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data @/tmp/.supa-query.json)
rm -f /tmp/.supa-query.json
echo "HTTP $STATUS"
cat /tmp/.supa-result.json; echo
rm -f /tmp/.supa-result.json
[ "$STATUS" = "201" ] || [ "$STATUS" = "200" ]
