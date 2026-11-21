resource "random_password" "db" {
  # Alphanumeric only so DATABASE_URL does not need percent-encoding.
  length  = 32
  special = false
}

resource "random_password" "jwt" {
  length  = 48
  special = false
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
    username     = var.db_username
    password     = random_password.db.result
    dbname       = var.db_name
    host         = aws_db_instance.main.address
    port         = tostring(aws_db_instance.main.port)
    database_url = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
    jwt_secret   = random_password.jwt.result
  })
}
