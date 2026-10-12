import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Anchor,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Compass,
  Heart,
  History,
  Leaf,
  Menu,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  today,
  clockTime,
  loadState,
  saveState,
  loadDrafts,
  saveDraft,
  exportBackup,
  parseBackup,
  replaceFromBackup,
  hasUnpersistedDrafts,
  draftStorageWarning,
  exportDraftRecovery,
  clearDraftStorage,
  validateState,
  DRAFT_STORAGE_KEY,
  STORAGE_KEY,
  type AppState,
  type Moment,
  type Day,
  type Ratings,
  type CravingRecord,
} from "./lib/storage";
import {
  HistoryView,
  PlanView,
  GrowthView,
  SettingsView,
} from "./SecondaryViews";
import { CravingView } from "./CravingView";
import "./secondary.css";

const MOODS = ["Erg laag", "Laag", "Neutraal", "Goed", "Erg goed"];
const MOUTHS = [
  "M10 23 Q17 13 24 23",
  "M11 22 Q17 17 23 22",
  "M11 21 H23",
  "M11 19 Q17 25 23 19",
  "M9 18 Q17 29 25 18 Z",
];
const KINDS: Record<Moment["kind"], string> = { checkin: "Check-in" };
const blankRatings = (): Ratings => ({ mood: null, eis: null });
const uid = () => crypto.randomUUID();
const hasAnchorWorker = () =>
  navigator.serviceWorker?.controller?.scriptURL ===
  new URL(`${import.meta.env.BASE_URL}sw.js`, location.origin).href;
const validCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1900 &&
    year <= 2199 &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};
const dateText = (date: string, long = false) =>
  !validCalendarDate(date)
    ? "Kies een datum"
    : new Intl.DateTimeFormat("nl-NL", {
        day: "numeric",
        month: long ? "long" : "short",
        year: "numeric",
        ...(long ? { weekday: "long" as const } : {}),
      }).format(new Date(`${date}T12:00:00`));
const hasRating = (ratings: Ratings) =>
  Object.values(ratings).some((value) => value !== null);
const emptyMoment = (): Moment => ({
  id: uid(),
  date: today(),
  time: clockTime(),
  kind: "checkin",
  before: blankRatings(),
  after: null,
  afterTime: null,
  afterDate: null,
  activity: "",
  attempted: null,
  emotions: [],
  note: "",
});
type Save = (next: AppState, message: string) => boolean;

function Button({
  children,
  onClick,
  primary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`dp-button ${primary ? "primary" : ""} ${props.className ?? ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    const previousRoute = location.hash;
    dialog.showModal();
    return () => {
      dialog.close();
      requestAnimationFrame(() => {
        if (
          location.hash === previousRoute &&
          previous instanceof HTMLElement &&
          previous.isConnected
        )
          previous.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      className="dp-dialog"
      ref={ref}
      aria-labelledby="dp-dialog-title"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [
          ...ref.current!.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        ].filter((element) => element.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="dp-section-head">
        <h2 id="dp-dialog-title">{title}</h2>
        <Button aria-label="Venster sluiten" onClick={onClose}>
          <X size={20} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
function RatingLine({ value, label }: { value: Ratings; label?: string }) {
  return (
    <div className="dp-rating-line" aria-label={label}>
      <span>
        <i className="dp-dot" />
        {value.mood === null ? "Stemming niet ingevuld" : MOODS[value.mood + 2]}
      </span>
      {value.eis !== null && (
        <span>
          EIS <b>{value.eis}</b>
        </span>
      )}
    </div>
  );
}
function RatingsEditor({
  value,
  onChange,
  prefix = "",
}: {
  value: Ratings;
  onChange: (next: Ratings) => void;
  prefix?: string;
}) {
  return (
    <div className="dp-ratings-editor">
      <fieldset>
        <legend>
          {prefix}Stemming <span className="dp-optional">optioneel</span>
        </legend>
        <div className="dp-mood-options">
          {MOODS.map((label, index) => (
            <button
              type="button"
              key={label}
              aria-pressed={value.mood === index - 2}
              aria-label={`${index - 2 > 0 ? "+" : ""}${index - 2} ${label}`}
              onClick={() =>
                onChange({
                  ...value,
                  mood: value.mood === index - 2 ? null : index - 2,
                })
              }
            >
              <svg
                aria-hidden="true"
                className="dp-mood-face"
                viewBox="0 0 34 34"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="17" cy="17" r="15.5" />
                <path d="M11 12 V13 M23 12 V13" />
                <path d={MOUTHS[index]} />
              </svg>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="dp-form-grid">
        <label className="dp-field">
          {prefix}Emotionele intensiteit (EIS)
          <span className="dp-hint">0 = geen · 100 = zeer sterk</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            step="1"
            placeholder="Niet ingevuld"
            value={value.eis ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                eis: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
      </div>
      <p className="dp-hint">
        Je eigen inschatting van dit moment. Een leeg veld blijft leeg.
      </p>
    </div>
  );
}
function PageTitle({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="dp-page-title">
      <div>
        <p className="dp-kicker">{kicker}</p>
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p className="dp-lead">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function App() {
  const [initial] = useState(loadState);
  const [state, setState] = useState(initial.state);
  const [warning, setWarning] = useState(initial.warning);
  const [pwaWarning, setPwaWarning] = useState("");
  const [blocked, setBlocked] = useState(initial.blocked);
  const [writer, setWriter] = useState(false);
  const [lockChecked, setLockChecked] = useState(false);
  const [route, setRoute] = useState(() => location.hash.slice(1) || "/today");
  const [drafts, setDrafts] = useState(loadDrafts);
  const [draftError, setDraftError] = useState("");
  const [draftWarning, setDraftWarning] = useState(draftStorageWarning);
  const [draftRecoveryRaw, setDraftRecoveryRaw] = useState<string | null>(null);
  const [draftRecoveryDownloaded, setDraftRecoveryDownloaded] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<
    "menu" | "import" | "privacy" | "drafts" | "draft-recovery" | null
  >(null);
  const [imported, setImported] = useState<AppState | null>(null);
  const [importError, setImportError] = useState("");
  const [recoveryBackup, setRecoveryBackup] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [workerControlled, setWorkerControlled] = useState(hasAnchorWorker);
  const importSequence = useRef(0);
  const recoverySnapshot = useRef<string | null | undefined>(undefined);
  const [discardKey, setDiscardKey] = useState<string | null>(null);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        window.addEventListener("focus", () => {
          if (navigator.onLine) void registration.update().catch(() => {});
        });
      }
    },
    onRegisterError() {
      setPwaWarning(
        "Offline installeren is nu niet gelukt. Je opgeslagen gegevens blijven op dit apparaat.",
      );
    },
  });
  const path = route.split("?")[0];
  const navigate = (to: string) => {
    importSequence.current++;
    setModal(null);
    setRoute(to);
    location.hash = to;
  };
  useEffect(() => {
    let release: (() => void) | undefined;
    let disposed = false;
    if (!navigator.locks) {
      setLockChecked(true);
      return;
    }
    void navigator.locks
      .request("anchor.app.writer", { ifAvailable: true }, async (lock) => {
        if (disposed) return;
        if (!lock) {
          setLockChecked(true);
          return;
        }
        const current = loadState();
        setState(current.state);
        setWarning(current.warning);
        setBlocked(current.blocked);
        setDrafts(loadDrafts());
        setWriter(true);
        setLockChecked(true);
        await new Promise<void>((resolve) => {
          release = resolve;
          if (disposed) resolve();
        });
      })
      .catch(() => setLockChecked(true));
    return () => {
      disposed = true;
      release?.();
    };
  }, []);
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "/today");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const navigation = document.querySelector<HTMLElement>(".dp-bottom-nav");
    if (!navigation) return;
    const measure = () =>
      document.documentElement.style.setProperty(
        "--anchor-nav-clearance",
        `${navigation.getBoundingClientRect().height + 16}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let frame = 0;
    const revealFocus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.activeElement;
        if (
          !(target instanceof HTMLElement) ||
          !target.closest("main") ||
          !target.matches("a, button, input, select, textarea, summary")
        )
          return;
        const viewport = window.visualViewport;
        const top = (viewport?.offsetTop ?? 0) + 16;
        const viewportBottom =
          (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
        const nav = document
          .querySelector(".dp-bottom-nav")
          ?.getBoundingClientRect();
        const bottom =
          Math.min(viewportBottom, nav?.height ? nav.top : viewportBottom) - 16;
        const rect = target.getBoundingClientRect();
        const movement =
          rect.height > bottom - top || rect.top < top
            ? rect.top - top
            : rect.bottom > bottom
              ? rect.bottom - bottom
              : 0;
        if (movement) window.scrollBy({ top: movement, behavior: "instant" });
      });
    };
    document.addEventListener("focusin", revealFocus);
    window.visualViewport?.addEventListener("resize", revealFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", revealFocus);
      window.visualViewport?.removeEventListener("resize", revealFocus);
    };
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document
      .querySelector<HTMLElement>("main h1")
      ?.focus({ preventScroll: true });
    setError("");
  }, [route]);
  useEffect(() => {
    document.documentElement.dataset.anchorTheme = state.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", state.theme === "dark" ? "#171614" : "#f6f3ec");
  }, [state.theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const refresh = () => {
      const loaded = loadState();
      setState(loaded.state);
      setBlocked(loaded.blocked);
      setWarning(loaded.warning);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) refresh();
      if (event.key === DRAFT_STORAGE_KEY) {
        setDrafts(loadDrafts());
        setDraftWarning(draftStorageWarning());
      }
    };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    const change = () => setWorkerControlled(hasAnchorWorker());
    navigator.serviceWorker?.addEventListener("controllerchange", change);
    change();
    return () =>
      navigator.serviceWorker?.removeEventListener("controllerchange", change);
  }, []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (hasUnpersistedDrafts() || draftError) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [draftError]);
  useEffect(() => {
    const status = (event: Event) => {
      setDrafts(loadDrafts());
      setDraftWarning(draftStorageWarning());
      const detail = (event as CustomEvent).detail;
      setDraftError(
        hasUnpersistedDrafts()
          ? detail?.message ||
              "Een concept is nog niet op dit apparaat opgeslagen. Houd dit tabblad open."
          : "",
      );
    };
    window.addEventListener("anchor-draft-status", status);
    return () => window.removeEventListener("anchor-draft-status", status);
  }, []);
  const save: Save = (next, message) => {
    if (!writer || blocked) {
      setError(
        blocked
          ? "Je opslag is geblokkeerd. Herstel eerst een geldige Anchor-back-up via Instellingen."
          : "Anchor is al geopend in een ander tabblad. Sluit dat tabblad en herlaad dit venster om te bewerken.",
      );
      return false;
    }
    const result = saveState(next);
    if (!result.ok || !result.state) {
      setError(
        result.message || "Opslaan is niet gelukt. Je invoer blijft staan.",
      );
      return false;
    }
    setState(result.state);
    setError("");
    setToast(message);
    return true;
  };
  function cacheDraft(key: string, value: unknown | null) {
    if (!writer || blocked) return;
    setDrafts((previous) => {
      const next = { ...previous };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
    const result = saveDraft(key, value);
    setDraftError(
      hasUnpersistedDrafts()
        ? result.message ||
            "Een concept kon niet worden bewaard. Houd dit tabblad open."
        : "",
    );
  }
  function download(text: string, name: string) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const backup = () => {
    try {
      download(exportBackup(state), `Anchor-back-up-${today()}.json`);
      setToast(
        "De Anchor-back-up is aangeboden als download. Bewaar dit bestand op een veilige plek.",
      );
    } catch {
      setError(
        "De back-up kon niet worden gemaakt. Je gegevens zijn niet gewijzigd.",
      );
    }
  };
  const nav = [
    { path: "/today", label: "Vandaag", icon: Sun },
    { path: "/history", label: "Terugkijken", icon: History },
    { path: "/tools", label: "Hulpmiddelen", icon: Compass },
    { path: "/plan", label: "Mijn plan", icon: BookOpen },
  ];
  const domain =
    path.startsWith("/moment") ||
    path.startsWith("/day") ||
    path.startsWith("/craving")
      ? "/today"
      : path === "/exercise" || path === "/help"
        ? "/tools"
        : path;
  const navigation = (mobile: boolean) => (
    <nav aria-label={mobile ? "Hoofdnavigatie mobiel" : "Hoofdnavigatie"}>
      {nav.map((item) => (
        <a
          key={item.path}
          href={`#${item.path}`}
          aria-current={domain === item.path ? "page" : undefined}
        >
          <item.icon size={21} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
  const momentId = path.startsWith("/moment/") ? path.split("/")[2] : null;
  const moment = state.moments.find((item) => item.id === momentId);
  const cravingId = path.startsWith("/craving/") ? path.split("/")[2] : null;
  const craving = state.cravings.find((item) => item.id === cravingId);
  const dayDate = path.startsWith("/day/") ? path.split("/")[2] : null;
  return (
    <div className="dp" data-theme={state.theme}>
      <a
        className="dp-skip"
        href="#anchor-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("anchor-main")?.focus();
        }}
      >
        Naar de inhoud
      </a>
      <aside className="dp-rail">
        <a className="dp-brand" href="#/today">
          <span className="dp-brand-mark">
            <Anchor size={25} />
          </span>
          <span>
            Anchor<small>Jouw dag. Jouw woorden.</small>
          </span>
        </a>
        {navigation(false)}
        <div className="dp-rail-extra">
          <a href="#/growth">
            <Leaf size={19} />
            Mijn groei
          </a>
          <a href="#/settings">
            <Settings size={19} />
            Instellingen
          </a>
        </div>
        <div className="dp-rail-note">
          <span className="dp-tiny-orbit" aria-hidden="true" />
          <p>
            Ruimte voor hoe
            <br />
            het vandaag gaat.
          </p>
          <small>Jouw tempo. Jouw woorden.</small>
        </div>
        <button className="dp-help-rail" onClick={() => navigate("/help")}>
          <Heart size={19} />
          Mijn houvast
          <ArrowRight size={17} />
        </button>
        <p className="dp-rail-caption">
          <ShieldCheck size={14} />
          Op dit apparaat opgeslagen
        </p>
      </aside>
      <div className="dp-workspace">
        <header className="dp-topbar">
          <a className="dp-brand dp-mobile-brand" href="#/today">
            <Anchor size={24} />
            Anchor
          </a>
          <span className="dp-top-context">Een moment voor jezelf</span>
          <div className="dp-top-actions">
            <button
              className="dp-text-button"
              onClick={() => navigate("/help")}
            >
              <Heart size={17} />
              Houvast
            </button>
            <Button
              disabled={!writer || blocked}
              className="dp-icon-button"
              aria-label={
                state.theme === "dark" ? "Licht thema" : "Donker thema"
              }
              onClick={() =>
                save(
                  {
                    ...state,
                    theme: state.theme === "dark" ? "light" : "dark",
                  },
                  "Thema aangepast.",
                )
              }
            >
              {state.theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </Button>
            <Button
              className="dp-mobile-menu dp-icon-button"
              aria-label="Meer opties"
              onClick={() => setModal("menu")}
            >
              <Menu size={21} />
            </Button>
          </div>
        </header>
        <main id="anchor-main" tabIndex={-1} key={generation}>
          {!online && (
            <div className="dp-notice" role="status">
              Je bent offline. Opgeslagen gegevens en deze app blijven op dit
              apparaat beschikbaar.
            </div>
          )}
          {lockChecked && !writer && (
            <div className="dp-notice" role="status">
              Alleen lezen. Sluit andere Anchor-tabbladen en herlaad om te
              bewerken.
              {!navigator.locks &&
                " Gebruik een browser die veilige toegang tot lokale opslag ondersteunt."}
              <Button onClick={() => location.reload()}>
                Opnieuw proberen
              </Button>
            </div>
          )}
          {!lockChecked && <p role="status">Je gegevens worden geopend…</p>}
          {pwaWarning && (
            <div className="dp-notice" role="status">
              {pwaWarning}
            </div>
          )}
          {warning && (
            <div className="dp-error" role="alert">
              {warning}
              {blocked && (
                <Button
                  onClick={() => {
                    setModal("import");
                    setImported(null);
                    setImportError("");
                    setRecoveryBackup(false);
                  }}
                >
                  Back-up herstellen
                </Button>
              )}
            </div>
          )}
          {draftWarning && (
            <div className="dp-error" role="alert">
              {draftWarning}
              <Button
                onClick={() => {
                  try {
                    setDraftRecoveryRaw(
                      localStorage.getItem(DRAFT_STORAGE_KEY),
                    );
                    setDraftRecoveryDownloaded(false);
                    setModal("draft-recovery");
                  } catch {
                    setError("De conceptopslag is niet toegankelijk.");
                  }
                }}
              >
                Conceptopslag herstellen
              </Button>
            </div>
          )}
          {draftError && (
            <div className="dp-error" role="alert">
              {draftError}
              <Button
                onClick={() => {
                  try {
                    download(
                      exportDraftRecovery(),
                      `Anchor-concepten-herstel-${today()}.json`,
                    );
                  } catch {
                    setError(
                      "Het herstelbestand kon niet worden gemaakt. Houd dit tabblad open; je invoer staat er nog.",
                    );
                  }
                }}
              >
                Niet-opgeslagen tekst downloaden
              </Button>
            </div>
          )}
          {error && (
            <div className="dp-error" role="alert">
              {error}
            </div>
          )}
          {needRefresh && (
            <div className="dp-notice" role="status">
              Een nieuwe versie van Anchor staat klaar. Sla je open formulieren
              eerst op.
              <Button
                disabled={!writer}
                onClick={() => {
                  if (
                    Object.keys(loadDrafts()).length ||
                    Object.keys(drafts).length ||
                    hasUnpersistedDrafts() ||
                    draftError
                  ) {
                    setError(
                      "Bewaar of annuleer eerst je open concepten voordat je bijwerkt.",
                    );
                    return;
                  }
                  void updateServiceWorker(true);
                }}
              >
                Bijwerken
              </Button>
            </div>
          )}
          <fieldset
            className="anchor-content"
            disabled={
              (!writer || blocked) &&
              Boolean(
                momentId ||
                cravingId ||
                dayDate ||
                ["/plan", "/growth"].includes(path),
              )
            }
          >
            {path === "/today" && <Today state={state} navigate={navigate} />}
            {path === "/history" && (
              <>
                <PageTitle
                  kicker="Jouw aantekeningen"
                  title="Terugkijken"
                  description="Momenten naast elkaar. Zonder oordeel."
                />
                <HistoryView
                  state={state}
                  onOpenMoment={(id) => navigate(`/moment/${id}`)}
                  onOpenCraving={(id) => navigate(`/craving/${id}`)}
                  onOpenDay={(date) => navigate(`/day/${date}`)}
                />
              </>
            )}
            {path === "/plan" && (
              <>
                <PageTitle
                  kicker="Houvast op jouw manier"
                  title="Mijn plan"
                  description="Wat je wilt, wat je helpt en wie er voor je is."
                />
                <PlanView state={state} onSave={save} />
              </>
            )}
            {path === "/growth" && (
              <>
                <PageTitle
                  kicker="Ook dit hoort bij je dag"
                  title="Mijn groei"
                  description="Een fijn moment hoeft geen prestatie te zijn."
                />
                <GrowthView state={state} onSave={save} />
              </>
            )}
            {path === "/settings" && (
              <>
                <PageTitle kicker="Maak het van jou" title="Instellingen" />
                <SettingsView
                  state={state}
                  readOnly={!writer}
                  blocked={blocked}
                  onSave={save}
                  onExport={backup}
                  onImport={() => {
                    setModal("import");
                    setImported(null);
                    setImportError("");
                    setRecoveryBackup(false);
                  }}
                  onPrivacy={() => setModal("privacy")}
                />
                <p className="dp-muted">
                  {offlineReady || workerControlled
                    ? "Anchor is beschikbaar voor offline gebruik."
                    : "Offlinebestanden worden voorbereid na het openen van de app."}{" "}
                  Versie {__APP_VERSION__}.
                </p>
                <p className="dp-hint">
                  Installeren: kies in je browser ‘App installeren’ of op
                  iPhone/iPad ‘Deel → Zet op beginscherm’.
                </p>
              </>
            )}
            {path === "/tools" && <Tools navigate={navigate} />}
            {path === "/help" && <Support state={state} navigate={navigate} />}
            {path === "/exercise" && (
              <ExerciseView
                moment={state.moments.find(
                  (m) =>
                    m.id ===
                    new URLSearchParams(route.split("?")[1]).get("moment"),
                )}
                onBack={(id) =>
                  navigate(id ? `/moment/${id}?after=1` : "/tools")
                }
              />
            )}
            {momentId &&
              (momentId === "new" || moment ? (
                <MomentView
                  key={momentId}
                  record={moment}
                  state={state}
                  onSave={save}
                  navigate={navigate}
                  draft={drafts[`moment:${momentId}`] as Moment | undefined}
                  onDraft={(value) => cacheDraft(`moment:${momentId}`, value)}
                  onClear={() => cacheDraft(`moment:${momentId}`, null)}
                  afterInitially={route.includes("after=1")}
                />
              ) : (
                <Missing navigate={navigate} />
              ))}
            {cravingId &&
              (cravingId === "new" || craving ? (
                <CravingView
                  key={cravingId}
                  record={craving}
                  state={state}
                  onSave={save}
                  navigate={navigate}
                  draft={
                    drafts[`craving:${cravingId}`] as CravingRecord | undefined
                  }
                  onDraft={(value) => cacheDraft(`craving:${cravingId}`, value)}
                  onClear={() => cacheDraft(`craving:${cravingId}`, null)}
                />
              ) : (
                <Missing navigate={navigate} />
              ))}
            {dayDate && (
              <DayView
                key={dayDate}
                date={dayDate}
                state={state}
                onSave={save}
                navigate={navigate}
                draft={drafts[`day:${dayDate}`] as Day | undefined}
                onDraft={(value) => cacheDraft(`day:${dayDate}`, value)}
                onClear={() => cacheDraft(`day:${dayDate}`, null)}
              />
            )}
            {!nav.some((item) => item.path === path) &&
              !["/growth", "/settings", "/help", "/exercise"].includes(path) &&
              !momentId &&
              !cravingId &&
              !dayDate && <Missing navigate={navigate} />}
          </fieldset>
          <footer className="dp-page-footer">
            <ShieldCheck size={15} />
            <span>
              Jouw gegevens blijven in deze browser. Maak regelmatig een
              back-up.
            </span>
            <button onClick={() => setModal("privacy")}>
              Over je gegevens
            </button>
            {Object.keys(drafts).length > 0 && (
              <button
                onClick={() => {
                  setDiscardKey(null);
                  setModal("drafts");
                }}
              >
                Open concepten ({Object.keys(drafts).length})
              </button>
            )}
          </footer>
        </main>
      </div>
      <div className="dp-bottom-nav">{navigation(true)}</div>
      {toast && (
        <div className="dp-toast" role="status">
          <CheckCheck size={20} />
          {toast}
        </div>
      )}
      {modal === "menu" && (
        <Dialog title="Meer in Anchor" onClose={() => setModal(null)}>
          <div className="dp-menu-links">
            <a href="#/growth" onClick={() => setModal(null)}>
              Mijn groei
              <Leaf size={20} />
            </a>
            <a href="#/settings" onClick={() => setModal(null)}>
              Instellingen
              <Settings size={20} />
            </a>
          </div>
        </Dialog>
      )}
      {modal === "drafts" && (
        <Dialog title="Open concepten" onClose={() => setModal(null)}>
          <p>
            Concepten zijn onafgemaakte formulieren. Je kunt verder schrijven of
            een concept verwijderen. Opgeslagen registraties blijven behouden.
          </p>
          {Object.keys(drafts).map((key) => {
            const type = key.split(":")[0];
            const id = key.includes(":") ? key.slice(type.length + 1) : "";
            const route =
              type === "moment"
                ? "/moment/" + id
                : type === "craving"
                  ? "/craving/" + id
                  : type === "day"
                    ? "/day/" + id
                    : type === "growth"
                      ? "/growth"
                      : "/plan";
            const title =
              type === "moment"
                ? "Check-in"
                : type === "craving"
                  ? "Craving"
                  : type === "day"
                    ? "Dagoverzicht"
                    : type === "goal"
                      ? "Doel"
                      : type === "growth"
                        ? "Fijn moment"
                        : "Mijn plan";
            return (
              <div className="anchor-draft-row" key={key}>
                <strong>
                  {title}
                  {id && id !== "new" && type === "day" ? " · " + id : ""}
                </strong>
                {discardKey === key ? (
                  <>
                    <p>
                      Dit concept verwijderen? De invoer in dit onafgemaakte
                      formulier vervalt.
                    </p>
                    <Button onClick={() => setDiscardKey(null)}>
                      Behouden
                    </Button>
                    <Button
                      disabled={!writer}
                      onClick={() => {
                        const result = saveDraft(key, null);
                        if (result.ok) {
                          setDrafts(loadDrafts());
                          setGeneration((value) => value + 1);
                          setDiscardKey(null);
                        } else
                          setDraftError(
                            result.message || "Verwijderen is niet gelukt.",
                          );
                      }}
                    >
                      Concept verwijderen bevestigen
                    </Button>
                  </>
                ) : (
                  <div className="dp-actions">
                    <Button onClick={() => navigate(route)}>
                      Verder schrijven
                    </Button>
                    <Button
                      disabled={!writer}
                      onClick={() => setDiscardKey(key)}
                    >
                      Concept verwijderen
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {!Object.keys(drafts).length && <p>Je hebt geen open concepten.</p>}
        </Dialog>
      )}
      {modal === "draft-recovery" && (
        <Dialog title="Conceptopslag herstellen" onClose={() => setModal(null)}>
          <p>
            De opgeslagen concepten kunnen niet veilig worden gelezen. Download
            eerst het herstelbestand. Dit bevat de oorspronkelijke opslag en
            eventuele nieuwe concepttekst uit dit tabblad.
          </p>
          <p>
            Na bevestiging worden uitsluitend alle open Anchor-concepten
            verwijderd. Je opgeslagen registraties, doelen en instellingen
            blijven behouden. Het herstelbestand is leesbare tekst voor
            handmatig herstel; het is geen gewone gegevensback-up.
          </p>
          <Button
            onClick={() => {
              try {
                download(
                  exportDraftRecovery(),
                  "Anchor-concepten-herstel-" + today() + ".json",
                );
                setDraftRecoveryDownloaded(true);
              } catch {
                setDraftError(
                  "Het herstelbestand kon niet worden gemaakt. Er is niets gewist.",
                );
              }
            }}
          >
            Herstelbestand downloaden
          </Button>
          <div className="dp-actions">
            <Button onClick={() => setModal(null)}>Annuleren</Button>
            <Button
              disabled={!writer || !draftRecoveryDownloaded}
              onClick={() => {
                const result = clearDraftStorage(draftRecoveryRaw);
                if (result.ok) {
                  setDrafts({});
                  setDraftWarning(null);
                  setDraftError("");
                  setGeneration((value) => value + 1);
                  setModal(null);
                  setToast(
                    "De conceptopslag is hersteld. Je opgeslagen registraties zijn behouden.",
                  );
                } else
                  setDraftError(result.message || "Herstellen is niet gelukt.");
              }}
            >
              Alleen concepten wissen
            </Button>
          </div>
        </Dialog>
      )}
      {modal === "privacy" && (
        <Dialog title="Over je gegevens" onClose={() => setModal(null)}>
          <p>
            Anchor slaat je registraties en concepten lokaal in deze browser op.
            Er is geen account, synchronisatie, tracker of automatische
            overdracht naar een server.
          </p>
          <p>
            Je browseropslag is niet versleuteld door Anchor. Iemand met toegang
            tot je apparaat of browserprofiel kan bij je gegevens. Gebruik de
            schermvergrendeling van je apparaat.
          </p>
          <p>
            Het wissen van browsergegevens, privé browsen of een andere browser
            kan betekenen dat je gegevens niet beschikbaar zijn. Bewaar een
            eigen back-up. Een gewone app-update wist je registraties niet.
          </p>
          <p>
            Back-ups bevatten persoonlijke gegevens als leesbare tekst. Bewaar
            ze op een plek die je vertrouwt. Anchor opent of importeert nooit
            automatisch gegevens van Substance Recovery.
          </p>
          <Button onClick={() => setModal(null)}>Begrepen</Button>
        </Dialog>
      )}
      {modal === "import" && (
        <Dialog
          title="Anchor-back-up herstellen"
          onClose={() => {
            importSequence.current++;
            setModal(null);
          }}
        >
          <p>
            Kies een back-up die met Anchor is gemaakt. Na bevestiging vervangt
            deze de opgeslagen Anchor-gegevens op dit apparaat.
          </p>
          <label className="dp-field">
            Back-upbestand
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (event) => {
                const selection = ++importSequence.current;
                setImported(null);
                setImportError("");
                setRecoveryBackup(false);
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 8_000_000)
                    throw new Error("Dit bestand is te groot.");
                  const candidate = parseBackup(await file.text());
                  if (selection === importSequence.current)
                    setImported(candidate);
                } catch (problem) {
                  if (selection === importSequence.current)
                    setImportError(
                      problem instanceof Error
                        ? problem.message
                        : "Deze back-up is niet geldig.",
                    );
                }
              }}
            />
          </label>
          {importError && (
            <p className="dp-error" role="alert">
              {importError}
            </p>
          )}
          {imported && (
            <>
              <p>
                {imported.cravings.length} cravingregistraties ·{" "}
                {imported.moments.length} check-ins · {imported.days.length}{" "}
                dagoverzichten · {imported.growth.length} fijne momenten ·{" "}
                {imported.goals.length} doelen.
              </p>
              <p>
                Bewaar eerst een kopie van de huidige opslag. Open concepten
                moeten eerst opgeslagen of geannuleerd worden.
              </p>
              <Button
                onClick={() => {
                  try {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    download(
                      blocked && raw !== null
                        ? raw
                        : exportBackup(
                            raw === null
                              ? state
                              : validateState(JSON.parse(raw)),
                          ),
                      `Anchor-opslag-voor-herstel-${today()}.json`,
                    );
                    recoverySnapshot.current = raw;
                    setRecoveryBackup(true);
                  } catch {
                    setImportError(
                      "De huidige opslag kon niet worden gekopieerd. Er wordt niets vervangen.",
                    );
                  }
                }}
              >
                Huidige opslag downloaden
              </Button>
              <div className="dp-actions">
                <Button onClick={() => setModal(null)}>Annuleren</Button>
                <Button
                  primary
                  disabled={!writer || !recoveryBackup}
                  onClick={() => {
                    if (
                      Object.keys(loadDrafts()).length ||
                      Object.keys(drafts).length ||
                      hasUnpersistedDrafts() ||
                      draftError
                    ) {
                      setImportError(
                        "Sla open concepten eerst op of annuleer ze. Je gegevens zijn niet vervangen.",
                      );
                      return;
                    }
                    const result = replaceFromBackup(
                      imported,
                      state.revision,
                      recoverySnapshot.current,
                    );
                    if (result.ok && result.state) {
                      setState(result.state);
                      setBlocked(false);
                      setWarning(null);
                      setDrafts({});
                      setGeneration((value) => value + 1);
                      setModal(null);
                      setToast("Je Anchor-back-up is hersteld.");
                      navigate("/today");
                    } else
                      setImportError(
                        result.message || "Herstellen is niet gelukt.",
                      );
                  }}
                >
                  Gegevens vervangen
                </Button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
function Today({
  state,
  navigate,
}: {
  state: AppState;
  navigate: (path: string) => void;
}) {
  const current = [
    ...state.moments
      .filter((m) => m.date === today())
      .map((item) => ({ type: "moment" as const, item })),
    ...state.cravings
      .filter((m) => m.date === today())
      .map((item) => ({ type: "craving" as const, item })),
  ].sort((a, b) => b.item.time.localeCompare(a.item.time));
  const day = state.days.find((item) => item.date === today());
  const favorite = state.growth.find((item) => item.favorite);
  return (
    <>
      <PageTitle
        kicker={dateText(today(), true)}
        title="Vandaag, op jouw tempo."
      />
      <section className="dp-now-panel">
        <div>
          <p className="dp-kicker">Even bij jezelf inchecken</p>
          <h2>Hoe gaat het nu?</h2>
          <p>
            Een paar woorden of een score is genoeg.
            <br />
            Je kunt later altijd weer inchecken.
          </p>
          <div className="dp-actions">
            <Button primary onClick={() => navigate("/moment/new")}>
              <Plus size={20} />
              Check-in toevoegen
              <ArrowRight size={18} />
            </Button>
            <Button onClick={() => navigate("/craving/new")}>
              Craving vastleggen
            </Button>
          </div>
        </div>
        <div className="dp-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
          <Anchor size={32} />
        </div>
      </section>
      <div className="dp-today-grid">
        <section>
          <div className="dp-section-head">
            <div>
              <p className="dp-kicker">Kleine momentopnamen</p>
              <h2>Jouw dag tot nu toe</h2>
            </div>
            <span className="dp-count">{current.length}</span>
          </div>
          {current.length ? (
            <ol className="dp-timeline">
              {current.map(({ type, item }) => (
                <li key={`${type}:${item.id}`}>
                  <time>{item.time}</time>
                  <button
                    className="dp-moment-row"
                    onClick={() =>
                      navigate(
                        `/${type === "craving" ? "craving" : "moment"}/${item.id}`,
                      )
                    }
                  >
                    <span className="dp-row-title">
                      {type === "craving"
                        ? "Craving"
                        : (item as Moment).activity || "Check-in"}
                      <ChevronRight size={18} />
                    </span>
                    {type === "craving" ? (
                      <>
                        <p className="dp-row-note">
                          {(item as CravingRecord).situation ||
                            (item as CravingRecord).thought ||
                            (item as CravingRecord).emotion ||
                            "Situatie vastgelegd"}
                        </p>
                        {(item as CravingRecord).behavior && (
                          <p className="dp-hint">
                            Gedrag: {(item as CravingRecord).behavior}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <RatingLine value={(item as Moment).before} />
                        {(item as Moment).after && (
                          <p className="dp-after-label">
                            <Check size={14} />
                            Nameting opgeslagen
                          </p>
                        )}
                        {item.note && (
                          <p className="dp-row-note">{item.note}</p>
                        )}
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="dp-empty">
              <h3>Je dag mag hier beginnen.</h3>
              <p>
                Leg een moment vast wanneer dat voor jou helpt. Er hoeft nog
                niets te staan.
              </p>
            </div>
          )}
          <button
            className="dp-text-button dp-section-link"
            onClick={() => navigate("/history")}
          >
            Alle momenten terugkijken
            <ArrowRight size={17} />
          </button>
        </section>
        <aside className="dp-day-aside">
          <section className="dp-reflection">
            <span className="dp-round-icon">
              <Moon size={22} />
            </span>
            <p className="dp-kicker">Wanneer je dag rond is</p>
            <h2>Mijn hele dag</h2>
            <p>
              Hoe was de dag als geheel? Sta stil bij je stemming en je slaap.
            </p>
            {day && (
              <p className="dp-summary-snippet">
                <Check size={16} />
                Dagoverzicht opgeslagen
              </p>
            )}
            <Button onClick={() => navigate(`/day/${today()}`)}>
              Mijn hele dag
              <ArrowRight size={17} />
            </Button>
            <small>Een aparte terugblik, naast je losse momenten.</small>
          </section>
          {state.homeShowGrowth && (
            <section className="dp-growth-peek">
              <Leaf size={22} />
              <h3>Ook de kleine dingen</h3>
              <p>
                {favorite?.text ||
                  "Een fijn moment, iets wat je koos, of iets dat je wilt onthouden."}
              </p>
              <button
                className="dp-text-button"
                onClick={() => navigate("/growth")}
              >
                Mijn groei
                <ArrowRight size={16} />
              </button>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
function Tools({ navigate }: { navigate: (path: string) => void }) {
  return (
    <>
      <PageTitle
        kicker="Een beetje ruimte"
        title="Wat helpt je nu?"
        description="Kies iets dat bij dit moment past. Stoppen of overslaan mag."
      />
      <div className="dp-tools-layout">
        <button
          className="dp-featured-tool"
          onClick={() => navigate("/exercise")}
        >
          <span className="dp-round-icon">
            <Compass size={27} />
          </span>
          <div>
            <p className="dp-kicker">Aandacht voor je omgeving</p>
            <h2>5-4-3-2-1</h2>
            <p>Sta even stil bij wat je om je heen opmerkt.</p>
            <span className="dp-tool-cta">
              Oefening openen
              <ArrowRight size={19} />
            </span>
          </div>
        </button>
        <section className="dp-plain-section">
          <h2>Ook in je eigen leven</h2>
          <p>
            Een wandeling, schilderen of iemand spreken. Koppel een eigen
            activiteit aan een check-in en leg later vast hoe het gaat.
          </p>
          <Button onClick={() => navigate("/moment/new")}>
            Activiteit bij een check-in
            <ArrowRight size={17} />
          </Button>
        </section>
      </div>
      <section className="dp-help-inset">
        <Heart size={22} />
        <div>
          <h3>Je eigen houvast</h3>
          <p>Lees wat je jezelf wilt meegeven wanneer het lastig wordt.</p>
        </div>
        <Button onClick={() => navigate("/help")}>Mijn houvast</Button>
      </section>
    </>
  );
}
function Support({
  state,
  navigate,
}: {
  state: AppState;
  navigate: (path: string) => void;
}) {
  return (
    <div className="dp-help-page">
      <PageTitle kicker="Ondersteuning dichtbij" title="Mijn houvast" />
      <section className="dp-help-choices">
        <div>
          <p className="dp-kicker">Een kleine stap</p>
          <h2>Wat ik kan doen</h2>
          <p className="anchor-prose">
            {state.plan.action ||
              "Je eigen actie verschijnt hier zodra je die invult in Mijn plan."}
          </p>
          <Button onClick={() => navigate("/plan")}>Mijn plan openen</Button>
        </div>
        <div>
          <p className="dp-kicker">Iemand dichtbij</p>
          <h2>Waar ik steun vind</h2>
          <p className="anchor-prose">
            {state.plan.support ||
              "Schrijf in Mijn plan op wie of wat jou kan steunen."}
          </p>
        </div>
      </section>
      <section className="dp-plain-section">
        <h2>Aandacht voor je omgeving</h2>
        <Button onClick={() => navigate("/exercise")}>5-4-3-2-1 openen</Button>
      </section>
      <p className="dp-muted">
        Anchor is een persoonlijk dagboek. Bij direct gevaar kun je{" "}
        <a className="dp-text-button" href="tel:112">
          112 bellen
        </a>
        .
      </p>
    </div>
  );
}
function Missing({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="dp-empty">
      <h1 tabIndex={-1}>Dit moment is er niet.</h1>
      <p>Misschien is het verwijderd of heb je een andere back-up hersteld.</p>
      <Button onClick={() => navigate("/history")}>
        Terug naar het overzicht
      </Button>
    </div>
  );
}

function MomentView({
  record,
  state,
  onSave,
  navigate,
  onDraft,
  draft,
  onClear,
  afterInitially,
}: {
  record?: Moment;
  state: AppState;
  onSave: Save;
  navigate: (path: string) => void;
  onDraft: (value: Moment) => void;
  draft?: Moment;
  onClear: () => void;
  afterInitially: boolean;
}) {
  const [value, setValue] = useState<Moment>(
    () => draft ?? record ?? emptyMoment(),
  );
  const knownEmotions = [
    "Onrustig",
    "Verdrietig",
    "Boos",
    "Blij",
    "Hoopvol",
    "Moe",
  ];
  const otherEmotion = value.emotions
    .filter((item) => !knownEmotions.includes(item))
    .join(", ");
  const [customActivity, setCustomActivity] = useState(
    () =>
      !["", "Buiten wandelen", "Schilderen", "5-4-3-2-1"].includes(
        value.activity,
      ),
  );
  const [afterOpen, setAfterOpen] = useState(
    afterInitially ||
      !!record?.after ||
      !!draft?.after ||
      draft?.attempted != null,
  );
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  function update(patch: Partial<Moment>) {
    const next = { ...value, ...patch };
    setValue(next);
    onDraft(next);
  }
  function submit(event: React.FormEvent, followup: boolean) {
    event.preventDefault();
    setError("");
    if (
      !hasRating(value.before) &&
      !value.note.trim() &&
      !value.activity.trim() &&
      !value.emotions.length
    ) {
      setError("Vul een score, een notitie of een activiteit in.");
      return;
    }
    if (customActivity && !value.activity.trim()) {
      setError("Geef je activiteit een naam of kies Alleen deze check-in.");
      return;
    }
    if (
      !followup &&
      (JSON.stringify(value.after) !== JSON.stringify(record?.after ?? null) ||
        value.attempted !== (record?.attempted ?? null))
    ) {
      setError(
        "Je hebt je nameting aangepast. Gebruik Nameting opslaan om deze samen met je moment te bewaren.",
      );
      return;
    }
    if (followup && value.attempted === null) {
      setError(
        "Geef aan of je de activiteit hebt geprobeerd. Nee is ook een antwoord.",
      );
      return;
    }
    if (followup && !value.activity.trim()) {
      setError("Kies eerst een activiteit.");
      return;
    }
    const saved: Moment = {
      ...value,
      note: value.note.trim(),
      emotions: [
        ...new Set(value.emotions.map((item) => item.trim()).filter(Boolean)),
      ],
      ...(followup
        ? {
            after: value.after ?? blankRatings(),
            afterTime: record?.afterTime ?? clockTime(),
            afterDate: record?.afterDate ?? today(),
          }
        : {}),
    };
    if (
      onSave(
        {
          ...state,
          moments: [
            ...state.moments.filter((item) => item.id !== saved.id),
            saved,
          ],
        },
        followup
          ? "Je nameting is opgeslagen op dit apparaat."
          : "Dit moment is opgeslagen op dit apparaat.",
      )
    ) {
      setValue(saved);
      onClear();
      navigate(`/moment/${saved.id}`);
    }
  }
  return (
    <div className="dp-form-page">
      <button
        className="dp-text-button dp-back"
        onClick={() => navigate("/today")}
      >
        <ArrowLeft size={17} />
        Mijn dag
      </button>
      <PageTitle
        kicker={
          record ? `${dateText(value.date)} · ${value.time}` : "Momentopname"
        }
        title={record ? "Jouw check-in" : "Hoe gaat het nu?"}
        description={
          record
            ? "Je kunt dit moment aanvullen. Je dagoverzicht blijft apart."
            : "Vul alleen in wat je wilt vastleggen."
        }
      />
      {record && (
        <div className="dp-saved-strip">
          <CheckCheck size={19} />
          Opgeslagen moment
          <Button className="quiet" onClick={() => navigate("/moment/new")}>
            <Plus size={17} />
            Nog een check-in
          </Button>
        </div>
      )}
      <form onSubmit={(event) => submit(event, false)}>
        <section className="dp-form-section">
          <div className="dp-section-head">
            <h2>{record?.activity ? "Voor je activiteit" : "Dit moment"}</h2>
            <span className="dp-tag">{value.time}</span>
          </div>

          <RatingsEditor
            value={value.before}
            onChange={(before) => update({ before })}
          />
          <details className="dp-extra-fields">
            <summary>Emoties en context toevoegen</summary>
            <fieldset>
              <legend>Welke emoties herken je?</legend>
              <div className="dp-chip-list">
                {[
                  "Onrustig",
                  "Verdrietig",
                  "Boos",
                  "Blij",
                  "Hoopvol",
                  "Moe",
                ].map((emotion) => (
                  <button
                    type="button"
                    key={emotion}
                    aria-pressed={value.emotions.includes(emotion)}
                    onClick={() =>
                      update({
                        emotions: value.emotions.includes(emotion)
                          ? value.emotions.filter((item) => item !== emotion)
                          : [...value.emotions, emotion],
                      })
                    }
                  >
                    {emotion}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="dp-field">
              Andere emotie
              <input
                value={otherEmotion}
                maxLength={100}
                onChange={(e) =>
                  update({
                    emotions: [
                      ...value.emotions.filter((item) =>
                        knownEmotions.includes(item),
                      ),
                      ...(e.target.value ? [e.target.value] : []),
                    ],
                  })
                }
              />
            </label>
          </details>
          <label className="dp-field">
            In je eigen woorden
            <span className="dp-hint">
              Optioneel. Een paar woorden mag ook.
            </span>
            <textarea
              rows={3}
              maxLength={4000}
              value={value.note}
              onChange={(e) => update({ note: e.target.value })}
            />
          </label>
        </section>
        <section className="dp-form-section dp-activity-section">
          <span className="dp-kicker">Optioneel</span>
          <h2>Wat zou je willen proberen?</h2>
          <p>Een activiteit uit je eigen leven telt net zo goed mee.</p>
          <label className="dp-field">
            Activiteit
            <select
              disabled={!!record?.after}
              value={customActivity ? "custom" : value.activity}
              onChange={(e) => {
                setCustomActivity(e.target.value === "custom");
                update({
                  activity: e.target.value === "custom" ? "" : e.target.value,
                });
              }}
            >
              <option value="">Alleen deze check-in</option>
              <option>Buiten wandelen</option>
              <option>Schilderen</option>
              <option>5-4-3-2-1</option>
              <option value="custom">Eigen activiteit</option>
            </select>
          </label>
          {customActivity && (
            <label className="dp-field">
              Naam van de activiteit
              <input
                disabled={!!record?.after}
                maxLength={200}
                value={value.activity}
                onChange={(e) => update({ activity: e.target.value })}
              />
            </label>
          )}
          {record?.after && (
            <p className="dp-hint">
              Deze activiteit hoort bij de opgeslagen nameting. Maak voor een
              andere activiteit een nieuwe check-in.
            </p>
          )}
          {record && value.activity === "5-4-3-2-1" && (
            <Button
              onClick={() => {
                if (JSON.stringify(value) !== JSON.stringify(record)) {
                  setError(
                    "Sla je moment eerst op voordat je de oefening opent.",
                  );
                  return;
                }
                navigate(`/exercise?moment=${record.id}`);
              }}
            >
              <Compass size={19} />
              Open de oefening
            </Button>
          )}
          {record && record.activity && (
            <Button className="quiet" onClick={() => setAfterOpen(true)}>
              Nameting invullen
              <ArrowRight size={17} />
            </Button>
          )}
        </section>
        {error && (
          <p className="dp-error" role="alert">
            {error}
          </p>
        )}
        <div className="dp-form-actions">
          <Button type="submit" primary>
            <Check size={18} />
            Dit moment opslaan
          </Button>
          <span>Op dit apparaat</span>
        </div>
      </form>
      {record?.activity && afterOpen && (
        <form
          className="dp-after-form"
          onSubmit={(event) => submit(event, true)}
        >
          <p className="dp-kicker">Nameting · {record.activity}</p>
          <h2>{record.after ? "Je nameting" : "Hoe is het nu?"}</h2>
          {record.afterDate && record.afterTime && (
            <p className="dp-hint">
              Vastgelegd op {dateText(record.afterDate, true)} om{" "}
              {record.afterTime}. Aanpassen behoudt dit tijdstip.
            </p>
          )}
          <fieldset>
            <legend>Heb je de activiteit geprobeerd?</legend>
            <div className="dp-chip-list">
              {[
                { value: true, label: "Ja" },
                { value: false, label: "Nee" },
              ].map((item) => (
                <button
                  type="button"
                  key={item.label}
                  aria-pressed={value.attempted === item.value}
                  onClick={() => update({ attempted: item.value })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
          <RatingsEditor
            prefix="Na: "
            value={value.after ?? blankRatings()}
            onChange={(after) => update({ after })}
          />
          <p className="dp-hint">
            Een verschil is een observatie. Het zegt niet automatisch waardoor
            je gevoel veranderde.
          </p>
          <Button type="submit" primary>
            Nameting opslaan
            <Check size={18} />
          </Button>
        </form>
      )}
      {record && (
        <div className="dp-delete-area">
          {deleting ? (
            <>
              <p>Dit moment verwijderen?</p>
              <Button onClick={() => setDeleting(false)}>Behouden</Button>
              <Button
                onClick={() => {
                  if (
                    onSave(
                      {
                        ...state,
                        moments: state.moments.filter(
                          (item) => item.id !== record.id,
                        ),
                      },
                      "Moment verwijderd.",
                    )
                  ) {
                    onClear();
                    navigate("/today");
                  }
                }}
              >
                Verwijderen bevestigen
              </Button>
            </>
          ) : (
            <button
              className="dp-text-button"
              onClick={() => setDeleting(true)}
            >
              Moment verwijderen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DayView({
  date,
  state,
  onSave,
  navigate,
  draft,
  onDraft,
  onClear,
}: {
  date: string;
  state: AppState;
  onSave: Save;
  navigate: (route: string) => void;
  draft?: Day;
  onDraft: (day: Day) => void;
  onClear: () => void;
}) {
  const [value, setValue] = useState<Day>(
    () =>
      draft ??
      state.days.find((item) => item.date === date) ?? {
        date,
        ratings: blankRatings(),
        sleepHours: "",
        sleepMinutes: "",
        note: "",
      },
  );
  const [error, setError] = useState("");
  const update = (patch: Partial<Day>) => {
    const next = { ...value, ...patch };
    setValue(next);
    onDraft(next);
  };
  if (!validCalendarDate(date)) return <Missing navigate={navigate} />;
  return (
    <div className="dp-form-page">
      <button
        className="dp-text-button dp-back"
        onClick={() => navigate("/today")}
      >
        <ArrowLeft size={17} />
        Mijn dag
      </button>
      <PageTitle
        kicker={dateText(date, true)}
        title="Mijn hele dag"
        description="Een terugblik op de dag als geheel. Je losse check-ins blijven aparte momenten."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          if (
            !hasRating(value.ratings) &&
            !value.note.trim() &&
            !value.sleepHours &&
            !value.sleepMinutes
          ) {
            setError("Vul iets in om je dagoverzicht op te slaan.");
            return;
          }
          if (value.sleepHours === "24" && Number(value.sleepMinutes) > 0) {
            setError("Een slaapduur kan maximaal 24 uur zijn.");
            return;
          }
          if (
            onSave(
              {
                ...state,
                days: [
                  ...state.days.filter((item) => item.date !== date),
                  value,
                ],
              },
              "Je dagoverzicht is opgeslagen op dit apparaat.",
            )
          ) {
            onClear();
            navigate("/today");
          }
        }}
      >
        <section className="dp-form-section">
          <h2>Hoe voelde deze dag?</h2>
          <RatingsEditor
            value={value.ratings}
            onChange={(ratings) => update({ ratings })}
          />
        </section>
        <section className="dp-form-section">
          <span className="dp-round-icon">
            <Moon size={22} />
          </span>
          <h2>Je slaap</h2>
          <p>
            Hoeveel heb je afgelopen nacht geslapen? Laat leeg als je het niet
            weet.
          </p>
          <div className="dp-form-grid">
            <label className="dp-field">
              Uren slaap
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="24"
                step="1"
                value={value.sleepHours}
                onChange={(e) => update({ sleepHours: e.target.value })}
              />
            </label>
            <label className="dp-field">
              Minuten slaap
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="59"
                step="1"
                value={value.sleepMinutes}
                onChange={(e) => update({ sleepMinutes: e.target.value })}
              />
            </label>
          </div>
        </section>
        <section className="dp-form-section">
          <label className="dp-field">
            Wat wil je onthouden van vandaag?
            <textarea
              rows={4}
              maxLength={4000}
              value={value.note}
              onChange={(e) => update({ note: e.target.value })}
            />
          </label>
        </section>
        {error && (
          <p className="dp-error" role="alert">
            {error}
          </p>
        )}
        <Button primary type="submit">
          Dagoverzicht opslaan
          <Check size={18} />
        </Button>
      </form>
    </div>
  );
}

function ExerciseView({
  moment,
  onBack,
}: {
  moment?: Moment;
  onBack: (id?: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const steps = [
    {
      number: 5,
      sense: "dingen die je ziet",
      prompt: "Kijk rustig om je heen. Wat valt je op?",
    },
    {
      number: 4,
      sense: "dingen die je voelt",
      prompt: "Bijvoorbeeld je voeten op de grond of de stof van je mouw.",
    },
    {
      number: 3,
      sense: "geluiden die je hoort",
      prompt: "Dichtbij of verder weg. Je hoeft niets bijzonders te horen.",
    },
    {
      number: 2,
      sense: "geuren die je opmerkt",
      prompt: "Merk je niets op? Dan kun je deze stap overslaan.",
    },
    {
      number: 1,
      sense: "smaak die je opmerkt",
      prompt: "Ook deze stap is optioneel.",
    },
  ];
  const current = steps[step];
  return (
    <div className="dp-form-page dp-exercise">
      <button
        className="dp-text-button dp-back"
        onClick={() => onBack(moment?.id)}
      >
        <X size={18} />
        Stoppen en terug
      </button>
      <PageTitle
        kicker="Aandacht voor je omgeving"
        title="5-4-3-2-1"
        description="Gebruik wat prettig is. Je mag elke stap overslaan."
      />
      {current ? (
        <>
          <div
            className="dp-exercise-progress"
            aria-label={`Stap ${step + 1} van 5`}
          >
            {steps.map((item, i) => (
              <span key={item.number} className={i <= step ? "active" : ""} />
            ))}
          </div>
          <div className="dp-exercise-number" aria-hidden="true">
            {current.number}
          </div>
          <h2>
            Noem {current.number} {current.sense}
          </h2>
          <p>{current.prompt}</p>
          <label className="dp-field">
            Wat merk je op?{" "}
            <span className="dp-hint">
              Optioneel. Deze oefennotitie wordt niet opgeslagen.
            </span>
            <textarea
              rows={3}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </label>
          <div className="dp-actions">
            <Button
              onClick={() => {
                setStep(step + 1);
                setAnswer("");
              }}
            >
              Stap overslaan
            </Button>
            <Button
              primary
              onClick={() => {
                setStep(step + 1);
                setAnswer("");
              }}
            >
              Volgende stap
              <ArrowRight size={17} />
            </Button>
          </div>
        </>
      ) : (
        <div className="dp-exercise-done">
          <span className="dp-round-icon">
            <Leaf size={27} />
          </span>
          <h2>Neem even de tijd.</h2>
          <p>
            Je hoeft je niet anders te voelen. Als je wilt, kun je nu vastleggen
            hoe het met je gaat.
          </p>
          <Button primary onClick={() => onBack(moment?.id)}>
            {moment ? "Terug naar mijn nameting" : "Terug naar hulpmiddelen"}
            <ArrowRight size={17} />
          </Button>
          <p className="dp-hint">
            Het openen of afronden van de oefening registreert niet automatisch
            dat je deze hebt geprobeerd.
          </p>
        </div>
      )}
    </div>
  );
}
