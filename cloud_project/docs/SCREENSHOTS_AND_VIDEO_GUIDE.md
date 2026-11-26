# Screenshots & deployment video

Evidence captured from a live deploy of PayLink on AWS (simulated banking UI — no real bank integrations).

| Item        | Path / notes                                             |
| ----------- | -------------------------------------------------------- |
| Region      | `us-east-1`                                              |
| IaC         | `cloud_project/terraform/`                               |
| Diagrams    | [`diagrams/`](diagrams/) — **one** internal ALB          |
| Screenshots | `../artifacts/screenshots/`                              |
| Video       | `../artifacts/video/paylink-aws-deployment-showcase.mp4` |

![Service architecture](diagrams/paylink-service-architecture.png)

![Network architecture](diagrams/paylink-network-architecture.png)

Three folders under `artifacts/screenshots/`:

1. Application UI + logs
2. AWS Management Console (one subfolder per service)
3. Ad-hoc working proof

---

## 1 — Application UI + logs

Path: `../artifacts/screenshots/01-application-ui-and-logs/`

![Sign-in](../artifacts/screenshots/01-application-ui-and-logs/01-signin-page.png)

![Sai quick-test dashboard](../artifacts/screenshots/01-application-ui-and-logs/06-quicktest-sai-dashboard.png)

![API health](../artifacts/screenshots/01-application-ui-and-logs/03-api-health-card.png)

![Backend logs](../artifacts/screenshots/01-application-ui-and-logs/04-backend-cloudwatch-logs.png)

| File                                       | Contents                           |
| ------------------------------------------ | ---------------------------------- |
| `01-signin-page.png`                       | CloudFront sign-in / quick-test UI |
| `02-authenticated-dashboard.png`           | Registered user dashboard          |
| `03-api-health.*`                          | `/api/health`                      |
| `04-backend-cloudwatch-logs.png` + `.txt`  | FastAPI ECS logs                   |
| `05-frontend-cloudwatch-logs.png` + `.txt` | Next.js ECS logs                   |
| `06-quicktest-sai-dashboard.png`           | Sai profile after quick-test       |

---

## 2 — AWS Console (by service)

Path: `../artifacts/screenshots/02-aws-services/<service>/`

Console UI captures only (`*console*.png`). JSON files in the same folders are CLI detail dumps.

### VPC

![VPC list](../artifacts/screenshots/02-aws-services/vpc/00-console-your-vpcs.png)

![Resource map](../artifacts/screenshots/02-aws-services/vpc/00-console-vpc-resource-map.png)

### NAT Gateway

![NAT](../artifacts/screenshots/02-aws-services/nat-gateway/00-console-nat-gateway-details.png)

### Application Load Balancer

![ALB](../artifacts/screenshots/02-aws-services/alb/00-console-alb-details.png)

### ECS Fargate

![ECS](../artifacts/screenshots/02-aws-services/ecs-fargate/00-console-ecs-cluster-services.png)

### ECR

![ECR](../artifacts/screenshots/02-aws-services/ecr/00-console-ecr-repositories.png)

### RDS (Multi-AZ)

![RDS Multi-AZ](../artifacts/screenshots/02-aws-services/rds/03-console-rds-multi-az.png)

### CloudFront (+ VPC origin)

![CloudFront](../artifacts/screenshots/02-aws-services/cloudfront/00-console-cloudfront-distribution.png)

![VPC origin](../artifacts/screenshots/02-aws-services/cloudfront/01-console-cloudfront-vpc-origin.png)

### Secrets Manager

![Secrets](../artifacts/screenshots/02-aws-services/secrets-manager/00-console-secrets-manager.png)

Metadata only — no secret values.

### CloudWatch

![Log groups](../artifacts/screenshots/02-aws-services/cloudwatch/00-console-cloudwatch-log-groups.png)

### IAM

![IAM](../artifacts/screenshots/02-aws-services/iam/00-console-iam-ecs-execution-role.png)

| Subfolder          | Shows                                       |
| ------------------ | ------------------------------------------- |
| `vpc/`             | Your VPCs + Resource Map (Show all details) |
| `nat-gateway/`     | `paylink-nat-a` Available                   |
| `alb/`             | Internal `paylink-alb`, HTTP:80             |
| `ecs-fargate/`     | FE 2/2 + BE 2/2 Fargate                     |
| `ecr/`             | `paylink-frontend` / `paylink-backend`      |
| `rds/`             | Multi-AZ Yes, secondary `us-east-1b`        |
| `cloudfront/`      | Distribution + VPC origin → internal ALB    |
| `secrets-manager/` | `paylink/app-credentials`                   |
| `cloudwatch/`      | `/ecs/paylink/*` log groups                 |
| `iam/`             | `paylink-ecs-execution` + secrets policy    |

---

## 3 — Ad-hoc working proof

Path: `../artifacts/screenshots/03-adhoc-working-proof/`

![Cross-validation](../artifacts/screenshots/03-adhoc-working-proof/01-cross-validation-checklist.png)

![Demo login Sai](../artifacts/screenshots/03-adhoc-working-proof/03-demo-login-sai.png)

![UI Sai proof](../artifacts/screenshots/03-adhoc-working-proof/05-ui-quicktest-sai-dashboard.png)

| File                                | Proves                               |
| ----------------------------------- | ------------------------------------ |
| `01-cross-validation-checklist.png` | Diagram ↔ Terraform ↔ AWS            |
| `02-health-via-cloudfront.png`      | HTTPS → CloudFront → ALB → API → RDS |
| `03-demo-login-sai.*`               | Quick-test `sai` → 200               |
| `04-demo-login-siddhardth.*`        | Quick-test `siddhardth` → 200        |
| `05-ui-quicktest-sai-dashboard.png` | UI quick-test + seeded accounts      |

---

## Reproducing this evidence

These are historic artifacts. Once Venkatasai authorizes a fresh AWS run, follow the [deployment runbook](DEPLOYMENT_GUIDE.md), including DB bootstrap before enabling services. Capture new evidence for the tested release. Talking points: [PROFESSOR_QA.md](PROFESSOR_QA.md).

## Tear down

Follow the [approval-gated teardown](DEPLOYMENT_GUIDE.md#4-tear-down-after-separate-confirmation).
