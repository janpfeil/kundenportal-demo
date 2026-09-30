# Anleitung Fundament (Kapitel 4–5)

Stand: 2026-09-30 · Fortsetzung der [Anleitung Kontoinhaber](anleitung-kontoinhaber.md) (Kapitel 0–3, Grundsätze). Weiter geht es in der [Anleitung Anwendung](anleitung-anwendung.md) (Kapitel 6–10).

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

Es gelten die Grundsätze aus [Kapitel 0](anleitung-kontoinhaber.md#0-grundsätze):
jeder Schritt nennt Ziel, Ort, Ergebnis und Notiz; 👁 = nur lesend,
✎ = verändernd (mit Rückweg); keine Geheimnisse ins Protokoll. Klickpfade,
die nicht anhand der Hersteller-Dokumentation geprüft werden konnten, sind mit
„(Stand 09/2026, nicht selbst geprüft)" markiert.

## 4. Alltagszugang einrichten

### 4.0 Reihenfolge aller Inhaber-Handlungen

Die Kapitel 4–10 bauen aufeinander auf. Überblick:

| Nr. | Handlung | Kapitel (Seite) | Art |
|---|---|---|---|
| 1 | IAM-Benutzer `jan-admin` mit MFA anlegen, `aws login` einrichten | 4.1–4.4 | ✎ |
| 2 | Lambda-Kontolimit prüfen, ggf. Erhöhung beantragen | 4.5 | 👁 / ✎ |
| 3 | Terraform-Erstlauf lokal: GitLab-Token, `init`, `apply` | 5.1–5.4 | ✎ |
| 4 | SNS-Abo bestätigen, Budget und Rollen ansehen | 5.5–5.6 | ✎ / 👁 |
| 5 | GitLab: Branch-Schutz prüfen, Deploy-Key, CI/CD-Variablen | 6.1–6.3 ([Anwendung](anleitung-anwendung.md)) | ✎ |
| 6 | (Agent legt `.gitlab-ci.yml` im Plattform-Projekt an) | 6.4 (erledigt 29.09.2026) | — |
| 7 | Plan-Job ansehen (grün); `apply` nur, wenn der Plan Änderungen zeigt | 6.5 ([Anwendung](anleitung-anwendung.md)) | 👁 / ✎ |
| 8 | CDK-Bootstrap lokal, GitHub-Environment `production` | 7 ([Anwendung](anleitung-anwendung.md)) | ✎ |
| 9 | Erster Deploy mit DNS-Validierung, CNAME, Test, DLQ-Probe, Teardown-Probe | 8 ([Anwendung](anleitung-anwendung.md)) | ✎ |
| 10 | Repository öffentlich schalten | 10 ([Anwendung](anleitung-anwendung.md)) | ✎ |

### 4.1 Warum ein IAM-Benutzer und nicht IAM Identity Center 👁

AWS empfiehlt für Menschen eigentlich [IAM Identity Center](glossar.md#iam-identity-center).
Das setzt aber [AWS Organizations](glossar.md#aws-organizations) voraus, und
der Beitritt zu AWS Organizations wechselt ein Konto automatisch vom
[Free Plan](glossar.md#free-plan) in den Paid Plan
[B: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html].
Deshalb wird der Alltagszugang ein [IAM-Benutzer](glossar.md#iam-benutzer)
mit Konsolen-Passwort und MFA — **ohne** [Access Keys](glossar.md#access-keys).
Für die Kommandozeile holt `aws login` kurzlebige Anmeldedaten über die
Konsolenanmeldung (4.4).

### 4.2 IAM-Benutzer anlegen ✎

Ziel: ein persönlicher Zugang mit vollen Rechten im Konto, damit der
Root-Benutzer nur noch für Konto- und Abrechnungsfragen nötig ist.
Grundlage: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html

1. Als Root anmelden (Kapitel 3.1), in die Suchleiste **IAM** eingeben, den
   Dienst öffnen.
2. Links **Users**, dann **Create user**.
3. **User name**: `jan-admin`.
4. **Provide user access to the AWS Management Console** anhaken. Bei der
   Frage, wie der Zugang eingerichtet werden soll, **I want to create an IAM
   user** wählen (nicht die Identity-Center-Empfehlung) (Stand 09/2026, nicht
   selbst geprüft).
5. **Console password**: **Custom password**, ein langes Zufallspasswort aus
   dem Passwortmanager.
6. **Users must create a new password at next sign-in** **abhaken** (der
   Benutzer ist man selbst). **Next**.
7. **Permissions options**: **Attach policies directly**, in der Liste
   `AdministratorAccess` suchen und anhaken. **Next**.
8. Zusammenfassung prüfen, **Create user**.
9. Ergebnis: Seite „Retrieve password" mit der **Console sign-in URL**
   (Form `https://<Kontonummer>.signin.aws.amazon.com/console`). Die URL als
   Lesezeichen speichern. **Download .csv file** ist nicht nötig (enthält das
   Passwort im Klartext).

Notieren: Benutzername, Datum (Passwort nur im Passwortmanager).

Rückweg: IAM → **Users** → `jan-admin` → **Delete**. Kosten: keine.

Optional ✎: Unter **IAM** → **Dashboard** → **AWS Account** →
**Account Alias** → **Create** einen Alias wie `rypox-kundenportal`
vergeben; die Anmelde-URL wird dann `https://rypox-kundenportal.signin.aws.amazon.com/console`.
Aliase sind weltweit eindeutig; Rückweg: **Delete** am selben Ort.

### 4.3 MFA für den IAM-Benutzer ✎

Ziel: auch der Alltagszugang braucht einen zweiten Faktor. Sobald ein
MFA-Gerät zugeordnet ist, verlangt die Konsole bei jeder Anmeldung dieses
Benutzers den Code — damit auch `aws login`, das über die Konsolenanmeldung
läuft. Grundlage: https://docs.aws.amazon.com/IAM/latest/UserGuide/enable-virt-mfa-for-iam-user.html

1. Als Root abmelden. Die Console sign-in URL aus 4.2 öffnen, als
   `jan-admin` mit dem neuen Passwort anmelden.
2. Oben rechts auf den Benutzernamen klicken, **Security credentials**.
3. Abschnitt **Multi-factor authentication (MFA)** → **Assign MFA device**.
4. Gerätename `jan-admin-handy`, **Authenticator app**, **Next**.
5. **Show QR code** scannen, zwei aufeinanderfolgende Codes eintragen,
   **Add MFA**.
6. Abmelden, neu anmelden: Nach dem Passwort wird der Code verlangt.

Ab jetzt: **alle weiteren Konsolenschritte als `jan-admin`**, nicht als Root.

Notieren: MFA für `jan-admin` aktiv (ja/nein).

Rückweg: am selben Ort **Remove** (nicht empfohlen).

### 4.4 `aws login` auf dem eigenen Rechner ✎

Ziel: Terraform, CDK und die AWS CLI lokal nutzen, ohne dauerhafte
Schlüssel auf der Platte. [`aws login`](glossar.md#aws-login) öffnet den
Browser, man meldet sich wie in 4.3 an, und die CLI erhält kurzlebige
Anmeldedaten, die sie selbst erneuert
[B: `aws login help`, AWS CLI 2.36]. Verändert wird nur die lokale
Konfiguration, nichts im AWS-Konto.

1. Version prüfen: `aws --version` → mindestens `aws-cli/2.32` (lokal 2.36
   installiert).
2. Region für das Profil festlegen:
   `aws configure set region eu-central-1 --profile kundenportal`
3. Anmelden: `aws login --profile kundenportal`. Der Browser öffnet sich;
   mit der Console sign-in URL aus 4.2 als `jan-admin` anmelden (Passwort und
   MFA-Code). Ohne Browser auf dem Rechner (SSH): `--remote` anhängen und den
   angezeigten Code zurückkopieren.
4. Prüfen 👁: `aws sts get-caller-identity --profile kundenportal`.
   Ergebnis: JSON mit `"Arn": "arn:aws:iam::<Kontonummer>:user/jan-admin"`.
5. Für Werkzeuge, die das Login-Verfahren nicht kennen, die Anmeldedaten
   ins aktuelle Terminal exportieren (gilt nur dort):

   ```
   eval "$(aws configure export-credentials --profile kundenportal --format env)"
   ```

   Die exportierten Werte laufen nach kurzer Zeit ab; dann Schritt 3 und 5
   wiederholen. Terraform und CDK werden in dieser Anleitung immer so
   gestartet.

**Nie** Access Keys anlegen (IAM → Users → Security credentials →
„Create access key" bleibt unbenutzt).

Rückweg: `aws logout --profile kundenportal` löscht die zwischengespeicherten
Anmeldedaten [B: `aws logout help`]; danach das Profil `kundenportal` aus
`~/.aws/config` entfernen.

### 4.5 Lambda-Kontolimit prüfen 👁 und ggf. erhöhen ✎

Ziel: Die Anwendung setzt je Lambda-Funktion eine
[Reserved Concurrency](glossar.md#reserved-concurrency) als harte
Kostenbremse: 2 je Worker und Trigger, 5 je API-Funktion und je
Next.js-Funktion (Stand Phase 4: zusammen 84; Phase 3: 52; Phase 2: 35;
Phase 1: 10). AWS lässt aber höchstens „nicht reservierte
Kontokapazität **minus 100**" reservieren; 100 bleiben immer für Funktionen
ohne Reservierung frei
[B: https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html].
Standard sind 1.000 gleichzeitige Ausführungen je Region, **neue Konten
haben reduzierte Werte**, die AWS mit der Nutzung automatisch anhebt
[B: https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html].
Bei einem Limit von 10 ist also gar keine Reservierung möglich, und der
erste Deploy würde scheitern.

Prüfen 👁 (Konsole):

1. Region oben rechts auf **Europe (Frankfurt)** stellen (Quoten gelten je
   Region).
2. In die Suchleiste **Service Quotas** eingeben, öffnen.
3. Links **AWS services**, in der Liste **AWS Lambda** suchen und öffnen.
4. Zeile **Concurrent executions**: Spalte **Applied account-level quota
   value** ablesen.

Prüfen 👁 (Kommandozeile, nach 4.4):
`aws lambda get-account-settings --region eu-central-1 --profile kundenportal`
→ `AccountLimit.ConcurrentExecutions` (Limit) und
`UnreservedConcurrentExecutions`.

Nötig ist: **Limit ≥ 100 + Summe aller Reservierungen**. Die Zahlen
stehen in der [Architektur](architektur.md) §7. Stand Phase 4:

| Funktionen | Anzahl | je Funktion | Summe |
|---|---|---|---|
| Base-Stack: drei Cognito-Trigger und Aufräum-Funktion der Pass-Mandanten | 4 | 2 | 8 |
| App-Stack: Worker | 8 | 2 | 16 |
| App-Stack: API-Funktionen | 8 | 5 | 40 |
| Next.js: Shell und drei Zonen | 4 | 10 | 40 |
| **Reservierungen gesamt** | | | **104** |

Also **Limit ≥ 100 + 8 + 16 + 40 + 40 = 204** (v0.4.0: ≥ 184; Phase 3:
≥ 152; Phase 2: ≥ 135). Die Next.js-Funktionen haben seit v0.4.1 je 10,
weil ein Seitenaufruf Prefetch- und RSC-Anfragen mitbringt.

| Angezeigtes Limit | Folge |
|---|---|
| ≥ 100 + Summe der Reservierungen (Stand v0.4.1: ≥ 204) | nichts zu tun; die Standardwerte passen (≥ 100 bleiben frei) |
| darunter (bei Neukonten typisch 10) | Weg A oder B |

Stand des Kontos: Die Erhöhung auf **1.000** ist genehmigt; das reicht mit
Abstand für alle geplanten Phasen.

**Weg A — Erhöhung beantragen ✎ (empfohlen):**

1. In der Zeile **Concurrent executions** auf den Namen klicken,
   **Request increase at account level**.
2. **Increase quota value**: `1000`, **Request**.
3. Ergebnis: Unter **Quota request history** ein Eintrag mit Status
   „Pending", später „Case opened"/„Approved". Das dauert Stunden bis
   Tage; AWS antwortet per E-Mail. Grundlage:
   https://docs.aws.amazon.com/servicequotas/latest/userguide/request-quota-increase.html

Der Antrag ist kostenlos; ein höheres Limit verursacht selbst keine Kosten
(bezahlt wird nur tatsächliche Ausführung). Rückweg: nicht nötig.

**Weg B — ohne Reservierung deployen ✎:** Der CDK-Kontextwert
`reservedConcurrency=0` lässt die Reservierung weg. Dann begrenzen nur noch
API-Throttling (10/20 Anfragen/s) und das Kontolimit selbst die Last; bei
einem Limit von 10 ist das ohnehin eine harte Grenze. Der Deploy-Workflow
liest den Wert aus der GitHub-Variable `RESERVED_CONCURRENCY` (Standard 2):
GitHub → Repository → **Settings** → **Secrets and variables** → **Actions**
→ Reiter **Variables** → **New repository variable**, Name
`RESERVED_CONCURRENCY`, Wert `0`. Rückweg: Variable löschen, sobald das Limit
erhöht ist; der nächste Deploy reserviert dann wieder (2 je Worker und
Trigger, 5 je API- und Next.js-Funktion).

Notieren: angezeigtes Limit, gewählter Weg, Datum des Antrags und der
Genehmigung.

### 4.6 Protokoll

| Datum | Schritt | Ergebnis | Wer |
|---|---|---|---|
| | 4.2 IAM-Benutzer `jan-admin` angelegt (Alias, falls vergeben) | | |
| | 4.3 MFA für `jan-admin` aktiv | | |
| | 4.4 `aws login` funktioniert (`get-caller-identity` zeigt `user/jan-admin`) | | |
| | 4.5 Lambda-Limit Frankfurt / gewählter Weg / Antrag genehmigt am | | |

## 5. Terraform-Fundament: Erstlauf

Ziel: die dauerhaften Grundlagen anlegen, die nicht zur Anwendung gehören
(Code: `infra/terraform`):

| Ressource | Zweck |
|---|---|
| OIDC-Anbieter GitHub + Rolle `kundenportal-github-deploy` | GitHub Actions deployt ohne Schlüssel; nur Environment `production` von `janpfeil/kundenportal-demo`; darf nur die CDK-Bootstrap-Rollen annehmen, Test-Ereignisse auf den Bus `kundenportal` senden und Log-Gruppen `/aws/lambda/Kundenportal*` löschen |
| OIDC-Anbieter `gitlab.rypox.org` + Rolle `kundenportal-gitlab-foundation` | GitLab CI pflegt dieses Fundament; nur Projekt `saas/kundenportal-demo/platform`, Branch `main` |
| Richtlinie `kundenportal-ci-boundary` | [Permissions Boundary](glossar.md#permissions-boundary) beider Rollen; die GitLab-Rolle kann sie nie ändern → Änderungen an der Boundary nur lokal durch den Inhaber |
| Budget `kundenportal-monthly` | 1 $/Monat; Alarm bei tatsächlichen Kosten > 0,01 $ und bei Prognose > 100 %; per E-Mail und an das SNS-Topic `kundenportal-budget-alerts` |
| SSM-Parameter `/kundenportal/owner-email`, `/kundenportal/budget-alerts-topic-arn` | Übergabe an die CDK-App |

Der **erste** Lauf geschieht lokal durch den Inhaber, weil die Rolle, mit der
GitLab später arbeitet, erst durch diesen Lauf entsteht. Der
[Terraform-State](glossar.md#terraform-state) liegt als
[GitLab-managed Terraform State](glossar.md#gitlab-managed-terraform-state)
im Projekt `saas/kundenportal-demo/platform` (Projekt-ID 726, State-Name
`foundation`); lokal und in der Pipeline wird derselbe State benutzt.

Kosten: keine. Die ersten zwei Budgets eines Kontos sind kostenlos, IAM, SSM
(Standard) und SNS-E-Mails im Rahmen sind kostenlos
([Kostenfreier Betrieb](kostenfrei.md) §2).

### 5.1 Vorbereiten 👁

1. Terraform installiert: `terraform version` → mindestens `1.16`.
2. Das GitHub-Repository lokal ausgecheckt, auf dem Stand, der auch in
   GitLab gepinnt wird (der Agent nennt den Commit).
3. `aws login --profile kundenportal` und Export aus 4.4, Schritt 5, im
   selben Terminal.
4. Mindestens die Rolle **Maintainer** im GitLab-Projekt
   `saas/kundenportal-demo/platform` (nötig, um den State zu schreiben)
   (Stand 09/2026, nicht selbst geprüft).

### 5.2 GitLab-Zugangstoken bereitlegen ✎

Ziel: Terraform liest und schreibt den State in GitLab. Dafür braucht es
**einmalig** ein persönliches GitLab-Zugangstoken (Personal Access Token).
Grundlage: https://docs.gitlab.com/user/profile/personal_access_tokens/

**Fall A — das Token liegt schon in einer Datei** (z. B.
`<pfad-zur-token-datei>`): nur prüfen, dass es den Scope **api**
hat und noch gültig ist (GitLab → Avatar → **Edit profile** → **Access
tokens** → Liste) und dass die Datei nur für einen selbst lesbar ist:

```
chmod 600 <pfad-zur-token-datei>
```

Weiter mit 5.3, Fall A.

**Fall B — neues Token anlegen:**

1. https://gitlab.rypox.org öffnen → eigenes **Avatar** → **Edit profile** →
   links **Access tokens** (Stand 09/2026, nicht selbst geprüft).
2. **Add new token**: Name `kundenportal-terraform-erstlauf`, **Expiration
   date** in 7 Tagen, Scope **api** anhaken, **Create personal access token**.
3. Das Token wird **einmal** angezeigt → mit dem Kopier-Symbol kopieren und
   gleich in 5.3, Fall B, einfügen. Nicht in Dateien, Chats oder Notizen
   ablegen.

Notieren: Name und Ablaufdatum des Tokens (nicht den Wert).

Rückweg: GitLab → **Access tokens** → **Revoke** (bei Fall B spätestens nach
5.4).

### 5.3 Terraform initialisieren ✎

Alle Befehle **in einem einzigen Terminalfenster** nacheinander ausführen —
die Umgebungsvariablen gelten nur in diesem Fenster. Platzhalter in `<…>`
ersetzen.

**Schritt 1 — ins Verzeichnis wechseln und AWS-Anmeldung übernehmen:**

```
cd <pfad-zum-repository>/kundenportal-demo/infra/terraform
aws login --profile kundenportal     # nur nötig, wenn die Anmeldung aus 4.4 abgelaufen ist
eval "$(aws configure export-credentials --profile kundenportal --format env)"
aws sts get-caller-identity --query Arn --output text
```

Ergebnis der letzten Zeile: `arn:aws:iam::<Kontonummer>:user/jan-admin`.
Steht dort `…:root` oder eine Fehlermeldung: Kapitel 4.4 wiederholen.

**Schritt 2 — GitLab-Zugang und E-Mail-Adresse setzen:**

Fall A (Token in Datei):

```
export TF_HTTP_USERNAME="janpfeil"
export TF_HTTP_PASSWORD="$(cat <pfad-zur-token-datei>)"
export TF_VAR_owner_email="<e-mail-adresse-für-kostenalarme>"
```

Fall B (Token frisch kopiert):

```
export TF_HTTP_USERNAME="janpfeil"
read -rs TF_HTTP_PASSWORD && export TF_HTTP_PASSWORD
export TF_VAR_owner_email="<e-mail-adresse-für-kostenalarme>"
```

Bei `read -rs …` wartet das Terminal still auf eine Eingabe: das Token mit
**Strg+Umschalt+V** einfügen und **Enter** drücken. Es erscheint dabei
**nichts** auf dem Bildschirm — das ist gewollt (kein Echo, kein Eintrag in
der Befehlshistorie).

`janpfeil` ist der GitLab-Benutzername. Die E-Mail-Adresse erhält die
Budget-Alarme und Betriebshinweise; sie landet nur im AWS-Konto und im
privaten State, nicht im Repository.

**Schritt 3 — prüfen, dass alles gesetzt ist (zeigt keine Werte an):**

```
for v in AWS_ACCESS_KEY_ID TF_HTTP_USERNAME TF_HTTP_PASSWORD TF_VAR_owner_email; do
  [ -n "${!v}" ] && echo "$v gesetzt" || echo "$v FEHLT"
done
```

Alle vier Zeilen müssen „gesetzt" lauten.

**Schritt 4 — Terraform mit dem GitLab-State verbinden:**

```
terraform init \
  -backend-config="address=https://gitlab.rypox.org/api/v4/projects/726/terraform/state/foundation" \
  -backend-config="lock_address=https://gitlab.rypox.org/api/v4/projects/726/terraform/state/foundation/lock" \
  -backend-config="unlock_address=https://gitlab.rypox.org/api/v4/projects/726/terraform/state/foundation/lock" \
  -backend-config="lock_method=POST" -backend-config="unlock_method=DELETE" -backend-config="retry_wait_min=5"
```

Ergebnis: „Terraform has been successfully initialized!". Verändert wird nur
das lokale Verzeichnis `.terraform/`; der State in GitLab entsteht beim
ersten `apply`.

Warum Umgebungsvariablen statt `-backend-config` für Benutzer und Token:
Terraform speichert alle `-backend-config`-Werte in
`.terraform/terraform.tfstate` auf der Platte; `TF_HTTP_USERNAME` und
`TF_HTTP_PASSWORD` werden dagegen nicht gespeichert
[B: https://developer.hashicorp.com/terraform/language/backend/http].

Typische Fehler:

| Meldung | Ursache | Abhilfe |
|---|---|---|
| `401 Unauthorized` beim `init` | Token falsch, abgelaufen oder ohne Scope **api** | Token prüfen (5.2), Schritt 2 wiederholen |
| `403 Forbidden` | GitLab-Rolle im Projekt `platform` unter Maintainer | Rolle erhöhen lassen (5.1, Punkt 4) |
| `No valid credential sources found` / `ExpiredToken` beim `plan` | AWS-Anmeldung abgelaufen | Schritt 1 wiederholen |

### 5.4 Plan und Apply ✎

Im selben Terminal:

```
terraform plan -out=plan.tfplan
```

Ergebnis prüfen — die letzte Zeile muss lauten: **Plan: 14 to add, 0 to
change, 0 to destroy.** (zwei OIDC-Anbieter, zwei Rollen, drei
Rollenrichtlinien, die Boundary, SNS-Topic mit Richtlinie und Abo, Budget,
zwei Parameter). Steht dort etwas bei „to change" oder „to destroy":
**abbrechen** und den Agenten fragen.

```
terraform apply plan.tfplan
terraform output
```

`apply` legt genau das Geplante an (unter einer Minute) und endet mit
„Apply complete! Resources: 14 added". `terraform output` zeigt drei Werte:
`github_deploy_role_arn`, `gitlab_foundation_role_arn`,
`budget_alerts_topic_arn`. Sie sind keine Geheimnisse, enthalten aber die
Kontonummer → nur ins private Protokoll.

Aufräumen (im selben Terminal):

```
rm -f plan.tfplan        # enthält u. a. die E-Mail-Adresse
unset TF_HTTP_PASSWORD TF_HTTP_USERNAME TF_VAR_owner_email AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CREDENTIAL_EXPIRATION
```

Bei Fall B danach das Token in GitLab widerrufen (**Revoke**). Bei Fall A
bleibt die Datei, wie sie ist; ein Token mit langem Ablaufdatum trotzdem
regelmäßig erneuern.

Prüfen 👁: GitLab → Projekt `platform` → **Operate** → **Terraform states**
zeigt einen State `foundation` (Stand 09/2026, nicht selbst geprüft).

Rückweg (vollständig): **erst** die Anwendung abbauen (Kapitel 8.7) und den
CDK-Bootstrap entfernen (Kapitel 7.1), dann in einem neuen Terminal Schritte
1–4 aus 5.3 und `terraform destroy`. Nicht über GitLab — die GitLab-Rolle
würde sich dabei selbst löschen.

### 5.5 E-Mail-Abonnement bestätigen ✎

Ziel: Budget-Alarme erreichen den Inhaber nur, wenn er das E-Mail-Abo
bestätigt hat.

1. Posteingang der Adresse aus `TF_VAR_owner_email`: E-Mail von
   „AWS Notifications" mit Betreff **AWS Notification - Subscription
   Confirmation**, Topic „Kundenportal Budget" (Spam-Ordner prüfen).
2. Link **Confirm subscription** anklicken. Ergebnis: Seite „Subscription
   confirmed!".
3. Prüfen 👁: Konsole (Frankfurt) → **Simple Notification Service** →
   **Topics** → `kundenportal-budget-alerts` → Reiter **Subscriptions**:
   Protokoll `EMAIL`, Status **Confirmed**.

Eine zweite Bestätigungs-E-Mail (Topic „Kundenportal", Hinweise der
Anwendung) kommt erst beim ersten Deploy (Kapitel 8).

Rückweg: Link **unsubscribe** in jeder SNS-E-Mail oder in der Konsole
**Delete** am Abo (dann gehen Alarme nur noch direkt vom Budget per E-Mail).

### 5.6 Budget und Rollen ansehen 👁

1. **Billing and Cost Management** → links **Budgets** → `kundenportal-monthly`.
   Ergebnis: Betrag 1,00 $, monatlich; unter **Alerts** zwei Schwellen
   (tatsächlich > 0,01 $ absolut; Prognose > 100 %). Die Werte „Current" und
   „Forecasted" erscheinen erst nach bis zu 24 Stunden.
2. **IAM** → **Roles** → Suchfeld `kundenportal`: zwei Rollen
   `kundenportal-github-deploy` und `kundenportal-gitlab-foundation`. Bei jeder
   Rolle unter **Permissions** den Eintrag **Permissions boundary**:
   `kundenportal-ci-boundary`.
3. **IAM** → **Identity providers**: `token.actions.githubusercontent.com`
   und `gitlab.rypox.org`.

Notieren: Budget sichtbar, zwei Rollen mit Boundary, zwei Anbieter.

### 5.7 Protokoll

| Datum | Schritt | Ergebnis | Wer |
|---|---|---|---|
| | 5.2 GitLab-Token angelegt (Name, Ablauf) | | |
| | 5.4 `apply` (Anzahl angelegt) und Outputs notiert | | |
| | 5.4 Token widerrufen, `plan.tfplan` gelöscht | | |
| | 5.5 Budget-Abo bestätigt | | |
| | 5.6 Budget, Rollen, Boundary, Anbieter geprüft | | |
