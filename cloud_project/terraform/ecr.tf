resource "aws_ecr_repository" "frontend" {
  count = 1

  name                 = "${var.project_name}-frontend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-frontend"
  }
}

resource "aws_ecr_repository" "backend" {
  count = 1

  name                 = "${var.project_name}-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-backend"
  }
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  count      = 1
  repository = aws_ecr_repository.frontend[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "backend" {
  count      = 1
  repository = aws_ecr_repository.backend[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

locals {
  frontend_image  = "${aws_ecr_repository.frontend[0].repository_url}:${var.image_tag}"
  backend_image   = "${aws_ecr_repository.backend[0].repository_url}:${var.image_tag}"
  bootstrap_image = "${aws_ecr_repository.backend[0].repository_url}:${var.image_tag}-bootstrap"
}
