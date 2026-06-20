# BlueCollar Production Incident Runbook

This runbook provides step-by-step resolution procedures for the most common production incidents.

## 1. API is Returning 500 Errors

### Symptoms
- API endpoints returning HTTP 500 responses
- Error logs showing "Internal server error"
- Possible spike in error rate in monitoring dashboards

### Diagnosis Steps

1. **Check recent deployments:**
   ```bash
   git log --oneline -10
   kubectl rollout history deployment/bluecollar-api -n production
   ```

2. **Review API logs (last 30 minutes):**
   ```bash
   kubectl logs -f deployment/bluecollar-api -n production --tail=500 --timestamps=true
   # Or via ELK/CloudWatch
   ```

3. **Check database connectivity:**
   ```bash
   kubectl exec -it deployment/bluecollar-api -n production -- \
     npm run db:check-connection
   ```

4. **Verify environment variables are set:**
   ```bash
   kubectl get secret bluecollar-api-secrets -n production -o yaml | grep -E "DATABASE_URL|JWT_SECRET"
   ```

5. **Check for memory/CPU exhaustion:**
   ```bash
   kubectl top pods -n production | grep bluecollar-api
   kubectl describe pod <pod-name> -n production
   ```

### Resolution

**If caused by recent deployment:**
- Rollback to previous version:
  ```bash
  kubectl rollout undo deployment/bluecollar-api -n production
  kubectl rollout status deployment/bluecollar-api -n production
  ```

**If caused by database issue:**
- Verify database is running and accessible
- Check connection pool settings in `packages/api/.env`
- Restart database if necessary (coordinate with DBA)

**If caused by resource exhaustion:**
- Scale up replicas:
  ```bash
  kubectl scale deployment bluecollar-api --replicas=5 -n production
  ```
- Monitor recovery with: `kubectl top pods -n production`

**If caused by missing environment variables:**
- Update secrets:
  ```bash
  kubectl create secret generic bluecollar-api-secrets \
    --from-literal=DATABASE_URL="..." \
    --from-literal=JWT_SECRET="..." \
    -n production --dry-run=client -o yaml | kubectl apply -f -
  ```
- Restart pods: `kubectl rollout restart deployment/bluecollar-api -n production`

### Verification
- Test endpoint: `curl -s https://api.bluecollar.io/health | jq .`
- Monitor error rate for 5 minutes to confirm recovery
- Check logs for any new errors

---

## 2. Database Connection Pool Exhausted

### Symptoms
- Errors: "ECONNREFUSED" or "connect ETIMEDOUT"
- Slow API responses or timeouts
- Database connection count near max in monitoring
- Logs showing "pool exhausted" or "no available connections"

### Diagnosis Steps

1. **Check current connection count:**
   ```bash
   # PostgreSQL
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \
     "SELECT count(*) FROM pg_stat_activity;"
   ```

2. **Check max connections setting:**
   ```bash
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \
     "SHOW max_connections;"
   ```

3. **Identify long-running queries:**
   ```bash
   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \
     "SELECT pid, usename, query, query_start FROM pg_stat_activity \
      WHERE state != 'idle' ORDER BY query_start;"
   ```

4. **Check Prisma pool settings:**
   ```bash
   kubectl exec -it deployment/bluecollar-api -n production -- \
     grep -A5 "connection_limit\|pool_size" packages/api/.env
   ```

### Resolution

**Immediate action - Restart connection pool:**
```bash
# Restart API pods to reset connections
kubectl rollout restart deployment/bluecollar-api -n production
kubectl rollout status deployment/bluecollar-api -n production
```

**Kill idle connections (if restart doesn't help):**
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity \
   WHERE state = 'idle' AND query_start < now() - interval '10 minutes';"
```

**Increase connection pool size:**
1. Update `packages/api/.env`:
   ```
   DATABASE_URL="postgresql://user:pass@host/db?schema=public&connection_limit=30"
   ```
2. Redeploy: `kubectl rollout restart deployment/bluecollar-api -n production`

**Optimize long-running queries:**
- Identify slow queries from step 3 above
- Add database indexes if needed
- Optimize query logic in code

### Verification
- Monitor connection count: `watch -n 5 'psql ... -c "SELECT count(*) FROM pg_stat_activity;"'`
- Verify API responsiveness: `curl -w "@curl-format.txt" https://api.bluecollar.io/health`
- Check logs for connection errors: `kubectl logs -f deployment/bluecollar-api -n production | grep -i "connection\|pool"`

---

## 3. Contract Upgrade Failed Mid-way

### Symptoms
- Contract deployment stuck or failed
- Inconsistent contract state on-chain
- Transactions failing with "contract not found" or version mismatch
- Stellar network errors in logs

### Diagnosis Steps

1. **Check contract deployment status:**
   ```bash
   stellar contract info \
     --id <contract-id> \
     --network testnet
   ```

2. **Verify WASM hash on-chain:**
   ```bash
   stellar contract invoke \
     --id <contract-id> \
     --source <admin-key> \
     --network testnet \
     -- get_version
   ```

3. **Check recent transactions:**
   ```bash
   stellar tx info <tx-hash> --network testnet
   ```

4. **Review upgrade logs:**
   ```bash
   kubectl logs -f deployment/bluecollar-contracts -n production --tail=200
   ```

### Resolution

**If upgrade is stuck (not yet committed):**
- Cancel the transaction (if possible) and retry:
  ```bash
  stellar contract upgrade \
    --wasm target/wasm32-unknown-unknown/release/bluecollar_registry.wasm \
    --source <admin-secret-key> \
    --network testnet
  ```

**If upgrade partially completed:**
1. Verify current contract state:
   ```bash
   stellar contract invoke \
     --id <contract-id> \
     --source <admin-key> \
     --network testnet \
     -- list_workers
   ```

2. If data is intact, complete the upgrade:
   ```bash
   # Install new WASM
   stellar contract install \
     --wasm target/wasm32-unknown-unknown/release/bluecollar_registry.wasm \
     --source <admin-secret-key> \
     --network testnet
   # Get the new hash and invoke upgrade
   stellar contract invoke \
     --id <contract-id> \
     --source <admin-secret-key> \
     --network testnet \
     -- upgrade \
     --admin <admin-address> \
     --new_wasm_hash <new-hash>
   ```

3. If data is corrupted, rollback:
   ```bash
   # Redeploy previous WASM version
   stellar contract install \
     --wasm target/wasm32-unknown-unknown/release/bluecollar_registry.v1.wasm \
     --source <admin-secret-key> \
     --network testnet
   ```

### Verification
- Confirm contract version: `stellar contract invoke ... -- get_version`
- Test worker registration: `stellar contract invoke ... -- register ...`
- Monitor Stellar network status: https://status.stellar.org/

---

## 4. Profile Images Not Loading

### Symptoms
- 404 errors when accessing profile images
- Broken image links in frontend
- S3/CDN returning 403 Forbidden
- Images uploaded but not accessible

### Diagnosis Steps

1. **Check image storage location:**
   ```bash
   # Verify S3 bucket exists and is accessible
   aws s3 ls s3://bluecollar-profiles/ --profile production
   ```

2. **Check image permissions:**
   ```bash
   aws s3api head-object \
     --bucket bluecollar-profiles \
     --key <image-key> \
     --profile production
   ```

3. **Verify CDN configuration:**
   ```bash
   # Check CloudFront distribution
   aws cloudfront list-distributions --profile production | grep -A5 "bluecollar"
   ```

4. **Check API logs for upload errors:**
   ```bash
   kubectl logs -f deployment/bluecollar-api -n production | grep -i "upload\|image\|s3"
   ```

5. **Test direct S3 access:**
   ```bash
   curl -I https://s3.amazonaws.com/bluecollar-profiles/<image-key>
   ```

### Resolution

**If S3 bucket is not accessible:**
1. Verify bucket policy allows public read:
   ```bash
   aws s3api get-bucket-policy \
     --bucket bluecollar-profiles \
     --profile production
   ```

2. Update bucket policy if needed:
   ```bash
   aws s3api put-bucket-policy \
     --bucket bluecollar-profiles \
     --policy file://bucket-policy.json \
     --profile production
   ```

**If CDN cache is stale:**
1. Invalidate CloudFront cache:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id <distribution-id> \
     --paths "/*" \
     --profile production
   ```

2. Monitor invalidation status:
   ```bash
   aws cloudfront list-invalidations \
     --distribution-id <distribution-id> \
     --profile production
   ```

**If image upload is failing:**
1. Check API environment variables:
   ```bash
   kubectl get secret bluecollar-api-secrets -n production -o yaml | \
     grep -E "AWS_ACCESS_KEY|AWS_SECRET_KEY|S3_BUCKET"
   ```

2. Verify IAM permissions for API service account:
   ```bash
   aws iam get-user-policy \
     --user-name bluecollar-api \
     --policy-name s3-upload \
     --profile production
   ```

3. Restart API to pick up new credentials:
   ```bash
   kubectl rollout restart deployment/bluecollar-api -n production
   ```

### Verification
- Test image upload: Upload a test image via API
- Verify S3 object exists: `aws s3 ls s3://bluecollar-profiles/ --profile production`
- Test CDN access: `curl -I https://cdn.bluecollar.io/<image-key>`
- Check frontend: Verify images load in browser (check Network tab in DevTools)

---

## General Incident Response Checklist

- [ ] Identify incident severity (P1/P2/P3)
- [ ] Notify on-call team and stakeholders
- [ ] Create incident ticket/channel
- [ ] Follow diagnosis steps for the specific incident
- [ ] Implement resolution
- [ ] Verify fix and monitor for 15+ minutes
- [ ] Document root cause and prevention steps
- [ ] Schedule post-incident review

## Escalation Contacts

- **On-call Engineer:** Check PagerDuty
- **Database Team:** #db-team Slack channel
- **Infrastructure Team:** #infra-team Slack channel
- **Stellar Support:** https://stellar.org/support

## Useful Commands Reference

```bash
# API health check
curl https://api.bluecollar.io/health

# View recent logs
kubectl logs -f deployment/bluecollar-api -n production --tail=100

# Check pod status
kubectl get pods -n production | grep bluecollar

# Describe pod for events
kubectl describe pod <pod-name> -n production

# Scale deployment
kubectl scale deployment bluecollar-api --replicas=<count> -n production

# Check resource usage
kubectl top pods -n production

# Database connection check
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1"
```

## Prevention Tips

1. **Monitor proactively:** Set up alerts for error rates, latency, and resource usage
2. **Test deployments:** Always test in staging before production
3. **Database maintenance:** Regular VACUUM and ANALYZE on PostgreSQL
4. **Connection pooling:** Monitor and tune connection pool settings
5. **Contract testing:** Test contract upgrades on testnet first
6. **Image storage:** Monitor S3 bucket size and CDN cache hit rates
