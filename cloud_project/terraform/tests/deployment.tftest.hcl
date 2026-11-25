mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = <<-JSON
        {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"sts:AssumeRole","Principal":{"Service":"ecs-tasks.amazonaws.com"}}]}
      JSON
    }
  }

  mock_data "aws_availability_zones" {
    defaults = {
      names = ["us-east-1a", "us-east-1b"]
    }
  }
}

mock_provider "random" {}

run "foundation_before_bootstrap" {
  command = plan

  assert {
    condition     = aws_ecs_service.frontend.desired_count == 0 && aws_ecs_service.backend.desired_count == 0 && length(aws_appautoscaling_target.backend) == 0
    error_message = "No app replicas or autoscaling may start before the database bootstrap."
  }

  assert {
    condition     = [for s in local.bootstrap_secrets : s.name] == ["ADMIN_DATABASE_URL", "DATABASE_URL"]
    error_message = "The one-off task must inject owner and restricted DB credentials as secrets."
  }
}

run "presentation_profile" {
  command = plan

  variables {
    enable_app_services = true
  }

  assert {
    condition     = aws_ecs_service.frontend.desired_count == 2 && aws_ecs_service.backend.desired_count == 2 && aws_appautoscaling_target.backend[0].max_capacity == 4
    error_message = "The presentation profile should start two copies of each service and scale the API to four."
  }

  assert {
    condition     = aws_lb.app.internal && !aws_db_instance.main.publicly_accessible && aws_db_instance.main.multi_az
    error_message = "Keep the ALB and the Multi-AZ database private."
  }
}

run "lower_cost_profile" {
  command = plan

  variables {
    enable_app_services    = true
    frontend_desired_count = 1
    backend_desired_count  = 1
    backend_min_capacity   = 1
    backend_max_capacity   = 2
    db_multi_az            = false
    public_demo_enabled    = false
  }

  assert {
    condition     = aws_ecs_service.frontend.desired_count == 1 && aws_ecs_service.backend.desired_count == 1 && aws_appautoscaling_target.backend[0].min_capacity == 1 && !aws_db_instance.main.multi_az && output.build_config.public_demo_enabled == "false"
    error_message = "The lower-cost plan must keep single-copy capacity and respect the frontend demo build setting."
  }
}
