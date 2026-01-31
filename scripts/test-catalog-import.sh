#!/bin/bash

# Configuration
API_URL="http://localhost:3000"
MERCHANT_ID="merchant-test-001"
API_KEY="test-api-key-12345"

echo "🧪 Testing Catalog Import & Search..."

# 1. Import Items
echo "1. Importing 3 items..."
curl -s -X POST "$API_URL/api/catalog/merchant/$MERCHANT_ID/import" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '[
    {
      "title": "Wireless Mouse",
      "description": "Ergonomic wireless mouse",
      "price": 25.00,
      "sku": "ACC-MOUSE-001",
      "category": "Accessories"
    },
    {
      "title": "Mechanical Keyboard",
      "description": "RGB gaming keyboard",
      "price": 120.00,
      "sku": "ACC-KEY-001",
      "category": "Accessories"
    },
    {
      "title": "Gaming Monitor",
      "description": "27 inch 144Hz monitor",
      "price": 300.00,
      "sku": "HW-MON-001",
      "category": "Hardware"
    }
  ]' | jq .

# 2. Search Items
echo -e "\n2. Searching for all items..."
SEARCH_ALL=$(curl -s "$API_URL/api/catalog/search?q=" | jq .)
echo "$SEARCH_ALL" | jq 'length'

# 3. Search Specific Item
echo -e "\n3. Searching for 'Mouse'..."
curl -s "$API_URL/api/catalog/search?q=Mouse" | jq .

echo "✅ Test Complete"
