#!/bin/bash
# Setup Razorpay environment variables for Vercel deployment
# Usage: ./scripts/setup-razorpay.sh

set -e

echo "🔑 Atalmart Razorpay Configuration Setup"
echo "========================================"
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Install it with:"
    echo "   npm i -g vercel@latest"
    exit 1
fi

echo "Enter your Razorpay credentials (from https://dashboard.razorpay.com/app/settings/api-keys)"
echo ""

read -sp "Razorpay Key ID (rzp_test_... or rzp_live_...): " RAZORPAY_KEY_ID
echo ""
read -sp "Razorpay Key Secret: " RAZORPAY_KEY_SECRET
echo ""
read -sp "Razorpay Webhook Secret: " RAZORPAY_WEBHOOK_SECRET
echo ""

echo "Setting environment variables in Vercel..."
vercel env add RAZORPAY_KEY_ID <<< "$RAZORPAY_KEY_ID"
vercel env add RAZORPAY_KEY_SECRET <<< "$RAZORPAY_KEY_SECRET"
vercel env add RAZORPAY_WEBHOOK_SECRET <<< "$RAZORPAY_WEBHOOK_SECRET"

echo ""
echo "✅ Razorpay keys configured!"
echo ""
echo "For local development, add to .env.local:"
cat > .env.local.example << 'EOF'
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx
EOF

echo "   Created .env.local.example — copy values and rename to .env.local"
echo ""
echo "Redeploy to Vercel to apply changes:"
echo "   vercel deploy --prod"
