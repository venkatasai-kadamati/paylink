resource "random_password" "db" {
  # Alphanumeric only so DATABASE_URL does not need percent-encoding.
  length  = 32
  special = false
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "api" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db_admin" {
  name                    = "${var.project_name}/bootstrap-db-admin"
  description             = "RDS owner connection for the one-off database bootstrap"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db_admin" {
  secret_id     = aws_secretsmanager_secret.db_admin.id
  secret_string = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.main.endpoint}/${var.db_name}?sslmode=require"
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${var.project_name}/app-credentials"
  description             = "PayLink DB URL, JWT secret, and related runtime credentials"
  recovery_window_in_days = 0 # class project: allow immediate destroy/recreate

  tags = {
    Name = "${var.project_name}-app-secret"
  }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id

  secret_string = jsonencode({
    database_url = "postgresql://paylink_api:${random_password.api.result}@${aws_db_instance.main.endpoint}/${var.db_name}?sslmode=require"
    jwt_secret   = random_password.jwt.result
  })
}
