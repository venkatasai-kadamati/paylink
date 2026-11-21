# Experiments

Capture CloudWatch screenshots and short notes after each lab.

## A. Baseline

1. Open CloudWatch dashboard `paylink-ops`.
2. Confirm frontend/backend task counts = 2.
3. `curl -sS "$(terraform -chdir=../terraform output -raw cloudfront_url)/api/health"`.
4. Record idle CPU, RequestCount ≈ 0, RDS connections.

## B. Scalability (backend 2 → 4)

1. Generate load against `/api/health` or authenticated APIs.
2. Watch `AWS/ECS CPUUtilization` for `paylink-backend` and autoscaling activity.
3. Confirm desired count rises toward `backend_max_capacity` (4) when CPU stays above ~60%.
4. Stop load; observe scale-in after cooldown.
5. Write-up: metric → policy → capacity change → user-visible behavior.

## C. Availability / recovery

**Task failure**

1. Stop one backend task (ECS console) or drain a target.
2. ALB marks unhealthy; ECS replaces to desired count.
3. Note recovery time and whether `/api/health` stayed up via the other AZ.

**AZ model (do not disable an AZ in a shared student account unless staff approve)**

- Losing AZ-A still leaves app subnet B + RDS Multi-AZ failover (AWS-managed).

**RDS Multi-AZ (optional, disruptive)**

- Only if the course allows reboot-with-failover.
- Measure downtime via `/api/health` + RDS events.

## D. Security

1. Internal ALB DNS should not resolve/reach from the public internet.
2. Only the CloudFront URL works.
3. Screenshot ALB SG ingress from the CloudFront prefix list.
4. Show Secrets Manager secret on the task definition (redact values).

## E. Monitoring

1. Drive backend CPU alarm with load (or temporarily lower threshold).
2. Tail ECS log groups during a failed login / transfer.
3. Note CloudFront `4xx` / `5xx` / `OriginLatency` during a 504 (e.g. before targets healthy).

## F. Cost

1. Cost Explorer → tag `Project=paylink` for the lab window.
2. Rank: NAT, RDS, ALB, ECS, CloudFront.
3. Destroy; confirm charges flatten.
