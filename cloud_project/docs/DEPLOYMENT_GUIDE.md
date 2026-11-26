# PayLink on AWS: deployment runbook

**Approval required.** Do not apply, push to ECR, run AWS tasks, or destroy without explicit authorization for the exact action and class account. The application uses only the isolated Amazon RDS PostgreSQL database and synthetic fixtures. Plan for about **$116/month** at presentation capacity or **$88/month** for the single-copy profile; see [cost assumptions](COST_NOTES.md). Leave the live stack running until teardown is separately approved.

For the full AWS service inventory and an overview, see the [AWS guide](AWS_GUIDE.md).

## Requirements and scope

| Source | Requirement or expectation | Implementation / evidence |
| --- | --- | --- |
| [CS 5610 Group Project, pp. 1–2](../../documentation/requirements/cloud%20computing/group%20project%20guide/CS%205610%20Group%20project.pdf) | Introduce the architecture and components, “how the functions are implemented, what options are available,” the chosen options, and service configurations. Include captioned screenshots of necessary implementation steps, grouped by function/service. | [Professor Q&A](PROFESSOR_QA.md) has the service trade-offs; the checks below are the evidence to gather after deployment. Demonstrate app functions, not cloud setup (demo ≤5 minutes; full demo, presentation and Q&A ≤15 minutes). Capture screenshots for the deck instead of opening the console during the presentation. |
| [Professor feedback](../../documentation/requirements/cloud%20computing/feedback%20from%20professor/feedback.md) | “Everything from start to end should be deployed using AWS through strictly Terraform IaC”; show microservices, virtualization, scaling, resilience, security and availability, and make the concept of containers clear. | Versioned S3 state and AWS infrastructure, including all three Fargate task definitions, are Terraform-managed. Docker builds release images; AWS CLI pushes artifacts and starts the already-defined one-off data task, not infrastructure. Next.js and FastAPI are independently deployable containers on AWS-managed Fargate compute. [Experiments](EXPERIMENTS.md) describes what to measure, not results. |
| [MVP discussion and images](../../documentation/requirements/cloud%20computing/mvp%20shown%20discussion%20thread/discussion.md) | “Why separate ALB's and what is the purpose - availability?” and “Look into Fargate option through IaC”; the team's design lists RDS, ECR, NAT, and S3 state. | **One** internal ALB across two AZs routes `/api` and `/api/*` to FastAPI; the default target is Next.js. CloudFront serves HTTPS to viewers and reaches the ALB privately. RDS is isolated and uses the same migrations as the existing app. The written group guide does not mandate RDS; it is the team's AWS design and the recommendation for an AWS-only class demo, subject to approval. |
| Professor feedback: “where does the money sit - is it real?” | Explain the balance and transfer model. | Synthetic balances and transfer postings live in PostgreSQL. Nothing connects to Zelle or any actual institution; there is no movement or custody of real money. |
| MVP discussion extensions | PayBot/Bedrock, insights/S3, receipt uploads. | Current app containers include PayBot's local provider, PostgreSQL-backed insights, and generated transfer receipts. This baseline does **not** claim a live Bedrock integration, S3-backed insights, or receipt uploads; S3 is only for Terraform state here. Bedrock needs separate model/access approval and task-role integration; current optional adapter expects credential variables, which should not be injected as long-lived keys. |

The prior EcoCraft report/deck are references for report layout and service-by-service evidence, not for PayLink's service choices. Group 3's report, slides, speaker script and confidential individual teamwork assessments are later deliverables. The discussion references `working_ui.png`, which is not included in the requirements folder; there are no new live measurements or AWS screenshots from this prep step.

## What will be created

The [state root](../terraform/state/) creates four Terraform resources: one S3 bucket, its versioning, SSE-S3 encryption and all four public-access blocks. The [application root](../terraform/) plans **75 adds** for an empty foundation and **77 adds** for an empty running deployment in the mocked test (not an AWS plan). At the second apply the normal delta is two ECS desired-count updates and two scaling-resource additions. The two running profiles use the same Terraform resource types.

| Area | Application root |
| --- | --- |
| Network | One VPC; six subnets (public, private app and isolated DB pairs across two AZs); one internet gateway, one EIP, one public NAT gateway; four route tables, six route table associations, two app default routes via that NAT; one free S3 gateway endpoint; four security groups with eight rules. |
| Entry point | One internal ALB, one HTTP listener, one API path rule and two IP target groups; one CloudFront VPC origin and one CloudFront distribution (Price Class 100, dynamic responses uncached). |
| Image and compute | Two ECR repos plus two retention policies; one ECS cluster plus Fargate capacity configuration; three ARM64 Fargate task definitions (Next.js, FastAPI, one-off DB bootstrap) and two ECS services. Running stage adds one backend autoscaling target and one CPU target-tracking policy (60%). |
| Database and credentials | One private, encrypted RDS PostgreSQL 16 `db.t4g.micro` (20 GiB gp3, max 50 GiB, one-day backups) and its subnet group; two Secrets Manager secrets and two versions; three generated passwords/keys; three IAM roles, two managed-policy attachments and two inline policies. FastAPI only receives the restricted `paylink_api` URL and JWT key. The bootstrap execution role alone can read the owner URL. |
| Monitoring | Two CloudWatch log groups (7-day retention), one dashboard, three explicit alarms (ECS, ALB, RDS). AWS may create service-managed objects including CloudFront origin network interfaces, service-linked roles and scaling alarms; they are not separate Terraform plan entries. |

One NAT retains the demonstrated private topology without paying for duplicate NAT/endpoint capacity; losing its AZ can block new task starts and AWS API egress, even if healthy tasks in the other AZ continue serving. The cheaper profile starts one task per tier and disables the RDS standby, so it cannot demonstrate the same failover. Use the full profile when capturing availability evidence; neither profile is a production banking deployment.

## 1. Preflight and review

Run from the repository root in Bash. Use Terraform ≥1.10, Docker Buildx with **linux/arm64** support (native or a preconfigured compatible builder), AWS CLI, Python 3, jq and temporary class-account credentials. Confirm there is no prior stack at the chosen name/key: **do not** overwrite, import, or destroy the older demo. Check class permissions for VPC origins, IAM/PassRole, RDS, S3 and the backend lock object; a valid STS identity alone does not establish these permissions.

```bash
terraform -chdir=cloud_project/terraform fmt -check -recursive
terraform -chdir=cloud_project/terraform init -backend=false -input=false
terraform -chdir=cloud_project/terraform validate
terraform -chdir=cloud_project/terraform test
terraform -chdir=cloud_project/terraform/state init -backend=false -input=false
terraform -chdir=cloud_project/terraform/state validate
aws sts get-caller-identity
docker buildx inspect --bootstrap
```

Before authorization, only run an account-backed `plan -lock=false` against a known, authorized backend that is already configured (no lock object writes); do not run it concurrently with a deployment. AWS identity was unavailable in prep, so the offline test is **not** proof of quotas, permissions, deployed settings or AWS health.

Local containers (native architecture): after local `./scripts/install.sh`, install Playwright Chromium with `.venv/bin/python -m playwright install chromium` or set `CHROMIUM_EXECUTABLE_PATH` to an installed Chromium/Chrome. These use a separate, disposable PostgreSQL container and an Nginx path router to mirror the ALB:

```bash
docker build --build-arg NEXT_PUBLIC_DEMO_ENABLED=true -f cloud_project/docker/frontend.Dockerfile -t paylink-cloud-smoke-frontend .
docker build --target app -f backend/Dockerfile -t paylink-cloud-smoke-backend .
docker build -f cloud_project/docker/migrate.Dockerfile -t paylink-cloud-smoke-bootstrap .
./cloud_project/scripts/smoke_test.sh
```

## 2. After explicit approval: provision state and foundation

**Existing deployment:** The application uses the versioned, encrypted S3 backend in `us-east-1` at `paylink/terraform.tfstate`, with a native S3 lockfile. Reconnect with the existing bucket and key; do not run the bucket-creation or foundation steps again. With authorized read-only credentials, use `aws s3api head-object` for that bucket and key to confirm it exists without downloading state, and `terraform state list` from the initialized application root to confirm it has the expected resources. If either check fails, stop; do not initialize or apply against a replacement key. No state migration is needed to reconnect.

**New deployment only:** Keep the bucket-bootstrap root's local state private and persistent, backed up in an encrypted location outside Git. It tracks only the bucket and its controls, not the application. It must not use the bucket it creates and later removes as its own backend. If an independent, retained administrative state bucket is provided, migrate only this root with `terraform init -migrate-state` to a distinct encrypted, locked key after verifying ownership and backing up the local state. Keep application state and plans out of Git; they can contain credentials despite redacted CLI output.

```bash
umask 077
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION="$AWS_REGION"
STATE=cloud_project/terraform/state
APP=cloud_project/terraform
terraform -chdir="$STATE" init -input=false
terraform -chdir="$STATE" plan -out=state.tfplan
terraform -chdir="$STATE" show state.tfplan
# Review the state-bucket plan before applying it.
terraform -chdir="$STATE" apply state.tfplan
BUCKET=$(terraform -chdir="$STATE" output -raw bucket)
```

Allow up to 15 minutes for newly enabled S3 versioning to propagate before the first state write. Treat old S3 state versions as sensitive. The backend role needs listing for the state bucket, read/write for the exact state key, and read/write/delete for its `.tflock` object.

```bash
terraform -chdir="$APP" init -reconfigure -input=false \
  -backend-config="bucket=$BUCKET" -backend-config="region=$AWS_REGION"
cp "$APP/terraform.tfvars.example" "$APP/terraform.tfvars"
```

In `terraform.tfvars`, choose a unique short `project_name` in the class account, set `image_tag` to a fresh release identifier (e.g. `git rev-parse --short=12 HEAD`), and leave `enable_app_services = false`. Keep the presentation defaults (frontend/backend 2/2, backend 2–4, Multi-AZ DB) or set frontend/backend desired count and backend minimum to 1, backend maximum to 2 and `db_multi_az = false` for rehearsal. Leave `public_demo_enabled = true` only for the authorized synthetic demo window. Any release or demo-flag change requires a new image tag and image build; Next.js embeds the public flag at build time.

```bash
terraform -chdir="$APP" plan -input=false -out=foundation.tfplan
terraform -chdir="$APP" show foundation.tfplan
# Verify account, target state, topology, cost, and no unexpected changes or deletions.
terraform -chdir="$APP" apply foundation.tfplan
./cloud_project/scripts/build_and_push.sh
./cloud_project/scripts/bootstrap_aws_data.sh
```

The foundation creates both ECS services at zero tasks. The bootstrap task runs the tracked migrations, provisions the restricted API role, loads the bank catalog and, if enabled, seeds the synthetic quick-test fixtures. It must exit zero before continuing. Existing demo fixtures are preserved on repeat runs; the demo profiles' regular passwords are random and are not required by quick-test sign-in. Pushes do not force any ECS service changes.

## 3. Enable services and capture evidence

Set `enable_app_services = true` in the same `terraform.tfvars` file and leave the release tag unchanged. Confirm the second plan only enables the desired capacity and autoscaling before applying:

```bash
terraform -chdir="$APP" plan -input=false -out=services.tfplan
terraform -chdir="$APP" show services.tfplan
terraform -chdir="$APP" apply services.tfplan
CLUSTER=$(terraform -chdir="$APP" output -raw ecs_cluster_name)
mapfile -t SERVICES < <(terraform -chdir="$APP" output -json ecs_service_names | jq -r '.[]')
aws ecs wait services-stable --cluster "$CLUSTER" --services "${SERVICES[@]}"
aws ecs describe-services --cluster "$CLUSTER" --services "${SERVICES[@]}" \
  --query 'services[].{name:serviceName,desired:desiredCount,running:runningCount,pending:pendingCount}'
for target in $(terraform -chdir="$APP" output -json alb_target_group_arns | jq -r '.[]'); do
  aws elbv2 describe-target-health --target-group-arn "$target" \
    --query 'TargetHealthDescriptions[].{state:TargetHealth.State,reason:TargetHealth.Reason}'
done
aws cloudfront wait distribution-deployed \
  --id "$(terraform -chdir="$APP" output -raw cloudfront_distribution_id)"
URL=$(terraform -chdir="$APP" output -raw cloudfront_url)
curl --fail --show-error --silent "$URL/api/health"
```

Check that both target groups have the expected healthy replicas and that health reports `{"status":"ok","database":"connected","simulation":true}`. At the CloudFront URL, verify anonymous access, Sai/Siddhardth sign-in, a session reload, a small **synthetic** transfer and matching balance/history/receipt, insights, and sign-out. The browser uses one origin and secure cookies; all demo writes go to the isolated RDS database. Capture captioned, redacted service/network/screens for the report, and record observed metrics and recovery times using the [experiment guide](EXPERIMENTS.md). Load generation, killing a task and RDS failover are separate test actions that must be explicitly authorized before running. The historic screenshots are not proof of this run.

If a target is unhealthy, inspect ECS events, bootstrap/application CloudWatch logs and the ALB target reason; don't print credentials. If the fresh rollout must be stopped, apply a reviewed plan with `enable_app_services = false`. Terraform reconciles the baseline desired count on later applies, so wait for scale-in before unrelated applies or explicitly review any count reset. For a later release rollback, reselect a retained, known-good image tag and plan; a container rollback does not roll back SQL migrations.

## 4. Tear down after separate confirmation

This is intended for ephemeral fixtures only: the RDS instance skips its final snapshot, ECR teardown deletes images, and the state bucket teardown deletes all versioned state objects. Do not use these commands if any account, name, bucket ownership, state or data is unexpected.

```bash
# Confirm explicit approval to delete this exact disposable deployment.
terraform -chdir="$APP" plan -destroy -input=false -out=teardown.tfplan
terraform -chdir="$APP" show teardown.tfplan
terraform -chdir="$APP" apply teardown.tfplan
terraform -chdir="$APP" state list
# Only after the app state is empty and no other deployment uses the bucket:
terraform -chdir="$STATE" plan -destroy -input=false -out=state-teardown.tfplan
terraform -chdir="$STATE" show state-teardown.tfplan
terraform -chdir="$STATE" apply state-teardown.tfplan
```

Use read-only AWS checks/Billing to verify CloudFront, ALB, RDS, NAT/EIP and running tasks are gone. Cost Explorer reporting is delayed. Preserve only sanitized demo evidence, not plan or state copies.
