output "vpc_id" {
  value = aws_vpc.main.id
}

output "availability_zones" {
  value = local.azs
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "app_subnet_ids" {
  value = aws_subnet.app[*].id
}

output "db_subnet_ids" {
  value = aws_subnet.db[*].id
}

output "alb_dns_name" {
  description = "Internal ALB DNS (not publicly reachable; CloudFront VPC origin uses this)"
  value       = aws_lb.app.dns_name
}

output "alb_arn" {
  value = aws_lb.app.arn
}

output "cloudfront_domain_name" {
  description = "Public HTTPS entry - use this as the app URL"
  value       = aws_cloudfront_distribution.app.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "vpc_origin_id" {
  value = aws_cloudfront_vpc_origin.alb.id
}

output "ecr_frontend_repository_url" {
  value = try(aws_ecr_repository.frontend[0].repository_url, null)
}

output "ecr_backend_repository_url" {
  value = try(aws_ecr_repository.backend[0].repository_url, null)
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "app_secret_arn" {
  description = "Secrets Manager ARN holding database_url and jwt_secret"
  value       = aws_secretsmanager_secret.app.arn
}

output "cloudwatch_dashboard_name" {
  value = aws_cloudwatch_dashboard.main.dashboard_name
}

output "next_steps" {
  value = <<-EOT
    1) After apply: ../scripts/build_and_push.sh
    2) REQUIRED data bootstrap (migrations + banks + Sai/Siddhardth quick-test profiles):
         ../scripts/bootstrap_aws_data.sh
       (or at minimum: ../scripts/run_migrations_ecs.sh which also seeds demo profiles)
       Without this, Quick test sign-in returns 503.
    3) Verify: curl cloudfront_url/api/health and click Sai / Siddhardth on the UI.
    4) When finished: terraform destroy to stop credit burn.
  EOT
}
