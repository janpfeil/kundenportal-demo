# Glossar

Stand: 2026-09-30. Zentrale Begriffsquelle für alle Wiki-Seiten. Spalten:
**Begriff** (Anker im Glossar), **Auch** (weitere Schreibweisen, durch
Komma getrennt; der Generator verlinkt auch diese), **Erklärung**,
**Außerhalb von AWS** (vergleichbare Lösungen anderer Anbieter, aus der
Java-/Self-Hosting-Welt oder als Open Source).

Das Glossar ist auf zwei Dateien verteilt (je unter 500 Zeilen): diese
Datei und die [Fortsetzung](glossar-2.md) ab „Infrastruktur als Code“. Der
Generator fügt beide zu **einer** Glossar-Seite zusammen; Verweise zeigen
immer auf `glossar.md#anker`.

## AWS-Grundlagen

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| AWS | Amazon Web Services | Cloud-Plattform von Amazon mit über 200 Diensten (Rechenleistung, Datenbanken, Netzwerk, Messaging …), abgerechnet nach Nutzung | Microsoft Azure, Google Cloud (GCP), Hetzner Cloud, IONOS, STACKIT, eigene Server |
| AWS-Konto | Neukonten, Neues Konto, Neukunden-Angebote | Abrechnungs- und Sicherheitsgrenze bei AWS: alle Ressourcen, Rechnungen und Berechtigungen hängen an einem Konto | Azure Subscription, GCP Project |
| Account ID | Kontonummer | zwölfstellige Nummer eines AWS-Kontos; kein Geheimnis, aber nicht öffentlich zu machen | Azure Subscription ID |
| Root-Benutzer | Root user, Root-Benutzers, Root | Anmeldung mit der E-Mail-Adresse, mit der das Konto angelegt wurde; hat alle Rechte und sollte nur für Konto- und Abrechnungsaufgaben genutzt werden | `root` unter Linux |
| Credential Report | Credential report, credentials report | von IAM erzeugte CSV-Liste aller Zugänge eines Kontos mit Erstellungsdatum, MFA-Status und Schlüsselnutzung; die Zeile `<root_account>` zeigt das Erstellungsdatum des Kontos – https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_getting-report.html | Benutzer-Export aus Keycloak/Active Directory |
| AWS Management Console | Konsole, Billing-Konsole, Billing and Cost Management | Weboberfläche von AWS; der Bereich Billing zeigt Rechnungen, Guthaben (Credits) und Freikontingent-Verbrauch | Azure Portal, Google Cloud Console |
| Region | eu-central-1, us-east-1 | geografischer Standort mit eigenen Rechenzentren; `eu-central-1` = Frankfurt, `us-east-1` = Nord-Virginia (dort müssen manche globalen Einstellungen, z. B. CloudFront-Zertifikate, liegen) | Azure Region, GCP Region; bei Hetzner „Standort" |
| AZ | Availability Zone | ein oder mehrere getrennte Rechenzentren innerhalb einer Region; Ausfallsicherheit durch Verteilung auf mehrere AZs | Azure Availability Zone, GCP Zone |
| Serverless | serverlos | Betriebsmodell, bei dem man keine Server verwaltet und nur für tatsächliche Nutzung zahlt; ohne Last kostet es (fast) nichts | Azure Functions, Google Cloud Run, Cloudflare Workers, Knative/OpenFaaS auf eigenem Kubernetes |
| Cloud | Cloud-Plattform | über das Internet gemietete Rechenleistung, Speicher und Dienste, abgerechnet nach Nutzung | eigenes Rechenzentrum (On-Premises) |
| Hybrid-Architektur | Hybrid, On-Premises, eigenes Rechenzentrum, eigene Infrastruktur | Teile eines Systems laufen in der Cloud, andere im eigenen Rechenzentrum bzw. auf eigenen Servern; im Demo: Altsysteme auf eigenem Server, Portal auf AWS | — |
| Eigener Server | | vom Projektinhaber selbst betriebener Server mit Docker; im Demo Standort der simulierten Altsysteme | — |
| Managed Service | verwalteter Dienst | Dienst, dessen Betrieb (Updates, Backups, Skalierung) der Anbieter übernimmt | gehostete Angebote wie Aiven, MongoDB Atlas, Confluent Cloud |
| ARN | Amazon Resource Name | eindeutige Kennung jeder AWS-Ressource, z. B. `arn:aws:s3:::mein-bucket` | Azure Resource ID, GCP Resource Name |
| Tags | Tagging | Schlüssel-Wert-Etiketten an Ressourcen, z. B. `project=kundenportal-demo`; wichtig für Kostenauswertung und Aufräumen | Labels in Kubernetes/GCP, Tags in Azure |

## Konto, Abrechnung und Kosten

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| Free Tier | Free-Tier, Free-Tier-Bedingungen, Freikontingent, Freikontingente, Kontingent, Kontingente | Sammelbegriff für kostenlose Nutzungsmengen bei AWS | Azure Free Account, Google Cloud Free Tier |
| Always Free | always free, Always-Free | Freikontingente, die unbefristet jeden Monat gelten, z. B. 1 Mio. Lambda-Aufrufe | GCP „Always Free", Azure „always free services" |
| Free Plan | | AWS-Kontoplan für Neukonten seit 15.07.2025: garantiert keine Kosten, aber nur ausgewählte Dienste und **automatische Kontoschließung** nach 6 Monaten oder aufgebrauchtem Guthaben – https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html | vergleichbar mit Azure „Free Account" (30 Tage Guthaben) |
| Legacy Free Tier | alte Bedingungen, 12-Monats-Angebote | Freikontingent-Modell für Konten vor dem 15.07.2025: 12 Monate kostenlose Kontingente für viele Dienste plus Always Free | — |
| Paid Plan | | regulärer AWS-Kontoplan: alle Dienste, Startguthaben wird zuerst verbraucht, danach Abrechnung nach Nutzung; Konto bleibt bestehen | Pay-as-you-go-Abo bei Azure/GCP |
| Guthaben | Credits, Startguthaben | Gutschrift in US-Dollar, die mit Rechnungsbeträgen verrechnet wird; bei Neukonten bis 200 $, verfällt nach 12 Monaten | Azure-/GCP-Startguthaben |
| Pay-as-you-go | nutzungsbasiert | Abrechnung nur nach tatsächlicher Nutzung (Aufrufe, GB, Sekunden) ohne Grundgebühr | Strom-/Mobilfunk-Prepaid-Prinzip; Gegenteil: Mietserver zum Festpreis |
| Fixkosten | Fixkostentreiber, Dauerkosten | Kosten, die auch ohne einen einzigen Nutzer anfallen, weil eine Ressource stundenweise abgerechnet wird (z. B. NAT Gateway, ALB, RDS) | Miete für einen VServer |
| AWS Budgets | Budgets, Budget, Budget-Alarm | kostenloser Dienst für Kostengrenzen mit E-Mail-/SNS-Alarm bei Überschreitung; **kein harter Stopp**, Daten kommen Stunden verzögert | Azure Cost Management Budgets, GCP Budget Alerts |
| Budget Actions | | Erweiterung von Budgets, die bei Überschreitung automatisch handelt, z. B. eine sperrende IAM-Policy anhängt | Azure Budget + Action Group |
| Cost Explorer | | AWS-Auswertung der Kosten nach Dienst, Zeit und Tags | Azure Cost Analysis, GCP Billing Reports |
| Resource Explorer | Tag Editor | AWS-Suche über alle Ressourcen eines Kontos (alle Regionen); Tag Editor findet und ändert Ressourcen nach Tags | Azure Resource Graph, GCP Asset Inventory |
| Savings Plans | Reserved Instances | Rabattmodelle gegen feste Laufzeitbindung (1–3 Jahre); für ein Demo irrelevant | Azure Reservations, GCP Committed Use Discounts |
| AWS Marketplace | Marketplace | Shop für Software von Drittanbietern, abgerechnet über die AWS-Rechnung | Azure Marketplace, GCP Marketplace |
| AWS Organizations | | Verbund mehrerer AWS-Konten unter gemeinsamer Abrechnung und Richtlinien | Azure Management Groups, GCP Organization |
| Mitgliedskonto | Mitgliedskonten | Konto innerhalb einer AWS Organization; eigene Ressourcen und Kosten, gemeinsame Rechnung | Azure Subscription unter einer Management Group |
| Control Tower | | AWS-Dienst, der eine Mehrkonten-Landschaft mit Leitplanken automatisiert aufsetzt | Azure Landing Zones |
| SCP | Service Control Policy | Richtlinie in AWS Organizations, die ganze Konten einschränkt (z. B. „keine Regionen außer Frankfurt") | Azure Policy, GCP Organization Policy |
| Kill-Switch | Not-Aus | automatische Notbremse bei Kostenalarm; im Demo (seit Phase 4): Budget-Alarm → SNS → Tenancy-Lambda sperrt das Einlösen neuer Demo-Pässe (503), laufende Pässe bleiben nutzbar | Feature-Flag „maintenance mode" |
| Teardown | Rückbau, Teardown-Workflow | vollständiges Entfernen aller Demo-Ressourcen per `cdk destroy` und `terraform destroy` | `docker compose down -v`, `helm uninstall` |
| Demo-Modus | Z2, Demo auf Abruf, Auf-/Abbau | Betriebsart, bei der der AWS-Stack nur für eine Vorführung per GitHub-Workflow aufgebaut und danach wieder abgebaut wird; dazwischen 0 $ | ephemere Testumgebung |
| Schlafmodus | Z3, Aufweck-Mechanik, Scale to zero | Betriebsart, in der die kostenpflichtigen Teile nach Inaktivität automatisch entfernt und beim nächsten Besuch automatisch neu angelegt werden; der Besucher wartet dann 1–3 Minuten | Scale-to-zero bei Knative/Cloud Run |
| Dauerbetrieb mit Deckel | Z1 | Betriebsart, bei der alles dauerhaft läuft und Throttling, Budget-Alarm und Kill-Switch Kosten auf Cent-Bruchteile begrenzen | — |
| GitLab-managed Terraform State | GitLab-State | Terraform-State, den GitLab über ein HTTP-Backend mit Sperre speichert – https://docs.gitlab.com/user/infrastructure/iac/terraform_state/ | S3-Backend, HCP Terraform |

## Rechenleistung

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| Lambda | AWS Lambda, Lambdas, Lambda-Funktion | führt eine einzelne Funktion (z. B. einen HTTP-Handler) bei Bedarf aus; Abrechnung pro Aufruf und Laufzeit, skaliert automatisch von 0 auf viele Instanzen | Azure Functions, Google Cloud Functions/Cloud Run, Cloudflare Workers; in Java: vergleichbar mit einem Spring-Cloud-Function-Handler, der nur bei Anfrage startet |
| Lambda-Handler | Handler, REST-Handler | die Einstiegsfunktion einer Lambda, die das Ereignis (HTTP-Request, Queue-Nachricht) erhält | Controller-Methode in Spring MVC, Message-Listener |
| GB-s | GB-Sekunden | Abrechnungseinheit von Lambda: zugewiesener Speicher in GB × Laufzeit in Sekunden | vergleichbar mit vCPU-/RAM-Sekunden bei Cloud Run |
| Concurrency | Nebenläufigkeit, gleichzeitige Ausführungen | Zahl der gleichzeitig laufenden Instanzen einer Lambda | Thread-/Pod-Anzahl |
| Reserved Concurrency | reservierte Concurrency | feste Obergrenze gleichzeitiger Ausführungen einer Lambda; wirkt im Demo als harte Kostenbremse (0 = Funktion abgeschaltet). Reservieren lässt sich höchstens das Kontolimit minus 100 – bei einem Neukonto-Limit von 10 also gar nichts – https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html | `maxReplicas` im Kubernetes-HPA, Thread-Pool-Größe |
| Service Quotas | Quota, Quoten, Kontolimit, Concurrent executions | AWS-Dienst, der die Obergrenzen eines Kontos je Dienst und Region anzeigt (z. B. Lambda „Concurrent executions“) und Erhöhungen per Antrag ermöglicht; der Antrag ist kostenlos – https://docs.aws.amazon.com/servicequotas/latest/userguide/request-quota-increase.html | Quotas in GCP, Azure „Usage + quotas“ |
| Provisioned Concurrency | | dauerhaft vorgewärmte Lambda-Instanzen gegen Kaltstarts; kostet stundenweise → im Demo vermeiden | `minReplicas > 0` |
| Kaltstart | Cold Start, Aufwärm-Aufruf, Aufwärmen | Verzögerung, wenn eine Lambda-Instanz erst gestartet werden muss (bei Node.js meist < 1 s) | JVM-Start eines Containers bei Scale-from-zero |
| Event Source Mapping | Lambda-Poller, Poller | AWS-seitiger Mechanismus, der eine Queue (SQS) oder einen Stream abfragt und Lambda mit den Nachrichten aufruft | `@RabbitListener`/`@KafkaListener`-Container in Spring |
| Fargate | | Container ausführen, ohne Server/Knoten zu verwalten; abgerechnet pro laufender Sekunde | Google Cloud Run, Azure Container Apps, Docker/Kubernetes auf eigenen Servern |
| Lightsail | | vereinfachte AWS-Server/Container zum Festpreis pro Monat | Hetzner Cloud, DigitalOcean |
| Step Functions | | Workflow-Dienst, der Lambdas und andere Dienste als Zustandsautomat orchestriert | Camunda, Temporal, Spring State Machine |
| Lambda Web Adapter | Web Adapter, LWA | Werkzeug, mit dem normale Web-Server-Apps (Express, Spring Boot, Next.js) unverändert in Lambda laufen | — |
| Function URL | Lambda Function URL | eigene HTTPS-Adresse einer Lambda ohne API Gateway; unterstützt Response Streaming und kann hinter CloudFront (mit OAC) liegen | direkt erreichbarer HTTP-Endpunkt eines Dienstes |
| Response Streaming | | Lambda schickt die Antwort in Teilen statt am Stück – nötig für Next.js-Streaming | Chunked Transfer in HTTP |

## Speicher und Datenbanken

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| S3 | Amazon S3, S3-Bucket, Bucket, Buckets | Objektspeicher für Dateien beliebiger Größe in „Buckets"; Standard für statische Websites, Uploads, Build-Artefakte | Azure Blob Storage, Google Cloud Storage, MinIO (selbst gehostet, S3-kompatibel), Hetzner Object Storage |
| Presigned URL | vorsignierte URL | zeitlich begrenzter, signierter Link, mit dem der Browser direkt in S3 hoch- oder herunterlädt, ohne AWS-Zugangsdaten | Azure SAS-Token, GCS Signed URL |
| Lifecycle-Regel | Lifecycle | S3-Regel, die alte Objekte automatisch löscht oder in günstigere Klassen verschiebt | Aufräum-Cronjob |
| Block Public Access | | S3-Einstellung, die jeden öffentlichen Zugriff auf einen Bucket sperrt, auch wenn eine Richtlinie ihn erlauben würde | Zugriffsebene „privat“ bei Azure Blob Storage, Public Access Prevention bei Google Cloud Storage |
| SSE-S3 | serverseitige Verschlüsselung | S3 verschlüsselt jedes Objekt beim Speichern mit von AWS verwalteten Schlüsseln; kostenlos | Verschlüsselung ruhender Daten bei Azure Storage und Google Cloud Storage; MinIO SSE |
| Versioning | Versionierung | S3 behält alte Fassungen überschriebener Dateien; kostet Speicher | Dateiversionierung in Nextcloud/Dropbox |
| DynamoDB | Amazon DynamoDB | vollständig verwaltete NoSQL-Datenbank (Schlüssel-Wert/Dokument) mit Antwortzeiten im Millisekundenbereich, ohne Server und ohne Verbindungs-Pool | MongoDB, Apache Cassandra, Azure Cosmos DB, Google Firestore, ScyllaDB |
| Single-Table-Design | Single Table, Single-Table, PK, SK, Partition Key, Sort Key, GSI, Sekundärindex | DynamoDB-Modellierung, bei der alle Entitäten einer Anwendung in einer Tabelle liegen und über zusammengesetzte Schlüssel (Partition/Sort Key) nach Zugriffsmustern angeordnet werden | Gegenmodell zu normalisierten SQL-Tabellen mit JOINs |
| RCU | Read Capacity Unit, RCU/WCU | Lese-Kapazitätseinheit von DynamoDB: 1 stark konsistenter Lesevorgang pro Sekunde bis 4 KB | — (in SQL-Welt: IOPS) |
| WCU | Write Capacity Unit | Schreib-Kapazitätseinheit von DynamoDB: 1 Schreibvorgang pro Sekunde bis 1 KB | — |
| provisioned | provisioniert, provisionierte DynamoDB | DynamoDB-Modus mit fest eingestellter Kapazität (RCU/WCU); im Always Free bis 25 Einheiten; bei Überlast wird gedrosselt statt berechnet | fest dimensionierter Datenbankserver |
| On-Demand | | DynamoDB-Modus ohne Kapazitätsplanung, Abrechnung pro Lese-/Schreibvorgang; nicht im Always Free | Serverless-Tarife von MongoDB Atlas oder Cosmos DB |
| Auto-Scaling | Autoscaling | automatisches Anpassen der Kapazität an die Last | Kubernetes Horizontal Pod Autoscaler |
| DynamoDB Streams | DynamoDB Stream, Streams, Stream-Kopie | Änderungsprotokoll einer DynamoDB-Tabelle: jede Änderung erscheint als Ereignis, das z. B. Lambda verarbeitet | Change Data Capture mit Debezium, MongoDB Change Streams, PostgreSQL Logical Replication |
| RDS | Amazon RDS | verwaltete relationale Datenbanken (PostgreSQL, MySQL …); läuft stundenweise → Fixkosten, im Demo vermieden | Azure Database for PostgreSQL, Cloud SQL, eigener PostgreSQL |
| OpenSearch | | verwalteter Such- und Analysedienst (Fork von Elasticsearch) | Elasticsearch, Apache Solr |
| ECR | Elastic Container Registry | AWS-Registry für Docker-Images | Docker Hub, GitHub Container Registry, Harbor, GitLab Registry |

## Netzwerk, Auslieferung und Sicherheit am Rand

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| CloudFront | Amazon CloudFront, CloudFront-Distribution | Content Delivery Network (CDN): liefert Inhalte weltweit aus nahen Standorten aus, cacht sie und leitet Pfade an verschiedene Ziele (S3, API Gateway, Lambda) weiter | Cloudflare, Akamai, Fastly, Bunny CDN; lokal: NGINX als Reverse Proxy mit Cache |
| CDN | Content Delivery Network | Netz verteilter Server, das Inhalte nah beim Nutzer zwischenspeichert | Cloudflare, Akamai |
| Distribution | | eine CloudFront-Konfiguration mit eigener Domain, Ursprüngen und Regeln | eine „Site"/„Zone" bei Cloudflare |
| Origin | Ursprung | Ziel, von dem CloudFront Inhalte holt (S3-Bucket, API Gateway, Lambda-URL) | Upstream in NGINX |
| Cache-Behavior | Behavior, Behaviors, Pfad-Routing | Regel in CloudFront: welcher Pfad (`/api/*`, `/mfe/*`) an welchen Origin geht und wie gecacht wird | `location`-Block in NGINX, Page Rule bei Cloudflare |
| Invalidierung | invalidiert, Cache-Invalidierung | Auftrag an CloudFront, zwischengespeicherte Kopien bestimmter Pfade (z. B. `/widgets/*`) zu verwerfen, damit die nächste Anfrage die neue Datei holt | Purge bei Cloudflare, Fastly oder Varnish |
| CORS | Cross-Origin Resource Sharing | Browser-Regel: Eine Seite darf Anfragen an eine andere Herkunft (Domain) nur schicken, wenn diese es per Header erlaubt; beim Upload erlaubt der Bucket nur `PUT` von der Portal-Domain | Spring `@CrossOrigin`, CORS-Konfiguration in NGINX |
| Flat-Rate-Plan | Flat-Rate, Flat-Rate-Pläne, Flat-Rate Free, CloudFront-Free-Plan | seit 11/2025 angebotene CloudFront-Pauschalpakete inkl. WAF, Route 53 und Zertifikat; die Stufe „Free" kostet 0 $ und drosselt bei Überschreitung statt zu berechnen – https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html | Cloudflare Free/Pro-Plan |
| CloudFront Functions | | sehr leichte JavaScript-Funktionen direkt am CDN-Rand (z. B. URL-Umschreiben, Header setzen); 2 Mio. Aufrufe frei | Cloudflare Workers (eingeschränkt), NGINX-`rewrite` |
| Lambda@Edge | | vollwertige Lambda-Funktionen an CloudFront-Standorten; teurer und immer kostenpflichtig → im Demo vermieden | Cloudflare Workers, Fastly Compute |
| OAC | Origin Access Control | CloudFront signiert seine Anfragen an den Ursprung, der nur CloudFront einlässt: ein **privater** S3-Bucket oder eine Lambda-Function-URL mit IAM-Prüfung; bei Function URLs werden Anfrage-Inhalte (POST-Bodies) nicht mitsigniert | Reverse Proxy mit internem Zugang zu MinIO |
| OAI | Origin Access Identity | Vorgänger von OAC, veraltet | — |
| Staging-Distribution | | CloudFront-Testkopie für Konfigurationsänderungen vor dem Live-Schalten | Staging-Umgebung |
| Echtzeit-Logs | | sekundengenaue Zugriffsprotokolle von CloudFront; kostenpflichtig | NGINX-Access-Log |
| API Gateway | Amazon API Gateway | verwalteter Eingangspunkt für APIs: nimmt HTTP-Anfragen an, prüft Authentifizierung, drosselt, leitet an Lambda weiter | Kong, Spring Cloud Gateway, NGINX, Traefik, Azure API Management |
| HTTP API | | schlanke, günstige Variante des API Gateway (≈ 1 $/Mio. Aufrufe) mit eingebautem JWT-Authorizer; im Demo gewählt | — |
| REST API (API Gateway) | REST-API-Variante | ältere, funktionsreichere und teurere Variante des API Gateway (≈ 3,50 $/Mio.) – nicht zu verwechseln mit dem Architekturstil REST | — |
| JWT-Authorizer | Authorizer | Prüfschritt im API Gateway, der Signatur, Aussteller und Zielgruppe eines JWT prüft, bevor die Lambda aufgerufen wird | Spring Security Resource Server, Kong JWT Plugin |
| Throttling | Drosselung, API-Throttling | Begrenzung der Anfragen pro Sekunde; zu viele Anfragen erhalten HTTP 429 | Rate Limiting in NGINX (`limit_req`), Bucket4j, Resilience4j RateLimiter |
| Burst | | kurzzeitig erlaubte Spitze über dem Throttling-Grenzwert (Token-Bucket-Verfahren) | `burst` in NGINX `limit_req` |
| Usage-Limits | Usage Plans | Kontingente pro API-Schlüssel beim API Gateway (nur REST-Variante) | API-Key-Kontingente in Kong |
| Route 53 | Amazon Route 53 | DNS-Dienst von AWS; eine Hosted Zone kostet 0,50 $/Monat | Cloudflare DNS, INWX, Hetzner DNS, Domain-Registrar |
| Hosted Zone | Route-53-Zone | Sammlung der DNS-Einträge einer Domain | DNS-Zone beim Registrar |
| Domain | Domains, Domainregister, Domainregistern | Internet-Adresse wie `beispiel.de`; wird bei einem Registrar für ca. 10–15 €/Jahr registriert | INWX, IONOS, Hetzner als Registrar |
| DNS | Domain Name System | Telefonbuch des Internets: übersetzt Namen wie `energie-demo.rypox.com` in Adressen | — |
| HTTPS | TLS, HTTP | verschlüsseltes Web-Protokoll; HTTP ohne Verschlüsselung | — |
| Nameserver | Nameservern | Server, der die DNS-Einträge einer Domain verwaltet; bei rypox eigene (`ns1.rypox.net`) | Route 53, Cloudflare DNS |
| CNAME | CNAME-Eintrag, CNAME-Einträge | DNS-Eintrag, der einen Namen auf einen anderen verweist, z. B. `energie-demo.rypox.com` → CloudFront-Adresse; auch für die Zertifikatsprüfung von ACM genutzt | — |
| Apex-Domain | | Domain ohne Subdomain, z. B. `beispiel.de` statt `www.beispiel.de` | — |
| Subdomain | | Unterdomain, z. B. `demo.beispiel.de` | — |
| ACM | AWS Certificate Manager, ACM-Zertifikat | stellt kostenlose TLS-Zertifikate für AWS-Dienste aus und erneuert sie automatisch | Let's Encrypt (certbot, Traefik) |
| WAF | AWS WAF, Web ACL | Web Application Firewall: filtert Anfragen nach Regeln (IP-Sperren, Rate Limits, bekannte Angriffe) | Cloudflare WAF, ModSecurity, NGINX-Regeln |
| DDoS | DDoS-Schutz | Überlastungsangriff durch sehr viele Anfragen; AWS Shield Standard schützt kostenlos auf Netzebene | Cloudflare DDoS Protection |
| VPC | Virtual Private Cloud | privates, isoliertes Netzwerk im AWS-Konto; Lambdas brauchen es nur für Zugriff auf private Ressourcen (z. B. RDS) | eigenes VLAN/Subnetz, Docker-Netzwerk, Hetzner Private Network |
| NAT Gateway | NAT | ermöglicht Ressourcen in privaten VPC-Subnetzen den Internetzugang; ≈ 32 $/Monat Fixkosten → im Demo vermieden | NAT-Funktion jedes Heimrouters |
| Interface-VPC-Endpoint | VPC-Endpoint | privater Zugang aus einer VPC zu AWS-Diensten ohne Internet; stundenweise berechnet | — |
| ALB | Application Load Balancer | Lastverteiler für HTTP-Verkehr auf Container/Server; ≈ 16–20 $/Monat Fixkosten → im Demo vermieden | NGINX, HAProxy, Traefik, Hetzner Load Balancer |
| Shield | AWS Shield | DDoS-Schutzdienst; Standard-Stufe kostenlos und automatisch aktiv | Cloudflare |

## Messaging und Ereignisse

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| EventBridge | Amazon EventBridge | Event-Bus: Dienste veröffentlichen Ereignisse, Regeln leiten sie anhand ihres Inhalts an Ziele (SQS, Lambda, SNS …) weiter | Apache Kafka mit Routing, RabbitMQ Topic Exchange, Azure Event Grid, Google Eventarc |
| Event | Events, Ereignis, Ereignisse | Nachricht, dass etwas passiert ist (z. B. „Zählerstand erfasst"); Empfänger reagieren darauf, ohne dass der Absender sie kennt | Spring `ApplicationEvent`, Kafka-Nachricht |
| Konsument | Konsumenten, Event-Konsumenten, Consumer | Dienst, der Nachrichten oder Events empfängt und verarbeitet | Kafka Consumer, `@RabbitListener` |
| Event-Bus | | zentrale Stelle, an die Ereignisse gesendet und von der sie verteilt werden | Kafka-Cluster, RabbitMQ-Broker |
| EventBridge-Regel | EventBridge-Regeln, Rule | Filter in EventBridge („alle Ereignisse vom Typ `AccountMigrated`") mit einem oder mehreren Zielen | Binding in RabbitMQ, Kafka-Streams-Filter |
| PutEvents | | API-Aufruf, mit dem eine Anwendung Ereignisse an EventBridge sendet | `kafkaTemplate.send(...)` |
| Custom Events | | selbst definierte Ereignisse der eigenen Anwendung (im Gegensatz zu AWS-eigenen Ereignissen); 1 $/Mio. | — |
| EventBridge Scheduler | Scheduler | zeitgesteuertes Auslösen von Zielen (einmalig oder wiederkehrend); 14 Mio. Aufrufe/Monat frei | Cron, Quartz Scheduler, Spring `@Scheduled` |
| EventBridge Pipes | Pipes | verbindet eine Quelle (z. B. DynamoDB Stream, SQS) mit einem Ziel inkl. Filter und Anreicherung | Kafka Connect, Apache Camel |
| Archive/Replay | Archive | Speichern und erneutes Abspielen vergangener EventBridge-Ereignisse | Kafka-Topic mit langer Aufbewahrung und Offset-Reset |
| SQS | Amazon SQS, Queue, Queues, SQS-Queue | Nachrichtenwarteschlange: Absender legt Nachrichten ab, Empfänger holt sie ab und bestätigt sie; entkoppelt Dienste und puffert Last | RabbitMQ Queue, ActiveMQ/Artemis, Azure Service Bus Queue, Google Pub/Sub |
| SQS-FIFO | FIFO | SQS-Variante mit garantierter Reihenfolge und Deduplizierung | Kafka-Partition, RabbitMQ mit Single Consumer |
| Long Polling | Long-Polling | Abruf, der bis zu 20 s auf Nachrichten wartet statt sofort leer zurückzukehren; spart Anfragen | blockierendes `receive()` in JMS |
| DLQ | Dead-Letter-Queue | Ablage für Nachrichten, die nach mehreren Versuchen nicht verarbeitet werden konnten, zur Analyse und Nachverarbeitung | Dead Letter Exchange in RabbitMQ, DLT (Dead Letter Topic) in Spring Kafka |
| Partial Batch Response | ReportBatchItemFailures, batchItemFailures | Antwort einer SQS-verarbeitenden Lambda, die nur die **fehlgeschlagenen** Nachrichten eines Stapels meldet; nur diese werden erneut zugestellt – https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html | Einzel-Ack/Nack in RabbitMQ, Spring Kafka `DefaultErrorHandler` |
| maxReceiveCount | | Zahl der Zustellversuche, nach der SQS eine Nachricht in die DLQ verschiebt | `maxAttempts` im Spring-Retry |
| Redrive | | Zurückführen von Nachrichten aus der DLQ in die Ursprungs-Queue, nachdem der Fehler behoben ist | Shovel in RabbitMQ, Replay aus dem DLT |
| Retry | Wiederholung | erneuter Verarbeitungsversuch nach einem Fehler | Spring Retry, Resilience4j Retry |
| Retry-Policy | Wiederholungsrichtlinie | Einstellung an einem EventBridge-Regelziel: wie oft und wie lange EventBridge die Zustellung wiederholt, bevor das Ereignis in die DLQ geht | Retry-Konfiguration von Kafka-Consumern, Spring Retry |
| Asynchroner Aufruf | asynchroner Aufruf, asynchroner Lambda-Aufruf, Direktaufruf | Lambda nimmt das Ereignis an, bestätigt sofort und verarbeitet es aus einer internen Warteschlange; bei Fehlern wiederholt Lambda selbst (bis zu 2-mal) | `@Async` in Spring, Fire-and-forget-Aufruf |
| On-Failure-Destination | On-Failure-DLQ, Lambda-Destination | Ziel (z. B. SQS-Queue), an das Lambda einen asynchronen Aufruf weitergibt, wenn alle Wiederholungen fehlgeschlagen sind | Fehlerkanal in Spring Integration, Dead Letter Topic |
| Standard-Bus | default-Bus, Default Event Bus | der in jedem Konto vorhandene EventBridge-Bus, auf dem AWS-Dienste (z. B. S3) ihre Ereignisse veröffentlichen; diese Ereignisse sind kostenlos | Systemereignisse einer Plattform, z. B. Azure Event Grid System Topics |
| SNS | Amazon SNS, SNS-Topic, Topic, Topics | Publish/Subscribe-Dienst: eine Nachricht an ein Topic geht an alle Abonnenten (E-Mail, SQS, Lambda, HTTP, SMS) | RabbitMQ Fanout Exchange, Kafka Topic mit mehreren Consumer Groups, Google Pub/Sub, Azure Service Bus Topic |
| Fan-out | | Muster, eine Nachricht gleichzeitig an mehrere Empfänger zu verteilen | Fanout Exchange in RabbitMQ |
| Publish/Subscribe | Pub/Sub, Publishes | Absender veröffentlichen an ein Thema, ohne die Empfänger zu kennen | JMS Topics, Kafka |
| Domänen-Event | Domänen-Events | fachliches Ereignis in der Vergangenheitsform, z. B. `CustomerRegistered`, `AccountMigrated`, `MeterReadingSubmitted`; andere Dienste reagieren darauf | Spring `ApplicationEvent`, Domain Events im DDD |
| Idempotenz | idempotent | Eigenschaft einer Verarbeitung, bei mehrfacher Ausführung dasselbe Ergebnis zu liefern wie bei einfacher; nötig, weil Ereignisse doppelt zugestellt werden können | Idempotent Consumer (Enterprise Integration Patterns), Idempotency-Key bei Zahlungs-APIs |
| Projektion | Projektionen, Vertragsprojektion, Read Model | eigene, aus Ereignissen aufgebaute Kopie fremder Daten, die ein Service zum Lesen hält, statt die Daten eines anderen Service abzufragen | Read Model in CQRS (Axon Framework), materialisierte Sicht |
| Event-carried State Transfer | | Muster: ein Ereignis trägt den ganzen relevanten Zustand (hier den vollständigen Vertrag), sodass Empfänger nicht beim Absender nachfragen müssen | gleichnamiges Muster bei Kafka-Architekturen (Martin Fowler) |
| Event-getrieben | eventlastig, event-getriebene | Architektur, in der Dienste über Ereignisse statt direkter Aufrufe zusammenarbeiten | — |

## Identität und Sicherheit

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| Auth0 | | verbreiteter Identitätsdienst (SaaS, von Okta) für Registrierung, Login, Social Login, MFA und Benutzerverwaltung; **im Demo nicht verwendet** (ersetzt durch Amazon Cognito), bleibt über Standard-OIDC als weiterer Anbieter austauschbar | Keycloak (Open Source, selbst gehostet), Okta, Microsoft Entra External ID, Amazon Cognito, Zitadel |
| Amazon Cognito | Cognito, Cognito-JWT, Cognito-JWTs | AWS-Identitätsdienst für Registrierung, Login, MFA und Benutzerverwaltung; im Demo der Portal-Login (Entscheidung 29.09.2026), angelegt per CDK – https://aws.amazon.com/cognito/pricing/ | Auth0, Keycloak, Microsoft Entra External ID, Zitadel |
| User Pool | User Pools, Benutzerpool | Nutzerverzeichnis in Cognito mit eigenen Nutzern, Gruppen, App-Clients und Triggern; zugleich OIDC-Aussteller | Realm in Keycloak, Tenant in Auth0 |
| Essentials-Plan | Essentials, Plan Essentials, Feature-Plan | Cognito-Tarifstufe (Lite, Essentials, Plus) je User Pool; Essentials ist Standard für neue User Pools und enthält Managed Login; 10.000 aktive Nutzer im Monat frei, ohne Ablauf – https://aws.amazon.com/cognito/pricing/ | Auth0 Free/Essentials |
| Managed Login | Cognito-Präfix-Domain, Präfix-Domain, Hosted UI | von Cognito gehostete Login-, Registrierungs- und Passwort-Seiten samt OAuth2-/OIDC-Endpunkten; erreichbar unter einer Präfix-Domain (`<präfix>.auth.<region>.amazoncognito.com`) oder eigener Domain; Vorgänger: Hosted UI – https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html | Keycloak-Login-Theme, Auth0 Universal Login |
| App-Client | App-Clients, App Client, vertraulicher Client, Client Secret | Eintrag einer Anwendung im User Pool mit Client-ID, erlaubten Rückkehr-Adressen und Abläufen; ein vertraulicher Client (hier die Next.js-Shell) hat zusätzlich ein Geheimnis, das nur der Server kennt | Client in Keycloak, Application in Auth0 |
| Lambda-Trigger (Cognito) | Cognito-Trigger, Cognito-Lambda-Trigger | Lambda-Funktion, die Cognito an festen Punkten aufruft (vor Registrierung, vor/nach Login, Token-Erzeugung, Migration); im Demo in `services/identity` | Auth0 Actions, Keycloak Authenticator-SPI |
| Migrate-User-Trigger | Migrate User, Migrate-User, User-Migration-Trigger | Cognito-Trigger für die Lazy Migration: meldet sich ein unbekannter Nutzer mit Passwort an, prüft die Lambda die Daten beim Altsystem; bei Erfolg legt Cognito den Nutzer mit demselben Passwort an – https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html | Auth0 Custom Database mit Import, Keycloak User Storage SPI |
| Keycloak | id.rypox.net | Open-Source-Identitätsdienst (OIDC, SAML), selbst betrieben; im Demo unter `id.rypox.net` die Anmeldung des Telko-Altsystems und ab Phase 3 Gegenstelle des Migrate-User-Triggers | Amazon Cognito, Auth0, Zitadel |
| Realm | Realms | abgeschlossener Bereich in Keycloak mit eigenen Nutzern, Clients und Einstellungen | User Pool in Cognito, Tenant in Auth0 |
| Tenant | Auth0-Tenant | abgeschlossene Auth0-Instanz mit eigenen Nutzern, Apps und Einstellungen; im Demo nicht verwendet | Realm in Keycloak, User Pool in Cognito |
| Universal Login | | von Auth0 gehostete Login-Seite, auf die die App weiterleitet (keine Passwort-Eingabe in der eigenen App); im Demo stattdessen Managed Login | Keycloak-Login-Theme |
| Auth0 Actions | Post-Login-Action | eigene JavaScript-Funktionen, die Auth0 an festen Punkten ausführt (z. B. nach dem Login: Onboarding-Status prüfen, Claims ergänzen); Cognito-Gegenstück: Lambda-Trigger | Keycloak Authenticator-SPI/Script Mapper |
| Auth0 Forms | Forms | in Auth0 gestaltete Formulare mitten im Login-Ablauf, z. B. für fehlende Profildaten | Keycloak Required Actions |
| Auth0 Organizations | Organizations | Mandantenfunktion in Auth0 für B2B-Kunden | Keycloak Organizations |
| Custom Domain | | eigene Domain für die Login-Seite (`login.beispiel.de` statt der Cognito-Präfix-Domain oder `*.auth0.com`) | — |
| Social Connections | Social Login | Login über Google, Apple, GitHub … | Identity Brokering in Keycloak |
| Enterprise Connection | | Anbindung eines Firmen-Verzeichnisses (SAML, Entra ID, LDAP) | Keycloak User Federation |
| Passwordless | | Login per E-Mail-Link oder Einmalcode ohne Passwort | Keycloak Magic Link |
| Passkeys | | passwortloses Anmelden per Gerät (WebAuthn/FIDO2) | WebAuthn in Keycloak |
| MFA | Mehrfaktor-Authentifizierung, Authentifizierungs-App | zweiter Faktor zusätzlich zum Passwort (App-Code, SMS, Passkey) | TOTP in Keycloak |
| MAU | Monthly Active Users, aktive Nutzer | Zahl der Nutzer, die sich in einem Monat mindestens einmal anmelden oder ihr Konto ändern; Preisgrundlage bei Cognito (Essentials: 10.000 frei) und Auth0 | — |
| M2M | Machine-to-Machine, M2M-Tokens | Tokens für Dienst-zu-Dienst-Aufrufe ohne Nutzer (Client-Credentials-Flow); im Auth0 Free 1.000/Monat → cachen | Service Accounts in Keycloak |
| Event Stream | | Auth0-Funktion, die Nutzerereignisse (Registrierung, Login) an externe Systeme, z. B. EventBridge, sendet | Keycloak Event Listener SPI |
| Custom Database | Custom DB, Custom-DB-Skripte, Custom-DB-Verbindung | Auth0-Verbindung, bei der Auth0 für Login und Nutzersuche eigene Skripte aufruft, die ein fremdes Nutzerverzeichnis abfragen; Cognito-Gegenstück: Migrate-User-Trigger | Keycloak User Storage SPI |
| Lazy Migration | automatische Migration, trickle migration, Automatic Migration | Konto wird erst beim ersten Login ins neue System übernommen: im Demo ruft Cognito den Migrate-User-Trigger, der das Passwort einmalig beim Altsystem prüft; danach speichert Cognito den Nutzer selbst (bei Auth0: Custom Database) – https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html | Keycloak User Storage SPI mit Import |
| Bulk-Import | Bulk-Migration, AdminCreateUser, CSV-Import | Übernahme vieler Konten auf einmal; bei Cognito per CSV-Import oder `AdminCreateUser`, im Demo ohne Passwörter (Nutzer müssen zurücksetzen); Hash-Import (u. a. bcrypt) ist noch nicht in jedem User Pool verfügbar – https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html | Keycloak Partial Import (JSON), Auth0 Bulk User Import |
| Management API | | Auth0-Verwaltungsschnittstelle (Nutzer, Apps, Importe); bei Cognito entsprechen ihr die `Admin…`-API-Aufrufe | Keycloak Admin REST API |
| Passwort-Hash | Hash, Alt-Hashes, Legacy-Hash, Hashes, Reset-Flow, Passwort-Reset, Reset-Aufforderung | Einweg-verschlüsselte Form eines Passworts; alte Systeme nutzen oft schwache Verfahren (MD5, SHA-1), die bei der Migration einen Passwort-Reset erzwingen | bcrypt, Argon2, PBKDF2 in Spring Security |
| Account-Linking | Kontenverknüpfung | mehrere Identitäten derselben Person (z. B. Google-Login und Altkonto) zu einem Konto zusammenführen | Keycloak Account Linking |
| Dublette | Dubletten, Dublettenauflösung | doppelt vorhandene Kundendatensätze, die bei der Übernahme erkannt und zusammengeführt werden müssen | Master Data Management |
| Progressive Profiling | progressives Onboarding | Profildaten schrittweise über mehrere Logins abfragen statt in einem langen Formular | — |
| OAuth2 | OAuth 2.0 | Standard für delegierte Autorisierung: eine App erhält ein Zugriffstoken, ohne das Passwort des Nutzers zu kennen | herstellerunabhängiger Standard (RFC 6749), in Java: Spring Security OAuth2 Client |
| OpenID Connect | OIDC | Identitätsschicht auf OAuth2: liefert zusätzlich ein ID-Token mit Nutzerangaben; auch für die Anmeldung von GitHub Actions bei AWS genutzt | Standard, unterstützt von Keycloak, Entra ID, Google |
| Authorization Code + PKCE | PKCE, Authorization Code | empfohlener OAuth2-Ablauf für Browser-, Server- und Mobil-Apps: Einmal-Code gegen Token tauschen, abgesichert durch einen zufälligen Prüfwert; im Demo tauscht die Shell den Code serverseitig als vertraulicher App-Client | Standard (RFC 7636) |
| openid-client | | Node.js-Bibliothek für OAuth2-/OIDC-Clients; im Demo meldet die Next.js-Shell damit serverseitig bei Cognito an, ohne sich an einen Anbieter zu binden – https://github.com/panva/openid-client | Spring Security OAuth2 Client, Nimbus OAuth SDK |
| Auth.js | next-auth, NextAuth.js | Login-Bibliothek für Next.js; Version 5 ist noch Beta und wird im Demo daher nicht verwendet – https://www.npmjs.com/package/next-auth | — |
| Resource Server | Scope, Scopes, OAuth-Scope | in Cognito die Beschreibung einer API mit eigenen **Scopes** (Berechtigungen wie `kundenportal/profile.read`); das Access Token trägt die gewährten Scopes, der JWT-Authorizer verlangt sie je Route – https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html | API und Scopes in Auth0, Client Scopes in Keycloak |
| Pre-Token-Generation-Trigger | Pre Token Generation, Pre-Token-Trigger | Lambda, die Cognito vor dem Ausstellen der Tokens aufruft; in Version 2 kann sie dem **Access Token** eigene Claims hinzufügen (im Demo `tenant_id`, `email`, `locale`, `name`) – https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html | Auth0 Post-Login-Action, Keycloak Protocol Mapper |
| Client Credentials | Client-Credentials-Flow | OAuth2-Ablauf für Dienst-zu-Dienst-Aufrufe mit Client-ID und Geheimnis | Standard |
| JWT | JSON Web Token, JWTs | signiertes Token im JSON-Format mit Angaben (Claims) wie Nutzer-ID und Ablaufzeit; der Empfänger prüft die Signatur ohne Rückfrage beim Aussteller | Standard (RFC 7519), in Java: Nimbus JOSE, jjwt |
| Token | Tokens, Zugangstoken, Zugriffstoken, ID-Token | digitaler Ausweis, den ein Identitätsdienst ausstellt und den eine App bei jedem API-Aufruf mitschickt | — |
| Claims | Claim | einzelne Angaben in einem JWT (z. B. `sub`, `email`, eigene Rollen) | — |
| Session | serverseitige Session | Anmeldezustand, den der Server (hier die Next.js-Shell) im Cookie verschlüsselt hält | HTTP-Session in Spring |
| XSS | Cross-Site Scripting | Angriff, bei dem fremdes JavaScript in eine Seite gelangt und dort z. B. Tokens aus dem Browser-Speicher ausliest | OWASP-Top-10-Risiko, Schutz per Content Security Policy |
| Cookie | httpOnly-Cookie, httpOnly | kleine Datei, die der Browser bei jeder Anfrage mitschickt; `httpOnly` heißt: für JavaScript unsichtbar und damit vor XSS geschützt | `JSESSIONID`-Cookie in Java-Webanwendungen |
| SameSite | SameSite=Lax | Cookie-Attribut: `Lax` heißt, der Browser schickt das Cookie bei Anfragen von fremden Seiten nicht mit, außer beim einfachen Aufruf eines Links | gleiches Attribut in jeder Webanwendung, z. B. Spring `ResponseCookie.sameSite` |
| CSRF | Cross-Site Request Forgery, CSRF-Schutz | Angriff, bei dem eine fremde Seite den Browser dazu bringt, mit der Sitzung des Nutzers eine schreibende Anfrage ans Portal zu schicken | CSRF-Token in Spring Security, Django CSRF-Middleware |
| Origin-Header | Origin-Prüfung | Header, mit dem der Browser bei schreibenden Anfragen die Herkunft der Seite angibt; der Server prüft ihn gegen die eigene Domain | Origin-Prüfung in Spring Security, Rails `forgery_protection_origin_check` |
| SigV4 | Signature Version 4, AWS-Signatur | Verfahren, mit dem AWS-Anfragen kryptografisch signiert werden; CloudFront signiert so die Anfragen an die Function URLs | HMAC-signierte Anfragen, z. B. bei Google Cloud Storage (V4-Signatur) |
| Payload-Hash | x-amz-content-sha256, Body-Hash | SHA-256 des Anfrage-Bodys; CloudFront braucht ihn vom Absender, um Anfragen mit Body per SigV4 zu signieren | Content-Digest-Header (RFC 9530) |
| Refresh Token | Refresh Tokens | langlebiges Token, mit dem eine App neue Access Tokens holt; bei Rotation wird es nach jeder Nutzung ersetzt | — |
| JWE | JSON Web Encryption | verschlüsseltes (nicht nur signiertes) Token-Format; im Demo steckt die Sitzung als JWE (`dir` + `A256GCM`) im Cookie, damit das Access Token für den Browser unlesbar bleibt | Standard (RFC 7516), in Java: Nimbus JOSE |
| HKDF | HMAC-based Key Derivation Function | Verfahren, um aus einem vorhandenen Geheimnis weitere Schlüssel für bestimmte Zwecke abzuleiten; im Demo wird der Cookie-Schlüssel aus dem Client-Secret abgeleitet | Standard (RFC 5869), `javax.crypto`/Bouncy Castle |
| Browser-Speicher | Local Storage, Session Storage | Speicher im Browser für Web-Apps; für JavaScript lesbar | — |
| BFF | Backend for Frontend, BFF-Muster | Muster, bei dem ein Server-Teil der Web-App die Tokens verwaltet, statt sie im Browser zu speichern; im Demo die Next.js-Shell mit verschlüsseltem httpOnly-Cookie | Spring Cloud Gateway als BFF |
| IAM | Identity and Access Management, IAM-Policy, IAM-Rolle, IAM-Rollen | Rechteverwaltung von AWS: Rollen und Richtlinien legen fest, wer (Mensch, Dienst, Lambda) was mit welcher Ressource darf | Kubernetes RBAC, Azure RBAC, GCP IAM; Linux-Benutzerrechte |
| IAM Identity Center | | empfohlener Weg, Menschen eingeschränkte, zeitlich begrenzte Anmeldungen am AWS-Konto zu geben; setzt **AWS Organizations** voraus – der Beitritt wechselt ein Free-Plan-Konto in den Paid Plan, deshalb im Demo vorerst nicht genutzt | Single Sign-On über Keycloak/Entra ID |
| IAM-Benutzer | IAM-User, Alltagszugang, Konsolen-Passwort | Benutzer innerhalb eines AWS-Kontos mit eigenem Passwort und eigener MFA; im Demo der Alltagszugang des Inhabers (`jan-admin`), **ohne** Access Keys – https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html | Benutzerkonto in Keycloak/Active Directory |
| aws login | AWS CLI login, Login-Verfahren | Befehl der AWS CLI (ab 2.32), der über die Konsolenanmeldung im Browser kurzlebige Anmeldedaten für die Kommandozeile holt und selbst erneuert; ersetzt dauerhafte Access Keys auf dem eigenen Rechner – https://docs.aws.amazon.com/cli/latest/reference/login/ | `gcloud auth login`, `az login` |
| Permissions Boundary | Boundary, Rechtegrenze | an eine IAM-Rolle gehängte Obergrenze: die Rolle darf höchstens, was Boundary **und** eigene Richtlinie gemeinsam erlauben; verhindert, dass eine CI-Rolle sich selbst mehr Rechte gibt – https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html | Kubernetes-Admission-Policy, die RBAC-Rechte nach oben begrenzt |
| Trust Policy | Vertrauensstellung | Teil einer IAM-Rolle: wer diese Rolle übernehmen darf (z. B. nur GitHub Actions aus einem bestimmten Repo) | — |
| OIDC-Rolle | OIDC-Anbindung, GitHub-OIDC-Rolle | IAM-Rolle, die GitHub Actions per kurzlebigem OIDC-Token übernimmt – es werden **keine** dauerhaften AWS-Zugangsschlüssel gespeichert | Workload Identity Federation (GCP/Azure) |
| Access Keys | Zugangsschlüssel | dauerhafte AWS-Zugangsdaten (Key-ID + Secret); Sicherheitsrisiko, wenn sie in CI oder Repos liegen | API-Tokens |
| KMS | Key Management Service | verwaltet kryptografische Schlüssel; AWS-verwaltete Schlüssel sind kostenlos, eigene kosten 1 $/Monat | HashiCorp Vault Transit, Azure Key Vault |
| SSM Parameter Store | SSM, Parameter Store, SSM-Parameter, SecureString | Ablage für Konfigurationswerte und (verschlüsselt als SecureString) Geheimnisse; Standard-Stufe kostenlos. Im Demo auch Übergabestelle zwischen Terraform und CDK | Spring Cloud Config, Consul KV, `.env`-Dateien, Kubernetes ConfigMap/Secret |
| Secrets Manager | | AWS-Dienst für Geheimnisse mit automatischer Rotation; 0,40 $/Secret und Monat | HashiCorp Vault, Azure Key Vault |
