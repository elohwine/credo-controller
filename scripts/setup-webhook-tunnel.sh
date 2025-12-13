#!/bin/bash

# EcoCash Webhook Setup Script
# This script sets up ngrok tunnel for local webhook testing

echo "🔧 EcoCash Webhook Setup"
echo "========================"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed!"
    echo ""
    echo "Please install ngrok:"
    echo "  1. Visit: https://ngrok.com/download"
    echo "  2. Or use: snap install ngrok (Linux)"
    echo "  3. Or use: brew install ngrok (macOS)"
    echo ""
    exit 1
fi

echo "✓ ngrok is installed"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "⚠️  Credo server is not running on port 3000"
    echo ""
    echo "Please start the server first:"
    echo "  yarn dev"
    echo ""
    exit 1
fi

echo "✓ Credo server is running on port 3000"
echo ""

# Start ngrok tunnel
echo "🚀 Starting ngrok tunnel..."
echo ""
echo "This will create a public URL for your local server."
echo "The webhook URL will be: https://YOUR-NGROK-URL/webhooks/ecocash"
echo ""
echo "⚠️  IMPORTANT: Copy the HTTPS URL and configure it in EcoCash dashboard"
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo ""

# Start ngrok on port 3000
ngrok http 3000
