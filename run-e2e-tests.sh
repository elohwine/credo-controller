#!/bin/bash
# Platform Remodel E2E Test Quick Start
# Run from: /home/eloh/PROJECTS/credo-controller-backup

set -e

echo "🚀 Platform Remodel E2E Test Suite"
echo "=================================="
echo ""

# Check prerequisites
echo "✓ Checking prerequisites..."

if [ ! -f "package.json" ]; then
  echo "❌ Error: Not in project root"
  exit 1
fi

if ! command -v yarn &> /dev/null; then
  echo "❌ Error: yarn not found. Install with: npm install -g yarn"
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo "❌ Error: node not found"
  exit 1
fi

# Check API is running
echo "✓ Checking if API is running on localhost:3000..."
if ! curl -s http://localhost:3000/docs > /dev/null; then
  echo "⚠️  API not running. Start with: yarn dev:api"
  echo "   Or: yarn dev:local"
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Install dependencies if needed
echo "✓ Ensuring dependencies..."
if [ ! -d "node_modules" ]; then
  yarn install
fi

# Run tests
echo ""
echo "📝 Running E2E test suite..."
echo ""
echo "Tests in: tests/e2e/platformRemodel.e2e.spec.ts"
echo ""

# Set environment variables for test
export API_URL="${API_URL:-http://localhost:3000}"
export PORTAL_URL="${PORTAL_URL:-http://localhost:5000}"

echo "API_URL: $API_URL"
echo "PORTAL_URL: $PORTAL_URL"
echo ""

# Run the tests
yarn test tests/e2e/platformRemodel.e2e.spec.ts --runInBand --verbose

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ All tests passed!"
  echo ""
  echo "📊 Test Coverage:"
  echo "   ✓ Organization readiness verification"
  echo "   ✓ Platform request lifecycle (draft→completed)"
  echo "   ✓ Workflow execution with pause/resume"
  echo "   ✓ Credential issuance & verification"
  echo "   ✓ OpenID4VP with DCQL"
  echo "   ✓ Authorization with SSI integration"
  echo "   ✓ Audit trail & policy decisions"
  echo "   ✓ Separation of duties enforcement"
  echo "   ✓ Failure scenarios"
  echo ""
  echo "📖 For detailed info, see: E2E_TESTING_SESSION_SUMMARY.md"
  echo "📖 For architecture, see: docs/WORKFLOW_ALIGNMENT.md"
else
  echo ""
  echo "❌ Some tests failed. Check output above."
  exit 1
fi
