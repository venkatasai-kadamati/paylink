locals {
  bootstrap_secrets = [
    { name = "ADMIN_DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_admin.arn },
    { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:database_url::" }
  ]
}

resource "aws_ecs_task_definition" "bootstrap" {
  family                   = "${var.project_name}-bootstrap"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.bootstrap_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "bootstrap"
    image     = local.bootstrap_image
    essential = true
    environment = [
      { name = "PUBLIC_DEMO_ENABLED", value = tostring(var.public_demo_enabled) }
    ]
    secrets = local.bootstrap_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.backend.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "bootstrap"
      }
    }
  }])

  depends_on = [
    aws_iam_role_policy_attachment.bootstrap_execution_managed,
    aws_iam_role_policy.bootstrap_execution_secrets,
    aws_secretsmanager_secret_version.db_admin,
    aws_secretsmanager_secret_version.app,
  ]
}
