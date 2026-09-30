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
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.9"
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

# Own Keycloak (id.rypox.net): realm of the telco's legacy system (phase 3). The provider
# signs in with a service client of the master realm (client credentials); the owner
# creates it once, see docs/wiki/anleitung-altsysteme.md. Without legacy_enabled nothing
# is read or changed there, so the pipeline also runs before that client exists.
provider "keycloak" {
  url           = var.keycloak_url
  realm         = "master"
  client_id     = var.keycloak_client_id
  client_secret = var.keycloak_client_secret
  initial_login = false
}
