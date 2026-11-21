Project Title + Desc + Services + Stack + Initial Thoughts
Title: PayLink On AWS: Banking Transfer Application Deployment and Scaling
PayLink is a peer-to-peer banking transfer application that allows users to manage linked bank accounts, transfer virtual funds, and view transaction history.

Note : The transactions holding money are simulated and don't hold real monetary value and doesn't use external banking integration for safe testing.

Primary Focus:

Understand and Implement cloud concepts & metrics, specifically, scalability, availability, security, monitoring, and cost optimization.

Expected Outcome:

A working AWS-hosted banking transfer simulation with documented deployment, scaling experiments, recovery tests, monitoring observations, and cost analysis.

View profile card for Dheeraj Reddy Karra Dheeraj Reddy Karra
October 21 at 9:10 PM
Project Title + Desc + Services + Stack + Initial Thoughts
Tech Stack:

- Frontend: React, Next.js, TypeScript
- Backend: Python, FastAPI (REST API)
- Database: PostgreSQL
- Containerization: Docker
- Infrastructure as Code: Terraform

View profile card for Dheeraj Reddy Karra Dheeraj Reddy Karra
October 21 at 9:11 PM
Project Title + Desc + Services + Stack + Initial Thoughts
AWS Services (Planned):

- Amazon ECS Fargate: Containerized application deployment and scaling
- Amazon ECR: Docker image storage
- Amazon RDS: Managed PostgreSQL database
- Application Load Balancer (ALB): Traffic distribution and health checks
- Amazon VPC: Network isolation, public/private subnets, and security groups
- Amazon CloudWatch: Application monitoring, logs, and alarms
- AWS IAM: Access control and permissions
- AWS Secrets Manager: Secure application credentials
- NAT Gateway / Internet Gateway: Network connectivity

View profile card for Venkata Sai Kadamati Venkata Sai Kadamati
October 22 at 2:02 PM • 0 WordsLast edited: Thursday, October 22, 2026 2:03 PM CDT
Service Architecture

image.png
(284.82 KB)
View profile card for Venkata Sai Kadamati Venkata Sai Kadamati
October 22 at 2:42 PM • 0 Words
Network Achitecture

image.png
(568.73 KB)
View profile card for Venkata Sai Kadamati Venkata Sai Kadamati
October 22 at 3:10 PM • 31 WordsLast edited: Thursday, October 22, 2026 3:11 PM CDT
Network Achitecture - Professor's Feedback & Queries
Why separate ALB's and what is the purpose - availability?
Look into Fargate option through IaC as it's managed by aws and full integration with other services like VPC and such.
View profile card for Dheeraj Reddy Karra Dheeraj Reddy Karra
October 29 at 10:32 AM
Add-on: We are using S3 storage service for saving the terraform state file safely. This is a good practice over the local terraform state save.

View profile card for Venkata Sai Kadamati Venkata Sai Kadamati
November 11 at 8:23 AM • 47 Words
Project Progress
Initial IaC deployment is done. The site is up, services are healthy, access paths are verified, and core app flows work end to end.

Next Steps:
Review and monitor DB replication
Check load distribution / ALB logs
Move Terraform to remote S3 state
Keep tightening deployment and architecture as needed

View profile card for Dheeraj Reddy Karra Dheeraj Reddy Karra
November 12 at 11:56 AMLast edited: Thursday, November 12, 2026 11:56 AM CST
Project Progress
Screenshots
Authenticated app dashboard
ECS services healthy
Multi-AZ VPC layout

working_ui.png
(120.42 KB)
aws_compute.png
(315.75 KB)
aws network.jpeg
(57.75 KB)
View profile card for Venkata Sai Kadamati Venkata Sai Kadamati
Thu at 12:19 PM • 56 WordsLast edited: Thursday, November 19, 2026 12:36 PM CST
Extensions to the existing project

1. Adding Chatbot (PayBot) - that helps with basic questions + information at both account/transaction level - Would include new AWS AI service- BEDROCK
2. Enhance UI/ UX with dedicated history/balance/transaction page hosting dedicated Visuals and Metrics for quick insights. - Uses Heavily S3
3. Upload Receipts for tracking payment under external Label - Purpose being, Overall budgeting.

Post has recent changes
View profile card for Venkata Sai Kadamati Venkata Sai Kadamati
just now • 34 WordsLast edited: Saturday, November 21, 2026 1:33 AM CST
Progress Update

1. Added Chatbot (Paybot) - Dheeraj Contributed to this

2. Enhanced UI/UX by separating the insights page with lots of visuals to make the page more digestable with information - Venkat Contributed to this
