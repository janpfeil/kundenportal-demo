# Next.js-Betrieb — Entscheidungsvorlage

Stand: 2026-09-29 · Kennzeichnung: **[B]** belegt (mit Quelle), **[E]** Einschätzung.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

## 1. Worum es geht

Next.js kann auf zwei grundverschiedene Arten ausgeliefert werden. Die Wahl
bestimmt, **wo der Login-Zustand liegt**, **wie viel Next.js das Demo
zeigt** und **wie viel AWS-Infrastruktur** zu bauen ist. Die Kosten sind in
beiden Fällen bei Demo-Traffic ≈ 0 $ (siehe [Machbarkeit & Kosten](machbarkeit-kosten.md)).

- **Variante A – Static Export:** Next.js erzeugt beim Build fertige
  HTML/JS-Dateien. Diese liegen in S3 und werden über CloudFront
  ausgeliefert. Zur Laufzeit gibt es **keinen Next.js-Server**; die App
  verhält sich im Browser wie eine SPA und ruft nur die REST-API
  (API Gateway + Lambda) auf.
  Java-Vergleich: ein Angular/React-Frontend, das als statische Dateien
  in `src/main/resources/static` liegt und nur mit dem REST-Backend spricht.
- **Variante B – Server-Rendering (SSR) in Lambda:** Der Next.js-Server
  läuft in einer Lambda (wie genau – mit oder ohne OpenNext – klärt
  Abschnitt 4). Seiten werden pro Anfrage oder zwischengespeichert
  auf dem Server erzeugt; der Server hält die Login-Session im
  verschlüsselten Cookie und ruft die REST-API serverseitig auf.
  Java-Vergleich: eine Spring-MVC-Anwendung mit Thymeleaf und
  Spring-Security-Session, die nur bei Bedarf gestartet wird.

## 2. Auswirkungen im Vergleich

| Kriterium | A – Static Export | B – SSR in Lambda |
|---|---|---|
| Laufende AWS-Bausteine für Next.js | S3 + CloudFront | S3 + CloudFront + Server-Lambda; mit OpenNext zusätzlich Bild-Lambda, SQS-Queue und DynamoDB-Tabelle für ISR [B: https://opennext.js.org/aws] |
| Kosten bei Demo-Traffic | ≈ 0 $ | ≈ 0 $ (alle Teile im Always-Free-Bereich) [E] |
| Login (Cognito per OIDC) | im Browser mit einer OIDC-Client-Bibliothek (Authorization Code + PKCE); Access Token liegt im Browser-Speicher | serverseitig mit `openid-client` (Authorization Code + PKCE als vertraulicher Client); Tokens bleiben auf dem Server, Browser hat nur ein verschlüsseltes httpOnly-Cookie (BFF-Muster). Auth.js 5 ist noch Beta [B: https://www.npmjs.com/package/next-auth] und wird daher nicht verwendet |
| Sicherheit | Token im Browser → bei XSS abgreifbar; Refresh Tokens mit Rotation nötig [E] | Token nie im Browser; das von der IETF für Browser-Apps empfohlene BFF-Muster [B: https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/] |
| Geschützte Seiten | Prüfung erst im Browser (Seite lädt, dann Weiterleitung) | Prüfung vor dem Ausliefern in `proxy.ts` (Next.js 16, früher `middleware.ts`) |
| Gezeigte Next.js-Kompetenz | App Router, Routing, Komponenten; **keine** Server Components mit Datenabruf, keine Server Actions, kein ISR | vollständig: Server Components, Server Actions, Streaming, ISR, `proxy.ts` |
| Erster Seitenaufruf | sofort (statische Datei aus dem CDN) | nach Leerlauf Kaltstart der Server-Lambda, typ. 0,5–2 s [E] |
| Aufwand Infrastruktur (CDK) | gering: Bucket + Distribution | mittel (siehe Abschnitt 4) [E] |
| Risiko | gering | abhängig vom gewählten Weg (siehe Abschnitt 4) [E] |
| Praxisnähe für Kundenportale | mittel | hoch — serverseitige Session ist das für Next.js übliche Muster, unabhängig vom Identitätsanbieter (Cognito, Auth0, Keycloak …); Portal mit LoggedIn-Journey ist klassisches SSR-Terrain [E] |
| Wechsel später | A → B möglich, aber Login-Umbau nötig | B → A kaum sinnvoll |

## 3. Folge für die Micro-Frontends

Wichtige Rechercheerkenntnis: Das Next.js-Plugin für Module Federation
(`@module-federation/nextjs-mf`) hat den **App Router nie unterstützt**,
ist im Wartungsmodus und soll um Ende 2026 eingestellt werden
[B: https://github.com/module-federation/core/issues/3153]. Die
ursprünglich angedachte Einbindung per Module Federation in eine
Next.js-Shell ist damit keine gute Referenz mehr.

Tragfähige Wege, unabhängig von Variante A oder B:

| Weg | Wie | Bewertung [E] |
|---|---|---|
| **Multi-Zones** | jedes Micro-Frontend ist eine eigene Next.js-App unter einem Pfad (`/vertraege`, `/zaehlerstaende`, `/cockpit`); CloudFront verteilt nach Pfad; gemeinsame Component Library | offizieller Next.js-Weg, App-Router-fähig, unabhängig deploybar; Wechsel zwischen Zonen ist ein voller Seitenwechsel |
| Client-Widgets per Module-Federation-Runtime | eigenständige React-Bundles (z. B. mit Vite gebaut), die die Shell im Browser zur Laufzeit lädt | echte Laufzeit-Integration in eine Seite; nur als Client-Komponenten, eigener Proof of Concept nötig |
| `@vercel/microfrontends` | Vercel-Paket für Micro-Frontends mit App Router [B: https://github.com/vercel/next.js/discussions/77862] | an Vercel-Plattform ausgerichtet → passt nicht zu AWS |

**Empfehlung:** Multi-Zones als Grundarchitektur (Shell/Onboarding,
Verträge & Rechnungen, Zählerstände, Migrations-Cockpit) und **ein**
Laufzeit-Widget (z. B. Benachrichtigungs-Glocke), um beide Integrationsarten
zu zeigen. Die Component Library wird von allen Zonen als Paket genutzt.

## 4. Server-Rendering mit und ohne OpenNext

Ausgangslage [B: https://nextjs.org/blog/nextjs-across-platforms]:

- Next.js läuft ohne Einschränkung als **ein** Node.js-Server (`next start`).
  Schwierig wird es erst bei **vielen gleichzeitigen Instanzen** — genau das
  ist Lambda: Zwischenspeicher (ISR, Data Cache) müssen dann zwischen den
  Instanzen abgeglichen werden, Revalidierung muss alle erreichen, Streaming
  muss funktionieren.
- Seit **Next.js 16.2 (März 2026)** gibt es dafür eine stabile, offizielle
  **Adapter API**. Ein offizieller, „verifizierter" AWS-Adapter entsteht
  über OpenNext und soll **später in 2026** erscheinen.

Damit gibt es vier Wege für Variante B:

| Weg | Wie | Zusätzliche Abhängigkeit | Was fehlt / Risiko | Kosten Demo |
|---|---|---|---|---|
| **B1 OpenNext** | OpenNext übersetzt den Build in Server-Lambda, Bild-Lambda, ISR-Queue (SQS) und Tag-Cache (DynamoDB) | OpenNext (Community-Projekt) + CDK-Einbindung (Community-Construct oder eigene) | volle Funktion inkl. ISR; Versions-Nachlauf bei neuen Next.js-Releases; Fehlersuche in fremder Abstraktion | ≈ 0 $ |
| **B2 Standalone + Lambda Web Adapter** | Next.js baut mit `output: "standalone"` einen eigenständigen Node-Server; der **Lambda Web Adapter** (von AWS gepflegt) startet ihn in einer Lambda; Aufruf über Function URL mit Response Streaming; statische Dateien (`/_next/static`) aus S3 [B: https://github.com/aws-samples/lwa-nextjs-response-streaming-example] | nur der Lambda Web Adapter – ein generisches AWS-Werkzeug, das jede Web-App (auch Spring Boot) in Lambda betreibt | ISR/Data Cache nur je Instanz (nicht geteilt) → Seiten dynamisch rendern statt ISR; Bildoptimierung abschalten oder `sharp` mitliefern; CDK-Code selbst schreiben (überschaubar) [E] | ≈ 0 $ |
| B3 eigener Adapter | eigenes Paket gegen die Adapter API | keine fremde, aber viel eigener Code | hoher Aufwand, lohnt nur als Selbstzweck [E] | ≈ 0 $ |
| B4 Container (`next start`) | Fargate/Lightsail mit dauerhaft laufendem Container | keine | **Fixkosten** (Container läuft 24/7, dazu Load Balancer oder öffentliche IPv4-Adresse) und kein Serverless mehr [E] | ca. 10–30 $/Monat [A] |
| (Amplify Hosting) | AWS-verwalteter Next.js-Betrieb | AWS Amplify | versteckt die Infrastruktur → zeigt kaum CDK/CloudFront/Lambda; Multi-Zones umständlich [E] | Build-Minuten und SSR-Aufrufe kostenpflichtig nach Freikontingent |

Java-Vergleich: B2 entspricht einer Spring-Boot-Anwendung, die unverändert
per Lambda Web Adapter in Lambda läuft; B1 entspricht einem Framework, das
die Anwendung in viele spezialisierte Lambdas zerlegt.

**Was fehlt bei B2 konkret?** Für ein Kundenportal mit Login wenig [E]:
Seiten hinter dem Login sind ohnehin personalisiert und werden pro Anfrage
gerendert; ISR und geteilter Cache sind vor allem für öffentliche, häufig
aufgerufene Inhaltsseiten wichtig. Streaming, Server Components, Server
Actions und `proxy.ts` funktionieren im Standalone-Server.

## 5. Empfehlung

**Variante B mit Weg B2 (Standalone + Lambda Web Adapter)** für die Zonen
mit Login, **Variante A (Static Export)** für Zonen ohne Login (Storybook,
öffentliche Startseite).

Begründung [E]:

1. **Weniger Fremdabhängigkeit:** nur der offizielle Next.js-Build und ein
   generisches AWS-Werkzeug; keine Übersetzungsschicht, die neuen
   Next.js-Versionen hinterherlaufen muss.
2. **Transparenz:** Die gesamte Infrastruktur steht als eigener, lesbarer
   CDK-Code im Repository — für eine Referenz besser als eine
   Blackbox.
3. **Ausreichender Funktionsumfang** für die LoggedIn-Journey (siehe oben);
   die bewusste Entscheidung gegen ISR ist im Gespräch ein gutes
   Architekturargument.
4. **Ausstiegspfad:** Erscheint der verifizierte AWS-Adapter (Ende 2026),
   kann das Demo darauf umziehen; das ist eine Build-Einstellung, kein
   Umbau der Anwendung.

Risiko: Kaltstart des Standalone-Servers in Lambda (typ. 1–2 s nach
Leerlauf) [E]. Absicherung: Durchstich misst die Startzeit; bei Bedarf
kleinere Bundles oder ein zeitgesteuerter Aufwärm-Aufruf (EventBridge
Scheduler, im Freikontingent).

## Quellen

- Next.js Adapter API und Selbst-Hosting (25.03.2026): https://nextjs.org/blog/nextjs-across-platforms
- Lambda Web Adapter + Next.js-Streaming-Beispiel: https://github.com/aws-samples/lwa-nextjs-response-streaming-example
- Lambda Web Adapter: https://github.com/awslabs/aws-lambda-web-adapter
- OpenNext 3 Jahre / Stand 2026: https://opennext.js.org/news/2026-03-25-3-years-of-opennext
- OpenNext für AWS: https://opennext.js.org/aws
- Module Federation – Next.js-Unterstützung im Wartungsmodus: https://github.com/module-federation/core/issues/3153
- Diskussion Module Federation und App Router: https://github.com/vercel/next.js/discussions/77862
- IETF OAuth 2.0 for Browser-Based Applications (BFF): https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/
- openid-client (serverseitiger OIDC-Client, Version 6.8.8 am 29.09.2026): https://github.com/panva/openid-client
- Auth.js / next-auth (Version 5 nur als Beta, latest 4.24.15 am 29.09.2026): https://www.npmjs.com/package/next-auth
- Next.js `proxy.ts` (ehemals Middleware): https://nextjs.org/docs/messages/middleware-to-proxy
