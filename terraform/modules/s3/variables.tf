variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name for static assets"
  type        = string
}

variable "force_destroy" {
  description = "Allow Terraform to destroy bucket contents when deleting"
  type        = bool
  default     = false
}
