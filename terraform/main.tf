module "vpc" {
  source      = "./modules/vpc"
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
}

module "rds" {
  source             = "./modules/rds"
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  vpc_cidr           = var.vpc_cidr
  db_instance_class  = var.db_instance_class
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = var.db_password
}

module "s3" {
  source      = "./modules/s3"
  environment = var.environment
  bucket_name = var.assets_bucket_name
}

module "cdn" {
  source                  = "./modules/cdn"
  environment             = var.environment
  bucket_name             = module.s3.bucket_name
  bucket_domain_name      = module.s3.bucket_domain_name
  bucket_arn              = module.s3.bucket_arn
  use_default_certificate = var.use_default_certificate
  acm_certificate_arn     = var.acm_certificate_arn
}

module "ecs" {
  source      = "./modules/ecs"
  environment = var.environment
  name        = "bluecollar"
}
