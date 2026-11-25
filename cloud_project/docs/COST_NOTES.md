# Estimated AWS cost (us-east-1)

USD on-demand, 730 hours/month, Linux ARM64, no free tier, discounts, tax or credits assumed. Rates are planning estimates, not a quote. Baseline traffic assumptions: 0.1 average ALB LCU, 1 GB via NAT, 10 GB CloudFront North America/Europe transfer and 100,000 HTTPS requests, 2 GB ECR storage, 1 GB CloudWatch log ingestion. The monthly prices below are for the **running** stage.

| Driver | Rate / usage | Presentation (2 UI + 2 API) | Rehearsal (1 UI + 1 API) |
| --- | --- | ---: | ---: |
| [Fargate](https://aws.amazon.com/fargate/pricing/) | $0.03238/vCPU-h and $0.00356/GiB-h; 0.25 vCPU + 0.5 GiB per task | $28.84 | $14.42 |
| [RDS PostgreSQL](https://aws.amazon.com/rds/postgresql/pricing/) ([regional price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.json)) | `db.t4g.micro` $0.032/h Multi-AZ or $0.016/h Single-AZ; 20 GiB gp3 at $0.23 or $0.115/GiB-mo respectively | $27.96 | $13.98 |
| [Private ALB](https://aws.amazon.com/elasticloadbalancing/pricing/) | $0.0225/h + $0.008/LCU-h | $17.01 | $17.01 |
| [NAT + public IPv4](https://aws.amazon.com/vpc/pricing/) | $0.045/h + $0.005/h for one EIP; 1 GB at $0.045 and ≈$0.02 cross-AZ allowance | $36.57 | $36.57 |
| [CloudFront](https://aws.amazon.com/cloudfront/pricing/) | Low-volume pay-as-you-go allowance using $0.085/GB and $0.01/10k HTTPS requests before any free tier | $0.95 | $0.95 |
| [ECR](https://aws.amazon.com/ecr/pricing/) | 2 GB at $0.10/GB-mo | $0.20 | $0.20 |
| [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) | 1 GB ingestion plus storage allowance ($0.53), five standard alarms ($0.50, including scaling), one dashboard ($3); Container Insights off | $4.03 | $4.03 |
| [Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/) | 2 secrets at $0.40/mo each + nominal API calls | $0.81 | $0.81 |
| [S3 state](https://aws.amazon.com/s3/pricing/) | Small encrypted state versions plus locking requests; no application files | ≤$0.10 | ≤$0.10 |
| **Budget at the assumed usage** | Rounded | **~$116.46/mo** | **~$88.06/mo** |

For a four-hour lab, the hour-metered stack components (NAT/IPv4, ALB, RDS compute, steady Fargate) are about **$0.58 presentation** or **$0.44 rehearsal**, before storage, one-off startup/apply/teardown time, alarms/dashboard, logs and traffic; do not treat that as an invoice ceiling. Each extra API task adds ≈$0.0099/hour while running. Sustained CPU on the burstable DB, storage growth, retained backups, larger traffic, data transfer or retained artifacts can raise the bill. Account-specific free tier, CloudFront allowances and student credits may offset charges but are not guaranteed; check Billing before approval. No Bedrock usage is included.

One ALB serves both AZs and both app tiers. One NAT keeps app ENIs private at lower fixed cost than four interface endpoints across two AZs (ECR API/DKR, CloudWatch Logs and Secrets Manager); ECR layer traffic can use the free S3 gateway endpoint. The NAT-free alternative with public-addressed task ENIs was not chosen because it changes the demonstrated private network. The most effective savings are to use the single-copy rehearsal profile if failover is not being measured, deploy only for an approved window, and verify teardown of NAT, IPv4, ALB and RDS.
