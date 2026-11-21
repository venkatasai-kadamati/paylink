# Architecture diagrams

Redrawn to make **one ALB** obvious. Do not interpret per-AZ ECS tasks as separate load balancers.

| File                               | Purpose                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `paylink-service-architecture.png` | Request path: CloudFront → **1 internal ALB** → FE/BE TGs → ECS → RDS         |
| `paylink-network-architecture.png` | VPC/AZ layout: **1 ALB bar spanning both AZs**; tasks only inside app subnets |

## How to read the network diagram

- **paylink-alb** is drawn once, as a bar across AZ-A and AZ-B.
- FE/BE task icons in each private app subnet are **capacity for HA**, not a second ALB.
- Terraform: one `aws_lb` with `subnets = [app-a, app-b]` (`terraform/alb.tf`).

Editable Mermaid sources: `service.mmd`, `network.mmd`.
