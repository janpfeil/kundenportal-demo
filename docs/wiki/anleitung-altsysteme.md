# Anleitung Altsysteme (Kapitel 11)

Stand: 2026-09-30 · Fortsetzung der [Anleitung Anwendung](anleitung-anwendung.md) (Kapitel 6–10). Gehört zu Phase 3 „Altsysteme und Migration" ([Übersicht](uebersicht.md), [Architektur](architektur.md) §9).

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

Es gelten die Grundsätze aus [Kapitel 0](anleitung-kontoinhaber.md#0-grundsätze):
jeder Schritt nennt Ziel, Ort, Ergebnis und Notiz; 👁 = nur lesend,
✎ = verändernd (mit Rückweg); keine Geheimnisse ins Protokoll. Klickpfade,
die nicht anhand der Hersteller-Dokumentation geprüft werden konnten, sind mit
„(Stand 09/2026, nicht selbst geprüft)" markiert.

## 11. Keycloak der Telko und Zugang der Altsysteme

Das Telko-Altsystem meldet seine Kunden über den eigenen
[Keycloak](glossar.md#keycloak) unter `id.rypox.net` an. Den
[Realm](glossar.md#realm) `telko` mit den Demo-Kunden und dem Client für die
Passwortprüfung legt [Terraform](glossar.md#terraform) an, ausgeführt von der
GitLab-Pipeline im Projekt `saas/kundenportal-demo/platform`
(`infra/terraform/keycloak.tf`). Terraform braucht dafür einmalig einen
eigenen Zugang zum Keycloak: einen **Service-Client** im Realm `master`. Den
legt der Inhaber an — alles Weitere erledigt die Pipeline.

### 11.0 Reihenfolge

| Nr. | Handlung | Abschnitt | Art |
|---|---|---|---|
| 1 | Service-Client `terraform-kundenportal` im Keycloak anlegen | 11.1 | ✎ |
| 2 | Client-Secret als CI/CD-Variable im Projekt `platform` hinterlegen | 11.2 | ✎ |
| 3 | Rechte der Terraform-Rolle für verschlüsselte Parameter lokal anwenden | 11.3 | ✎ |
| 4 | Pipeline laufen lassen: Plan prüfen, `apply` | 11.4 | 👁 / ✎ |
| 5 | Ergebnis ansehen: Realm, Client, Demo-Kunden, SSM-Parameter | 11.5 | 👁 |

Die übrigen Werte (API-Schlüssel der Altsysteme, Demo-Passwort) erzeugt der
Agent zufällig und legt sie direkt als CI/CD-Variablen an; sie stehen nirgends
im Repository.

### 11.1 Service-Client im Keycloak anlegen ✎

Ziel: Terraform darf den Realm `telko` anlegen und verwalten — sonst nichts.
Ort: Admin-Konsole `https://id.rypox.net/admin/`, Realm `master`.
Grundlage: https://www.keycloak.org/docs/latest/server_admin/#_service_accounts
und https://registry.terraform.io/providers/keycloak/keycloak/latest/docs
(Abschnitt „Client Credentials Grant Setup").

1. In der Admin-Konsole anmelden; links oben den Realm **master** wählen.
2. Links **Clients**, dann **Create client**.
3. **Client type**: `OpenID Connect`; **Client ID**: `terraform-kundenportal`;
   **Name**: `Terraform Kundenportal (GitLab CI)`. **Next**.
4. **Client authentication**: an. **Authorization**: aus.
   **Authentication flow**: nur **Service accounts roles** anhaken; **Standard
   flow** und **Direct access grants** abhaken. **Next**, dann **Save**.
5. Reiter **Service accounts roles** → **Assign role** → Filter **Filter by
   realm roles** → `create-realm` auswählen → **Assign**
   (Stand 09/2026, nicht selbst geprüft: bei manchen Versionen heißt der
   Filter „Realm roles").
   Warum nur diese Rolle: Wer einen Realm anlegt, erhält in Keycloak
   automatisch die Verwaltungsrechte für genau diesen Realm (Client
   `telko-realm` im Realm `master`). Andere Realms bleiben unberührt.
6. Reiter **Credentials** → **Client Secret** kopieren (Schaltfläche neben dem
   Feld). Nicht notieren, direkt in Schritt 11.2 einfügen.

Ergebnis: Client `terraform-kundenportal` mit Dienstkonto und der Rolle
`create-realm`.
Notiz: „11.1 erledigt am …" (ohne Secret).
Rückweg: **Clients** → `terraform-kundenportal` → **Action** → **Delete**.
Hat Terraform den Realm schon angelegt, bleibt er bestehen; löschen über
**Realm settings** → **Action** → **Delete** im Realm `telko` oder über die
Pipeline (11.4 mit `TF_VAR_legacy_enabled=false`).

### 11.2 Client-Secret als CI/CD-Variable hinterlegen ✎

Ziel: Die Pipeline kennt das Secret, das Repository nicht.
Ort: https://gitlab.rypox.org/saas/kundenportal-demo/platform → **Settings** →
**CI/CD** → **Variables** → **Add variable**.

| Key | Value | Einstellungen |
|---|---|---|
| `TF_VAR_keycloak_client_secret` | Secret aus 11.1 Schritt 6 | **Masked**, **Protected**, Typ **Variable** |

Ergebnis: Die Variable erscheint in der Liste mit maskiertem Wert.
Notiz: „11.2 erledigt".
Rückweg: Variable in derselben Liste löschen (Stift → **Delete variable**).

Die folgenden Variablen legt der Agent an (zur Kontrolle, 👁): 
`TF_VAR_legacy_enabled` (`true`), `TF_VAR_telco_demo_password`,
`TF_VAR_legacy_utility_api_key`, `TF_VAR_legacy_telco_api_key` — dieselben
Werte stehen als `DEMO_PASSWORD` bzw. `LEGACY_API_KEY` in den privaten
Projekten `legacy-versorger` und `legacy-telko`.

### 11.3 Rechte für verschlüsselte Parameter lokal anwenden ✎

Ziel: Die Terraform-Rolle der Pipeline darf die API-Schlüssel und das
Keycloak-Secret als [SecureString](glossar.md#ssm-parameter-store) in den
[Parameter Store](glossar.md#ssm-parameter-store) schreiben. Dafür braucht sie
den AWS-eigenen Schlüssel `aws/ssm` — nur über SSM, sonst nicht. Diese
Änderung betrifft die [Permissions Boundary](glossar.md#permissions-boundary),
die nur der Inhaber lokal ändert (Kapitel 5).
Ort: eigenes Terminal im Repository, Verzeichnis `infra/terraform`.

1. `aws login --profile kundenportal` (Kapitel 4.4), dann
   `export AWS_PROFILE=kundenportal`.
2. Backend wie in Kapitel 5.3 initialisieren (GitLab-Token als
   `TF_HTTP_PASSWORD`), dann
   `terraform plan -target=aws_iam_policy.ci_boundary -target=aws_iam_role_policy.gitlab_foundation`.
3. 👁 Der Plan zeigt genau zwei Änderungen: in beiden Richtlinien kommt der
   Block `SecureParametersViaSsm` mit `kms:Encrypt`, `kms:Decrypt`,
   `kms:GenerateDataKey` und der Bedingung `kms:ViaService =
   ssm.eu-central-1.amazonaws.com` hinzu. Nichts wird gelöscht.
4. Derselbe Befehl mit `apply`, Bestätigung mit `yes`.

Ergebnis: „Apply complete! Resources: 0 added, 2 changed, 0 destroyed."
Notiz: „11.3 erledigt".
Rückweg: Commit mit dem Block zurücknehmen, Schritt 2–4 wiederholen.

### 11.4 Pipeline laufen lassen 👁 / ✎

Ziel: Realm, Client, Demo-Kunden und SSM-Parameter entstehen.
Ort: https://gitlab.rypox.org/saas/kundenportal-demo/platform → **Build** →
**Pipelines**. Der Agent setzt vorher den Pin `SOURCE_REF` auf den Commit mit
diesem Stand und startet die Pipeline.

1. 👁 Job **plan** öffnen, Artefakt `plan.txt` ansehen: neu sind
   `keycloak_realm.telco[0]`, `keycloak_realm_user_profile.telco[0]`,
   `keycloak_openid_client.portal_migration[0]`,
   `keycloak_openid_user_attribute_protocol_mapper.subscriber_id[0]`, zwei
   `keycloak_user.telco[…]` und sieben `aws_ssm_parameter.legacy[…]`. Keine
   Änderung und keine Löschung an Bestehendem (Rollen, Budget, Parameter).
2. ✎ Job **apply** starten (Play-Knopf).

Ergebnis: „Apply complete! Resources: 13 added, 0 changed, 0 destroyed."
Notiz: „11.4 erledigt, Pipeline #…".
Rückweg: CI/CD-Variable `TF_VAR_legacy_enabled` auf `false`, Pipeline erneut
laufen lassen und `apply` starten — Terraform entfernt Realm und Parameter
wieder (die Portal-Anmeldung für Telko-Kunden funktioniert dann nicht mehr).

### 11.5 Ergebnis ansehen 👁

1. Keycloak-Admin-Konsole → Realm **telko** → **Users**: zwei Nutzer
   (`b.yilmaz@example.net`, `carla.schulz@example.net`), Reiter
   **Attributes** zeigt `subscriberId`.
2. **Clients** → `kundenportal-migration`: Zugriffsart vertraulich, nur
   „Direct access grants".
3. AWS-Konsole → **Systems Manager** → **Parameter Store**, Filter
   `/kundenportal/legacy/`: sieben Parameter, davon drei vom Typ
   **SecureString** (Werte nicht aufdecken).

Notiz: „Kapitel 11 abgeschlossen am …".
