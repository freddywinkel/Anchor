# Anchor

Een rustig, Nederlandstalig dagboek om meerdere keren per dag in te checken, een craving vast te leggen en aan het einde van de dag terug te kijken. Anchor is een zelfstandige app met eigen broncode, opslag en PWA. De bestaande Substance Recovery-app wordt niet gewijzigd en gegevens worden niet automatisch overgenomen.

## Wat kun je vastleggen?

- **Craving:** datum en tijd, externe situatie (wie, wat en waar), gedachte, lichamelijke sensatie, emotie en gedrag. De weekdag volgt uit de datum. Je kunt kort beginnen en later aanvullen; er zijn geen extra scores of vragen in dit formulier.
- **Voorbeelden bij interne situatie:** optionele keuzelijsten voor gedachten, lichamelijke sensaties en emoties voegen tekst toe aan het bestaande tekstvak. Je kunt meerdere voorbeelden kiezen, ze aanpassen of helemaal zelf schrijven.
- **Check-in:** aanpasbare datum/tijd, stemming, optionele pannetjes (1–5) voor emotionele spanning en benoemde emoties met elk een eigen intensiteit (0–100). Kies een emotie of schrijf je eigen woord; ieder cijfer mag leeg blijven. Meerdere momenten per dag zijn mogelijk.
- **Activiteit en nameting:** kies optioneel wandelen, schilderen, iemand spreken, 5-4-3-2-1 of een eigen activiteit. De app legt de route uit: eerst inchecken en bewaren, de activiteit proberen, later opnieuw inchecken. Een vervolgkaart geeft direct toegang tot de oefening en nameting. De nameting biedt dezelfde emotienamen met lege nieuwe cijfers; stemming en pannetjes beginnen ook leeg. Het proberen van de activiteit wordt afzonderlijk bevestigd. Alleen dezelfde emotie wordt vóór en na vergeleken; een begonnen nameting blijft aan dezelfde activiteit gekoppeld.
- **Mijn hele dag:** een eigen dagoverzicht met stemming, slaap en notitie. Benoemde emoties kunnen optioneel worden toegevoegd; hun cijfer beschrijft het opvallendste moment van die emotie die dag. Dit is geen berekend gemiddelde van losse registraties.
- **Terugkijken:** geschiedenis, filters, zoeken en een weergave van de ingevulde stemmingsmetingen.
- **Mijn plan en Mijn groei:** kies een middel of gedrag en daarna je doel: Minderen, Stoppen, Gecontroleerd gebruik of Eigen doel. Een bekend middel hoef je niet opnieuw te typen; bij een eigen middel of gedrag vul je zelf de naam in. Bestaande eigen namen en doelteksten blijven bewerkbaar. Er is ook ruimte voor een persoonlijk plan en fijne momenten.
- **Hulpmiddelen:** gebruik de 5-4-3-2-1-oefening los of kies expliciet ‘Eerst inchecken’. Eigen activiteiten openen direct de activiteitkeuze. Na een losse oefening kun je een gewone check-in doen, zonder verzonnen voormeting of automatisch geregistreerd gebruik. Bestaande concepten gaan altijd voor en worden herkenbaar hervat.
- **Eigen kleuren:** kies in Instellingen uit Amber, Salie, Oceaan, Roos en Lavendel. Elk palet heeft een lichte en donkere stand; de knop bovenin wisselt de stand met behoud van je palet.
- **Verzorgde vormgeving:** zachte kaarten, verfijnde typografie en geïllustreerde stemmingsgezichten en pannetjes. De pannetjes krijgen oplopende stoom en een eigen gezichtsuitdrukking; het geselecteerde antwoord heeft ook een vinkje. Bij grotere tekst verdelen de keuzes zich over meerdere regels.
- **Duidelijke onderdelen:** Vandaag, ‘Ook de kleine dingen’, formulieren, hulpmiddelen en je persoonlijke plan gebruiken dezelfde kaartopbouw. Velden passen zich aan de beschikbare ruimte aan; fouten bij bewaren komen zichtbaar in beeld.

De app start leeg. Er zijn geen accounts, Fitbit-koppelingen, externe analytics, automatische synchronisatie of medische conclusies.

Versie 1.5.0 vernieuwt de vormgeving zonder het gegevensformaat te wijzigen. DM Sans en Fraunces worden lokaal meegeleverd, inclusief hun SIL Open Font License in `public/fonts/`. Alle gebruikte lettertypen en illustraties zijn offline beschikbaar; de app haalt geen lettertypen bij een externe dienst op.

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

Concepten blijven bewaard wanneer je naar een ander scherm gaat. De updatemelding toont hoeveel er zijn en opent de conceptlijst als ze het bijwerken tegenhouden. Je vindt ze ook via **Meer opties → Open concepten**. Alleen een nieuw doel openen of een bestaand doel bekijken maakt nog geen concept; ingevulde wijzigingen wel.

Normale back-ups kunnen worden geïmporteerd na validatie, een veiligheidskopie en bevestiging. Een afzonderlijk **concept-herstelbestand** bevat ruwe tekst voor handmatig herstel; dit is geen reguliere importback-up. Gegevens uit Substance Recovery vereisen een later afzonderlijk ontworpen import en worden nu niet automatisch gemigreerd.

Vanaf 1.4.0 staan emotienamen en hun intensiteiten per meting bij elkaar. Oude losse EIS-cijfers blijven bewaard als **Intensiteit — emotie niet gekoppeld**, samen met de oorspronkelijke emotiewoorden; er wordt geen koppeling gegokt. Het openen van oude data schrijft niets om. Nieuwe optionele velden worden ook in concepten en back-ups gevalideerd. Een oudere appversie kan nieuwe velden niet bewerken en blokkeert onbekende gegevens in plaats van ze stilzwijgend weg te schrijven.

De pannetjes en emotiecijfers zijn afzonderlijke persoonlijke inschattingen. De [VERS-EIS gebruikt vijf niveaus](https://documenten.trimbos.nl/openen-downloadbaar-bestand-prs/werkblad-4-eis-thermometer-aug-pdf); [emotiedagboeken gebruiken ook 0–100 per benoemde emotie](https://www.cci.health.wa.gov.au/~/media/CCI/Mental-Health-Professionals/Social-Anxiety/Social-Anxiety---Worksheets/Social-Anxiety-Worksheet---07---Thought-Diary-1.pdf). Anchor rekent deze schalen niet naar elkaar om en leidt er geen behandeling of klinische conclusie uit af. De vijf stemmingsgezichten blijven een eigen meting.

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
