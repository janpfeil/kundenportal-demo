# Telco legacy sign-in on the own Keycloak (fachkonzept §7.3, phase 3): a realm with the
# telco's demo customers and a confidential client the Cognito migrate user trigger uses
# to check a telco customer's password (resource owner password grant, server to server).

locals {
  legacy = var.legacy_enabled ? 1 : 0

  # Demo persons of the telco legacy system (legacy-telko, src/seed.ts). Sign-in name is
  # the mail address; the subscriber id links the account to the legacy record.
  telco_users = {
    bernd = { email = "b.yilmaz@example.net", first = "Bernd", last = "Yilmaz", subscriber = "T/88-4711" }
    carla = { email = "carla.schulz@example.net", first = "Carla", last = "Schulz", subscriber = "T/88-4712" }
  }
}

resource "keycloak_realm" "telco" {
  count        = local.legacy
  realm        = "telko"
  display_name = "Telko Kundenkonto (Demo)"
  enabled      = true

  login_with_email_allowed = true
  duplicate_emails_allowed = false
  registration_allowed     = false
  reset_password_allowed   = false
  remember_me              = false

  access_token_lifespan = "5m"
  ssl_required          = "external"

  security_defenses {
    brute_force_detection {
      permanent_lockout                = false
      max_login_failures               = 10
      wait_increment_seconds           = 60
      max_failure_wait_seconds         = 900
      failure_reset_time_seconds       = 43200
      quick_login_check_milli_seconds  = 1000
      minimum_quick_login_wait_seconds = 60
    }
  }
}

# Keycloak 24+ keeps only declared user attributes; subscriberId is visible to admins only.
resource "keycloak_realm_user_profile" "telco" {
  count    = local.legacy
  realm_id = keycloak_realm.telco[0].id

  attribute {
    name         = "username"
    display_name = "$${username}"
    validator {
      name   = "length"
      config = { min = "3", max = "255" }
    }
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }

  attribute {
    name               = "email"
    display_name       = "$${email}"
    required_for_roles = ["user"]
    validator {
      name = "email"
    }
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }

  attribute {
    name         = "firstName"
    display_name = "$${firstName}"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }

  attribute {
    name         = "lastName"
    display_name = "$${lastName}"
    permissions {
      view = ["admin", "user"]
      edit = ["admin"]
    }
  }

  attribute {
    name         = "subscriberId"
    display_name = "Kundennummer Telko"
    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }
}

resource "keycloak_openid_client" "portal_migration" {
  count       = local.legacy
  realm_id    = keycloak_realm.telco[0].id
  client_id   = "kundenportal-migration"
  name        = "Kundenportal: Passwortprüfung bei der Übernahme"
  enabled     = true
  access_type = "CONFIDENTIAL"

  # Only the password grant: no browser flows, no service account.
  standard_flow_enabled        = false
  implicit_flow_enabled        = false
  direct_access_grants_enabled = true
  service_accounts_enabled     = false
  full_scope_allowed           = false
}

resource "keycloak_openid_user_attribute_protocol_mapper" "subscriber_id" {
  count          = local.legacy
  realm_id       = keycloak_realm.telco[0].id
  client_id      = keycloak_openid_client.portal_migration[0].id
  name           = "subscriber-id"
  user_attribute = "subscriberId"
  claim_name     = "subscriber_id"

  add_to_access_token = true
  add_to_id_token     = false
  add_to_userinfo     = false
}

resource "keycloak_user" "telco" {
  for_each = var.legacy_enabled ? local.telco_users : {}
  realm_id = keycloak_realm.telco[0].id
  username = each.value.email
  email    = each.value.email

  email_verified = true
  first_name     = each.value.first
  last_name      = each.value.last
  enabled        = true

  attributes = {
    subscriberId = each.value.subscriber
  }

  initial_password {
    value     = var.telco_demo_password
    temporary = false
  }

  depends_on = [keycloak_realm_user_profile.telco]

  lifecycle {
    precondition {
      condition     = length(var.telco_demo_password) >= 12
      error_message = "Set TF_VAR_telco_demo_password (at least 12 characters)."
    }
  }
}
