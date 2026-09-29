# Glossar (Fortsetzung)

Zweiter Teil des [Glossars](glossar.md); Aufbau und Spalten wie dort. Der
Generator liest beide Dateien und erzeugt daraus **eine** Glossar-Seite.

## Infrastruktur als Code

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| IaC | Infrastructure as Code, Infrastruktur als Code | Infrastruktur (Server, Datenbanken, Rechte) wird in Dateien beschrieben, versioniert und automatisch angelegt statt per Klick | Ansible, Terraform, Pulumi, Helm |
| CDK | AWS CDK, Cloud Development Kit | Infrastruktur als **Programmcode** (TypeScript, Java, Python …): man schreibt Klassen wie `new Table(...)`, CDK erzeugt daraus CloudFormation-Vorlagen und legt die Ressourcen an | Pulumi (mehrere Clouds, ähnliches Prinzip), CDK for Terraform (CDKTF), Terraform (deklarativ statt Code) |
| CloudFormation | | AWS-eigener Dienst, der Ressourcen aus einer JSON/YAML-Vorlage anlegt, ändert und löscht; Grundlage von CDK und SAM | Terraform-Engine, Azure Resource Manager (ARM/Bicep) |
| Stack | Stacks, Anwendungs-Stacks, Bootstrap-Stack | Einheit in CloudFormation/CDK: eine Gruppe von Ressourcen, die gemeinsam angelegt und gelöscht wird | Terraform-Workspace/-Modul, Helm-Release |
| Construct | Constructs | wiederverwendbarer Baustein in CDK (z. B. „Lambda + Queue + DLQ" als eine Klasse) | Terraform-Modul, Pulumi Component |
| CDK Bootstrap | Bootstrap | einmalig je Konto und Region angelegte CDK-Hilfsressourcen (S3-Bucket für Artefakte, ECR-Repository, Rollen) | — |
| cdk destroy | | CDK-Befehl, der alle Ressourcen eines Stacks löscht | `terraform destroy` |
| RemovalPolicy | RemovalPolicy.DESTROY, autoDeleteObjects | CDK-Einstellung, ob eine Datenbank/ein Bucket beim Löschen des Stacks mitgelöscht (DESTROY) oder behalten wird | `force_destroy` in Terraform |
| Terraform | TF | verbreitetes IaC-Werkzeug von HashiCorp: Infrastruktur deklarativ in HCL beschreiben, für viele Anbieter (AWS, Azure, Keycloak, GitHub …) über Provider | OpenTofu (Open-Source-Fork), Pulumi, Ansible |
| HCL | | HashiCorp Configuration Language, die Beschreibungssprache von Terraform | YAML/JSON-Konfiguration |
| Terraform-Provider | Provider, Terraform-Provider für Keycloak | Plug-in, über das Terraform die API eines Anbieters anspricht (AWS, Keycloak, GitHub); im Demo ab Phase 3 auch für die Keycloak-Konfiguration | — |
| Terraform-State | State, State-Bucket | Datei, in der Terraform den tatsächlichen Zustand der verwalteten Ressourcen festhält; liegt im Demo im GitLab-managed Terraform State (kein State-Bucket in S3) | — |
| State-Locking | Locking, use_lockfile, .tflock | Sperre, damit nicht zwei Terraform-Läufe gleichzeitig den State ändern; seit Terraform 1.10 direkt in S3 möglich (früher DynamoDB) | — |
| HCP Terraform | Terraform Cloud | von HashiCorp gehosteter Terraform-Dienst mit State-Verwaltung und Läufen | Spacelift, env0, Scalr |
| terraform destroy | | Terraform-Befehl, der alle verwalteten Ressourcen löscht | `cdk destroy` |
| SAM | Serverless Application Model | vereinfachte CloudFormation-Syntax für Serverless-Anwendungen | Serverless Framework |
| SST | | Framework zum Deployen von Web-Apps (u. a. Next.js) auf AWS; nutzt in Version 3 Pulumi/Terraform-Provider | — |
| Pulumi | | IaC-Werkzeug mit echten Programmiersprachen für viele Clouds | — |
| Amplify | Amplify Hosting | AWS-Dienst für bequemes Hosting von Web-Apps mit Build-Pipeline | Vercel, Netlify |

## Frontend

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| TypeScript | TS | JavaScript mit statischen Typen; wird zu JavaScript übersetzt | — (vergleichbar mit Java-Typsicherheit im JS-Umfeld) |
| React | | JavaScript-Bibliothek für Benutzeroberflächen aus Komponenten | Vue, Angular, Svelte |
| Next.js | | React-Framework (von Vercel) mit Routing, Server-Rendering, API-Routen und Build-Optimierung | Remix/React Router, Nuxt (Vue), Angular Universal |
| App Router | App-Router, App-Router-fähig, App-Router-Unterstützung | aktuelles Routing-Modell von Next.js mit React Server Components | Pages Router (älter) |
| Server Components | React Server Components | React-Komponenten, die nur auf dem Server laufen und fertiges HTML/Daten liefern | serverseitige Templates (Thymeleaf) |
| proxy.ts | | ab Next.js 16 der Dateiname für Code, der vor jeder Anfrage läuft (vorher `middleware.ts`) | Servlet-Filter |
| Server Actions | | Next.js-Funktionen, die ein Formular direkt auf dem Server verarbeiten, ohne eigene API | Spring-MVC-`@PostMapping` mit Formular |
| Streaming | | Server schickt eine Seite in Teilen, sobald sie fertig sind, statt auf alles zu warten | `StreamingResponseBody` in Spring |
| Client-Komponente | Client-Komponenten, Client Components | React-Komponente, die im Browser läuft (Gegenstück zu Server Components) | — |
| Middleware | | Code, der in Next.js vor jeder Anfrage läuft (z. B. Login prüfen, umleiten) | Servlet-Filter, Spring `HandlerInterceptor` |
| SSR | Server-Side Rendering, Server-Rendering | HTML wird pro Anfrage auf dem Server erzeugt | JSP, Thymeleaf |
| ISR | Incremental Static Regeneration, ISR-Revalidierung | Next.js erzeugt statische Seiten und aktualisiert sie im Hintergrund nach Zeit oder Ereignis | Cache mit Hintergrund-Aktualisierung |
| Static Export | statisch exportiert | Next.js baut die App zu reinen HTML/JS-Dateien, die ohne Server (z. B. aus S3) ausgeliefert werden; kein SSR, keine Middleware | statische Website, SPA |
| SPA | Single-Page-App | Web-App, die einmal geladen wird und danach im Browser navigiert | Angular-App |
| OpenNext | Server-Lambda, Bild-Lambda | Open-Source-Adapter, der einen Next.js-Build auf AWS-Bausteine abbildet (Server-Lambda, S3, CloudFront, SQS, DynamoDB) – https://opennext.js.org/aws | Vercel (Hersteller-Hosting), Netlify, Docker-Container mit `next start` |
| Standalone-Build | standalone, output: "standalone", Standalone-Server | Next.js-Build-Modus, der einen schlanken, eigenständigen Node.js-Server mit allen benötigten Dateien erzeugt | ausführbares Spring-Boot-JAR |
| next start | | Befehl, der den Next.js-Server als einzelnen Node.js-Prozess startet | `java -jar app.jar` |
| Adapter API | Adapter, verifizierter Adapter, Build Adapters | seit Next.js 16.2 (März 2026) stabile Schnittstelle, über die Hosting-Anbieter den Build auf ihre Infrastruktur abbilden; „verifiziert" = Open Source und besteht die Next.js-Testsuite – https://nextjs.org/blog/nextjs-across-platforms | — |
| Data Cache | Tag-Cache, Zwischenspeicher | Next.js-Zwischenspeicher für Datenabrufe und gerenderte Seiten; bei vielen Lambda-Instanzen nur geteilt, wenn ein Adapter (z. B. OpenNext) ihn auslagert | Spring Cache mit Redis statt lokalem Caffeine |
| Shell | Shell-App, Next.js-Shell | Rahmenanwendung, die Navigation, Login und Layout stellt und die Micro-Frontends einbindet | Portal-Container |
| Micro-Frontend | Micro-Frontends, Microfrontends, MFE, MFEs | eigenständig entwickelter und deployter Teil einer Weboberfläche (z. B. „Rechnungen"), den die Shell zur Laufzeit einbindet; überträgt die Microservice-Idee aufs Frontend | Portlets (Liferay), Web Components, iFrames |
| Module Federation | Module-Federation-Runtime, nextjs-mf | Mechanismus (Webpack/Rspack), mit dem ein Bundle zur Laufzeit Module aus einem anderen, separat deployten Build lädt | OSGi-Bundles (Analogie) |
| Multi-Zones | Multi-Zone, Zonen, Zone | Next.js-Ansatz, mehrere Next.js-Apps unter einer Domain zu betreiben, aufgeteilt nach Pfaden | Reverse-Proxy-Routing auf mehrere Apps |
| single-spa | Piral | Frameworks zum Orchestrieren von Micro-Frontends | — |
| Bundle | Bundles, MFE-Bundles | vom Build erzeugte, zusammengefasste JavaScript-/CSS-Dateien | JAR-Datei (Analogie) |
| Component Library | Komponentenbibliothek, Lib | gemeinsames Paket wiederverwendbarer UI-Bausteine (Buttons, Formulare, Layouts), das alle Micro-Frontends nutzen und so ein einheitliches Aussehen sichern | Material UI, Bootstrap; in Java-Welt: gemeinsames Shared-Modul |
| Storybook | | Werkzeug, das jede Komponente der Component Library isoliert darstellt und dokumentiert; als statische Seite veröffentlicht | Pattern Lab, Ladle |
| Monorepo | | ein Git-Repository mit mehreren Paketen/Apps (Frontend, Services, IaC) und gemeinsamen Typen | Maven-Multi-Modul-Projekt |
| Vercel | @vercel/microfrontends | Hosting-Anbieter und Hersteller von Next.js | Netlify, Cloudflare Pages |
| WebSocket | | dauerhafte bidirektionale Verbindung zwischen Browser und Server | STOMP über WebSocket in Spring |
| GraphQL | AppSync | Abfragesprache für APIs, bei der der Client die Felder bestimmt; AppSync ist der verwaltete GraphQL-Dienst von AWS | Apollo Server, Spring for GraphQL |
| HTMX | Vue, Quasar | alternative Frontend-Techniken, die in anderen Demos vorkommen | — |

## Schnittstellen und Architektur

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| Endpunkt | Endpunkte, Migrations-Endpunkt, Endpoint | einzelne Adresse einer API, z. B. `POST /api/meter-readings` | `@PostMapping`-Methode |
| agnostisch | backend-agnostisch | unabhängig von einer bestimmten Technik, z. B. mit jedem Backend kombinierbar | — |
| API | APIs, Schnittstelle | Programmierschnittstelle, über die Programme miteinander sprechen | — |
| REST | REST APIs, RESTful | Architekturstil für HTTP-APIs: Ressourcen unter URLs, Operationen über HTTP-Methoden (GET, POST …) | Spring Web MVC `@RestController` |
| OpenAPI | OpenAPI-Spezifikation | maschinenlesbare Beschreibung einer REST-API (YAML/JSON); daraus lassen sich Clients und Dokumentation erzeugen | Swagger, springdoc-openapi |
| SDK | | Software Development Kit: Bibliothek für den Zugriff auf einen Dienst (z. B. AWS SDK) | — |
| Microservices | Microservice | Architektur aus kleinen, unabhängig deploybaren Diensten mit eigener Datenhaltung | Spring-Boot-Microservices |
| Strangler Fig | | Muster, ein Altsystem schrittweise durch neue Komponenten zu ersetzen, bis es „abgewürgt" ist | — |
| Legacy-System | Legacy, Altsystem, Legacy-Adapter, Altbestände | bestehendes Altsystem mit Kundendaten, das abgelöst werden soll; im Demo simuliert | — |
| Parallelbetrieb | | Alt- und Neusystem laufen während der Migration gleichzeitig | — |
| CRUD | | Create, Read, Update, Delete – einfache Datenpflege ohne Fachlogik | Spring Data Repository |
| Durchstich | | erste, schmale Umsetzung durch alle Schichten (UI → API → DB → Event), um die Architektur früh zu beweisen | Walking Skeleton, Tracer Bullet |
| Customer Journey | Journey, User Journey, LoggedIn-Journey, LoggedIn | Weg eines Kunden durch das Portal: Registrierung → Onboarding → angemeldeter Bereich | — |
| Onboarding | | erste Schritte nach der Registrierung (Daten ergänzen, Vertrag verknüpfen) | — |
| B2C | | Geschäft mit Endkunden (Business to Consumer) | — |
| B2B | B2B-Beschaffungskanal, B2B-Besucher, B2B-Besuchern | Geschäft zwischen Unternehmen (Business to Business) | — |
| Migrations-Cockpit | | im Demo geplantes Micro-Frontend, das den Fortschritt der Kontenübernahme, Ereignisse und DLQ-Fälle live zeigt | — |
| Account-Migration | Kontenübernahme, Portal-Migration | Übernahme bestehender Kundenkonten aus einem Altsystem in das neue Portal, ohne dass Kunden sich neu registrieren müssen; typisches Kernthema von Portal-Modernisierungen | Identitätsmigration z. B. nach Keycloak |
| Kundenportal | Energie-Kundenportal, Consumer Web Portal, Consumer-Portal, Selfservice, Self-Service | Web-Anwendung, in der Endkunden ihre Verträge, Rechnungen und Daten selbst verwalten (Self-Service) | — |
| Multi-Sparten-Versorger | Multi-Sparten, Multi-Sparten-Kundenportal, Querverbund, Multi-Utility, Versorger | Unternehmen, das mehrere Versorgungs- und Kommunikationsprodukte anbietet (Strom, Gas, Wasser, Wärme, Internet, Mobilfunk) – typisch für Stadtwerke | — |
| Sparte | Sparten | Produktbereich eines Versorgers, z. B. Strom, Gas, Mobilfunk; im Demo zentraler Begriff des Datenmodells | Produktlinie |
| Stadtwerk | Stadtwerke, Stadtwerks | kommunaler Versorger | — |
| Glasfaser | DSL, Internet-/Mobilfunkanbieter, Telekommunikationsanbieter | Internetanschlüsse; im Demo die Sparten des übernommenen Anbieters | — |

## Werkzeuge, Betrieb und CI/CD

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| GitLab | | Git-Plattform mit CI, auch selbst betreibbar; bei rypox intern auf gitlab.rypox.org im Einsatz | GitHub, Gitea |
| Git | | verteilte Versionsverwaltung | — |
| GitHub | | Plattform für Git-Repositories, Pull Requests und CI | GitLab, Bitbucket, Gitea |
| GitHub Actions | GitHub-Workflow | CI/CD-Dienst von GitHub: Workflows in YAML laufen bei Push, Pull Request oder manuell | GitLab CI, Jenkins, Azure Pipelines |
| Pipeline | Pipelines | automatisierte Abfolge von Schritten (bauen, testen, ausliefern) | Jenkins-Pipeline |
| GitLab CI | GitLab-CI-Variablen | CI/CD in GitLab; hier auf gitlab.rypox.org für Plattform (Terraform) und Altsysteme | GitHub Actions, Jenkins |
| Deploy Key | Deploy-Key, Deploy-Schlüssel | SSH-Schlüssel, der nur **einem** GitHub-Repository zugeordnet ist und – ohne „Allow write access“ – nur Lesen erlaubt; im Demo klont die GitLab-Pipeline damit das private Repository – https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys | Deploy Token in GitLab, Read-only-Zugang in Gitea |
| Pull-Mirror | Spiegel | GitLab holt regelmäßig den Stand eines anderen Repositories; erst ab GitLab Premium – https://docs.gitlab.com/user/project/repository/mirror/pull/ | `git clone` in einer Pipeline |
| Runner | | Maschine, auf der ein GitHub-Actions-Job läuft; Standard-Runner sind für öffentliche Repos kostenlos | GitLab Runner, Jenkins Agent |
| GitHub Pages | | kostenloses Hosting statischer Websites direkt aus einem GitHub-Repository; im Demo für Storybook und Berichte | Netlify, Cloudflare Pages |
| Environment | Environments, Required Reviewers | GitHub-Umgebung (z. B. „production") mit Schutzregeln, etwa Freigabe durch eine Person vor dem Deploy | geschützte Umgebungen in GitLab |
| Pull Request | PR, PRs | Änderungsvorschlag auf GitHub mit Review und automatischen Prüfungen | Merge Request (GitLab) |
| CI | Continuous Integration | automatisches Bauen und Testen bei jeder Änderung | — |
| CD | Continuous Delivery, Continuous Deployment | automatisches Ausliefern geprüfter Änderungen | — |
| CloudWatch | Amazon CloudWatch, CloudWatch Logs, Log-Gruppen, Logs | AWS-Dienst für Logs, Metriken und Alarme | Prometheus + Grafana, ELK/OpenSearch, Loki |
| Log-Retention | Aufbewahrungsfrist, Log-Aufbewahrung | Dauer, nach der Logs automatisch gelöscht werden; ohne Frist wachsen Kosten | logrotate |
| Metriken | Metrik | Messwerte über die Zeit (Aufrufe, Fehler, Dauer) | Micrometer + Prometheus |
| Alarm | Alarme, Kostenalarm | Benachrichtigung, wenn eine Metrik einen Grenzwert überschreitet | Alertmanager |
| Docker | Docker-Assets, Docker-Image | Container-Technik; ein Image enthält eine Anwendung mit allen Abhängigkeiten | Podman |

## Recht, Recherche und Sonstiges

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| DSGVO | | Datenschutz-Grundverordnung der EU; Datenhaltung in der EU (Frankfurt) ist ein Vertrauenssignal | — |
| DPMA | | Deutsches Patent- und Markenamt; Register zur Prüfung von Markennamen | — |
| EUIPO | | Amt der EU für geistiges Eigentum; Register für EU-Marken | — |
| OSI-Lizenz | OSI, Open-Source-Lizenz | von der Open Source Initiative anerkannte Lizenz (z. B. MIT, Apache 2.0) | — |
| Open-Source-Credits | AWS Promotional Credits for Open Source Projects | AWS-Programm, das Open-Source-Projekten auf Antrag Guthaben für ein Jahr gibt; bevorzugt Projekte mehrerer Organisationen oder von Stiftungen – https://aws.amazon.com/blogs/opensource/aws-promotional-credits-open-source-projects/ | GitHub Sponsors, Förderprogramme anderer Clouds |
| IETF | | Internet Engineering Task Force; standardisiert Internetprotokolle wie OAuth2 | — |
| SaaS | Software as a Service | Software als gemieteter Online-Dienst | — |
| Open Self Service | O2S | Open-Source-Frontend-Schicht (Next.js) für Kundenportale; nächster Verwandter des geplanten Demos | — |
| Tractor Store | Tractor Store 2.0, TodoMVC | Referenz-Beispiel für Micro-Frontends (von micro-frontends.org), in mehreren Techniken umgesetzt; TodoMVC ist das analoge Vergleichsprojekt für Frontend-Frameworks | — |
| Cloud Resume Challenge | | bekannte Einsteiger-Übung: Lebenslauf-Website auf S3 mit DynamoDB-Besucherzähler | — |
| Serverlesspresso | Wild Rydes, Unicorn | AWS-eigene Workshop-/Demo-Anwendungen (Kaffeebestellung, Einhorn-Fahrdienst) | — |
| Serverless Land | Serverless Land Patterns | AWS-Sammlung von Serverless-Mustern als fertige Vorlagen | — |
| aws-samples | | GitHub-Organisation, in der AWS Beispielprojekte veröffentlicht | vergleichbar mit `spring-projects`/`spring-guides` |
| re:Invent | | jährliche AWS-Konferenz in Las Vegas | — |
| README | | Einstiegsdokumentation eines Repositories | — |
| Persona | Personas | typisierte, fiktive Nutzerbeschreibung für das Fachkonzept | — |

## Allgemeine Software-Begriffe

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| Frontend | Frontends | der Teil einer Anwendung, der im Browser läuft und die Oberfläche zeigt | — |
| Browser | Browser-Apps, Browser-Based | Programm zum Anzeigen von Webseiten; „Browser-App" = Anwendung, die im Browser läuft | — |
| Server | | Rechner oder Prozess, der Anfragen beantwortet | — |
| HTML | HTML/JS-Dateien, JS | Auszeichnungssprache für Webseiten; JS = JavaScript | — |
| Laufzeit-Integration | Laufzeit-Widget | Einbinden eines Bausteins erst im laufenden Browser statt beim Build | dynamisches Nachladen von Plug-ins |
| Vite | | schnelles Build-Werkzeug für Frontends | Webpack |
| Spring MVC | Spring-MVC-Anwendung, Spring Boot, Spring-Boot-Anwendung | Web-Framework von Spring für Java-Webanwendungen | Referenz für Java-Vergleiche in diesem Wiki |
| Backend | Backends | der serverseitige Teil einer Anwendung (Fachlogik, Datenhaltung, APIs) | Spring-Boot-Anwendung |
| Fullstack | | Entwicklung über Frontend, Backend und Infrastruktur hinweg | — |
| Web-App | Web-Apps, Webanwendung | Anwendung, die im Browser bedient wird | — |
| Self-Hosting | Selbst-Hosting, selbst gehostet | Software auf eigener bzw. selbst gewählter Infrastruktur betreiben statt beim Hersteller | — |
| Community-Projekt | Community-Construct | Open-Source-Projekt, das nicht vom Hersteller selbst, sondern von Freiwilligen oder Firmen gepflegt wird | — |
| IPv4-Adresse | öffentliche IPv4-Adresse | Internetadresse; AWS berechnet öffentliche IPv4-Adressen stundenweise (ca. 3,60 $/Monat) | — |
| kWh | kWh/m³, m³ | Kilowattstunde (Strom, Gas) bzw. Kubikmeter (Gas, Wasser) – Verbrauchseinheiten | — |
| serverseitig | serverseitige, serverseitiger | läuft auf dem Server statt im Browser | — |
| Build | Builds, Build-Artefakte, Artefakte, Artefakt, Artefakt-Ablage, Build-Werkzeug | Übersetzen und Paketieren des Quellcodes zu auslieferbaren Dateien (Artefakten) | `mvn package`, Gradle-Build |
| Assets | statische Assets | statische Dateien einer Web-App: JavaScript, CSS, Bilder, Schriften | `src/main/resources/static` |
| Deployment | Deploy, deployt, deployen, deploybar, Deploy-Rollen | Ausliefern einer neuen Version in eine Umgebung | — |
| Stage | Demo-Stage | eine Umgebung/Ausbaustufe (z. B. dev, demo, prod), oft als eigener Satz Ressourcen | Spring-Profile, Kubernetes-Namespace |
| Traffic | Demo-Traffic | Menge der Zugriffe/Datenübertragung | — |
| Request | Requests, Leer-Requests, Anfragen | einzelne Anfrage an einen Dienst; viele AWS-Dienste rechnen pro Million Requests ab | — |
| Cache | cachen, gecacht | Zwischenspeicher, der wiederholte Anfragen schneller und billiger beantwortet | Caffeine, Redis, NGINX-Cache |
| Upload | Uploads, Foto-Upload, Dokument-Uploads, Impfpass-Upload | Hochladen einer Datei vom Browser zum Server bzw. nach S3 | Multipart-Upload in Spring |
| Login | Logins, Login-Quickstart | Anmeldung eines Nutzers | — |
| Quickstart | | offizielles Minimalbeispiel eines Herstellers zum schnellen Einstieg | — |
| Repository | Repositories, Repo, Repos, Repository-Struktur | von Git verwaltetes Projektverzeichnis, z. B. auf GitHub | — |
| Snippet | Snippets, Doku-Snippets | kurzes Code-Beispiel aus einer Dokumentation | — |
| Mock | gemockt, Mock-System | Attrappe, die ein echtes System für Tests/Demos nachahmt | Mockito, WireMock |
| Workflow | Workflows, Willkommens-Workflow | allgemein: automatisierter Ablauf mehrerer Schritte; bei GitHub: eine Pipeline-Datei | — |
| Widget | Widgets | kleiner, eingebetteter Oberflächenbaustein | — |
| In-App-Feed | In-App | Benachrichtigungsliste innerhalb der Anwendung (statt E-Mail) | — |
| Guardrails | Konto-Guardrails, Leitplanken | technische Schutzregeln, die Fehlbedienung und Kosten begrenzen | — |
| Schema | Schemas, Typen/Schemas | formale Beschreibung einer Datenstruktur, z. B. JSON Schema | Bean Validation, XSD |
| Plattform-Schicht | Fundament-Schicht, Plattform-/Fundament-Schicht, Fundament, Plattformschicht | im Demo: per Terraform aus GitLab CI verwaltete Grundlagen (OIDC-Vertrauensstellungen, Budget + SNS-Grundlage des Kill-Switch, SSM-Grundwerte, ab Phase 3 Keycloak-Konfiguration), auf denen die Anwendung aufsetzt; Cognito gehört zur Anwendung (CDK) | — |
| End-to-End | End-to-End-Demo | durchgängig über alle Schichten, vom Browser bis zur Datenbank und zurück | — |
| UI | User Interface, Oberfläche | Benutzeroberfläche | — |
| E-Commerce | Webshop, Webshop-Domäne | Online-Handel | — |
| Blog | URL-Shortener | typische Übungsprojekte ohne fachliche Tiefe | — |
| Tutorial | Tutorial-Niveau, Workshop, Einsteiger-Workshop | Schritt-für-Schritt-Anleitung zum Nachbauen | — |
| .NET | .NET-Monolith | Microsofts Entwicklungsplattform (C#) | vergleichbar mit der Java-Plattform |
| Monolith | Monolithen | Anwendung, die als ein einziges großes Programm gebaut und ausgeliefert wird | klassische Spring-Boot- oder Java-EE-Anwendung |
| GB | TB, MB, GB-Speicher | Gigabyte / Terabyte (1 TB = 1.000 GB) | — |
| Abschlag | Abschlagsberechnung | monatliche Vorauszahlung auf die Energie-Jahresrechnung; wird nach neuem Zählerstand angepasst | — |
| PDF | | Dokumentformat, hier für Rechnungen | — |
| CSV | CSV-Datei | einfache Tabellendatei mit durch Komma getrennten Werten, lesbar mit LibreOffice Calc oder Excel | — |
| Client-ID | Client ID | öffentliche Kennung einer Anwendung bei einem Identitätsdienst wie Cognito oder Keycloak (nicht geheim, im Gegensatz zum Client Secret) | — |
| Projekt-Journal | Journal | laufendes Arbeitsprotokoll des Projekts (im privaten Arbeitsbereich des Inhabers) | — |
| E-Mail | E-Mails | elektronische Post; SNS verschickt bis 1.000 E-Mails im Monat kostenlos | — |
| SMS | SMS-Versand | Kurznachricht ans Handy; bei SNS vergleichsweise teuer | — |
| Timeline | Event-Timeline | zeitliche Liste von Ereignissen in der Oberfläche | — |

## Demo-Pass und Mandanten

| Begriff | Auch | Erklärung | Außerhalb von AWS |
|---|---|---|---|
| Demo-Pass | Pass, Pass-Ablauf, Pass-Adresse, Pass-Inhaber, Pass-Verwaltung | im Demo: zeitlich begrenzte Berechtigung (7 Tage, Kontingent) für eine eigene Instanz; ausgestellt per Einladungslink oder für den Inhaber | Testlizenz, Trial |
| Inhaber-Zugang | Inhaber-Rolle, Verwaltungsbereich | Anmeldung des Projektinhabers mit Sonderrechten: Instanzen starten, Einladungslinks erzeugen | Admin-Rolle |
| Einladungslink | Einladungslinks | persönlicher, einmal verwendbarer Link, der einen Demo-Pass ausstellt | Gutscheincode |
| Cent-Dienst | Cent-Dienste | in diesem Wiki: AWS-Dienst ohne dauerhaftes Freikontingent, der bei Demo-Nutzung nur Bruchteile eines Cents kostet (API Gateway, EventBridge-Events, S3) | — |
| Mandant | Mandanten, Mandanten-Kennung, Mandantenfähigkeit, Mandantentrennung, Multi-Tenancy, Tenant-ID | abgeschotteter Bereich eines Kunden in einer gemeinsam betriebenen Anwendung; im Demo je Demo-Pass ein Mandant | Mandant in SAP, `tenant_id` in Hibernate Multi-Tenancy |
| Silo-Modell | Silo | Mandantenmodell: jeder Mandant bekommt eigene, vollständige Infrastruktur | eigene VM/Datenbank je Kunde |
| Bridge-Modell | Bridge | Mandantenmodell: Rechenleistung geteilt, Daten und Ereignisse je Mandant getrennt | Schema je Mandant in PostgreSQL |
| Pool-Modell | Pool | Mandantenmodell: alles geteilt, Trennung nur über die Mandanten-Kennung in jedem Datensatz | Spalte `tenant_id` |
| CAPTCHA | hCaptcha, Cloudflare Turnstile, Bot-Prüfung | Prüfung, ob ein Mensch oder ein Programm eine Seite bedient | Google reCAPTCHA, Friendly Captcha |
| Cloudflare | | CDN- und Sicherheitsanbieter; hier nur wegen des kostenlosen CAPTCHA-Dienstes Turnstile genannt | — |
| IP-Adresse | IP | Internetadresse eines Geräts; dient zur Begrenzung von Anfragen je Absender | — |
| Spam | Spam-Schleuder | unerwünschte Massen-Nachrichten; hier: Missbrauch der Demo zum Versand an Dritte | — |
| Infrastruktur-Automatisierung | Bereitstellung auf Knopfdruck | Anlegen vollständiger Umgebungen per Programm statt per Hand | — |
| Impressum | Datenschutzerklärung, Pflichtseiten, Rechtstexte | gesetzlich vorgeschriebene Anbieterkennzeichnung bzw. Information über die Verarbeitung personenbezogener Daten | — |
| USD | US-Dollar, $ | Währung, in der AWS abrechnet | — |
| Commit | Tag/Commit, Git-Tag | Commit = gespeicherter Änderungsstand in Git; Git-Tag = Name für einen bestimmten Commit, z. B. eine Version `v1.2.0` (nicht zu verwechseln mit AWS-Tags) | — |
| GitLab Community Edition | Community Edition, CE, GitLab Premium, Premium | kostenlose, selbst betreibbare GitLab-Ausgabe; Premium ist die kostenpflichtige Stufe mit Zusatzfunktionen wie Pull-Mirror | — |
| OIDC-Discovery | id_tokens, JWKS | öffentliche Adresse, unter der ein Identitätsanbieter seine Signaturschlüssel veröffentlicht; `id_tokens` erzeugt in GitLab CI ein signiertes OIDC-Token für AWS | — |
| Konto-Alias | Account alias, Alias | optionaler, weltweit eindeutiger Name für die Anmelde-Adresse eines AWS-Kontos; nach Kontoschließung nicht wiederverwendbar | — |
| Post-Closure-Period | Schließfrist | 90 Tage nach Schließung eines AWS-Kontos, in denen es über den Support wieder geöffnet werden kann; danach endgültige Löschung | — |
| Support-Plan | Basic support | Umfang der AWS-Unterstützung; „Basic" ist kostenlos und umfasst Konto- und Abrechnungsfragen | — |
| Sign up for AWS (new) | neue AWS-Anmeldung, AWS Settings, Ausgabenlimit, Spend limit | vereinfachte AWS-Anmeldung mit Projekten und Ausgabenlimit (ab 20 $), nur für einen Teil der Kunden freigeschaltet; hier nicht verwendet | — |
| QR-Code | QR | quadratischer Strichcode, den eine App mit der Kamera einliest – hier zum Einrichten der Authentifizierungs-App | — |
| HTTP-Methoden | GET, POST, PATCH, PUT, DELETE | Arten von REST-Aufrufen: lesen (GET), anlegen (POST), teilweise ändern (PATCH), ersetzen (PUT), löschen (DELETE) | `@GetMapping`, `@PostMapping` … in Spring |
| URL | | Internetadresse einer Seite oder eines API-Endpunkts | — |
| Demo-Person | Demo-Personen | im Demo vorbereitete fiktive Kundinnen und Kunden mit festgelegter Geschichte (z. B. Anna Becker: Altkundin, Lazy Migration) | Testdaten-Persona |
| Demo-Postfach | | im Portal angezeigtes Postfach der Demo-Personen; ersetzt echte E-Mails, damit die Demo niemanden anschreibt | MailHog, Mailpit |
| Journey-Kürzel | J1, J2, J3, J4, J5, J6, J7, J8, J9 | Nummern der neun Demo-Abläufe im Fachkonzept (J1 Registrierung … J9 Demo-Pass) | — |
| Ereigniskatalog | | Liste aller fachlichen Ereignisse mit Quelle, Empfängern und Wirkung | AsyncAPI-Dokument |
| Plattform-Tabelle | | mandantenübergreifende DynamoDB-Tabelle für Einladungen, Pässe, Mandanten und Kontingent-Zähler | — |
| Beispieldaten-Generator | | Programm, das die Altsysteme je Mandant mit denselben Demo-Personen und gezielten Datenmängeln befüllt | Testdaten-Fabrik (z. B. Datafaker) |
| Edge-Stack | Edge | CDK-Stack für alles am Rand des Systems: CloudFront, Zertifikat, CloudFront Functions | — |
| Datenbank | DB | geordnete Datenablage | — |
| Altkonto | Altkonten, Altkunde, Altkunden, Bestandskunde | Kundenkonto im Altsystem des Versorgers oder der Telko, das ins neue Portal übernommen wird (nicht zu verwechseln mit einem alten AWS-Konto) | — |
| Internationalisierung | i18n, zweisprachig, Übersetzungsdateien | Vorbereitung einer Anwendung auf mehrere Sprachen; Texte liegen in Übersetzungsdateien statt im Code | `messages_de.properties` / Spring `MessageSource` |
