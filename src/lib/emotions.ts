// Optional words to help describe a personal experience. These groups are
// navigation aids, not a clinical classification or an exhaustive taxonomy.
// Keep existing option labels stable; stored observations are never normalized.
export const EMOTION_GROUPS: readonly {
  label: string;
  options: readonly string[];
}[] = [
  {
    label: "Angst en onzekerheid",
    options: [
      "Bang",
      "Angstig",
      "Bezorgd",
      "Nerveus",
      "Zenuwachtig",
      "Onzeker",
      "Beducht",
      "Ongerust",
      "Verlegen",
      "Ongemakkelijk",
      "Kwetsbaar",
      "Wantrouwig",
    ],
  },
  {
    label: "Spanning en onrust",
    options: [
      "Onrustig",
      "Gespannen",
      "Gestrest",
      "Gejaagd",
      "Rusteloos",
      "Overweldigd",
      "Overprikkeld",
      "Paniek",
    ],
  },
  {
    label: "Boosheid en weerstand",
    options: [
      "Boos",
      "Geïrriteerd",
      "Gefrustreerd",
      "Ongeduldig",
      "Verontwaardigd",
      "Woedend",
      "Verbitterd",
      "Opstandig",
      "Wrokkig",
      "Gekrenkt",
    ],
  },
  {
    label: "Verdriet en gemis",
    options: [
      "Verdrietig",
      "Eenzaam",
      "Teleurgesteld",
      "Neerslachtig",
      "Weemoedig",
      "Somber",
      "Bedroefd",
      "Ontroostbaar",
      "Moedeloos",
      "Wanhopig",
      "Nostalgisch",
      "Heimwee",
    ],
  },
  {
    label: "Schaamte en spijt",
    options: [
      "Beschaamd",
      "Schuldig",
      "Spijt",
      "Gegeneerd",
      "Gekwetst",
      "Machteloos",
      "Hulpeloos",
      "Berouwvol",
    ],
  },
  {
    label: "Afkeer en walging",
    options: ["Afkeer", "Walging", "Afschuw", "Weerzin", "Minachting"],
  },
  {
    label: "Verlangen en jaloezie",
    options: [
      "Jaloers",
      "Afgunstig",
      "Verlangend",
      "Hunkerend",
      "Smachtend",
      "Onvervuld",
    ],
  },
  {
    label: "Plezier en enthousiasme",
    options: [
      "Blij",
      "Vrolijk",
      "Gelukkig",
      "Opgetogen",
      "Uitgelaten",
      "Enthousiast",
      "Opgewonden",
      "Speels",
      "Geamuseerd",
      "Trots",
      "Dankbaar",
    ],
  },
  {
    label: "Rust en vertrouwen",
    options: [
      "Rustig",
      "Kalm",
      "Ontspannen",
      "Opgelucht",
      "Tevreden",
      "Vredig",
      "Gerustgesteld",
      "Geborgen",
      "Veilig",
      "Hoopvol",
      "Vol vertrouwen",
      "Zelfverzekerd",
    ],
  },
  {
    label: "Liefde en verbinding",
    options: [
      "Verbonden",
      "Geliefd",
      "Liefdevol",
      "Verliefd",
      "Teder",
      "Warm",
      "Betrokken",
      "Bewogen",
      "Ontroerd",
    ],
  },
  {
    label: "Interesse en verrassing",
    options: [
      "Nieuwsgierig",
      "Geïnteresseerd",
      "Verwonderd",
      "Verrast",
      "Verbaasd",
      "Verbijsterd",
      "Verward",
      "Verbluft",
    ],
  },
  {
    label: "Verveling en afstand",
    options: [
      "Verveeld",
      "Onverschillig",
      "Afstandelijk",
      "Leeg",
      "Vlak",
      "Verdoofd",
      "Afgestompt",
    ],
  },
];

export const EMOTION_OPTIONS: readonly string[] = EMOTION_GROUPS.flatMap(
  (group) => group.options,
);
