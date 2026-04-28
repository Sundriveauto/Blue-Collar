variable "environment"          { type = string }
variable "primary_region"       { type = string; default = "us-east-1" }
variable "dr_region"            { type = string; default = "eu-west-1" }
variable "source_db_identifier" { type = string }
variable "assets_bucket_arn"    { type = string }
variable "ecr_registry_id"      { type = string }

# ---------------------------------------------------------------------------
# RDS cross-region read replica
# ---------------------------------------------------------------------------

resource "aws_db_instance" "replica" {
  provider               = aws.dr
  identifier             = "bluecollar-${var.environment}-replica"
  replicate_source_db    = "arn:aws:rds:${var.primary_region}:${data.aws_caller_identity.current.account_id}:db:${var.source_db_identifier}"
  instance_class         = "db.t3.medium"
  storage_encrypted      = true
  skip_final_snapshot    = true
  publicly_accessible    = false
  tags = { Name = "bluecollar-dr-replica-${var.environment}" }
}

# ---------------------------------------------------------------------------
# S3 cross-region replication
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_replication_configuration" "assets" {
  bucket = split(":::", var.assets_bucket_arn)[1]
  role   = aws_iam_role.replication.arn

  rule {
    id     = "replicate-all"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.assets_dr.arn
      storage_class = "STANDARD_IA"
    }
  }
}

resource "aws_s3_bucket" "assets_dr" {
  provider = aws.dr
  bucket   = "bluecollar-assets-dr-${var.environment}"
  tags     = { Name = "BlueCollar Assets DR", Environment = var.environment }
}

resource "aws_s3_bucket_versioning" "assets_dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.assets_dr.id
  versioning_configuration { status = "Enabled" }
}

# ---------------------------------------------------------------------------
# ECR cross-region replication
# ---------------------------------------------------------------------------

resource "aws_ecr_replication_configuration" "main" {
  replication_configuration {
    rule {
      destination {
        region      = var.dr_region
        registry_id = var.ecr_registry_id
      }
    }
  }
}

# ---------------------------------------------------------------------------
# IAM role for S3 replication
# ---------------------------------------------------------------------------

resource "aws_iam_role" "replication" {
  name = "bluecollar-s3-replication-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "replication" {
  role = aws_iam_role.replication.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
        Resource = [var.assets_bucket_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl"]
        Resource = ["${var.assets_bucket_arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ReplicateObject", "s3:ReplicateDelete"]
        Resource = ["${aws_s3_bucket.assets_dr.arn}/*"]
      }
    ]
  })
}

data "aws_caller_identity" "current" {}

provider "aws" {
  alias  = "dr"
  region = var.dr_region
}
