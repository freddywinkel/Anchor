// Original, brief descriptions to help users find words for an experience.
// Everyday meanings overlap; these are not diagnoses or fixed categories.
// Conceptual references (consulted 2026-10-14; no runtime requests):
// https://dictionary.apa.org/emotion
// https://dictionary.apa.org/anxiety
// https://www.apa.org/news/podcasts/speaking-of-psychology/guilt-shame
// https://dictionary.apa.org/jealousy
// https://dictionary.apa.org/envy
// Keep keys identical to EMOTION_OPTIONS; never rewrite stored labels.
export const EMOTION_MEANINGS: Readonly<Record<string, string>> = {
  // Angst en onzekerheid
  Bang: "Je ervaart angst voor iets dat op dit moment bedreigend of spannend voelt.",
  Angstig:
    "Je ervaart vrees en onzekerheid, ook als niet duidelijk is waar je precies bang voor bent.",
  Bezorgd:
    "Je voelt zorg over hoe het met iemand gaat of hoe iets zal verlopen.",
  Nerveus:
    "Je voelt onrustige spanning, bijvoorbeeld terwijl je afwacht hoe iets zal verlopen.",
  Zenuwachtig:
    "Je voelt een kriebelige, onrustige spanning, bijvoorbeeld rond iets dat je spannend vindt.",
  Onzeker: "Je voelt twijfel over jezelf, een keuze of wat je kunt verwachten.",
  Beducht:
    "Je voelt voorzichtige vrees voor iets dat mogelijk onaangenaam of moeilijk wordt.",
  Ongerust:
    "Je voelt onrust en hebt het idee dat er misschien iets niet goed gaat.",
  Verlegen:
    "Je voelt je wat geremd of schuchter wanneer anderen aandacht aan je geven.",
  Ongemakkelijk:
    "Je voelt je niet op je gemak en weet misschien niet goed hoe je je wilt gedragen.",
  Kwetsbaar:
    "Je voelt je gevoelig en weinig beschermd tegen wat je emotioneel kan raken.",
  Wantrouwig:
    "Je voelt twijfel over iemands bedoelingen of over de betrouwbaarheid van een situatie.",

  // Spanning en onrust
  Onrustig: "Je voelt dat het vanbinnen niet stil is en vindt moeilijk rust.",
  Gespannen:
    "Je voelt je strak, alert of op scherp, met weinig ruimte om te ontspannen.",
  Gestrest:
    "Je ervaart druk en hebt het gevoel dat er veel van je gevraagd wordt.",
  Gejaagd:
    "Je voelt haast vanbinnen, alsof je steeds verder moet en nauwelijks kunt vertragen.",
  Rusteloos:
    "Je voelt een aanhoudende onrust en een drang om te bewegen of iets anders te doen.",
  Overweldigd:
    "Je ervaart zoveel tegelijk dat het moeilijk voelt om overzicht of houvast te vinden.",
  Overprikkeld:
    "Geluiden, indrukken of andere prikkels voelen op dit moment als te veel.",
  Paniek:
    "Je voelt zeer sterke angst, waarbij het moeilijk kan zijn om overzicht en houvast te vinden.",

  // Boosheid en weerstand
  Boos: "Je voelt kwaadheid of verzet tegen iets dat je dwarszit of raakt.",
  Geïrriteerd: "Je voelt ergernis en merkt dat iets of iemand je tegenstaat.",
  Gefrustreerd:
    "Je voelt ergernis of onmacht rond iets wat niet lukt zoals je wilt.",
  Ongeduldig:
    "Je vindt wachten moeilijk en voelt de behoefte dat iets sneller gaat.",
  Verontwaardigd:
    "Je voelt boosheid over iets dat voor jou oneerlijk of onrechtvaardig is.",
  Woedend:
    "Je voelt zeer sterke boosheid die op dat moment veel ruimte inneemt.",
  Verbitterd:
    "Je voelt een mengeling van teleurstelling en boosheid, met weinig vertrouwen dat het anders wordt.",
  Opstandig: "Je voelt verzet tegen wat er van je wordt verwacht of opgelegd.",
  Wrokkig:
    "Je voelt boosheid die blijft hangen rond iets wat je als onrecht hebt ervaren.",
  Gekrenkt:
    "Je voelt je geraakt in je eigenwaarde, bijvoorbeeld door een ervaren belediging of afwijzing.",

  // Verdriet en gemis
  Verdrietig:
    "Je ervaart een pijnlijk gevoel van verdriet, soms met behoefte aan tranen of troost.",
  Eenzaam:
    "Je mist de verbinding of nabijheid die je graag zou voelen, ook als er mensen zijn.",
  Teleurgesteld:
    "Je voelt verdriet of onvrede over een verschil tussen je hoop en wat er is.",
  Neerslachtig:
    "Je voelt je terneergeslagen en ervaart op dit moment weinig lichtheid of plezier.",
  Weemoedig:
    "Je voelt een zacht, soms ook warm verdriet bij iets dat je mist of herinnert.",
  Somber:
    "Je voelt een donkere zwaarte en het is moeilijk om iets hoopvols te zien.",
  Bedroefd: "Je voelt een stil of diep verdriet om iets dat je raakt.",
  Ontroostbaar:
    "Je voelt zoveel verdriet dat troost je op dit moment nauwelijks lijkt te bereiken.",
  Moedeloos:
    "Je voelt weinig moed om verder te gaan met iets dat moeilijk lijkt.",
  Wanhopig:
    "Je voelt diepe nood en ziet op dit moment nauwelijks een uitweg of mogelijkheid.",
  Nostalgisch:
    "Je verlangt met warmte en soms verdriet terug naar een herinnering of vroegere tijd.",
  Heimwee:
    "Je mist een vertrouwde plek, mensen of een gevoel van thuis en verlangt ernaar terug.",

  // Schaamte en spijt
  Beschaamd:
    "Je voelt je tekortschieten als persoon en wilt jezelf misschien liever verbergen.",
  Schuldig:
    "Je voelt je verantwoordelijk voor iets dat volgens jou verkeerd is gegaan of iemand heeft geraakt.",
  Spijt:
    "Je wenst dat je iets anders had gedaan of dat iets anders was gelopen.",
  Gegeneerd:
    "Je voelt je ongemakkelijk of opgelaten rond iets wat anderen van je zien of merken.",
  Gekwetst:
    "Je voelt emotionele pijn rond iets wat je persoonlijk heeft geraakt.",
  Machteloos:
    "Je voelt dat je weinig invloed hebt op iets wat je graag zou veranderen.",
  Hulpeloos:
    "Je voelt dat je het alleen niet redt en weet niet goed wat mogelijk is.",
  Berouwvol:
    "Je voelt diepe spijt over iets wat je deed of naliet en wat dat heeft betekend.",

  // Afkeer en walging
  Afkeer:
    "Je voelt een duidelijke tegenzin tegen iets of iemand en wilt er afstand van.",
  Walging:
    "Je voelt sterke afkeer, soms met een lichamelijk gevoel van misselijkheid of terugdeinzen.",
  Afschuw:
    "Je voelt een intense mengeling van afkeer en ontzetting bij iets dat je raakt.",
  Weerzin:
    "Je voelt een innerlijke weerstand om ergens naartoe te gaan, iets te doen of iets toe te laten.",
  Minachting:
    "Je voelt afwijzing en weinig respect voor iemand of voor diens gedrag.",

  // Verlangen en jaloezie
  Jaloers:
    "Je voelt angst of pijn bij het idee dat aandacht of een belangrijke band naar iemand anders gaat.",
  Afgunstig:
    "Je voelt een pijnlijk verlangen naar iets wat een ander heeft of kan.",
  Verlangend:
    "Je voelt een wens naar iets of iemand die op dit moment niet dichtbij is.",
  Hunkerend:
    "Je voelt een sterk en aanhoudend verlangen naar iets of iemand die je mist.",
  Smachtend:
    "Je verlangt heel intens naar iets of iemand, met een haast tastbaar gevoel van gemis.",
  Onvervuld:
    "Je voelt dat een belangrijke wens of behoefte op dit moment geen vervulling vindt.",

  // Plezier en enthousiasme
  Blij: "Je ervaart plezier of vreugde bij iets, iemand of het moment zelf.",
  Vrolijk: "Je voelt je licht en opgewekt, misschien met zin om te lachen.",
  Gelukkig:
    "Je ervaart een warm gevoel van welbevinden, alsof het op dit moment goed voelt om er te zijn.",
  Opgetogen:
    "Je voelt een sterke, levendige blijdschap die je aandacht even helemaal kan vullen.",
  Uitgelaten:
    "Je voelt zoveel vrolijkheid dat je die graag vrij en zichtbaar uit.",
  Enthousiast:
    "Je voelt een levendige interesse en zin om ergens bij betrokken te zijn.",
  Opgewonden:
    "Je voelt levendige, sterke spanning of verwachting, die prettig, onrustig of seksueel kan zijn.",
  Speels:
    "Je voelt lichtheid en zin om te spelen, te ontdekken of iets luchtig te benaderen.",
  Geamuseerd:
    "Je voelt plezier in iets wat je grappig, vermakelijk of onderhoudend vindt.",
  Trots:
    "Je voelt waardering voor jezelf, iemand anders of iets dat voor je van betekenis is.",
  Dankbaar:
    "Je voelt waardering voor iets of iemand die je als waardevol ervaart.",

  // Rust en vertrouwen
  Rustig:
    "Je voelt weinig innerlijke onrust en hebt ruimte om bij het moment te zijn.",
  Kalm: "Je voelt je rustig en evenwichtig, ook als er om je heen iets gebeurt.",
  Ontspannen:
    "Je voelt minder spanning en ervaart ruimte om even niets te hoeven.",
  Opgelucht:
    "Je voelt dat een last of spanning van je afvalt en er ruimte ontstaat.",
  Tevreden: "Je voelt dat wat er nu is voldoende of passend voor je is.",
  Vredig: "Je voelt een diepe rust en weinig innerlijke strijd op dit moment.",
  Gerustgesteld:
    "Je voelt minder bezorgdheid en meer vertrouwen in iets waarover je onzeker was.",
  Geborgen:
    "Je voelt je warm omringd, opgevangen of welkom bij iemand of op een plek.",
  Veilig: "Je voelt je op dit moment beschermd en ervaart weinig dreiging.",
  Hoopvol:
    "Je voelt ruimte voor de mogelijkheid dat iets goed of beter kan worden.",
  "Vol vertrouwen":
    "Je voelt vertrouwen in iemand, een situatie of hoe iets zich kan ontwikkelen.",
  Zelfverzekerd:
    "Je voelt vertrouwen in jezelf en in je vermogen om met iets om te gaan.",

  // Liefde en verbinding
  Verbonden:
    "Je voelt nabijheid en het gevoel ergens bij te horen of contact te hebben.",
  Geliefd:
    "Je voelt dat iemand om je geeft en dat je voor diegene belangrijk bent.",
  Liefdevol:
    "Je voelt warme genegenheid en zorg voor iemand, jezelf of iets wat je dierbaar is.",
  Verliefd:
    "Je voelt een bijzondere aantrekkingskracht en verlangen naar de nabijheid van iemand.",
  Teder:
    "Je voelt een zachte, voorzichtige genegenheid voor iemand of iets dat je raakt.",
  Warm: "Je voelt een zachte, vriendelijke genegenheid tegenover iemand, jezelf of de mensen om je heen.",
  Betrokken:
    "Je voelt dat iemand of iets je aangaat en je niet onverschillig laat.",
  Bewogen:
    "Je voelt je innerlijk geraakt, bijvoorbeeld door medeleven met wat iemand meemaakt.",
  Ontroerd:
    "Je voelt je diep geraakt door iets dierbaars, moois of aangrijpends, soms met tranen.",

  // Interesse en verrassing
  Nieuwsgierig:
    "Je voelt zin om iets te ontdekken of te begrijpen dat je nog niet kent.",
  Geïnteresseerd:
    "Je voelt aandacht en belangstelling voor iets of iemand en wilt er meer van weten.",
  Verwonderd:
    "Je voelt open verbazing over iets bijzonders dat je niet vanzelfsprekend vindt.",
  Verrast:
    "Je voelt een plotselinge reactie op iets onverwachts, prettig of onprettig.",
  Verbaasd: "Je voelt verbazing over iets wat niet past bij wat je verwachtte.",
  Verbijsterd:
    "Je voelt zo'n sterke verbazing of ontzetting dat je even niet weet wat je ervan moet denken.",
  Verward:
    "Je voelt weinig helderheid en vindt het moeilijk om te begrijpen wat je denkt, voelt of meemaakt.",
  Verbluft:
    "Je voelt sterke verbazing over iets opvallends, alsof je er even stil van wordt.",

  // Verveling en afstand
  Verveeld:
    "Je voelt weinig belangstelling voor wat er nu is en mist iets dat je aanspreekt.",
  Onverschillig:
    "Je merkt dat iets je weinig raakt en weinig voorkeur of betrokkenheid oproept.",
  Afstandelijk:
    "Je voelt weinig emotionele nabijheid tot anderen of tot wat er om je heen gebeurt.",
  Leeg: "Je voelt vanbinnen een leegte of gemis, zonder dat daar een duidelijk gevoel bij hoort.",
  Vlak: "Je ervaart weinig variatie in je gevoelens, zonder duidelijke pieken of dalen.",
  Verdoofd:
    "Je kunt moeilijk bij je gevoelens komen, alsof er een laagje tussen jou en je gevoel zit.",
  Afgestompt:
    "Je merkt dat dingen die je eerder raakten nu minder gevoel bij je oproepen.",
};
