resource "aws_db_subnet_group" "this" {
  name       = "bluecollar-${var.environment}-db-subnets"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "bluecollar-${var.environment}-db-subnet-group"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_security_group" "rds" {
  name        = "bluecollar-${var.environment}-rds-sg"
  description = "RDS security group for BlueCollar"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "bluecollar-${var.environment}-rds-sg"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_db_instance" "this" {
  identifier              = "bluecollar-${var.environment}-db"
  engine                  = "postgres"
  engine_version          = "15.8"
  instance_class          = var.db_instance_class
  allocated_storage       = 20
  storage_type            = "gp3"
  name                    = var.db_name
  username                = var.db_username
  password                = var.db_password
  db_subnet_group_name    = aws_db_subnet_group.this.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  multi_az                = false
  publicly_accessible     = false
  storage_encrypted       = true
  backup_retention_period = 7
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = false

  tags = {
    Name        = "bluecollar-${var.environment}-db"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
