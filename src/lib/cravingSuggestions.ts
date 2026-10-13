// Optional examples to help find words; these are not an exhaustive or clinical list.
export const CRAVING_SUGGESTIONS = {
  thought: [
    {
      label: "Drang en gewoonte",
      options: [
        "Ik heb er nu zin in.",
        "Eén keer kan toch wel.",
        "Het hoort voor mij bij dit moment.",
        "Ik wil even nergens aan denken.",
      ],
    },
    {
      label: "Spanning en druk",
      options: [
        "Dit is me te veel.",
        "Ik moet nog van alles.",
        "Straks gaat het mis.",
        "Ik krijg geen rust in mijn hoofd.",
      ],
    },
    {
      label: "Zelfkritiek en twijfel",
      options: [
        "Ik doe het nooit goed genoeg.",
        "Ik stel anderen teleur.",
        "Ik had dit anders moeten doen.",
        "Ik weet niet of ik dit aankan.",
      ],
    },
    {
      label: "Behoeften en grenzen",
      options: [
        "Ik heb rust nodig.",
        "Ik wil even alleen zijn.",
        "Ik wil dat iemand naar me luistert.",
        "Ik heb behoefte aan iets fijns.",
      ],
    },
    {
      label: "Steun en vertrouwen",
      options: [
        "Ik hoef dit niet alleen te doen.",
        "Ik mag hulp vragen.",
        "Ik kan dit stap voor stap bekijken.",
        "Ik ben blij met wat al lukt.",
      ],
    },
  ],
  bodySensation: [
    {
      label: "Ademhaling en borst",
      options: [
        "Snelle ademhaling",
        "Oppervlakkige ademhaling",
        "Snelle hartslag",
        "Druk op mijn borst",
      ],
    },
    {
      label: "Spieren en spanning",
      options: [
        "Gespannen schouders",
        "Strakke kaken",
        "Stijve nek",
        "Spanning in mijn handen",
      ],
    },
    {
      label: "Buik en keel",
      options: [
        "Knoop in mijn maag",
        "Misselijkheid",
        "Honger of een lege maag",
        "Brok in mijn keel",
      ],
    },
    {
      label: "Warmte en huid",
      options: ["Warm gezicht", "Koude handen", "Klamme handen", "Kippenvel"],
    },
    {
      label: "Hoofd en tintelingen",
      options: [
        "Druk in mijn hoofd",
        "Duizelig gevoel",
        "Trillende handen",
        "Tintelingen in mijn handen",
      ],
    },
    {
      label: "Energie en ontspanning",
      options: [
        "Zware armen en benen",
        "Rusteloze benen",
        "Ontspannen spieren",
        "Rustige ademhaling",
      ],
    },
  ],
  emotion: [
    {
      label: "Angst en onzekerheid",
      options: ["Bang", "Bezorgd", "Onzeker", "Zenuwachtig", "Overweldigd"],
    },
    {
      label: "Boosheid en weerstand",
      options: ["Boos", "Geïrriteerd", "Gefrustreerd", "Ongeduldig", "Jaloers"],
    },
    {
      label: "Verdriet en gemis",
      options: [
        "Verdrietig",
        "Eenzaam",
        "Teleurgesteld",
        "Neerslachtig",
        "Weemoedig",
      ],
    },
    {
      label: "Schaamte en kwetsbaarheid",
      options: ["Beschaamd", "Schuldig", "Verlegen", "Gekwetst", "Machteloos"],
    },
    {
      label: "Plezier en verbinding",
      options: ["Blij", "Enthousiast", "Dankbaar", "Trots", "Verbonden"],
    },
    {
      label: "Rust en vertrouwen",
      options: ["Rustig", "Tevreden", "Opgelucht", "Hoopvol", "Geborgen"],
    },
    {
      label: "Verveling en nieuwsgierigheid",
      options: ["Verveeld", "Nieuwsgierig"],
    },
  ],
} as const satisfies Record<
  "thought" | "bodySensation" | "emotion",
  readonly { label: string; options: readonly string[] }[]
>;
