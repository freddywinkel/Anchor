# Anchor

Een rustig, Nederlandstalig dagboek om meerdere keren per dag in te checken, een craving vast te leggen en aan het einde van de dag terug te kijken. Anchor is een zelfstandige app met eigen broncode, opslag en PWA. De bestaande Substance Recovery-app wordt niet gewijzigd en gegevens worden niet automatisch overgenomen.

## Wat kun je vastleggen?

- **Craving:** datum en tijd, situatie (wie/wat/waar), gedachte, lichamelijke sensatie, emotie en gedrag. De weekdag volgt uit de datum. Je kunt kort beginnen en later aanvullen; er zijn geen extra scores of vragen in dit formulier.
- **Check-in:** stemming, persoonlijke emotionele intensiteit (EIS 0–100), woorden/emoties en eventueel een activiteit met een afzonderlijke nameting. Meerdere momenten per dag zijn mogelijk.
- **Mijn hele dag:** een eigen dagoverzicht met stemming, intensiteit, slaap en notitie. Dit is geen berekend gemiddelde van losse registraties.
- **Terugkijken:** geschiedenis, filters, zoeken en een weergave van de ingevulde stemmingsmetingen.
- **Mijn plan en Mijn groei:** eigen doelen, aanpasbare namen, een persoonlijk plan en fijne momenten.
- **Hulpmiddelen:** een eenvoudige grondoefening en ruimte voor eigen activiteiten, zonder automatisch een effect of gebruik te registreren.

De app start leeg. Er zijn geen accounts, Fitbit-koppelingen, externe analytics, automatische synchronisatie of medische conclusies.

## Lokaal starten

Gebruik Node.js 24 en pnpm **11.9.0**:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:8800/Anchor/`. De ontwikkelserver gebruikt geen service worker. Voor de volledige PWA:

```sh
pnpm build
pnpm preview
```

Open dezelfde URL, wacht tot de offlinebestanden gereed zijn en herlaad eenmaal. De app kan via een ondersteunende browser worden geïnstalleerd. Een productiehost moet HTTPS gebruiken; localhost is geschikt voor lokale tests. Op een telefoon verwijst `127.0.0.1` naar de telefoon zelf.

## Gegevens en updates

Alle gegevens staan lokaal in deze browser, onder uitsluitend `anchor.app.data.v1` en `anchor.app.drafts.v1`. De opslag en JSON-back-ups zijn **niet door Anchor versleuteld**. Andere apps worden niet uitgelezen of gewijzigd. Wissen van browsergegevens, privévensters, opslaglimieten en een ander apparaat/origin kunnen de beschikbaarheid van gegevens beïnvloeden; maak regelmatig een back-up in Instellingen.

Een nieuwe appversie wordt voorbereid en pas na de knop **Bijwerken** geactiveerd. Open concepten moeten eerst worden opgeslagen of bewust verworpen. Het vernieuwen van appbestanden wist geen registraties. Opslagfouten laten een zichtbare melding zien en houden tekst beschikbaar; herstel van beschadigde gegevens vraagt eerst om een herstelkopie en expliciete bevestiging. Gebruik één bewerkend tabblad tegelijk. Een tweede tabblad is alleen-lezen totdat het eerste is gesloten en het tweede is herladen.

Normale back-ups kunnen worden geïmporteerd na validatie, een veiligheidskopie en bevestiging. Een afzonderlijk **concept-herstelbestand** bevat ruwe tekst voor handmatig herstel; dit is geen reguliere importback-up. Gegevens uit Substance Recovery vereisen een later afzonderlijk ontworpen import en worden nu niet automatisch gemigreerd.

Voor toekomstige wijzigingen:

1. Werk vanuit een branch, behoud de bestaande opslagstructuur en voeg voor een schemawijziging expliciete, geteste migraties toe. Verhoog de schemaversie niet met een reset als alternatief.
2. Verhoog de appversie in `package.json`. Een build kan daarnaast een herkenbare `APP_BUILD`-waarde krijgen; de schemaversie staat hiervan los.
3. Voer de controles hieronder uit, inclusief echte A→B-update met bewaarde gegevens en concepten.
4. Publiceer de gecontroleerde inhoud van `dist/` op dezelfde HTTPS-origin en hetzelfde pad. Het standaardpad is `/Anchor/`; `BASE_PATH` kan bij het bouwen worden ingesteld met een begin- en eindslash.

De controleworkflow kan het **exact geteste artifact** naar GitHub Pages deployen, nadat alle controles geslaagd zijn. Deployment is actief wanneer de repositoryvariabele `ANCHOR_PAGES_ENABLED` op `true` staat. Daarna publiceert een push naar `main` de nieuwe geteste versie; de workflow kan ook handmatig worden gestart. `release.json` identificeert de appversie en bij een CI-build de broncommit.

De eigenaar heeft op 12 oktober 2026 gekozen voor een openbare repository en GitHub Pages. Het publicatieadres is [Anchor](https://freddywinkel.github.io/Anchor/). Pages gebruikt buildtype `workflow` met de bovengenoemde repositoryvariabele. De broncode is openbaar; persoonlijke registraties en back-ups worden niet in deze repository opgeslagen. Controleer de geslaagde deploymentrun en `release.json` voor de daadwerkelijk gepubliceerde versie.

Gegevens uit de lokale preview verhuizen niet vanzelf naar een nieuw webadres: sla eerst open concepten op, exporteer de Anchor-back-up op het oude adres en importeer die op het nieuwe adres. Updates op datzelfde nieuwe adres behouden de bestaande opslag.

## Controles

```sh
pnpm typecheck
pnpm test
pnpm audit
pnpm build
pnpm verify:pwa
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:secondary
pnpm test:update
```

Na deployment: stel `ANCHOR_LIVE_URL` en `EXPECTED_COMMIT` in en voer `pnpm verify:live` uit. Deze controle gebruikt een schoon browserprofiel met fictieve invoer voor de live pagina, offline opslaan/herladen en back-upexport.

De browsertests gebruiken lokaal Google Chrome en in CI het geïnstalleerde Chromium. De updatetest gebruikt Chromium en bouwt twee tijdelijke versies op poort 8801; hij raakt geen eigen browserprofiel of persoonlijke registraties. Browserchecks gebruiken poort 8800. Sluit bij een handmatige controle een oude previewserver of bouw eerst de actuele versie.

Zie [de audit](docs/AUDIT.md) voor de beoordeelde onderdelen, resultaten en grenzen van de verificatie. De primaire modules zijn `src/App.tsx`, `src/CravingView.tsx`, `src/SecondaryViews.tsx` en de gevalideerde opslaglaag `src/lib/storage.ts`.
