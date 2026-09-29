terraform {
  required_version = ">= 1.16.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.4"
    }
  }

  # GitLab-managed Terraform state (HTTP backend with locking) on gitlab.rypox.org.
  # Address and credentials come from the pipeline (TF_HTTP_* variables) or, for the
  # first run, from -backend-config arguments; see docs/wiki/anleitung-kontoinhaber.md.
  backend "http" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project    = var.project
      managed-by = "terraform"
    }
  }
}
