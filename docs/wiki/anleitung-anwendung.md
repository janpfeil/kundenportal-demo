# Anleitung Anwendung (Kapitel 6–10)

Stand: 2026-09-29 · Fortsetzung der [Anleitung Fundament](anleitung-fundament.md) (Kapitel 4–5); Grundsätze in [Kapitel 0](anleitung-kontoinhaber.md#0-grundsätze). Aufbau der Anwendung: [Architektur Phase 1](architektur.md).

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

Voraussetzung: Kapitel 4–5 erledigt — `aws login` funktioniert, das
Terraform-Fundament steht, die Outputs aus Kapitel 5.4 liegen im privaten
Protokoll. Markierungen wie in Kapitel 0: 👁 lesend, ✎ verändernd (mit
Rückweg); „(Stand 09/2026, nicht selbst geprüft)" bei Klickpfaden ohne
Beleg in der Hersteller-Dokumentation.

## 6. GitLab-Pipeline für das Fundament

Ziel: Künftige Änderungen am Fundament laufen nicht mehr lokal, sondern
über [GitLab CI](glossar.md#gitlab-ci) im Projekt
`saas/kundenportal-demo/platform`: `plan` automatisch bei jedem Push auf
`main`, `apply` erst nach Klick. Die Pipeline klont das GitHub-Repository an
einem festen Commit (`SOURCE_REF`); GitHub erhält kein GitLab-Token und
GitLab kein GitHub-Token — solange das Repository privat ist, nur einen
lesenden [Deploy Key](glossar.md#deploy-key).

### 6.1 Branch-Schutz prüfen 👁

Die AWS-Rolle vertraut nur Pipelines auf dem **geschützten** Branch `main`.

1. gitlab.rypox.org → Projekt `saas/kundenportal-demo/platform` →
   **Settings** → **Repository** → **Protected branches** aufklappen.
2. Ergebnis: Zeile `main` mit **Allowed to merge** / **Allowed to push**
   (z. B. Maintainers). Neue Projekte schützen den Standard-Branch
   automatisch.
3. Fehlt `main`: **Add protected branch** → `main` → Maintainers → **Protect** ✎
   (Rückweg: **Unprotect**).
4. 👁 **Settings** → **CI/CD** → **Runners**: mindestens ein verfügbarer
   Runner mit Tag `docker` (die Pipeline verlangt ihn).

(Stand 09/2026, nicht selbst geprüft.)

### 6.2 Lesenden Deploy-Key anlegen ✎

Nur solange das GitHub-Repository privat ist (Ende: Kapitel 10).
Grundlage: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys

1. Lokal ein Schlüsselpaar ohne Passphrase im SSH-Verzeichnis erzeugen
   (dort, wo SSH-Schlüssel üblicherweise liegen und nur man selbst lesen
   darf — **nicht** im Projektverzeichnis, damit er nie in einem Commit
   landet):

   ```
   ssh-keygen -t ed25519 -N "" -C "gitlab-platform-readonly" -f ~/.ssh/kundenportal-deploy-key
   ```

   Ergebnis: `~/.ssh/kundenportal-deploy-key` (privat, Rechte `600`) und
   `~/.ssh/kundenportal-deploy-key.pub` (öffentlich).
2. GitHub → Repository `janpfeil/kundenportal-demo` → **Settings** →
   **Deploy keys** → **Add deploy key**.
3. **Title** `gitlab-platform (read-only)`, **Key**: Inhalt der `.pub`-Datei
   (`cat ~/.ssh/kundenportal-deploy-key.pub`). **Allow write access NICHT
   anhaken.** **Add key**.
4. Ergebnis: Eintrag in der Liste, ohne „Read/write".
5. Den **privaten** Schlüssel in GitLab hinterlegen: https://gitlab.rypox.org
   → Projekt `saas/kundenportal-demo/platform` → links **Settings** →
   **CI/CD** → Abschnitt **Variables** aufklappen (**Expand**) → **Add
   variable** (Stand 09/2026, nicht selbst geprüft).
6. Im Formular:

   | Feld | Eingabe |
   |---|---|
   | **Type** | **File** (nicht „Variable") |
   | **Environments** | All (default) |
   | **Visibility** | Visible |
   | **Flags** | **Protect variable** an; **Expand variable reference** aus |
   | **Key** | `GITHUB_DEPLOY_KEY` |
   | **Value** | kompletten Inhalt des privaten Schlüssels einfügen |

   Den Inhalt holt man mit `cat ~/.ssh/kundenportal-deploy-key` im
   Terminal: alles markieren von `-----BEGIN OPENSSH PRIVATE KEY-----` bis
   einschließlich `-----END OPENSSH PRIVATE KEY-----`, kopieren und in
   **Value** einfügen; danach im Feld einmal **Enter** drücken, damit die
   letzte Zeile mit einem Zeilenumbruch endet (sonst lehnt SSH den
   Schlüssel ab).
7. **Add variable**. Ergebnis: In der Liste steht `GITHUB_DEPLOY_KEY` mit
   Typ „File" und dem Merkmal „Protected".
8. Danach wird der Schlüssel lokal nicht mehr gebraucht — die Pipeline nutzt
   nur die GitLab-Variable. Empfehlung: beide Dateien vernichten
   `shred -u ~/.ssh/kundenportal-deploy-key ~/.ssh/kundenportal-deploy-key.pub`;
   wer sie behalten will, lässt sie in `~/.ssh/` (nie ins Projekt kopieren).

Rückweg: GitHub → **Deploy keys** → **Delete**; GitLab-Variable
`GITHUB_DEPLOY_KEY` löschen.

### 6.3 CI/CD-Variablen setzen ✎

Stand 29.09.2026: `AWS_ROLE_ARN` und `TF_VAR_owner_email` hat der Agent per
GitLab-API gesetzt, `GITHUB_DEPLOY_KEY` entsteht in 6.2 (Schritte 5–7).
Hier nur 👁 prüfen, dass alle drei in der Liste stehen.

Ort: Projekt `platform` → **Settings** → **CI/CD** → **Variables** →
**Add variable** (Stand 09/2026, nicht selbst geprüft).

| Key | Value | Type | Visibility | Protect variable |
|---|---|---|---|---|
| `AWS_ROLE_ARN` | Output `gitlab_foundation_role_arn` aus 5.4 | Variable | Visible | an |
| `TF_VAR_owner_email` | E-Mail-Adresse wie in 5.3 | Variable | Masked | an |
| `GITHUB_DEPLOY_KEY` | privater Schlüssel, siehe 6.2 Schritt 6 | **File** | Visible | an |

Bei allen: **Environments** „All (default)", **Expand variable reference**
aus. Lehnt GitLab das Maskieren der E-Mail-Adresse ab (nicht erlaubte
Zeichen), nur **Protect variable** setzen — die Adresse ist kein Geheimnis.

Rückweg: je Variable **Delete**. Wirkung: nächste Pipeline scheitert
(`AWS_ROLE_ARN`) bzw. klont per HTTPS (`GITHUB_DEPLOY_KEY`).

### 6.4 Pipeline-Datei (erledigt durch den Agenten, 29.09.2026)

Im Projekt `platform` liegt `.gitlab-ci.yml` — eine Kopie von
`infra/terraform/gitlab/platform.gitlab-ci.yml` mit gepinntem `SOURCE_REF`.
Die Pipeline startet erst, wenn die Variable `AWS_ROLE_ARN` aus 6.3 gesetzt
ist. Der Inhaber tut hier nichts.

### 6.5 Plan ansehen 👁 und ggf. anwenden ✎

1. Projekt `platform` → **Build** → **Pipelines**: die neueste Pipeline auf
   `main`.
2. Ergebnis: Job **plan** grün (✓), Job **apply** grau mit ▶ (manuell).
3. Job **plan** öffnen, ans Ende des Protokolls scrollen. Erwartet nach dem
   Erstlauf: **No changes. Your infrastructure matches the configuration.**
   Dann **nicht** auf ▶ klicken — fertig.
4. Zeigt der Plan Änderungen (z. B. weil `SOURCE_REF` neuer ist als der
   lokal angewendete Stand): Artefakt `plan.txt` herunterladen (rechts
   **Job artifacts** → **Download**) oder das Protokoll lesen. Nur wenn die
   Änderungen verstanden und gewollt sind: im Pipeline-Bild beim Job
   **apply** auf ▶ klicken. Ergebnis: Job grün, „Apply complete!".
5. Scheitert **plan** mit „Not authorized to perform
   sts:AssumeRoleWithWebIdentity": Branch-Schutz (6.1) und `AWS_ROLE_ARN`
   (6.3) prüfen.

Rückweg für ein `apply`: im Projekt `platform` den Commit mit dem vorigen
`SOURCE_REF` wiederherstellen (Revert), Pipeline abwarten, ▶ bei **apply**.

### 6.6 Protokoll

| Datum | Schritt | Ergebnis | Wer |
|---|---|---|---|
| | 6.1 `main` geschützt, Runner mit Tag `docker` vorhanden | | |
| | 6.2 Deploy-Key angelegt (nur lesend), lokale Dateien vernichtet | | |
| | 6.3 drei Variablen gesetzt (nur Namen notieren) | | |
| | 6.5 Plan-Job grün, Ergebnis „No changes" bzw. Apply am | | |

## 7. CDK-Bootstrap und GitHub-Freigabe

### 7.1 CDK-Bootstrap ✎

Ziel: [CDK](glossar.md#cdk) braucht je Konto und Region einmalig
Hilfsressourcen ([CDK Bootstrap](glossar.md#cdk-bootstrap)), bevor
irgendetwas deployt werden kann. Die Anwendung nutzt zwei Regionen:
Frankfurt (alles) und Nord-Virginia (nur das CloudFront-Zertifikat). Der
Bootstrap geschieht lokal durch den Inhaber, weil die GitHub-Rolle bewusst
nur die Bootstrap-Rollen **benutzen**, aber nicht anlegen darf.

Was entsteht, je Region ein [Stack](glossar.md#stack) `CDKToolkit`:

| Ressource | Zweck | Kosten |
|---|---|---|
| S3-Bucket `cdk-hnb659fds-assets-<Konto>-<Region>` | Zwischenablage für Lambda-Code und statische Dateien beim Deploy | wenige MB; im Free Plan über das Guthaben, Bruchteile eines Cents |
| ECR-Repository `cdk-hnb659fds-container-assets-…` | für Container-Images (hier ungenutzt) | leer = 0 $ |
| IAM-Rollen `cdk-hnb659fds-*` (deploy, file-publishing, image-publishing, lookup, cfn-exec) | werden beim Deploy angenommen | 0 $ |
| SSM-Parameter `/cdk-bootstrap/hnb659fds/version` | Versionsprüfung | 0 $ |

Sicherheitshinweis: Die Ausführungsrolle für CloudFormation
(`cdk-hnb659fds-cfn-exec-role-…`) hat nach CDK-Standard
`AdministratorAccess`. Deshalb darf die GitHub-Rolle nur die
Bootstrap-Rollen annehmen, und nur das Environment `production` mit Freigabe
kommt an die GitHub-Rolle (7.2).

Schritte (im Repository-Wurzelverzeichnis, Node.js laut `.nvmrc`, pnpm):

1. `aws login --profile kundenportal` und Export wie in
   [Kapitel 4.4](anleitung-fundament.md#44-aws-login-auf-dem-eigenen-rechner),
   Schritt 5.
2. `pnpm install --frozen-lockfile && pnpm build` — die CDK-App prüft beim
   Start, dass die Shell gebaut ist.
3. Kontonummer holen:
   `ACCOUNT=$(aws sts get-caller-identity --query Account --output text)`
4. Bootstrap:

   ```
   cd infra/cdk
   pnpm exec cdk bootstrap aws://$ACCOUNT/eu-central-1 aws://$ACCOUNT/us-east-1 --tags project=kundenportal-demo
   ```

5. Ergebnis: je Region „✅ Environment aws://…/… bootstrapped." Dauer: ein
   bis drei Minuten.
6. Prüfen 👁: Konsole → **CloudFormation** → **Stacks**: in **Europe
   (Frankfurt)** und in **US East (N. Virginia)** je ein Stack `CDKToolkit`
   mit Status **CREATE_COMPLETE**.

Notieren: Datum, beide Stacks vorhanden.

Rückweg: erst die Anwendung abbauen (8.7). Dann je Region **S3** → Bucket
`cdk-hnb659fds-assets-…` → **Empty**; **CloudFormation** → `CDKToolkit` →
**Delete**. Bleiben Bucket oder ECR-Repository danach stehen (sie sind zum
Schutz vor Datenverlust oft vom Löschen ausgenommen), sie einzeln löschen
(Stand 09/2026, nicht selbst geprüft).

### 7.2 GitHub-Environment `production` ✎

Ziel: Jeder Lauf von Deploy, Teardown und DLQ-Probe braucht die Freigabe des
Inhabers, und nur diese Läufe kommen an die AWS-Rolle — die Rolle vertraut
ausschließlich dem [Environment](glossar.md#environment) `production`.

**Einschränkung (GitHub-Dokumentation):** Bei GitHub Free, Pro und Team gibt
es **Required reviewers** nur in **öffentlichen** Repositories;
Deployment-Branch-Regeln und Environment-Variablen gibt es in privaten
Repositories nur mit GitHub Pro oder Team
[B: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments].
Solange das Repository privat ist, zeigt GitHub diese Optionen je nach Plan
nicht an. Dann gilt 7.3.

1. GitHub → Repository `janpfeil/kundenportal-demo` → **Settings** → links
   **Environments** → **New environment**.
2. Name `production`, **Configure environment**.
3. **Deployment protection rules**: **Required reviewers** anhaken,
   `janpfeil` hinzufügen. **Prevent self-review** **nicht** anhaken — sonst
   kann der Inhaber seine eigenen Läufe nicht freigeben. **Save protection
   rules**.
4. **Deployment branches and tags**: **Selected branches and tags** →
   **Add deployment branch or tag rule** → `main`; noch einmal → `develop`.
5. **Environment variables** → **Add environment variable**: Name
   `AWS_DEPLOY_ROLE_ARN`, Wert = Output `github_deploy_role_arn` aus
   Kapitel 5.4. Als **Variable**, nicht als Secret — der Wert ist kein
   Geheimnis.
6. Ergebnis: Environment `production` mit „1 protection rule", zwei
   Branch-Regeln und einer Variable.

(Beschriftungen laut GitHub-Dokumentation; genaue Knopftexte Stand 09/2026,
nicht selbst geprüft.)

Rückweg: **Environments** → `production` → **Delete environment** (danach
kann kein Workflow mehr deployen).

### 7.3 Solange das Repository privat ist ✎

Fehlen in 7.2 die Felder für Reviewer oder Variablen:

1. Das Environment `production` trotzdem anlegen (Schritte 1–2); die
   Workflows melden sich damit bei AWS an.
2. `AWS_DEPLOY_ROLE_ARN` als **Repository-Variable** setzen: **Settings** →
   **Secrets and variables** → **Actions** → Reiter **Variables** → **New
   repository variable**.
3. Wissen: Ohne Required reviewers laufen Deploy, Teardown und DLQ-Probe
   sofort nach dem Start ohne Freigabeschritt. Starten kann sie nur, wer
   Schreibrechte am privaten Repository hat — also nur der Inhaber.
4. Nach dem Öffentlichschalten (Kapitel 10) die Schritte 3–5 aus 7.2
   nachholen und die Repository-Variable löschen.

### 7.4 Protokoll

| Datum | Schritt | Ergebnis | Wer |
|---|---|---|---|
| | 7.1 `CDKToolkit` in eu-central-1 und us-east-1 | | |
| | 7.2 Environment `production`: Reviewer, Branches, Variable | | |
| | 7.3 falls privat: Repository-Variable gesetzt | | |

## 8. Anwendung deployen, testen, abbauen

### 8.1 Deploy starten ✎

Ziel: die Anwendung aus [Architektur Phase 1](architektur.md) in AWS
aufbauen oder nach einer Pause wieder in Betrieb nehmen. Kosten: im Free Plan
0 $ (Cent-Bruchteile für API Gateway, EventBridge und S3 laufen über das
Guthaben; [Kostenfreier Betrieb](kostenfrei.md)).

Der Deploy läuft **unbeaufsichtigt** über `scripts/deploy.sh` (Bash, keine
Rückfragen): Build → Stacks `KundenportalCertificate`, `KundenportalBase`,
`KundenportalApp` → danach `KundenportalEdge`, das CloudFront auf die (ggf.
neuen) Adressen der Anwendung umstellt. Adresse und DNS-Eintrag bleiben
dabei gleich.

1. GitHub → Repository → **Actions** → links **Deploy** → rechts **Run
   workflow** → Branch `develop` (oder `main`) → **Run workflow**.
2. Solange das Repository öffentlich ist und eine Freigabe verlangt wird
   (Kapitel 10): **Review deployments** → `production` anhaken →
   **Approve and deploy**. Bei privatem Repository entfällt der Schritt.
3. Ergebnis: Lauf grün; die **Summary** zeigt Dauer (`BUILD_SECONDS`,
   `CORE_SECONDS`, `EDGE_SECONDS`, `TOTAL_SECONDS`) und die Ausgaben.

Lokal (als `jan-admin`, Kapitel 4.4): `AWS_PROFILE=kundenportal ./scripts/deploy.sh`.

Rückweg: 8.7 (Pause oder Ende).
### 8.2 Zertifikat per DNS bestätigen ✎ (nur beim ersten Deploy)

Beim ersten Deploy wartet der Stack `KundenportalCertificate` in
Nord-Virginia, bis das Zertifikat für `kundenportal-demo.rypox.com` per DNS
bestätigt ist. Route 53 wird nicht genutzt; der Eintrag kommt auf den eigenen
Nameserver. Der Deploy-Job bricht nach **60 Minuten** ab — den Eintrag also
zügig anlegen.

1. Etwa eine Minute nach Start des Deploy-Schritts: AWS-Konsole, Region oben
   rechts **US East (N. Virginia)**, Suchleiste **Certificate Manager**.
2. **List certificates** → Zertifikat `kundenportal-demo.rypox.com` mit
   Status **Pending validation** → auf die **Certificate ID** klicken.
3. Abschnitt **Domains**: Spalten **CNAME name** (Form
   `_<lange Zeichenkette>.kundenportal-demo.rypox.com.`) und **CNAME value**
   (Form `_<…>.acm-validations.aws.`) kopieren.
4. Beim eigenen Nameserver für die Domain `rypox.com` einen Eintrag anlegen:
   Typ **CNAME**, Name = CNAME name **ohne** Domain-Anhang, also
   `_<…>.kundenportal-demo` (viele Oberflächen hängen `.rypox.com`
   selbst an; sonst entsteht `….rypox.com.rypox.com`), Ziel = CNAME value,
   TTL 300.
5. Prüfen 👁: `dig +short CNAME _<…>.kundenportal-demo.rypox.com` zeigt den
   `acm-validations.aws`-Wert.
6. Ergebnis nach Minuten (bis zu 30): Status **Issued**; der Deploy läuft
   von selbst weiter.

Der Eintrag **bleibt dauerhaft** stehen: Solange er existiert, bestätigt ACM
auch neue Zertifikate für denselben Namen (nach Abbau und Neuaufbau) und
erneuert sie automatisch
[B: https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html].
Läuft der Job trotzdem in den Zeitabbruch: Eintrag stehen lassen, Deploy neu
starten.

Rückweg: den Validierungs-CNAME erst löschen, wenn das Projekt endet (nach
Teardown und Löschen des Zertifikats).

### 8.3 Portal-Adresse eintragen ✎ (einmalig)

Die CloudFront-Distribution liegt im dauerhaften Stack `KundenportalEdge`;
ihr Name ändert sich bei normalen Deploys und bei Pausen (8.7, Variante A)
**nicht**. Der Eintrag ist deshalb nur einmal nötig — und erneut nur nach
einem Vollabbau (8.7, Variante B).

1. Nach Ende des Laufs: **Summary** → „Outputs": Wert
   `KundenportalEdge.DistributionDomain`, z. B. `d123abc.cloudfront.net`.
2. Beim eigenen Nameserver (PowerDNS): Typ **CNAME**,
   Name `kundenportal-demo`, Ziel = dieser Wert mit Punkt am Ende, TTL 300.
   Auf der Kommandozeile des Nameservers:

   ```
   pdnsutil replace-rrset rypox.com kundenportal-demo.rypox.com CNAME 300 d123abc.cloudfront.net.
   pdnsutil increase-serial rypox.com
   ```

3. Prüfen 👁: `dig +short CNAME kundenportal-demo.rypox.com @ns1.rypox.net`
   zeigt den `cloudfront.net`-Namen; https://kundenportal-demo.rypox.com
   öffnet die Startseite.

CloudFront verweigert einen Alias, dessen DNS-Eintrag noch auf eine
**andere** (auch gelöschte) Distribution zeigt. Deshalb vor einem
Neuaufbau nach Vollabbau den alten Eintrag löschen (8.7, Variante B).

### 8.4 Hinweis-Abo bestätigen und testen ✎

1. Beim ersten Deploy (und nur nach einem Vollabbau erneut) kommt eine
   **AWS Notification - Subscription Confirmation** für das Topic
   „Kundenportal" → **Confirm subscription** (wie 5.5). Das Topic liegt im
   dauerhaften Stack `KundenportalBase`; Pausen (8.7 A) ändern daran nichts.
2. https://kundenportal-demo.rypox.com → **Anmelden** → registrieren
   (Passwort mindestens 12 Zeichen). Der Code kommt von
   `no-reply@verificationemail.com` (Cognito-Standard, höchstens 50 E-Mails
   pro Tag). Der Code kann **mehrere Minuten** brauchen (30.09.2026: über
   5 min); notfalls bestätigt der Agent das Konto per Admin-API.
3. Ergebnis: **Mein Konto** zeigt die Daten; im **Postfach** steht nach
   wenigen Sekunden die Willkommensnachricht. Automatisch prüft das der
   Workflow **E2E** (Playwright, Wegwerf-Nutzer, misst die Zeit).

Rückweg: Testnutzer in Cognito → **Delete user**.

### 8.5 DLQ-Probe ✎

Ziel: prüfen, dass nicht verarbeitbare Ereignisse in der DLQ landen und der
Inhaber davon erfährt (Abnahmekriterium).

1. **Actions** → **DLQ probe** → **Run workflow** → Freigabe wie in 8.1.
2. Der Workflow sendet ein absichtlich ungültiges Ereignis (ohne Mandant).
   Der notification-Dienst lehnt es dreimal ab; danach liegt es in der DLQ.
3. Ergebnis nach etwa 10 Minuten: E-Mail „ALARM: …DlqNotEmpty…" an die
   Inhaberadresse.
4. Prüfen 👁: Konsole (Frankfurt) → **Simple Queue Service** → **Queues** →
   Queue mit `NotificationDlq` im Namen → Spalte **Messages available** = 1.
5. Aufräumen ✎: Queue anklicken → **Purge** → `purge` eintippen →
   **Purge**. Der Alarm geht in den folgenden Minuten zurück auf „OK"
   (👁 **CloudWatch** → **Alarms**); dafür kommt keine E-Mail.

Rückweg: nicht nötig (die Nachricht ist wertlos).

### 8.6 Protokoll erster Deploy

| Datum | Schritt | Ergebnis | Wer |
|---|---|---|---|
| | 8.2 Validierungs-CNAME angelegt, Zertifikat „Issued" nach … min | | |; 8.3 Portal-CNAME | | |
| | 8.4 Abo „Kundenportal" bestätigt, Registrierung → Willkommensnachricht in … s | | |
| | 8.5 DLQ-Alarm-E-Mail nach … min, Queue geleert | | |

### 8.7 Abbau (Teardown) ✎

Zwei Varianten, beide unbeaufsichtigt über `scripts/teardown.sh`:

| | A — Pause (Standard) | B — Ende (Vollabbau) |
|---|---|---|
| Zweck | kostenpflichtige Teile ruhen lassen, jederzeit per 8.1 zurück | Konto räumen, z. B. vor Ablauf des Free Plans (Kapitel 9) |
| Entfernt | Stack `KundenportalApp`: Lambdas, HTTP API, EventBridge-Bus, Queues, Alarm | zusätzlich `KundenportalEdge` (CloudFront, statische Dateien), `KundenportalBase` (Cognito mit allen Nutzern, DynamoDB mit allen Daten, Hinweis-Topic), `KundenportalCertificate` |
| Bleibt | Zertifikat, Nutzer, Daten, bestätigtes E-Mail-Abo, CloudFront und DNS-Eintrag | nur Terraform-Fundament und CDK-Bootstrap |
| DNS | nichts zu tun | Portal-CNAME löschen; Validierungs-CNAME darf bleiben |
| Wieder aufbauen | 8.1 — gleiche Adresse, ca. 2–6 min | 8.1, danach neuer Portal-CNAME (8.3) |

1. **Actions** → **Teardown** → **Run workflow** → Feld „Type destroy …":
   `destroy`, **scope**: `app` (A) oder `all` (B) → **Run workflow**
   (Freigabe wie in 8.1, falls verlangt).
   Lokal: `AWS_PROFILE=kundenportal ./scripts/teardown.sh` (A) bzw.
   `… ./scripts/teardown.sh --all` (B).
2. Ergebnis: Lauf grün; die Summary zeigt `TEARDOWN_SECONDS` →
   Architektur §9.
3. Nur bei B: Portal-CNAME beim Nameserver löschen:
   `pdnsutil delete-rrset rypox.com kundenportal-demo.rypox.com CNAME`.
4. Prüfen 👁 wie [Kapitel 3.6](anleitung-kontoinhaber.md#36-laufende-ressourcen-finden),
   aber mit Filter: **Tag Editor** → **Regions** „All regions",
   **Resource types** „All supported resource types", **Tags**: Key
   `project`, Value `kundenportal-demo` → **Search resources**.
   Der Index hinkt einige Minuten nach; im Zweifel direkt in der Konsole des
   Dienstes nachsehen.
5. Erwartet bei B: nur Fundament (IAM-Rollen, OIDC-Anbieter, Richtlinie,
   SNS-Topic `kundenportal-budget-alerts`, SSM-Parameter unter
   `/kundenportal/…` aus Terraform) und CDK-Bootstrap (je Region Stack
   `CDKToolkit`, Bucket, ECR-Repository, Rollen, Parameter). Bei A zusätzlich
   die Ressourcen von Certificate, Base und Edge.

Das Skript leert Buckets vor dem Löschen, räumt Log-Gruppen außerhalb von
CloudFormation auf und bricht bei unklaren Fehlern ab, statt Stacks still zu
überspringen.

Fundament abbauen (nur wenn das Projekt endet, nach B): lokal `terraform
destroy` wie in [Kapitel 5.4](anleitung-fundament.md#54-plan-und-apply),
nicht über GitLab — die GitLab-Rolle würde sich dabei selbst löschen.

### 8.8 Protokoll Abbau

| Datum | Schritt | Ergebnis | Wer |
|---|---|---|---|
| | 8.7 Teardown-Lauf, Dauer | | |
| | 8.7 Portal-CNAME gelöscht | | |
| | 8.7 Tag Editor: nur Fundament und Bootstrap übrig | | |

## 9. Vor Ablauf des Free Plans

Der [Free Plan](glossar.md#free-plan) endet 6 Monate nach Kontoanlage
(Konto vom 29.09.2026 → Ende März 2027) oder früher, wenn das Guthaben
aufgebraucht ist; danach schließt AWS das Konto, sofern nicht vorher auf den
Paid Plan gewechselt wurde
[B: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html].

Anfang März 2027 entscheiden 👁 (Guthaben prüfen wie Kapitel 3.3):

| Entscheidung | Schritte |
|---|---|
| Demo soll weiterlaufen | ✎ **Billing and Cost Management** → **Free Tier** → **Upgrade plan**; das Restguthaben (gültig bis 29.09.2027) bleibt. Ab dann ist das Budget aus Kapitel 5 die Frühwarnung. Rückweg: keiner (Wechsel ist endgültig) |
| Demo endet | ✎ Teardown (8.7), CDK-Bootstrap entfernen (7.1), `terraform destroy` (5.4), State `foundation` in GitLab löschen, DNS-Einträge löschen; das Konto schließt AWS dann selbst |

## 10. Repository öffentlich schalten

Ziel: Das GitHub-Repository wird öffentlich (Vorgabe: Referenzprojekt).
Danach braucht GitLab keinen Deploy-Key mehr, und die Freigaberegeln des
Environments greifen auch im GitHub-Free-Plan.

Vorher 👁: Der Agent prüft die Git-Historie auf Geheimnisse, Kontonummern und
private Adressen und meldet das Ergebnis. Erst danach umschalten.

1. ✎ GitHub → Repository → **Settings** → **General** → ganz unten **Danger
   Zone** → **Change repository visibility** → **Change to public** →
   Bestätigungen folgen (Repository-Namen eintippen).
   Rückweg: dieselbe Stelle, **Change to private** (bereits erstellte Forks
   und Kopien bleiben öffentlich).
2. ✎ Deploy-Key löschen: **Settings** → **Deploy keys** →
   `gitlab-platform (read-only)` → **Delete**.
3. ✎ GitLab-Variable löschen: Projekt `platform` → **Settings** → **CI/CD** →
   **Variables** → `GITHUB_DEPLOY_KEY` → **Delete**. Die Pipeline klont dann
   anonym per HTTPS (`SOURCE_HTTPS`); `SOURCE_REF` bleibt ein fester Commit,
   den der Agent bei Fundament-Änderungen neu setzt.
4. 👁 Nächste Pipeline im Projekt `platform` (oder **Run pipeline** auf
   `main`): Job **plan** grün, im Protokoll „Source: <Commit>".
5. ✎ Environment `production` vervollständigen, falls 7.3 galt: Required
   reviewers, Branch-Regeln, Environment-Variable `AWS_DEPLOY_ROLE_ARN`
   (7.2, Schritte 3–5); danach die Repository-Variable löschen.
6. 👁 Probe: **Deploy** starten → der Lauf muss auf „Review deployments"
   warten. Wenn nicht: Schritt 5 prüfen.

Die Workflows sind gegen Fremdnutzung abgesichert: Sie starten nur manuell
(Schreibrechte nötig), nur im Repository `janpfeil/kundenportal-demo`, und
Pull Requests aus Forks erreichen das Environment nie.

### 10.1 Protokoll

| Datum | Schritt | Ergebnis | Wer |
|---|---|---|---|
| | Vorab: Historie geprüft (durch Agent) | | |
| | Schritt 1: Repository öffentlich | | |
| | Schritte 2–3: Deploy-Key und GitLab-Variable entfernt | | |
| | Schritt 4: Plan-Job über HTTPS grün | | |
| | Schritte 5–6: Freigabe greift | | |
