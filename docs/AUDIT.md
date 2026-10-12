# Anchor — product- en technische audit

Auditdatum: 12 oktober 2026. Dit document beschrijft de zelfstandige Anchor-app en de lokale verificatie. Een publieke deployment en installatie op een fysiek apparaat zijn hiermee niet aangetoond.

## Product en afbakening

Anchor is een Nederlandstalig persoonlijk dagboek met een rustige dagweergave. De nieuwe app heeft eigen broncode, opslag, manifest en serviceworker. Substance Recovery blijft een afzonderlijke app. Een vergelijking van alle 514 bestaande, niet-genegeerde bronbestanden van die repository vond geen gewijzigde inhoud; Git-status en HEAD bleven gelijk.

De dubbele term ‘interne situatie’ in het verzoek is verwerkt als **Situatie (wie, wat, waar)** en vervolgens **Interne situatie** met drie afzonderlijke tekstvelden. Daarmee blijft het formulier begrijpelijk zonder aanvullende vragen of scores te introduceren.

| Onderdeel              | Uitwerking en controle                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vandaag                | Check-in en craving hebben eigen ingangen. Een tijdlijn toont opgeslagen momenten. De dagafsluiting en optionele fijne momenten staan apart.                                                                                                                                                                                         |
| Craving / drang        | Uitsluitend datum, tijd, afgeleide weekdag, situatie (wie/wat/waar), gedachte, lichamelijke sensatie, emotie en gedrag (wat deed je). Geen middelkeuze, drangscore, EIS, gebruiksuitkomst of verborgen extra vragen. Datum/tijd plus één tekstveld zijn voldoende; later aanvullen, bewerken en bevestigd verwijderen zijn mogelijk. |
| Momentcheck-in         | Meerdere losse check-ins per dag. Optionele stemming −2…+2, persoonlijke EIS 0…100, emoties, eigen emotie en notitie. Leeg blijft `null`, niet nul.                                                                                                                                                                                  |
| Activiteit en nameting | Een aangeboden of eigen activiteit kan bij een check-in horen. ‘Geprobeerd’ wordt expliciet vastgelegd. Een nameting heeft eigen datum/tijd en blijft gekoppeld aan hetzelfde moment. Een oefening openen telt niet automatisch als geprobeerd.                                                                                      |
| Mijn hele dag          | Eén bewerkbare terugblik per datum met optionele stemming, EIS, slaapduur en notitie. Geen automatisch gemiddelde van losse momenten.                                                                                                                                                                                                |
| Terugkijken            | Periode-, soort- en tekstfilters. Cravings zijn doorzoekbaar op alle vijf tekstvelden. De stemminggrafiek gebruikt uitsluitend momentmetingen en de echte datum van een nameting; een tekstlijst biedt dezelfde waarden. Craving- en dagfilters verbergen de niet-relevante grafiek.                                                 |
| Doelen en middelen     | Categorie, vrij aanpasbare middel-/doelnaam, eigen richting en toelichting. Bewerken behoudt het ID. Verwijderen vraagt bevestiging en verwijdert geen registraties.                                                                                                                                                                 |
| Mijn plan / houvast    | Eigen signalen, acties en steun. Houvast toont de opgeslagen actie en steun; het formulier heeft conceptopslag en expliciet verwerpen.                                                                                                                                                                                               |
| Mijn groei             | Fijne momenten met datum, tekst en favoriet; toevoegen, bewerken en bevestigd verwijderen. Geen verplichte scores.                                                                                                                                                                                                                   |
| Hulpmiddelen           | Een werkende 5-4-3-2-1-oefening met doorgaan, overslaan en stoppen; eigen activiteiten via een check-in. De app presenteert geen automatische conclusies over werkzaamheid.                                                                                                                                                          |
| Instellingen           | Licht/donker, fijne momenten op Vandaag, echte back-upexport/import, uitleg over privacy/opslag en installatie. Geen demostanden of inactieve previewknoppen.                                                                                                                                                                        |
| Concepten en herstel   | Open concepten hervatten of bewust wissen. Opslagfouten blijven zichtbaar; corrupte conceptopslag kan eerst als herstelbestand worden gedownload. Ongeldige/missende routes tonen een begrijpelijke terugweg.                                                                                                                        |

De EIS is een eigen intensiteitsinschatting, geen klinisch gevalideerde uitkomstmaat. De grafiek vergelijkt observaties en doet geen causale uitspraken. Anchor bevat geen Fitbit-koppeling, account, automatische synchronisatie of behandeling op maat.

## Architectuur en gegevensbehoud

React/TypeScript en Vite vormen een zelfstandige statische app. `src/CravingView.tsx` bevat het compacte drangformulier, `src/SecondaryViews.tsx` de historie/plannen/groei/instellingen en `src/lib/storage.ts` het gevalideerde opslagcontract. De hashrouter en `/Anchor/`-basis passen bij hosting onder een repositorypad. Node 24 en pnpm 11.9.0 zijn vastgelegd; de lockfile en controleworkflow horen bij deze repository.

Opgeslagen gegevens gebruiken `anchor.app.data.v1`; concepten gebruiken `anchor.app.drafts.v1`. De app leest of migreert geen Substance Recovery- of previewgegevens. Browserproeven met synthetische oude localStorage-, IndexedDB- en cachegegevens bevestigen dat deze ongemoeid blijven.

De opslaglaag valideert versies, toegestane velden, datums/tijden, scorebereiken, tekstlengtes, unieke IDs en chronologie. Onbekende of corrupte gegevens worden niet stilzwijgend vervangen. De hoofdgegevens worden als één gevalideerd object geschreven; een fout levert geen succesmelding op. Mislukte conceptwrites blijven tijdens de open sessie beschikbaar, met een waarschuwing en herstelmogelijkheid. Een mislukte conceptverwijdering dupliceert een al opgeslagen doel niet bij opnieuw opslaan.

Eén tabblad bezit de schrijflock `anchor.app.writer`; andere tabbladen krijgen een leesmodus. Revisiecontrole weigert achterhaalde writes en imports. Dit gebruikt de coördinatie tussen tabbladen van dezelfde origin uit de [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API). Bij ontbrekende ondersteuning wordt veilig lezen aangeboden; er is geen onveilige schrijf-fallback.

Een gewone Anchor-back-up bevat de **opgeslagen** gegevens, geen nog open concepten. Import valideert eerst het bestand, toont aantallen en vervangt pas na een expliciete bevestiging en het aanbieden van een kopie van de huidige opslag. Open concepten blokkeren vervanging. Een concept-herstelbestand is afzonderlijk en bedoeld voor handmatig herstel; het is geen gewone importback-up.

## Privacy, beveiliging en toegankelijkheid

De app heeft geen backend of telemetrie en verstuurt geen dagboekinhoud. React rendert ingevoerde tekst als tekst. Er zijn geen externe lettertypen; een Content Security Policy beperkt actieve bronnen tot de eigen origin. De dependency-audit rapporteerde nul bekende kwetsbaarheden op de auditdatum; dit is geen bewijs dat de code kwetsbaarheidsvrij is.

Browseropslag en back-ups zijn leesbare tekst, niet door Anchor versleuteld. Apparaat-/profieltoegang kan toegang tot deze gegevens geven. Opslagkeys en paden voorkomen onbedoelde vermenging; verschillende paden op dezelfde hostingorigin vormen geen afzonderlijke beveiligingsgrens. De 112-link vereist een bewuste gebruikersactie; er zijn geen automatische oproepen of berichten getest of verstuurd.

Formulieren gebruiken blijvende labels, ruime velden, zichtbare focus, begrijpelijke foutmeldingen en expliciete bevestigingen. Navigatie past zich aan desktop, tablet en telefoon aan; de inhoud blijft bruikbaar bij 320 CSS-pixels en 200% tekstgrootte. Beweging kan worden beperkt. Grafiekwaarden zijn ook als tekst beschikbaar. Beide thema's en lange invoer zijn bekeken. Dit is geen volledige WCAG-conformiteitsverklaring; fysieke apparaten, Safari en een schermlezer zijn nog niet afzonderlijk geverifieerd.

## PWA en onderhoud

Het manifest heet **Anchor**, heeft standalone-weergave en eigen gewone/maskable icons. De serviceworker is begrensd tot `/Anchor/`, gebruikt een eigen cache-ID en cachet appbestanden. Een gecontroleerde browserproef bevestigde offline openen, opslaan en opnieuw openen nadat de serviceworker de app bestuurde.

Updates gebruiken `registerType: "prompt"` en `skipWaiting: false`: de gebruiker krijgt eerst een melding. Open of niet-bewaarde concepten blokkeren de knop Bijwerken. Deze keuze volgt het [Vite PWA-patroon voor expliciet vernieuwen](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html). Assetcache en persoonlijke opslag hebben verschillende verantwoordelijkheden; cachevernieuwing is geen gegevensmigratie.

De echte overgang van een actieve oudere worker naar een nieuw gebouwde versie is tweemaal achtereen geslaagd. `tests/verify-update.mjs` bevestigt een nieuw JavaScript-bestand, een echte herlaadactie en een actieve nieuwe worker. Een open concept houdt activatie tegen; na opslaan en bewust bijwerken blijven beide opgeslagen registraties byte voor byte identiek. De nieuwe versie opent vervolgens volledig offline, zonder browserfouten.

Bij toekomstige releases: behoud bestaande opslagkeys, voeg zo nodig expliciete schemamigraties met oude-fixturetests toe, bouw opnieuw en controleer de oude-client-update. Een nieuwe URL, browser of origin verplaatst gebruikersgegevens niet automatisch. Publieke hosting en fysieke PWA-installatie vereisen een afzonderlijke verificatie.

## Verificatie en resterende grenzen

| Controle                              | Vastgesteld resultaat                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript en productiebuild          | Geslaagd.                                                                                                                         |
| Opslagtests                           | 39 geslaagd: schema, corrupte data, revisieconflicten, back-ups, concepten en fouten.                                             |
| App-browsertests                      | 17 geslaagd: kernflows, isolatie, concepten/herstel, meervoudige check-ins, import, twee tabbladen, offline en responsive invoer. |
| Aanvullende secundaire browseraudit   | 18 geslaagd: doelen, plan, groei, voorkeuren, foutscenario's, filters, latere nameting en 320 px/200% tekst. Geen runtimefouten.  |
| Dependency-audit                      | Nul gerapporteerde kwetsbaarheden op auditdatum.                                                                                  |
| Oude repository behouden              | 514 bestanden inhoudelijk identiek; status en HEAD ongewijzigd.                                                                   |
| Oude-client-update                    | Twee opeenvolgende echte A→B-overgangen geslaagd, met conceptblokkade, identieke gegevens en offline herladen van B.              |
| Publieke deployment / fysiek apparaat | Niet aangetoond door deze audit.                                                                                                  |

`localStorage` heeft beperkte, browserafhankelijke capaciteit en kan worden gewist of ontoegankelijk zijn. De app begrenst de hoofdgegevens tot 2.000.000 tekens, concepten tot 256.000 tekens en 100 concepten. Een niet-bewaarde sessie kan verloren gaan als het tabblad ondanks de waarschuwing wordt gesloten. Regelmatige eigen back-ups blijven nodig. Er is geen cross-device-synchronisatie, bulkimport uit de oude app, attachmentopslag of automatische samenvoeging van conflicterende back-ups.

Herhaal de controles met `pnpm typecheck`, `pnpm test`, `pnpm audit`, `pnpm build`, `pnpm test:browser`, `pnpm test:secondary` en `pnpm test:update`. De GitHub-workflow bevat dezelfde controles; een groene lokale run is geen bewijs van een uitgevoerde GitHub-run. De aanvullende browseraudit is herhaalbaar via `tests/verify-secondary.mjs`.

Lokale aanvullende bewijzen staan bewust onder genegeerde paden: `tmp/secondary-qa/report.json`, `tmp/secondary-qa/audit.md`, `tmp/secondary-qa/run.mjs`, `tmp/secondary-qa/capture-viewport.mjs`, de bijbehorende screenshots, `tmp/dependency-audit.json`, `tmp/source-preservation-result.json` en `tmp/update-check/`. Reguliere browsertestuitvoer staat in `test-results/` en `playwright-report/`. Deze synthetische testartefacten maken geen onderdeel uit van de appdata of publieke broncode.
