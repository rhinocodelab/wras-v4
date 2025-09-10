#!/bin/bash

# Certificate Cleanup Script
# This script removes all existing SSL certificates and temporary files
# Usage: ./scripts/cleanup-certificates.sh

set -e

# Configuration
CERT_DIR="./certs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧹 SSL Certificate Cleanup${NC}"
echo "=================================================="

# Check if certificates directory exists
if [ ! -d "$CERT_DIR" ]; then
    echo -e "${GREEN}✅ No certificates directory found. Nothing to clean up.${NC}"
    exit 0
fi

# Count existing files
CERT_COUNT=0
if [ -f "$CERT_DIR/cert.pem" ]; then CERT_COUNT=$((CERT_COUNT + 1)); fi
if [ -f "$CERT_DIR/private.key" ]; then CERT_COUNT=$((CERT_COUNT + 1)); fi
if [ -f "$CERT_DIR/server.crt" ]; then CERT_COUNT=$((CERT_COUNT + 1)); fi
if [ -f "$CERT_DIR/server.key" ]; then CERT_COUNT=$((CERT_COUNT + 1)); fi
if [ -f "$CERT_DIR/cert.csr" ]; then CERT_COUNT=$((CERT_COUNT + 1)); fi
if [ -f "$CERT_DIR/server.csr" ]; then CERT_COUNT=$((CERT_COUNT + 1)); fi

if [ $CERT_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ No certificate files found. Nothing to clean up.${NC}"
    exit 0
fi

echo -e "${YELLOW}Found $CERT_COUNT certificate file(s) to remove...${NC}"

# Remove new format certificates
if [ -f "$CERT_DIR/cert.pem" ]; then
    rm -f "$CERT_DIR/cert.pem"
    echo -e "${YELLOW}   Removed: $CERT_DIR/cert.pem${NC}"
fi

if [ -f "$CERT_DIR/private.key" ]; then
    rm -f "$CERT_DIR/private.key"
    echo -e "${YELLOW}   Removed: $CERT_DIR/private.key${NC}"
fi

# Remove old format certificates
if [ -f "$CERT_DIR/server.crt" ]; then
    rm -f "$CERT_DIR/server.crt"
    echo -e "${YELLOW}   Removed: $CERT_DIR/server.crt${NC}"
fi

if [ -f "$CERT_DIR/server.key" ]; then
    rm -f "$CERT_DIR/server.key"
    echo -e "${YELLOW}   Removed: $CERT_DIR/server.key${NC}"
fi

# Remove CSR files
if [ -f "$CERT_DIR/cert.csr" ]; then
    rm -f "$CERT_DIR/cert.csr"
    echo -e "${YELLOW}   Removed: $CERT_DIR/cert.csr${NC}"
fi

if [ -f "$CERT_DIR/server.csr" ]; then
    rm -f "$CERT_DIR/server.csr"
    echo -e "${YELLOW}   Removed: $CERT_DIR/server.csr${NC}"
fi

# Check if directory is now empty
REMAINING_FILES=$(ls -A "$CERT_DIR" 2>/dev/null | wc -l)

if [ $REMAINING_FILES -eq 0 ]; then
    echo -e "${GREEN}✅ All certificate files removed successfully!${NC}"
    echo -e "${YELLOW}📁 Certificates directory is now empty.${NC}"
else
    echo -e "${YELLOW}⚠️  $REMAINING_FILES file(s) remain in the certificates directory.${NC}"
    echo -e "${YELLOW}   Remaining files:${NC}"
    ls -la "$CERT_DIR"
fi

echo ""
echo -e "${GREEN}🎉 Certificate cleanup completed!${NC}"
echo "=================================================="
echo -e "${YELLOW}💡 To generate new certificates, run:${NC}"
echo "   ./scripts/generate-ssl-cert.sh <IP_ADDRESS>"
echo "   or"
echo "   npm run setup-server <IP_ADDRESS>"