# Cost notes (class credits)

Rough **order-of-magnitude** drivers in `us-east-1`. Always check the AWS Billing console / Cost Explorer for your account. Prices change; treat this as a priority list, not a quote.

## What costs the most (idle stack left on)

| Resource            | Why it hurts                     | Our mitigation                                                                                                          |
| ------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **NAT Gateway**     | Hourly charge + per-GB processed | **One** NAT in AZ-A (matches diagram). Free **S3 gateway endpoint** to cut some ECR pull traffic. Destroy when idle.    |
| **RDS Multi-AZ**    | ~2× single-AZ instance + storage | `db.t4g.micro`, 20 GB gp3. Set `db_multi_az = false` only for cheap throwaway labs (deviates from diagram).             |
| **ALB**             | Hourly + LCU                     | One internal ALB (not two).                                                                                             |
| **Fargate**         | vCPU + memory × task × hours     | 256 CPU / 512 MB; floor of 2 tasks each. Scale to 0 only during deliberate “stop compute” experiments (breaks HA demo). |
| **CloudFront**      | Request + data out               | `PriceClass_100`; default TTL 0 (dynamic app).                                                                          |
| **CloudWatch**      | Logs ingestion/storage           | 7-day retention.                                                                                                        |
| **Secrets Manager** | Per secret / month               | One app secret. `recovery_window_in_days = 0` for easy destroy in class.                                                |

## Before you apply

1. Run `terraform plan` and count NAT + RDS + ALB + ECS services.
2. Set a billing alarm in the student account if the course allows it.
3. Prefer short lab sessions: apply → experiment → **destroy**.

## After demos

```bash
cd cloud_project/terraform && terraform destroy
```

Leaving NAT + Multi-AZ RDS up overnight is the usual way student credits disappear.

## Cost optimization talking points (for the report)

- Single NAT vs dual-NAT HA (we chose cost-aligned diagram).
- Fargate right-sizing (256/512) vs larger tasks.
- Backend scale 2→4 only under load (target tracking).
- Short log retention.
- Optional future: VPC interface endpoints for ECR/Logs/Secrets to reduce NAT data (adds hourly endpoint cost — measure both ways in Cost Explorer).
