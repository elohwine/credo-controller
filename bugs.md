# Known Bugs and Issues - Credo Controller

## 1. Docker Environment & Permissions
### Issue: Permission Denied for Docker Daemon
- **Symptoms**: `docker ps` and `docker-compose` fail with `permission denied` accessing `/var/run/docker.sock`.
- **Impact**: Automation scripts and `npm run` commands that trigger docker operations fail.
- **Workaround**: User must run all docker commands with `sudo`.

### Issue: Container Name Conflicts
- **Symptoms**: `Error response from daemon: Conflict. The container name ... is already in use`.
- **Context**: Switching between `docker-compose` (v1) and `docker compose` (v2) leaves "orphaned" or conflicting containers.
- **Workaround**: Must manually run `sudo docker rm -f credo-api credo-holder` before bringing services up.

## 2. Configuration & Network
### Issue: TSOA Route Generation (Double Segment)
- **Symptoms**: 404 Not Found on expected endpoints.
- **Detail**: The `WalletController` is decorated with `@Route('wallet')` and methods with `@Post('wallet/:walletId/...')`, causing TSOA to generate paths like `/api/wallet/wallet/:walletId/...`.
- **Status**: Documented in `walkthrough.md`. Requires careful URL configuration.

### Issue: Docker Internal DNS vs Localhost
- **Symptoms**: Issuer cannot push offers to Holder.
- **Detail**: Issuer container cannot resolve `localhost:6000` (Holder). It requires `http://holder-api:6000` (Docker DNS) or `host.docker.internal` (Mac/Windows).
- **Status**: Updated `docker-compose.full.yml` to use `holder-api`, but requires consistent network internal addresses.

## 3. Credential Formats
### Issue: `jwt_vc` vs `jwt_vc_json`
- **Symptoms**: "Format unsupported" or decoding errors.
- **Detail**: The codebase has partial support for `jwt_vc`. The system currently stabilizes on `jwt_vc_json` as the supported format for offers and issuance.
- **Status**: `jwt_vc` logic is present but disabled/deprioritized in favor of `jwt_vc_json`.
