#!/bin/bash
# =============================================================================
# Credentis Backup Script
# Phase 9D: Production Hardening - Deployment & Recovery
#
# Creates consistent backups of:
#   - SQLite database (with WAL checkpoint)
#   - Askar wallet files
#   - Configuration files
#
# Usage: ./scripts/backup.sh [backup_dir]
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="credentis_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Source directories
DATA_DIR="${DATA_DIR:-./data}"
CONFIG_FILE="${CONFIG_FILE:-./config.json}"
PERSISTENCE_DB="${PERSISTENCE_DB_PATH:-./data/persistence.db}"
WALLET_DB="${WALLET_DB_PATH:-./data/.afj}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v sqlite3 &> /dev/null; then
        log_warn "sqlite3 not found - using file copy for database backup"
        return 1
    fi
    return 0
}

# Create backup directory
create_backup_dir() {
    mkdir -p "${BACKUP_PATH}"
    log_info "Created backup directory: ${BACKUP_PATH}"
}

# Backup SQLite database with WAL checkpoint
backup_database() {
    log_info "Backing up SQLite database..."
    
    if [ ! -f "${PERSISTENCE_DB}" ]; then
        log_warn "Database file not found: ${PERSISTENCE_DB}"
        return
    fi

    # Try to use sqlite3 for consistent backup
    if command -v sqlite3 &> /dev/null; then
        # Checkpoint WAL to ensure all changes are in main DB
        sqlite3 "${PERSISTENCE_DB}" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
        
        # Use .backup command for atomic backup
        sqlite3 "${PERSISTENCE_DB}" ".backup '${BACKUP_PATH}/persistence.db'" 2>/dev/null
        
        if [ $? -eq 0 ]; then
            log_info "Database backup completed (sqlite3 .backup)"
        else
            # Fallback to file copy
            cp "${PERSISTENCE_DB}" "${BACKUP_PATH}/persistence.db"
            log_info "Database backup completed (file copy)"
        fi
    else
        # Fallback: copy all database files
        cp "${PERSISTENCE_DB}" "${BACKUP_PATH}/persistence.db"
        [ -f "${PERSISTENCE_DB}-wal" ] && cp "${PERSISTENCE_DB}-wal" "${BACKUP_PATH}/persistence.db-wal"
        [ -f "${PERSISTENCE_DB}-shm" ] && cp "${PERSISTENCE_DB}-shm" "${BACKUP_PATH}/persistence.db-shm"
        log_info "Database backup completed (file copy with WAL files)"
    fi

    # Get database stats
    if command -v sqlite3 &> /dev/null; then
        local table_count=$(sqlite3 "${PERSISTENCE_DB}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "?")
        log_info "Database tables backed up: ${table_count}"
    fi
}

# Backup Askar wallet
backup_wallet() {
    log_info "Backing up Askar wallet..."
    
    if [ ! -d "${WALLET_DB}" ]; then
        log_warn "Wallet directory not found: ${WALLET_DB}"
        return
    fi

    mkdir -p "${BACKUP_PATH}/wallet"
    
    # Copy wallet files (Askar uses SQLite internally)
    cp -r "${WALLET_DB}"/* "${BACKUP_PATH}/wallet/" 2>/dev/null || true
    
    local wallet_size=$(du -sh "${BACKUP_PATH}/wallet" 2>/dev/null | cut -f1 || echo "?")
    log_info "Wallet backup completed (${wallet_size})"
}

# Backup configuration
backup_config() {
    log_info "Backing up configuration..."
    
    mkdir -p "${BACKUP_PATH}/config"
    
    # Backup config.json (if exists)
    if [ -f "${CONFIG_FILE}" ]; then
        # Sanitize sensitive data
        cat "${CONFIG_FILE}" | \
            sed 's/"walletKey":[^,}]*/"walletKey": "[REDACTED]"/g' | \
            sed 's/"apiKey":[^,}]*/"apiKey": "[REDACTED]"/g' \
            > "${BACKUP_PATH}/config/config.json"
        log_info "Config file backed up (secrets redacted)"
    fi

    # Backup environment variables (names only, not values)
    if [ -f ".env" ]; then
        grep -v "KEY\|SECRET\|PASSWORD\|TOKEN" .env > "${BACKUP_PATH}/config/env.sample" 2>/dev/null || true
        log_info "Environment sample backed up"
    fi
}

# Create manifest
create_manifest() {
    log_info "Creating backup manifest..."
    
    cat > "${BACKUP_PATH}/manifest.json" <<EOF
{
    "backup_version": "1.0",
    "timestamp": "$(date -Iseconds)",
    "hostname": "$(hostname)",
    "contents": {
        "database": $([ -f "${BACKUP_PATH}/persistence.db" ] && echo "true" || echo "false"),
        "wallet": $([ -d "${BACKUP_PATH}/wallet" ] && echo "true" || echo "false"),
        "config": $([ -d "${BACKUP_PATH}/config" ] && echo "true" || echo "false")
    },
    "sizes": {
        "database": "$(du -sh "${BACKUP_PATH}/persistence.db" 2>/dev/null | cut -f1 || echo "N/A")",
        "wallet": "$(du -sh "${BACKUP_PATH}/wallet" 2>/dev/null | cut -f1 || echo "N/A")",
        "total": "$(du -sh "${BACKUP_PATH}" 2>/dev/null | cut -f1 || echo "N/A")"
    }
}
EOF
    log_info "Manifest created"
}

# Compress backup
compress_backup() {
    log_info "Compressing backup..."
    
    cd "${BACKUP_DIR}"
    tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
    rm -rf "${BACKUP_NAME}"
    
    local archive_size=$(du -sh "${BACKUP_NAME}.tar.gz" | cut -f1)
    log_info "Backup compressed: ${BACKUP_NAME}.tar.gz (${archive_size})"
}

# Cleanup old backups (keep last N)
cleanup_old_backups() {
    local keep_count="${BACKUP_RETENTION:-7}"
    log_info "Cleaning up old backups (keeping last ${keep_count})..."
    
    cd "${BACKUP_DIR}"
    local backup_count=$(ls -1 credentis_backup_*.tar.gz 2>/dev/null | wc -l)
    
    if [ "${backup_count}" -gt "${keep_count}" ]; then
        ls -1t credentis_backup_*.tar.gz | tail -n +$((keep_count + 1)) | xargs rm -f
        log_info "Removed $((backup_count - keep_count)) old backup(s)"
    fi
}

# Main execution
main() {
    log_info "=== Credentis Backup Starting ==="
    log_info "Backup destination: ${BACKUP_PATH}"
    
    check_prerequisites
    create_backup_dir
    backup_database
    backup_wallet
    backup_config
    create_manifest
    compress_backup
    cleanup_old_backups
    
    log_info "=== Backup Complete ==="
    log_info "Archive: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
}

main "$@"
