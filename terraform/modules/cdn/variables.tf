variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "bucket_name" {
  description = "Origin bucket name"
  type        = string
}

variable "bucket_domain_name" {
  description = "Origin bucket domain name"
  type        = string
}

variable "bucket_arn" {
  description = "Origin bucket ARN for policy generation"
  type        = string
}

variable "use_default_certificate" {
  description = "Use the default CloudFront certificate"
  type        = bool
  default     = true
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for custom CloudFront aliases"
  type        = string
  default     = ""
}
