# PayLink on AWS: deployment and service guide

PayLink is a class banking simulation. The live app runs in US East (N. Virginia) and uses Amazon RDS PostgreSQL for all accounts, payments, invitations, and activity. All money and bank data are fictional.

## AWS service inventory

**Total: 12 AWS services.** The table counts the named services used by the deployment, including Fargate as the compute service for ECS. Subnets, NAT, security groups, and endpoints are features of Amazon VPC, not extra services. Command-line tooling and underlying AWS-managed encryption keys are not counted separately.

| AWS service | Purpose in PayLink |
| --- | --- |
| Amazon CloudFront | Public HTTPS entry point; reaches the load balancer through a private VPC origin. |
| Amazon VPC | Separates public, private app, and isolated database subnets across two availability zones. |
| Elastic Load Balancing | One internal Application Load Balancer sends web traffic to Next.js and API requests to FastAPI. |
| Amazon Elastic Container Service (ECS) | Runs and replaces frontend and API tasks; also runs the one-off database bootstrap task. |
| AWS Fargate | Runs the ARM64 containers without servers for the team to manage. |
| Amazon Elastic Container Registry (ECR) | Stores the frontend, API, and database bootstrap images. |
| Amazon Relational Database Service (RDS) | Runs encrypted PostgreSQL in an isolated subnet; only the API can reach it during normal use. |
| AWS Identity and Access Management (IAM) | Gives ECS scoped access to images, logs, and the correct secrets for each task. |
| AWS Secrets Manager | Holds the restricted API database credentials, session-signing secret, and separate database owner credentials. |
| Amazon CloudWatch | Collects logs, shows traffic and health metrics, and monitors CPU usage and unhealthy targets. |
| Amazon Simple Storage Service (S3) | Stores encrypted, versioned remote Terraform application state and its lockfile; also serves image layers via a VPC endpoint. |
| Application Auto Scaling | Uses average API CPU to adjust backend capacity between one and two tasks. |

The class deployment runs one Next.js task, one FastAPI task, and a single-AZ RDS database. At low demo traffic, the estimated cost is $88.06 per month before credits; this is not a bill.

## Remote state and deployment

1. **Confirm scope and identity.** Obtain approval for the AWS account, region, budget, and exact deployment action. Use short-lived credentials and confirm the account before running AWS commands. Do not write to the existing application during setup or recreate the live stack.
2. **Prepare or reconnect state.** For a new stack, create the dedicated state bucket first. Block public access and enable S3 versioning and server-side encryption. Keep the bucket-bootstrap root’s own local state private and backed up outside Git; it tracks only that bucket and its controls. Do not store it in the bucket it must later be able to delete.
3. **Initialize the application root.** Use the approved S3 bucket in the intended region. The application state key is paylink/terraform.tfstate. Terraform encrypts state and uses a native S3 lockfile so two operators cannot change the same state at once. Treat all state versions and saved plans as sensitive, and keep them out of Git. For the existing class stack, reconnect to the same bucket and key rather than creating a new foundation.
4. **Plan and review the foundation.** For a new deployment, review Terraform’s plan for the network, private load balancer, registry, database, and monitoring. Keep both ECS app services at zero tasks until the database is ready. Apply only the approved plan.
5. **Build and bootstrap.** Build the Next.js, FastAPI, and bootstrap images for ARM64 and publish them to ECR with a new release tag. Run the Terraform-defined one-off ECS task. It applies the PostgreSQL schema, creates the restricted API role, and loads synthetic demo data. Verify that the task exits successfully.
6. **Start the services.** Review the second Terraform plan before enabling the frontend and API tasks and backend scaling. Wait until both services are stable and both load balancer target groups are healthy.

## Verification, operation, and teardown

1. **Verify the request path.** Open the CloudFront URL over HTTPS. Confirm the frontend loads and the API health check reports a PostgreSQL connection. Browser requests reach the internal load balancer; only the API connects to RDS for normal app requests.
2. **Verify the web app and ledger.** Check sign-in, rejection of a wrong password, session reload, account opening, transfer, return, invitation acceptance, CSV export, and insights. Use only demo users and fictional funds. A read-only database check should confirm that a repeated request created one original transfer, both payments balanced, and stored balances match the ledger.
3. **Monitor the demo.** Use CloudWatch for logs and the dashboard; review load balancer health and ECS desired and running task counts before presenting. If a deployment is unhealthy, review ECS events, target health, and application logs without exposing credentials.
4. **Keep it running until teardown is approved.** Review a destroy plan for the exact application stack only after separate approval. Confirm the application is removed and no other deployment uses the bucket before considering removal of the state bucket and its versions. A preserved state backup and captured demo evidence serve different purposes; never publish state or credentials as evidence.

The repository runbook, cloud_project/docs/DEPLOYMENT_GUIDE.md, provides command-by-command instructions and safety checks.
