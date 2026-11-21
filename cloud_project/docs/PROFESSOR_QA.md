# Professor Q&A

Answers mapped to the course diagrams and `cloud_project/terraform/`.

---

## 1. Why 2 nodes? (frontend, backend, Multi-AZ DB)

Availability across Availability Zones — not extra power for its own sake.

| Tier                  | Count                            | Why                                                                                |
| --------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| Next.js (ECS Fargate) | **2 tasks** across app subnets   | AZ or task failure still leaves capacity behind the ALB                            |
| FastAPI (ECS Fargate) | **2 tasks**, scale **up to 4**   | Same HA floor; CPU autoscaling for load labs                                       |
| RDS PostgreSQL        | **Primary + standby (Multi-AZ)** | Synchronous standby; AWS fails over; standby does not serve queries until failover |

Concepts: availability (survive single-AZ/task loss), scalability (2→4 separate from the HA floor), cost (2× compute + Multi-AZ costs more — see `COST_NOTES.md`).

---

## 2. Why CloudFront + ALB? Why VPC origin?

| Layer                     | Role                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **CloudFront**            | Public HTTPS entry, edge TLS, single public endpoint                                                      |
| **ALB**                   | In-VPC: health checks, path routing (`/api/*` → FastAPI, default → Next.js), spreads traffic across tasks |
| **CloudFront VPC origin** | Private path to an **internal** ALB (no public IP on the ALB)                                             |

CloudFront alone is not an L7 balancer for ECS target groups and path rules. An internet-facing ALB alone would expose the origin and skip the private-origin design in the diagram.

VPC origin notes:

- ALB is `internal` in `10.42.10.0/24` and `10.42.11.0/24`
- ALB SG allows CloudFront prefix list `com.amazonaws.global.cloudfront.origin-facing` only
- VPC still has an IGW (AWS requirement for VPC origins); private app egress uses NAT

---

## 3. “Why separate ALBs?”

We deploy **one** ALB, not two. Clarifying diagrams: [diagrams/](diagrams/) (ALB drawn **once**, spanning both AZs).

| Misreading                                     | Actual design                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Two ALBs because something is drawn in each AZ | Single `aws_lb` with `subnets = [app-a, app-b]` (`terraform/alb.tf`) |
| “Dedicated node per AZ” = second load balancer | Per-AZ boxes are **ECS tasks** (HA capacity), not extra ALBs         |
| Split backends somehow                         | One listener; `/api/*` → backend TG; default → frontend TG           |

One multi-AZ ALB → one CloudFront VPC origin, cross-AZ failover, lower cost/ops than two ALBs.

---

## 4. Why ECS Fargate (via Terraform)?

| Concern     | Fargate                                                                              |
| ----------- | ------------------------------------------------------------------------------------ |
| Ops         | No EC2 fleet to patch                                                                |
| Networking  | `awsvpc` ENIs in private app subnets + SGs                                           |
| Integration | ALB target groups, CloudWatch logs, IAM roles, Secrets Manager, ECR, App Autoscaling |
| Scaling     | Desired count / policies — no AMI or node groups                                     |
| IaC         | Cluster → task defs → services → scaling → alarms in Terraform                       |

EC2 launch type adds ASGs/AMI work; EKS adds a control plane. For this course scope, Fargate fits.

---

## 5. Request path (demo)

1. Browser → `https://<distribution>.cloudfront.net`
2. CloudFront → VPC origin → internal ALB `:80`
3. ALB routes `/api/*` → FastAPI `:8000`; else → Next.js `:3000`
4. FastAPI → RDS in isolated subnets over SG-restricted `:5432`
5. Private app egress (pulls/APIs) → NAT in public AZ-A

---

## 6. Security

- Public surface: CloudFront only
- ALB: internal + CloudFront prefix-list SG
- ECS: private subnets, no public IPs
- RDS: isolated subnets, no internet route, encrypted storage, backend SG only
- Secrets: JWT + DB URL in Secrets Manager (not in images)
- IAM: execution role for ECR/logs/secrets; minimal task role

---

## 7. Course pillars → where they show up

| Pillar       | Evidence                                                                          |
| ------------ | --------------------------------------------------------------------------------- |
| Scalability  | Backend autoscaling 2→4; load + CloudWatch CPU                                    |
| Availability | 2 tasks / AZ spread; Multi-AZ RDS; ALB unhealthy-host alarm                       |
| Security     | VPC origin, SGs, Secrets Manager, private RDS                                     |
| Monitoring   | CloudWatch logs, dashboard, CPU/ALB/RDS/CloudFront alarms                         |
| Cost         | Single NAT, `PriceClass_100`, small sizes, short log retention, destroy when idle |
