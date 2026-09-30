# Anleitung Altsysteme (Kapitel 11)

Stand: 2026-09-30 · Fortsetzung der [Anleitung Anwendung](anleitung-anwendung.md) (Kapitel 6–10). Gehört zu Phase 3 „Altsysteme und Migration" ([Übersicht](uebersicht.md), [Altsysteme & Migration](architektur-migration.md)).

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

Es gelten die Grundsätze aus [Kapitel 0](anleitung-kontoinhaber.md#0-grundsätze):
jeder Schritt nennt Ziel, Ort, Ergebnis und Notiz; 👁 = nur lesend,
✎ = verändernd (mit Rückweg); keine Geheimnisse ins Protokoll.

## 11. Altsysteme, Keycloak-Realm und Zugangsdaten

Für den Betrieb ist **keine Handarbeit nötig**. Dieses Kapitel beschreibt,
was automatisch entsteht, wo die Einstellungen liegen und wie man Passwörter
oder Schlüssel ändert.

### 11.1 Was die Pipelines anlegen 👁

| Was | Wo | Angelegt von |
|---|---|---|
| Versorger-Altsystem | `https://kundenportal-versorger.rypox.com` | Pipeline des privaten GitLab-Projekts `saas/kundenportal-demo/legacy-versorger` (Branch `main`): Image nach Nexus, [Ansible](glossar.md#ansible)-Deploy auf den eigenen Server, nginx mit TLS |
| Telko-Altsystem | `https://kundenportal-telko.rypox.com` | Pipeline von `saas/kundenportal-demo/legacy-telko`, ebenso |
| [Realm](glossar.md#realm) `telko` im [Keycloak](glossar.md#keycloak) `https://id.rypox.net` | Einstellungen, User-Profile mit `subscriberId`, Client `kundenportal-migration` (nur Password Grant), Bernd und Carla | derselbe Deploy von `legacy-telko`: `kcadm.sh` im Keycloak-Container importiert den Realm, **wenn er fehlt** |
| Zugangsdaten für die Lambdas | [Parameter Store](glossar.md#ssm-parameter-store) `/kundenportal/legacy/…` (drei SecureStrings) | Terraform in der Pipeline des Projekts `saas/kundenportal-demo/platform` (`infra/terraform/legacy-parameters.tf`) |

Die Secrets der Altsysteme (API-Schlüssel, Demo-Passwort, Pepper der Telko,
Keycloak-Admin, Client-Secret) liegen verschlüsselt im Ansible-Vault des
jeweiligen Repositorys: `ansible/inventory/group_vars/legacy/vault.yml`
(Vorlage `vault.yml.example` daneben, Passwort des gemeinsamen saas-Vaults,
in der CI aus `ANSIBLE_VAULT_PASSWORD_B64`). Die Pipeline des Projekts
`platform` erhält dieselben Werte als CI/CD-Variablen `TF_VAR_legacy_utility_api_key`,
`TF_VAR_legacy_telco_api_key` und `TF_VAR_keycloak_migration_client_secret`.

### 11.2 Passwort eines Telko-Demo-Kunden ändern ✎

Ziel: anderes Passwort für Bernd oder Carla im Realm `telko`.
Ort: https://id.rypox.net/admin/ → Realm **telko** → **Users** → Nutzer →
Reiter **Credentials** → **Reset password**, **Temporary** aus.

Ergebnis: Die Anmeldung am Portal mit Telko-Zugang nutzt ab sofort das neue
Passwort (die Lazy Migration fragt Keycloak).
Notiz: „Telko-Passwort von … geändert am …" (ohne Passwort).
Rückweg: Passwort erneut setzen.

Hinweise:
- Der Live-Test (E2E) meldet Bernd und Carla mit dem Demo-Passwort an
  (GitHub-Environment-Secret `LEGACY_DEMO_PASSWORD`). Wer das Passwort dauerhaft
  ändert, ändert es auch dort und im Vault (`vault_demo_password`), sonst
  scheitert der Test bzw. setzt ein Neuimport (11.4) das alte Passwort zurück.
- Die Passwörter im Altsystem selbst (REST-Prüfung, Export) stammen ebenfalls
  aus `vault_demo_password`; der Beispieldaten-Reset des Altsystems erzeugt sie
  neu.

### 11.3 Client-Secret oder API-Schlüssel ändern ✎

Ziel: neues Secret für `kundenportal-migration` oder neuer API-Schlüssel eines
Altsystems. Der Wert muss an zwei Stellen gleich sein.

1. Neuen Zufallswert erzeugen, z. B. `openssl rand -base64 32`.
2. Im Repository des Altsystems: `ansible-vault edit
   ansible/inventory/group_vars/legacy/vault.yml` (Passwortdatei
   `~/vault-pw.txt`), Wert von `vault_keycloak_client_secret` bzw.
   `vault_legacy_api_key` ersetzen, committen und auf `main` pushen.
3. In https://gitlab.rypox.org/saas/kundenportal-demo/platform/-/settings/ci_cd
   unter **Variables** die passende Variable ersetzen
   (`TF_VAR_keycloak_migration_client_secret`, `TF_VAR_legacy_utility_api_key`
   oder `TF_VAR_legacy_telco_api_key`) und die Pipeline des Projekts
   `platform` laufen lassen (Job **apply** starten).
4. Nur beim Client-Secret: Der Realm existiert schon, der Deploy importiert ihn
   deshalb nicht neu. Entweder das Secret in der Admin-Konsole setzen (Realm
   **telko** → **Clients** → `kundenportal-migration` → **Credentials**) oder
   den Deploy einmal mit `-e keycloak_realm_recreate=true` ausführen (legt den
   Realm neu an; von Hand geänderte Passwörter gehen dabei verloren).

Ergebnis: Altsystem bzw. Keycloak und SSM-Parameter tragen denselben Wert; die
Lambdas lesen ihn beim nächsten Kaltstart.
Rückweg: alten Wert an beiden Stellen wieder eintragen.

### 11.4 Realm neu anlegen ✎

Ziel: Änderungen an der Realm-Definition
(`ansible/templates/telko-realm.json.j2` in `legacy-telko`) übernehmen oder
einen verbastelten Realm zurücksetzen.
Ort: Repository `legacy-telko`. In `ansible/inventory/group_vars/legacy/vars.yml`
vorübergehend `keycloak_realm_recreate: true` setzen, auf `main` pushen (die
Pipeline deployt), danach wieder `false` committen. Alternativ lokal mit
SSH-Zugang: `cd ansible && ansible-playbook deploy.yml -e keycloak_realm_recreate=true`.

Ergebnis: Der Realm wird gelöscht und aus der Vorlage neu importiert.
Rückweg: keiner nötig — die Vorlage ist die Quelle.

### 11.5 Alles abschalten ✎

- Portal-Zugriff: CI/CD-Variable `TF_VAR_legacy_enabled` im Projekt
  `platform` auf `false`, Pipeline laufen lassen → Terraform entfernt die
  SSM-Parameter; Anmeldungen von Altkunden scheitern danach.
- Realm: Admin-Konsole → Realm **telko** → **Realm settings** → **Action** →
  **Delete** (ein erneuter Deploy legt ihn wieder an).
- Altsysteme: auf dem Server `docker compose down` im Verzeichnis
  `/opt/data/container/kundenportal-demo/legacy-versorger` bzw. `…/legacy-telko`.
