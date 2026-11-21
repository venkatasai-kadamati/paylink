variable "project_name" {
  description = "Short name used for resource naming and tags"
  type        = string
  default     = "paylink"
}

variable "aws_region" {
  description = "AWS region (must support CloudFront VPC origins; us-east-1 is supported except AZ use1-az3)"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR (matches network architecture diagram)"
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs [AZ-A, AZ-B]"
  type        = list(string)
  default     = ["10.42.0.0/24", "10.42.1.0/24"]
}

variable "app_subnet_cidrs" {
  description = "Private application subnet CIDRs [AZ-A, AZ-B]"
  type        = list(string)
  default     = ["10.42.10.0/24", "10.42.11.0/24"]
}

variable "db_subnet_cidrs" {
  description = "Isolated database subnet CIDRs [AZ-A, AZ-B]"
  type        = list(string)
  default     = ["10.42.20.0/24", "10.42.21.0/24"]
}

variable "frontend_desired_count" {
  description = "Desired Next.js Fargate tasks (diagram: 2)"
  type        = number
  default     = 2
}

variable "backend_desired_count" {
  description = "Desired FastAPI Fargate tasks (diagram: 2)"
  type        = number
  default     = 2
}

variable "backend_min_capacity" {
  description = "Autoscaling minimum for backend"
  type        = number
  default     = 2
}

variable "backend_max_capacity" {
  description = "Autoscaling maximum for backend (diagram: scales up to 4)"
  type        = number
  default     = 4
}

variable "frontend_cpu" {
  type    = number
  default = 256
}

variable "frontend_memory" {
  type    = number
  default = 512
}

variable "backend_cpu" {
  type    = number
  default = 256
}

variable "backend_memory" {
  type    = number
  default = 512
}

variable "db_instance_class" {
  description = "RDS instance class (keep small for class credits)"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_multi_az" {
  description = "Enable Multi-AZ standby (matches diagram; costs more)"
  type        = bool
  default     = true
}

variable "db_name" {
  type    = string
  default = "paylink"
}

variable "db_username" {
  type    = string
  default = "paylink_admin"
}

variable "log_retention_days" {
  description = "CloudWatch log retention (short = cheaper)"
  type        = number
  default     = 7
}

variable "public_demo_enabled" {
  description = "Enable synthetic demo login profiles in the API"
  type        = bool
  default     = true
}

variable "enable_nat_gateway" {
  description = "Create NAT Gateway in public AZ-A (required for private tasks to pull images / reach AWS APIs unless you add VPC endpoints)"
  type        = bool
  default     = true
}

variable "create_ecr_repositories" {
  description = "Create ECR repos for frontend/backend images"
  type        = bool
  default     = true
}

variable "frontend_image_tag" {
  description = "ECR image tag for frontend (push before or after apply; service will fail health checks until image exists)"
  type        = string
  default     = "latest"
}

variable "backend_image_tag" {
  description = "ECR image tag for backend"
  type        = string
  default     = "latest"
}
