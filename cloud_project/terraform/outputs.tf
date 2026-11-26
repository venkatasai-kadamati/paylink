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

output "bootstrap_task_definition_arn" {
  value = aws_ecs_task_definition.bootstrap.arn
}

output "bootstrap_network_configuration" {
  value = {
    awsvpcConfiguration = {
      subnets        = aws_subnet.app[*].id
      securityGroups = [aws_security_group.ecs_backend.id]
      assignPublicIp = "DISABLED"
    }
  }
}

output "build_config" {
  value = {
    region              = var.aws_region
    image_tag           = var.image_tag
    public_demo_enabled = tostring(var.public_demo_enabled)
  }
}

output "ecs_service_names" {
  value = [aws_ecs_service.frontend.name, aws_ecs_service.backend.name]
}

output "alb_target_group_arns" {
  value = [aws_lb_target_group.frontend.arn, aws_lb_target_group.backend.arn]
}
