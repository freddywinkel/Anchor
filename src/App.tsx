import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  createHistorySession,
} from "./SecondaryViews";
import { CravingView } from "./CravingView";
import "./secondary.css";
import {
  MOODS,
  RatingLine,
  RatingsEditor,
  hasRating,
  cleanRatings,
  followupRatings,
  revealInvalidField,
} from "./RatingsEditor";

const KINDS: Record<Moment["kind"], string> = { checkin: "Check-in" };
const ACTIVITIES = [
  "Buiten wandelen",
  "Schilderen",
  "Iemand spreken",
  "5-4-3-2-1",
];
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
        const activeDialog =
          document.querySelector<HTMLDialogElement>("dialog[open]");
        if (activeDialog) {
          if (!activeDialog.contains(document.activeElement))
            activeDialog.querySelector<HTMLElement>("button")?.focus();
          return;
        }
        if (location.hash !== previousRoute) return;
        if (
          previous instanceof HTMLElement &&
          previous.isConnected &&
          previous !== document.body &&
          previous !== document.documentElement
        ) {
          previous.focus({ preventScroll: true });
          if (document.activeElement === previous) return;
        }
        // Switching dialogs can leave BODY as the captured opener. A draft
        // deletion can also replace the original button with a new page.
        const menu = document.querySelector<HTMLElement>(
          '[aria-label="Meer opties"]',
        );
        const fallback = menu?.getClientRects().length
          ? menu
          : document.querySelector<HTMLElement>("main h1");
        fallback?.focus({ preventScroll: true });
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
  const [currentDate, setCurrentDate] = useState(today);
  const [historySession, setHistorySession] = useState(createHistorySession);
  const [drafts, setDrafts] = useState(loadDrafts);
  const [draftError, setDraftError] = useState("");
  const [pendingDraftCompletion, setPendingDraftCompletion] = useState<
    string | null
  >(null);
  const [draftWarning, setDraftWarning] = useState(draftStorageWarning);
  const [draftRecoveryRaw, setDraftRecoveryRaw] = useState<string | null>(null);
  const [draftRecoveryDownloaded, setDraftRecoveryDownloaded] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [offerSupport, setOfferSupport] = useState(false);
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
  const [dialogError, setDialogError] = useState("");
  const dialogErrorRef = useRef<HTMLParagraphElement>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(
    undefined,
  );
  const lastUpdateCheck = useRef(0);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration;
    },
    onRegisterError() {
      setPwaWarning(
        "De bestanden voor offline gebruik konden niet worden klaargezet. Je opgeslagen gegevens blijven in deze browser.",
      );
    },
  });
  const path = route.split("?")[0];
  const routeQuery = new URLSearchParams(route.split("?")[1]);
  const returnTo =
    routeQuery.get("returnTo") === "history" ? "/history" : "/today";
  const returnQuery = returnTo === "/history" ? "returnTo=history" : "";
  const helpCraving = routeQuery.get("craving");
  const helpQuery =
    helpCraving &&
    (helpCraving === "new" ||
      state.cravings.some((item) => item.id === helpCraving) ||
      !!drafts[`craving:${helpCraving}`])
      ? `?craving=${encodeURIComponent(helpCraving)}${returnQuery ? `&${returnQuery}` : ""}`
      : "";
  const supportDestination = path.startsWith("/craving/")
    ? `/help?craving=${encodeURIComponent(path.split("/")[2])}${returnQuery ? `&${returnQuery}` : ""}`
    : `/help${helpQuery}`;
  const navigate = (to: string) => {
    setOfferSupport(false);
    importSequence.current++;
    setPendingDraftCompletion(null);
    setModal(null);
    setDialogError("");
    setRoute(to);
    location.hash = to;
  };
  const draftCount = Object.keys(drafts).length;
  function openDrafts() {
    setDrafts(loadDrafts());
    setDiscardKey(null);
    setDialogError("");
    setModal("drafts");
  }
  function showDialogError(message: string) {
    setDialogError(message);
    requestAnimationFrame(() => {
      dialogErrorRef.current?.focus();
      dialogErrorRef.current?.scrollIntoView({ block: "nearest" });
    });
  }
  function focusDraftControl(key?: string, keep = false) {
    requestAnimationFrame(() => {
      const dialog = document.querySelector("dialog[open]");
      const row = key
        ? dialog?.querySelector(`[data-draft-key="${CSS.escape(key)}"]`)
        : null;
      const target =
        row?.querySelector<HTMLElement>(
          keep ? "[data-keep-draft]" : "button",
        ) ??
        dialog?.querySelector<HTMLElement>(
          ".anchor-draft-row button, [data-drafts-empty]",
        );
      target?.focus();
    });
  }
  function openDraftRecovery() {
    try {
      setDialogError("");
      setDraftRecoveryRaw(localStorage.getItem(DRAFT_STORAGE_KEY));
      setDraftRecoveryDownloaded(false);
      setModal("draft-recovery");
    } catch {
      setError("De conceptopslag is niet toegankelijk. Houd dit venster open.");
    }
  }
  function requestUpdate() {
    const currentDrafts = loadDrafts();
    const currentWarning = draftStorageWarning();
    setDrafts(currentDrafts);
    setDraftWarning(currentWarning);
    if (currentWarning) {
      openDraftRecovery();
      return;
    }
    if (Object.keys(currentDrafts).length) {
      openDrafts();
      return;
    }
    if (hasUnpersistedDrafts() || draftError) {
      setError(
        "Niet alle conceptwijzigingen zijn bewaard. Houd dit venster open en bewaar je invoer voordat je bijwerkt.",
      );
      return;
    }
    setError("");
    void updateServiceWorker(true);
  }
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
    const change = () => {
      setRoute(location.hash.slice(1) || "/today");
      setModal(null);
      setDialogError("");
      importSequence.current++;
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    let midnight: ReturnType<typeof setTimeout>;
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    const checkUpdate = () => {
      updateTimer = undefined;
      const registration = registrationRef.current;
      if (
        !registration ||
        !navigator.onLine ||
        document.visibilityState !== "visible"
      )
        return;
      lastUpdateCheck.current = Date.now();
      void registration.update().catch(() => {});
    };
    const refresh = () => {
      setCurrentDate(today());
      clearTimeout(midnight);
      const now = new Date();
      const nextDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      midnight = setTimeout(refresh, nextDay.getTime() - now.getTime() + 50);
      if (
        registrationRef.current &&
        navigator.onLine &&
        document.visibilityState === "visible"
      ) {
        const delay = Math.max(
          0,
          60_000 - (Date.now() - lastUpdateCheck.current),
        );
        if (updateTimer === undefined) {
          if (delay === 0) checkUpdate();
          else updateTimer = setTimeout(checkUpdate, delay);
        }
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(midnight);
      clearTimeout(updateTimer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    if (dialogError) {
      dialogErrorRef.current?.focus();
      dialogErrorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [dialogError]);
  useEffect(() => {
    setPendingDraftCompletion(null);
    if (path !== "/today") setOfferSupport(false);
  }, [path]);
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
        const saveTop = [
          ...document.querySelectorAll<HTMLElement>(
            "main .dp-form-actions, main .anchor-save-bar",
          ),
        ]
          .filter(
            (bar) =>
              !bar.contains(target) &&
              getComputedStyle(bar).position === "sticky",
          )
          .map((bar) => bar.getBoundingClientRect())
          .filter(
            (rect) =>
              rect.height && rect.top > top && rect.bottom <= viewportBottom,
          )
          .map((rect) => rect.top);
        const bottom =
          Math.min(
            viewportBottom,
            nav?.height ? nav.top : viewportBottom,
            ...saveTop,
          ) - 16;
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
    const resize = () => {
      const available = window.visualViewport?.height ?? window.innerHeight;
      const fontSize = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      document.documentElement.dataset.anchorCompactActions = String(
        available >= 600 && fontSize <= 24,
      );
    };
    resize();
    const observer = new MutationObserver(resize);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });
    window.visualViewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
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
    const app = document.querySelector<HTMLElement>(".dp");
    const background = app
      ? getComputedStyle(app).getPropertyValue("--dp-bg").trim()
      : "#171614";
    document.documentElement.style.setProperty("--anchor-page-bg", background);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", background);
  }, [state.theme, state.palette]);
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
              "Een wijziging in je concepten kon niet worden opgeslagen. Houd dit tabblad open en probeer het opnieuw."
          : "",
      );
      if (hasUnpersistedDrafts()) setToast("");
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
    if (!writer || blocked) return false;
    // A failed removal keeps the draft visible in loadDrafts for a later retry.
    const currentDrafts = loadDrafts();
    if (value === null && !draftStorageWarning() && !(key in currentDrafts)) {
      setDrafts(currentDrafts);
      setPendingDraftCompletion(null);
      return true;
    }
    const result = saveDraft(key, value);
    if (value === null) setPendingDraftCompletion(result.ok ? null : key);
    setDrafts(loadDrafts());
    setDraftError(
      hasUnpersistedDrafts()
        ? value === null
          ? "Het concept kon niet worden opgeruimd. Houd dit scherm open en probeer het afronden opnieuw."
          : result.message ||
            "Een concept kon niet worden bewaard. Houd dit tabblad open."
        : "",
    );
    if (!result.ok && value === null) setToast("");
    return result.ok;
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
    <div className="dp" data-theme={state.theme} data-palette={state.palette}>
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
            Kleine momenten
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
        <button
          className="dp-help-rail"
          onClick={() => navigate(supportDestination)}
        >
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
              onClick={() => navigate(supportDestination)}
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
              Je bent offline. Je kunt verder werken in dit geopende scherm.
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
              <Button onClick={openDraftRecovery}>
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
            <div className="dp-notice dp-update-notice" role="status">
              <p>Een nieuwe versie van Anchor staat klaar.</p>
              {draftCount > 0 && (
                <p>
                  Je hebt {draftCount}{" "}
                  {draftCount === 1 ? "open concept" : "open concepten"}. Ook
                  als het formulier niet in beeld is. Rond je concepten eerst af
                  of verwijder wat je niet wilt bewaren.
                </p>
              )}
              <div className="dp-actions">
                {draftCount > 0 && (
                  <Button onClick={openDrafts}>
                    Concepten bekijken ({draftCount})
                  </Button>
                )}
                <Button disabled={!writer} onClick={requestUpdate}>
                  Bijwerken
                </Button>
              </div>
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
            {path === "/today" && (
              <Today
                state={state}
                currentDate={currentDate}
                navigate={navigate}
                offerSupport={offerSupport}
                onDismissSupport={() => setOfferSupport(false)}
              />
            )}
            {path === "/history" && (
              <>
                <PageTitle
                  kicker="Jouw aantekeningen"
                  title="Terugkijken"
                  description="Klap een registratie open om alles terug te lezen."
                />
                <HistoryView
                  state={state}
                  currentDate={currentDate}
                  session={historySession}
                  onSessionChange={setHistorySession}
                  onOpenMoment={(id) =>
                    navigate(`/moment/${id}?returnTo=history`)
                  }
                  onOpenCraving={(id) =>
                    navigate(`/craving/${id}?returnTo=history`)
                  }
                  onOpenDay={(date) =>
                    navigate(`/day/${date}?returnTo=history`)
                  }
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
                  title="Kleine momenten"
                  description="Bewaar een fijn moment, een bewuste keuze of iets dat je wilt onthouden."
                />
                <GrowthView
                  state={state}
                  currentDate={currentDate}
                  onSave={save}
                />
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
            {path === "/help" && (
              <Support
                state={state}
                navigate={navigate}
                cravingId={helpQuery ? helpCraving : null}
                helpQuery={helpQuery}
                returnTo={returnTo}
              />
            )}
            {path === "/exercise" && (
              <ExerciseView
                key={route}
                navigate={navigate}
                moment={state.moments.find(
                  (m) =>
                    m.id ===
                    new URLSearchParams(route.split("?")[1]).get("moment"),
                )}
                onBack={(id) =>
                  navigate(
                    id
                      ? `/moment/${id}?after=1${returnQuery ? `&${returnQuery}` : ""}`
                      : new URLSearchParams(route.split("?")[1]).has("support")
                        ? `/help${helpQuery}`
                        : "/tools",
                  )
                }
                fromSupport={new URLSearchParams(route.split("?")[1]).has(
                  "support",
                )}
              />
            )}
            {momentId &&
              (momentId === "new" ||
              moment ||
              drafts[`moment:${momentId}`] ||
              pendingDraftCompletion === `moment:${momentId}` ? (
                <MomentView
                  key={momentId}
                  record={moment}
                  returnTo={returnTo}
                  state={state}
                  onSave={save}
                  navigate={navigate}
                  draft={drafts[`moment:${momentId}`] as Moment | undefined}
                  onDraft={(value) => cacheDraft(`moment:${momentId}`, value)}
                  onClear={() => cacheDraft(`moment:${momentId}`, null)}
                  afterInitially={!!moment && route.includes("after=1")}
                  activityIntent={new URLSearchParams(route.split("?")[1]).get(
                    "activity",
                  )}
                />
              ) : (
                <Missing navigate={navigate} />
              ))}
            {cravingId &&
              (cravingId === "new" ||
              craving ||
              drafts[`craving:${cravingId}`] ||
              pendingDraftCompletion === `craving:${cravingId}` ? (
                <CravingView
                  key={cravingId}
                  record={craving}
                  returnTo={returnTo}
                  state={state}
                  onSave={save}
                  navigate={navigate}
                  draft={
                    drafts[`craving:${cravingId}`] as CravingRecord | undefined
                  }
                  onDraft={(value) => cacheDraft(`craving:${cravingId}`, value)}
                  onClear={() => cacheDraft(`craving:${cravingId}`, null)}
                  onCompleted={() => {
                    navigate(returnTo);
                    setOfferSupport(returnTo === "/today");
                  }}
                  onSupport={() => navigate(supportDestination)}
                />
              ) : (
                <Missing navigate={navigate} />
              ))}
            {dayDate && (
              <DayView
                key={dayDate}
                date={dayDate}
                returnTo={returnTo}
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
              <button onClick={openDrafts}>
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
            <Button onClick={openDrafts}>
              Open concepten ({draftCount})
              <BookOpen size={20} />
            </Button>
            <a href="#/growth" onClick={() => setModal(null)}>
              Kleine momenten
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
            Concepten zijn onafgemaakte formulieren. Ze blijven hier staan als
            je naar een ander scherm gaat. Je kunt verder schrijven of een
            concept verwijderen. Opgeslagen registraties blijven behouden.
          </p>
          {needRefresh && draftCount > 0 && (
            <p>Rond deze concepten af of verwijder ze voordat je bijwerkt.</p>
          )}
          {Object.entries(drafts).map(([key, value]) => {
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
                        ? "Klein moment"
                        : "Mijn plan";
            const details = value as {
              date?: string;
              time?: string;
              name?: string;
            };
            const description = details.date
              ? `${dateText(details.date)}${details.time ? " · " + details.time : ""}`
              : details.name;
            return (
              <div className="anchor-draft-row" key={key} data-draft-key={key}>
                <strong>{title}</strong>
                {description && <p className="dp-muted">{description}</p>}
                {discardKey === key ? (
                  <>
                    <p>
                      Dit concept verwijderen? De invoer in dit onafgemaakte
                      formulier vervalt.
                    </p>
                    <Button
                      data-keep-draft
                      onClick={() => {
                        setDiscardKey(null);
                        setDialogError("");
                        focusDraftControl(key);
                      }}
                    >
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
                          setDialogError("");
                          setDraftError("");
                          focusDraftControl();
                          if (pendingDraftCompletion) navigate("/today");
                        } else
                          showDialogError(
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
                      onClick={() => {
                        setDialogError("");
                        setDiscardKey(key);
                        focusDraftControl(key, true);
                      }}
                    >
                      Concept verwijderen
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {!Object.keys(drafts).length && (
            <p tabIndex={-1} data-drafts-empty>
              Je hebt geen open concepten.
            </p>
          )}
          {dialogError && (
            <p
              className="dp-error"
              role="alert"
              tabIndex={-1}
              ref={dialogErrorRef}
            >
              {dialogError}
            </p>
          )}
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
                showDialogError(
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
                  if (pendingDraftCompletion) navigate("/today");
                  setToast(
                    "De open concepten zijn verwijderd. Je opgeslagen registraties zijn behouden.",
                  );
                } else
                  showDialogError(
                    result.message || "Herstellen is niet gelukt.",
                  );
              }}
            >
              Alleen concepten wissen
            </Button>
          </div>
          {dialogError && (
            <p
              className="dp-error"
              role="alert"
              tabIndex={-1}
              ref={dialogErrorRef}
            >
              {dialogError}
            </p>
          )}
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
            deze de opgeslagen Anchor-gegevens in deze browser.
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
                dagoverzichten · {imported.growth.length} kleine momenten ·{" "}
                {imported.goals.length} doelen.
              </p>
              <p>
                Download eerst een kopie van je huidige gegevens. Rond open
                concepten af of verwijder ze via ‘Open concepten’.
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
                        "Rond open concepten eerst af of verwijder ze via ‘Open concepten’. Je gegevens zijn niet vervangen.",
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
                      setHistorySession(createHistorySession());
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
  currentDate,
  navigate,
  offerSupport,
  onDismissSupport,
}: {
  state: AppState;
  currentDate: string;
  navigate: (path: string) => void;
  offerSupport: boolean;
  onDismissSupport: () => void;
}) {
  const current = [
    ...state.moments
      .filter((m) => m.date === currentDate)
      .map((item) => ({ type: "moment" as const, item })),
    ...state.cravings
      .filter((m) => m.date === currentDate)
      .map((item) => ({ type: "craving" as const, item })),
  ].sort((a, b) => b.item.time.localeCompare(a.item.time));
  const day = state.days.find((item) => item.date === currentDate);
  const favorite = state.growth.find((item) => item.favorite);
  return (
    <>
      <PageTitle
        kicker={dateText(currentDate, true)}
        title="Vandaag, op jouw tempo."
      />
      {offerSupport && (
        <section
          className="dp-card dp-form-section"
          aria-labelledby="craving-next-step"
        >
          <p className="dp-kicker">Je craving is opgeslagen</p>
          <h2 id="craving-next-step">Wat helpt je nu?</h2>
          <p>
            Een kleine stap of iemand om op terug te vallen. Je mag het ook
            hierbij laten.
          </p>
          <div className="dp-actions">
            <Button primary onClick={() => navigate("/help")}>
              Open mijn houvast
            </Button>
            <Button
              onClick={() => {
                onDismissSupport();
                requestAnimationFrame(() =>
                  document.querySelector<HTMLElement>("main h1")?.focus(),
                );
              }}
            >
              Klaar voor nu
            </Button>
          </div>
        </section>
      )}
      <section className="dp-now-panel">
        <div>
          <p className="dp-kicker">Een moment voor jezelf</p>
          <h2>Hoe gaat het nu?</h2>
          <p>
            Leg vast hoe je je voelt, of beschrijf een moment van drang. Je kunt
            zo vaak inchecken als je wilt.
          </p>
          <div className="dp-actions dp-entry-actions">
            <Button primary onClick={() => navigate("/moment/new")}>
              <span>Check-in toevoegen</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
            <Button primary onClick={() => navigate("/craving/new")}>
              <span>Craving vastleggen</span>
              <ArrowRight size={18} aria-hidden="true" />
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
        <section className="dp-card dp-today-moments">
          <div className="dp-section-head">
            <div>
              <p className="dp-kicker">Check-ins en cravings</p>
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
                        {(item as CravingRecord).substance && (
                          <p className="dp-hint">
                            Middel of gedrag:{" "}
                            {(item as CravingRecord).substance}
                          </p>
                        )}
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
              <h3>Nog niets vastgelegd vandaag</h3>
              <p>
                Je check-ins en cravings verschijnen hier zodra je ze opslaat.
                Leg iets vast wanneer dat voor jou helpt.
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
          <section className="dp-card dp-reflection">
            <div className="dp-card-heading">
              <div>
                <p className="dp-kicker">Wanneer je dag rond is</p>
                <h2>Mijn hele dag</h2>
              </div>
              <span className="dp-round-icon" aria-hidden="true">
                <Moon size={22} />
              </span>
            </div>
            <p>
              Hoe was de dag als geheel? Sta stil bij je stemming en je slaap.
            </p>
            {day && (
              <p className="dp-summary-snippet">
                <Check size={16} />
                Dagoverzicht opgeslagen
              </p>
            )}
            <Button onClick={() => navigate(`/day/${currentDate}`)}>
              {day ? "Dagoverzicht bewerken" : "Dagoverzicht invullen"}
              <ArrowRight size={17} />
            </Button>
            <small>Een aparte terugblik, naast je losse momenten.</small>
          </section>
          {state.homeShowGrowth && (
            <section className="dp-card dp-growth-peek">
              <div className="dp-card-heading">
                <h2>Kleine momenten bewaren</h2>
                <span className="dp-round-icon" aria-hidden="true">
                  <Leaf size={22} />
                </span>
              </div>
              <p>
                {favorite?.text ||
                  "Een fijn moment, een bewuste keuze of iets anders dat je wilt onthouden."}
              </p>
              <Button onClick={() => navigate("/growth")}>
                Moment toevoegen
                <ArrowRight size={16} />
              </Button>
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
        <section className="dp-card dp-featured-tool">
          <span className="dp-round-icon">
            <Compass size={27} />
          </span>
          <div>
            <p className="dp-kicker">Aandacht voor je omgeving</p>
            <h2>5-4-3-2-1</h2>
            <p>Sta even stil bij wat je om je heen opmerkt.</p>
            <p>
              Je kunt meteen beginnen, of eerst inchecken en na afloop opnieuw
              vastleggen hoe het gaat.
            </p>
            <div className="dp-actions">
              <Button primary onClick={() => navigate("/exercise")}>
                Start de oefening
                <ArrowRight size={19} />
              </Button>
              <Button
                onClick={() => navigate("/moment/new?activity=grounding")}
              >
                Eerst inchecken
              </Button>
            </div>
          </div>
        </section>
        <section className="dp-card dp-plain-section">
          <h2>Een eigen activiteit</h2>
          <p>
            Wandelen, schilderen, iemand spreken of iets anders. Kies wat je
            wilt doen, leg eventueel vast hoe je je vooraf voelt en check later
            opnieuw in.
          </p>
          <Button onClick={() => navigate("/moment/new?activity=choose")}>
            Activiteit kiezen
            <ArrowRight size={17} />
          </Button>
        </section>
      </div>
      <section className="dp-card dp-help-inset">
        <Heart size={22} />
        <div>
          <h3>Je eigen houvast</h3>
          <p>Lees wat je jezelf wilt meegeven wanneer het lastig wordt.</p>
        </div>
        <Button onClick={() => navigate("/help")}>Mijn houvast openen</Button>
      </section>
    </>
  );
}
function Support({
  state,
  navigate,
  cravingId,
  helpQuery,
  returnTo,
}: {
  state: AppState;
  navigate: (path: string) => void;
  cravingId: string | null;
  helpQuery: string;
  returnTo: string;
}) {
  return (
    <div className="dp-help-page">
      {cravingId && (
        <Button
          onClick={() =>
            navigate(
              `/craving/${cravingId}${returnTo === "/history" ? "?returnTo=history" : ""}`,
            )
          }
        >
          Terug naar mijn craving
        </Button>
      )}
      <PageTitle
        kicker="Ondersteuning dichtbij"
        title="Mijn houvast"
        description="Kies één haalbare stap. Je hoeft niets in te vullen of eerst alles te begrijpen."
      />
      <section className="dp-help-choices">
        <div className="dp-card">
          <p className="dp-kicker">Een kleine stap</p>
          <h2>Wat ik kan doen</h2>
          <p className="anchor-prose">
            {state.plan.action ||
              "Je kunt even rust nemen, een belastende situatie verlaten of teruggaan naar één eenvoudige stap uit je dagroutine. Kies wat nu haalbaar is."}
          </p>
          <Button onClick={() => navigate("/plan")}>Mijn plan openen</Button>
        </div>
        <div className="dp-card">
          <p className="dp-kicker">Iemand dichtbij</p>
          <h2>Waar ik steun vind</h2>
          <p className="anchor-prose">
            {state.plan.support ||
              "Denk aan iemand die je vertrouwt of je eigen hulpverlener. Je kunt diegene zelf bellen of een bericht sturen; je hoeft niet eerst alles uit te leggen."}
          </p>
          <Button onClick={() => navigate("/plan")}>Mijn plan openen</Button>
        </div>
      </section>
      <section className="dp-card dp-plain-section">
        <h2>Aandacht voor je omgeving</h2>
        <p>
          Een korte oefening om stil te staan bij wat je om je heen opmerkt.
          Elke stap mag je overslaan.
        </p>
        <Button
          onClick={() =>
            navigate(
              `/exercise${helpQuery || "?"}${helpQuery ? "&" : ""}support=1`,
            )
          }
        >
          5-4-3-2-1 openen
        </Button>
      </section>
      <details className="dp-card dp-form-section">
        <summary>Verder na gebruik</summary>
        <p>
          Je hoeft dit nu niet uitgebreid te verklaren. Kijk eerst wat je nodig
          hebt voor je veiligheid en wie je kan steunen. Je eigen plan en steun
          staan hierboven.
        </p>
        <p>
          Kies daarna één haalbare volgende stap, bijvoorbeeld iemand benaderen
          of rust nemen op een plek waar je je veilig voelt. Een terugblik kan
          later.
        </p>
        <div className="dp-actions">
          <Button onClick={() => navigate("/plan")}>Mijn plan openen</Button>
          <Button onClick={() => navigate("/moment/new")}>
            Eventueel een check-in schrijven
          </Button>
        </div>
        <p className="dp-hint">
          Je eerdere registraties blijven bewaard. Deze pagina openen
          registreert geen gebruik.
        </p>
      </details>
      <p className="dp-muted">
        Anchor is een persoonlijk dagboek, geen hulpdienst. Niemand kijkt
        automatisch mee en er wordt niemand gewaarschuwd. Bij direct gevaar kun
        je{" "}
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
      <h1 tabIndex={-1}>Deze pagina is niet gevonden</h1>
      <p>Controleer de link of zoek je registratie in Terugkijken.</p>
      <Button onClick={() => navigate("/history")}>Naar Terugkijken</Button>
    </div>
  );
}

function FinishSaved({
  removed = false,
  onRetry,
}: {
  removed?: boolean;
  onRetry: () => void;
}) {
  const message = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    message.current?.focus({ preventScroll: true });
    message.current?.scrollIntoView({ block: "center" });
  }, [onRetry]);
  return (
    <section className="dp-card dp-form-page">
      <h1 tabIndex={-1}>
        {removed ? "Registratie verwijderd" : "Registratie opgeslagen"}
      </h1>
      <p className="dp-error" role="alert" tabIndex={-1} ref={message}>
        {removed
          ? "Je registratie is verwijderd"
          : "Je registratie is opgeslagen"}
        , maar het concept kon niet worden opgeruimd. Probeer het afronden
        opnieuw.
      </p>
      <Button
        primary
        onClick={() => {
          onRetry();
          requestAnimationFrame(() => message.current?.focus());
        }}
      >
        Afronden opnieuw proberen
      </Button>
    </section>
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
  activityIntent,
  returnTo = "/today",
}: {
  record?: Moment;
  state: AppState;
  onSave: Save;
  navigate: (path: string) => void;
  onDraft: (value: Moment) => void;
  draft?: Moment;
  onClear: () => boolean;
  afterInitially: boolean;
  activityIntent: string | null;
  returnTo?: string;
}) {
  const [value, setValue] = useState<Moment>(
    () =>
      draft ??
      record ?? {
        ...emptyMoment(),
        activity: activityIntent === "grounding" ? "5-4-3-2-1" : "",
      },
  );
  const [resumedDraft] = useState(() => !!draft);
  const [repairActivity, setRepairActivity] = useState(
    () =>
      (!!value.after || value.attempted !== null) &&
      (!value.activity.trim() ||
        (!!draft && (!record || draft.activity !== record.activity))),
  );
  const beforeFormRef = useRef<HTMLFormElement>(null);
  const afterHeadingRef = useRef<HTMLHeadingElement>(null);
  const activityHeadingRef = useRef<HTMLHeadingElement>(null);
  const activitySelectRef = useRef<HTMLSelectElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const fieldErrorId = useId();
  const [customActivity, setCustomActivity] = useState(
    () => !["", ...ACTIVITIES].includes(value.activity),
  );
  const [afterOpen, setAfterOpen] = useState(
    afterInitially ||
      !!record?.after ||
      record?.attempted != null ||
      !!draft?.after ||
      draft?.attempted != null,
  );
  const [error, setError] = useState<{
    message: string;
    form: "before" | "after" | "delete";
    field?: "date" | "time";
  } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingAfter, setDeletingAfter] = useState(false);
  const afterDeleteCancelRef = useRef<HTMLButtonElement>(null);
  const afterDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingCompletion, setPendingCompletion] = useState<{
    kind: "before" | "after" | "delete" | "after-delete";
    id: string;
  } | null>(null);
  const activityLocked =
    !repairActivity && (!!value.after || value.attempted !== null);
  const changedSinceSave =
    !!record && JSON.stringify(value) !== JSON.stringify(record);
  const activityEntry =
    activityIntent === "choose" || activityIntent === "grounding";
  const differentDraft =
    resumedDraft &&
    activityIntent === "grounding" &&
    value.activity !== "5-4-3-2-1";
  const returnQuery = returnTo === "/history" ? "?returnTo=history" : "";
  useEffect(() => {
    if (deletingAfter) afterDeleteCancelRef.current?.focus();
  }, [deletingAfter]);
  useEffect(() => {
    if (!activityEntry || afterInitially) return;
    const frame = requestAnimationFrame(() => {
      const select = activitySelectRef.current;
      const details = select?.closest("details");
      if (details) details.open = true;
      const target = select?.disabled
        ? details?.querySelector("summary")
        : select;
      target?.focus({ preventScroll: true });
      details?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activityIntent, activityEntry, afterInitially]);
  useEffect(() => {
    if (!afterInitially) return;
    const frame = requestAnimationFrame(() => {
      afterHeadingRef.current?.focus({ preventScroll: true });
      afterHeadingRef.current?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [afterInitially]);
  useEffect(() => {
    if (!error) return;
    const target =
      error.field === "date"
        ? dateInputRef.current
        : error.field === "time"
          ? timeInputRef.current
          : errorRef.current;
    const details = target?.closest("details");
    if (details) details.open = true;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [error]);
  function showError(
    message: string,
    form: "before" | "after" | "delete" = "before",
    field?: "date" | "time",
  ) {
    // A fresh object also reveals the same message after another save attempt.
    setError({ message, form, field });
  }
  function revealBeforeInvalid(event: React.InvalidEvent<HTMLFormElement>) {
    revealInvalidField(event);
    const form = event.currentTarget;
    requestAnimationFrame(() => {
      const firstInvalid = form.querySelector<HTMLElement>(":invalid");
      firstInvalid?.focus({ preventScroll: true });
      firstInvalid?.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }
  function openAfter() {
    if (!repairActivity && record && record.activity !== value.activity) {
      showError(
        "Bewaar eerst je gekozen activiteit bij deze check-in. Daarna kun je de nameting invullen.",
      );
      return;
    }
    setAfterOpen(true);
    requestAnimationFrame(() => {
      afterHeadingRef.current?.focus({ preventScroll: true });
      afterHeadingRef.current?.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    });
  }
  function update(patch: Partial<Moment>) {
    const next = { ...value, ...patch };
    setError(null);
    setValue(next);
    onDraft(next);
  }
  function submit(event: React.FormEvent, followup: boolean) {
    event.preventDefault();
    setError(null);
    if (followup && !beforeFormRef.current?.reportValidity()) return;
    // Date/time inputs fall back to plain text in some browsers.
    if (!validCalendarDate(value.date)) {
      showError(
        "Vul een geldige datum tussen 1900 en 2199 in.",
        "before",
        "date",
      );
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) {
      showError("Vul een geldige tijd in, zoals 14:30.", "before", "time");
      return;
    }
    if (
      !hasRating(value.before) &&
      !value.note.trim() &&
      !value.activity.trim() &&
      !value.emotions.length
    ) {
      showError("Vul een stemming, emotie, notitie of activiteit in.");
      return;
    }
    if (customActivity && !value.activity.trim()) {
      showError("Geef je activiteit een naam of kies Alleen deze check-in.");
      return;
    }
    if (
      !followup &&
      (repairActivity ||
        JSON.stringify(value.after) !== JSON.stringify(record?.after ?? null) ||
        value.attempted !== (record?.attempted ?? null))
    ) {
      showError(
        "Je hebt je nameting aangepast. Gebruik Nameting opslaan om deze samen met je moment te bewaren.",
      );
      return;
    }
    if (followup && !value.activity.trim()) {
      showError("Kies eerst een activiteit.", "after");
      return;
    }
    if (followup) {
      const after = value.after ?? followupRatings(value.before);
      const hasNewAnswer =
        value.attempted !== null ||
        after.mood !== null ||
        after.eis !== null ||
        after.pans != null ||
        !!after.emotionRatings?.some(
          (emotion) =>
            emotion.label.trim() &&
            (emotion.intensity !== null ||
              !value.before.emotionRatings?.some(
                (before) =>
                  before.id === emotion.id && before.label === emotion.label,
              )),
        );
      const unchangedSavedAfter =
        !!record?.after &&
        JSON.stringify(after) === JSON.stringify(record.after) &&
        value.attempted === record.attempted;
      if (!hasNewAnswer && !unchangedSavedAfter) {
        showError(
          "Je nameting is nog leeg. Kies zelf een emotie, geef een score of vul in of je de activiteit hebt geprobeerd. Je kunt ook terug zonder een nameting op te slaan.",
          "after",
        );
        return;
      }
    }
    const saved: Moment = {
      ...value,
      note: value.note.trim(),
      before: cleanRatings(value.before),
      after: value.after ? cleanRatings(value.after) : null,
      emotions: [
        ...new Set(value.emotions.map((item) => item.trim()).filter(Boolean)),
      ],
      ...(followup
        ? {
            after: cleanRatings(value.after ?? followupRatings(value.before)),
            afterTime: record?.afterTime ?? value.afterTime ?? clockTime(),
            afterDate: record?.afterDate ?? value.afterDate ?? today(),
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
          : "Je check-in is opgeslagen op dit apparaat.",
      )
    ) {
      setValue(saved);
      setRepairActivity(false);
      finish(followup ? "after" : "before", saved.id);
    } else {
      showError(
        "Opslaan is niet gelukt. Je ingevulde waarden staan hier nog. Probeer het opnieuw.",
        followup ? "after" : "before",
      );
    }
  }
  function finish(
    kind: "before" | "after" | "delete" | "after-delete",
    id: string,
  ) {
    if (!onClear()) {
      if (kind === "after-delete")
        showError(
          "Je nameting is verwijderd, maar het concept kon niet worden opgeruimd. Je check-in blijft bewaard. Probeer het afronden opnieuw.",
          "after",
        );
      else setError(null);
      setPendingCompletion({ kind, id });
      return;
    }
    setPendingCompletion(null);
    setAfterOpen(false);
    navigate(
      (kind === "before" && value.activity) || kind === "after-delete"
        ? `/moment/${id}${returnQuery}`
        : returnTo,
    );
    if (kind === "before" && value.activity)
      requestAnimationFrame(() => {
        activityHeadingRef.current?.focus({ preventScroll: true });
        activityHeadingRef.current?.scrollIntoView({ block: "center" });
      });
    else if (kind === "after-delete") focusAfterRemoval();
  }
  function focusAfterRemoval() {
    requestAnimationFrame(() => {
      const target =
        activityHeadingRef.current ??
        document.querySelector<HTMLElement>("main h1");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center" });
    });
  }
  function cancelAfterDelete() {
    setDeletingAfter(false);
    requestAnimationFrame(() => afterDeleteButtonRef.current?.focus());
  }
  function removeAfter() {
    if (!record) return;
    const cleared = {
      after: null,
      afterDate: null,
      afterTime: null,
      attempted: null,
    };
    const saved: Moment = { ...record, ...cleared };
    if (
      !onSave(
        {
          ...state,
          moments: state.moments.map((item) =>
            item.id === record.id ? saved : item,
          ),
        },
        "Je nameting is verwijderd. Je check-in blijft bewaard.",
      )
    ) {
      showError(
        "Verwijderen is niet gelukt. Je check-in en nameting blijven bewaard.",
        "after",
      );
      return;
    }
    const pending: Moment = { ...value, ...cleared };
    setValue(pending);
    setDeletingAfter(false);
    setAfterOpen(false);
    setRepairActivity(false);
    setError(null);
    if (JSON.stringify(pending) !== JSON.stringify(saved)) {
      // Keep unsaved changes to the original check-in; deletion only affects its follow-up.
      onDraft(pending);
      focusAfterRemoval();
    } else finish("after-delete", record.id);
  }
  if (pendingCompletion?.kind === "after-delete")
    return (
      <section className="dp-card dp-form-page">
        <h1 tabIndex={-1}>Nameting verwijderd</h1>
        <p className="dp-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error?.message}
        </p>
        <Button
          primary
          onClick={() => finish("after-delete", pendingCompletion.id)}
        >
          Afronden opnieuw proberen
        </Button>
      </section>
    );
  if (pendingCompletion)
    return (
      <FinishSaved
        removed={pendingCompletion.kind === "delete"}
        onRetry={() => finish(pendingCompletion.kind, pendingCompletion.id)}
      />
    );
  return (
    <div className="dp-form-page">
      <button
        className="dp-text-button dp-back"
        onClick={() => navigate(returnTo)}
      >
        <ArrowLeft size={17} />
        {returnTo === "/history"
          ? "Terug naar Terugkijken"
          : "Terug naar Vandaag"}
      </button>
      <PageTitle
        kicker={record ? `${dateText(value.date)} · ${value.time}` : "Check-in"}
        title={record ? "Jouw check-in" : "Hoe gaat het nu?"}
        description={
          record
            ? "Je kunt dit moment aanvullen. Je dagoverzicht blijft apart."
            : "Vul alleen in wat je wilt vastleggen."
        }
      />
      {resumedDraft && (
        <p className="dp-notice" role="status">
          Je werkt verder aan een bewaard concept. Je eerdere invoer is
          teruggezet, inclusief de datum en tijd van dat moment.
        </p>
      )}
      {record && (
        <div className="dp-saved-strip">
          <CheckCheck size={19} />
          Check-in opgeslagen
          <Button className="quiet" onClick={() => navigate("/moment/new")}>
            <Plus size={17} />
            Nieuwe check-in
          </Button>
        </div>
      )}
      {record && value.activity && (
        <section className="dp-card dp-activity-next">
          <p className="dp-kicker">Activiteit bij deze check-in</p>
          <h2 ref={activityHeadingRef} tabIndex={-1}>
            {value.activity}
          </h2>
          <p>
            {record.after
              ? "Je check-in en je nameting zijn bewaard. Hieronder kun je ze bekijken of aanvullen."
              : activityLocked
                ? "Je nameting is nog een concept. Ga verder waar je was gebleven en bewaar je terugblik."
                : changedSinceSave
                  ? "Je hebt wijzigingen in je check-in. Bewaar die voordat je aan je activiteit begint."
                  : "Je check-in is bewaard. Probeer je activiteit wanneer het uitkomt. Kom daarna terug om vast te leggen hoe het nu gaat."}
          </p>
          <div className="dp-actions">
            {value.activity === "5-4-3-2-1" &&
              !activityLocked &&
              !repairActivity && (
                <Button
                  primary
                  onClick={() => {
                    if (changedSinceSave) {
                      showError(
                        "Sla je moment eerst op voordat je de oefening opent.",
                      );
                      return;
                    }
                    navigate(
                      `/exercise?moment=${record.id}${returnTo === "/history" ? "&returnTo=history" : ""}`,
                    );
                  }}
                >
                  <Compass size={19} />
                  Open de oefening
                </Button>
              )}
            <Button onClick={openAfter}>
              {record.after ? "Nameting bekijken" : "Nameting invullen"}
              <ArrowRight size={17} />
            </Button>
          </div>
          <p className="dp-hint">
            De nameting hoort bij dit moment. Je eerdere scores blijven bewaard.
            Je kunt aangeven of je de activiteit hebt geprobeerd. Dat is
            optioneel.
          </p>
        </section>
      )}
      <form
        ref={beforeFormRef}
        onSubmit={(event) => submit(event, false)}
        onInvalidCapture={revealBeforeInvalid}
      >
        <section className="dp-card dp-form-section">
          <div className="dp-section-head">
            <h2>{record?.activity ? "Voor je activiteit" : "Dit moment"}</h2>
            <span className="dp-tag">
              {dateText(value.date)} · {value.time}
            </span>
          </div>

          <details className="dp-extra-fields dp-moment-time">
            <summary>Datum en tijd aanpassen</summary>
            <div className="dp-form-grid anchor-datetime-grid">
              <label className="dp-field">
                Datum
                <input
                  aria-label="Datum momentopname"
                  ref={dateInputRef}
                  aria-invalid={error?.field === "date" || undefined}
                  aria-describedby={
                    error?.field === "date" ? `${fieldErrorId}-date` : undefined
                  }
                  type="date"
                  required
                  min="1900-01-01"
                  max="2199-12-31"
                  value={value.date}
                  onChange={(event) => update({ date: event.target.value })}
                />
                {error?.field === "date" && (
                  <span
                    className="dp-error"
                    role="alert"
                    id={`${fieldErrorId}-date`}
                  >
                    {error.message}
                  </span>
                )}
              </label>
              <label className="dp-field">
                Tijd
                <input
                  aria-label="Tijd momentopname"
                  ref={timeInputRef}
                  aria-invalid={error?.field === "time" || undefined}
                  aria-describedby={
                    error?.field === "time" ? `${fieldErrorId}-time` : undefined
                  }
                  type="time"
                  required
                  value={value.time}
                  onChange={(event) => update({ time: event.target.value })}
                />
                {error?.field === "time" && (
                  <span
                    className="dp-error"
                    role="alert"
                    id={`${fieldErrorId}-time`}
                  >
                    {error.message}
                  </span>
                )}
              </label>
            </div>
          </details>
          <RatingsEditor
            value={value.before}
            savedValue={record?.before}
            onChange={(before) => update({ before })}
          />
          {value.emotions.length > 0 && (
            <p className="dp-hint">
              Eerder genoteerde emoties: {value.emotions.join(", ")}. Deze zijn
              niet aan een intensiteitscijfer gekoppeld.
            </p>
          )}
          <details className="dp-extra-fields">
            <summary>Hulp bij je notitie</summary>
            <p className="dp-hint">
              Wat gebeurde er? Welke gedachten had je? Wat merkte je in je
              lichaam? Gebruik alleen wat je helpt om dit moment te beschrijven.
            </p>
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
        <details
          className="dp-card dp-form-section dp-activity-section dp-extra-fields"
          open={
            activityEntry ||
            repairActivity ||
            !!value.activity ||
            customActivity
          }
        >
          <summary>Activiteit toevoegen</summary>
          <span className="dp-kicker">Optioneel</span>
          <h2>Wat wil je doen?</h2>
          <p>
            Een activiteit is iets wat je probeert, zoals wandelen, schilderen
            of iemand spreken. Je doet dit in je eigen tijd; 5-4-3-2-1 kun je
            hier in de app volgen.
          </p>
          {!record && (
            <ol className="dp-activity-steps">
              <li>Kies een activiteit en vul hierboven in hoe het nu gaat.</li>
              <li>Bewaar je check-in en probeer je activiteit.</li>
              <li>
                Open later deze check-in voor je nameting: hoe gaat het nu?
              </li>
            </ol>
          )}
          {differentDraft && (
            <p className="dp-notice">
              Je hebt al een open check-in. Je invoer en gekozen activiteit zijn
              behouden. Rond dit concept eerst af, of kies hieronder zelf een
              andere activiteit als er nog geen nameting is ingevuld.
            </p>
          )}
          {repairActivity && (
            <p className="dp-notice">
              Controleer de activiteit bij deze bewaarde nameting. Kies
              hieronder de activiteit die erbij hoort en gebruik ‘Nameting
              opslaan’. Je eerder ingevulde scores blijven behouden.
            </p>
          )}
          <label className="dp-field">
            Activiteit
            <select
              ref={activitySelectRef}
              disabled={activityLocked}
              value={customActivity ? "custom" : value.activity}
              onChange={(e) => {
                setCustomActivity(e.target.value === "custom");
                update({
                  activity: e.target.value === "custom" ? "" : e.target.value,
                });
              }}
            >
              <option value="">Alleen deze check-in</option>
              {ACTIVITIES.map((activity) => (
                <option key={activity}>{activity}</option>
              ))}
              <option value="custom">Eigen activiteit</option>
            </select>
          </label>
          {customActivity && (
            <label className="dp-field">
              Naam van de activiteit
              <input
                disabled={activityLocked}
                maxLength={200}
                value={value.activity}
                onChange={(e) => update({ activity: e.target.value })}
              />
            </label>
          )}
          {activityLocked && (
            <p className="dp-hint">
              Deze activiteit hoort bij je ingevulde nameting en blijft eraan
              gekoppeld. Bewaar je nameting; gebruik voor een andere activiteit
              een nieuwe check-in.
            </p>
          )}
          {!record && value.activity && (
            <p className="dp-hint">
              Kies hieronder ‘Check-in opslaan’. Daarna zie je hoe je verder
              kunt met je activiteit en de nameting.
            </p>
          )}
        </details>
        {error?.form === "before" && !error.field && (
          <p className="dp-error" role="alert" tabIndex={-1} ref={errorRef}>
            {error.message}
          </p>
        )}
        <div className="dp-form-actions">
          <Button type="submit" primary>
            <Check size={18} />
            {record ? "Wijzigingen check-in opslaan" : "Check-in opslaan"}
          </Button>
          <span>
            {afterOpen
              ? "Je nameting bewaar je met de knop eronder."
              : "Op dit apparaat"}
          </span>
        </div>
      </form>
      {afterOpen &&
        (value.activity || record?.after || record?.attempted != null) && (
          <form
            className="dp-card dp-after-form"
            onSubmit={(event) => submit(event, true)}
          >
            <p className="dp-kicker">
              Nameting · {value.activity || "Activiteit niet ingevuld"}
            </p>
            <h2 ref={afterHeadingRef} tabIndex={-1}>
              {value.after ? "Je nameting" : "Hoe is het nu?"}
            </h2>
            <p>
              Vul opnieuw in hoe het nu gaat: je stemming, spanning of emoties.
              De eerdere check-in blijft apart bewaard. Je mag waarden leeg
              laten.
            </p>
            {value.afterDate && value.afterTime && (
              <p className="dp-hint">
                Tijdstip nameting: {dateText(value.afterDate, true)} om{" "}
                {value.afterTime}. Aanpassen behoudt dit tijdstip.
              </p>
            )}
            <fieldset>
              <legend>Heb je de activiteit geprobeerd? (optioneel)</legend>
              <div className="dp-chip-list">
                {[
                  { value: true, label: "Ja" },
                  { value: false, label: "Nee" },
                  { value: null, label: "Niet ingevuld" },
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
              value={value.after ?? followupRatings(value.before)}
              savedValue={
                record?.after ??
                followupRatings(record?.before ?? blankRatings())
              }
              onChange={(after) => update({ after })}
            />
            <p className="dp-hint">
              Een verschil is een observatie. Het zegt niet automatisch waardoor
              je gevoel veranderde.
            </p>
            {error?.form === "after" && (
              <p className="dp-error" role="alert" tabIndex={-1} ref={errorRef}>
                {error.message}
              </p>
            )}
            <div className="dp-form-actions">
              <Button type="submit" primary>
                Nameting opslaan
                <Check size={18} />
              </Button>
            </div>
            {record && (record.after || record.attempted !== null) && (
              <div className="dp-delete-area">
                {deletingAfter ? (
                  <div
                    role="alertdialog"
                    aria-labelledby={`${fieldErrorId}-after-delete`}
                    aria-describedby={`${fieldErrorId}-after-delete-description`}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelAfterDelete();
                      }
                    }}
                  >
                    <h3 id={`${fieldErrorId}-after-delete`}>
                      Alleen deze nameting verwijderen?
                    </h3>
                    <p id={`${fieldErrorId}-after-delete-description`}>
                      Je verwijdert de antwoorden en het tijdstip van de
                      nameting, inclusief eventuele wijzigingen daarin. Je
                      eerdere check-in blijft bewaard. Niet-opgeslagen
                      wijzigingen aan je check-in blijven als concept staan. Dit
                      kun je niet ongedaan maken.
                    </p>
                    <div className="dp-actions">
                      <button
                        type="button"
                        className="dp-button"
                        ref={afterDeleteCancelRef}
                        onClick={cancelAfterDelete}
                      >
                        Behouden
                      </button>
                      <Button onClick={removeAfter}>
                        Ja, nameting verwijderen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="dp-text-button"
                    ref={afterDeleteButtonRef}
                    onClick={() => setDeletingAfter(true)}
                  >
                    Nameting verwijderen
                  </button>
                )}
              </div>
            )}
          </form>
        )}
      {record && (
        <div className="dp-delete-area">
          {error?.form === "delete" && (
            <p className="dp-error" role="alert" tabIndex={-1} ref={errorRef}>
              {error.message}
            </p>
          )}
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
                    finish("delete", record.id);
                  } else
                    showError(
                      "Verwijderen is niet gelukt. Je check-in blijft bewaard.",
                      "delete",
                    );
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
  returnTo = "/today",
  state,
  onSave,
  navigate,
  draft,
  onDraft,
  onClear,
}: {
  date: string;
  returnTo?: string;
  state: AppState;
  onSave: Save;
  navigate: (route: string) => void;
  draft?: Day;
  onDraft: (day: Day) => void;
  onClear: () => boolean;
}) {
  const record = state.days.find((item) => item.date === date);
  const [chosenDate, setChosenDate] = useState(date);
  const [value, setValue] = useState<Day>(
    () =>
      draft ??
      record ?? {
        date,
        ratings: blankRatings(),
        sleepHours: "",
        sleepMinutes: "",
        note: "",
      },
  );
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [pendingCompletion, setPendingCompletion] = useState<
    "saved" | "deleted" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationId = useId();
  useEffect(() => {
    if (confirmDelete) cancelDeleteRef.current?.focus();
  }, [confirmDelete]);
  const showError = (message: string) => {
    setError(message);
    requestAnimationFrame(() => {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: "center" });
    });
  };
  const update = (patch: Partial<Day>) => {
    const next = { ...value, ...patch };
    setValue(next);
    onDraft(next);
    setError("");
  };
  function finish(action: "saved" | "deleted") {
    if (onClear()) navigate(returnTo);
    else setPendingCompletion(action);
  }
  function cancelDelete() {
    setConfirmDelete(false);
    requestAnimationFrame(() => deleteButtonRef.current?.focus());
  }
  if (!validCalendarDate(date)) return <Missing navigate={navigate} />;
  if (pendingCompletion)
    return (
      <FinishSaved
        removed={pendingCompletion === "deleted"}
        onRetry={() => finish(pendingCompletion)}
      />
    );
  return (
    <div className="dp-form-page">
      <button
        className="dp-text-button dp-back"
        onClick={() => navigate(returnTo)}
      >
        <ArrowLeft size={17} />
        {returnTo === "/history"
          ? "Terug naar Terugkijken"
          : "Terug naar Vandaag"}
      </button>
      <PageTitle
        kicker={dateText(date, true)}
        title="Mijn hele dag"
        description="Een terugblik op de dag als geheel. Je losse check-ins blijven aparte momenten."
      />
      <form
        className="dp-card dp-day-choice"
        onSubmit={(event) => {
          event.preventDefault();
          if (!validCalendarDate(chosenDate)) {
            showError("Kies een geldige datum tussen 1900 en 2199.");
            return;
          }
          navigate(
            `/day/${chosenDate}${returnTo === "/history" ? "?returnTo=history" : ""}`,
          );
        }}
      >
        <label className="dp-field">
          Dag kiezen
          <input
            type="date"
            required
            min="1900-01-01"
            max="2199-12-31"
            value={chosenDate}
            onChange={(event) => setChosenDate(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={chosenDate === date}>
          Dag openen
        </Button>
        <p className="dp-hint">
          Ook een eerdere dag. Een bestaand dagoverzicht wordt geopend.
          Niet-opgeslagen invoer blijft als concept bewaard.
        </p>
      </form>
      <form
        onInvalidCapture={revealInvalidField}
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          if (
            !hasRating(value.ratings) &&
            !value.note.trim() &&
            !value.sleepHours &&
            !value.sleepMinutes
          ) {
            showError("Vul iets in om je dagoverzicht op te slaan.");
            return;
          }
          if (value.sleepHours === "24" && Number(value.sleepMinutes) > 0) {
            showError("Een slaapduur kan maximaal 24 uur zijn.");
            return;
          }
          if (
            onSave(
              {
                ...state,
                days: [
                  ...state.days.filter((item) => item.date !== date),
                  { ...value, ratings: cleanRatings(value.ratings) },
                ],
              },
              "Je dagoverzicht is opgeslagen op dit apparaat.",
            )
          ) {
            setError("");
            finish("saved");
          } else
            showError(
              "Opslaan is niet gelukt. Je dagoverzicht staat hier nog. Probeer het opnieuw.",
            );
        }}
      >
        <section className="dp-card dp-form-section">
          <h2>Hoe voelde deze dag?</h2>
          <RatingsEditor
            day
            value={value.ratings}
            savedValue={record?.ratings}
            onChange={(ratings) => update({ ratings })}
          />
        </section>
        <section className="dp-card dp-form-section">
          <span className="dp-round-icon">
            <Moon size={22} />
          </span>
          <h2>Je slaap</h2>
          <p>
            Hoeveel sliep je in de nacht vóór deze dag? Laat leeg als je het
            niet weet.
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
        <section className="dp-card dp-form-section">
          <label className="dp-field">
            Wat wil je onthouden van deze dag?
            <textarea
              rows={4}
              maxLength={4000}
              value={value.note}
              onChange={(e) => update({ note: e.target.value })}
            />
          </label>
        </section>
        {error && (
          <p className="dp-error" role="alert" tabIndex={-1} ref={errorRef}>
            {error}
          </p>
        )}
        <div className="dp-form-actions">
          <Button primary type="submit">
            Dagoverzicht opslaan
            <Check size={18} />
          </Button>
        </div>
      </form>
      {record && (
        <section
          className="dp-delete-area"
          aria-label="Dagoverzicht verwijderen"
        >
          {confirmDelete ? (
            <div
              className="dp-inline-confirm"
              role="alertdialog"
              aria-labelledby={`${confirmationId}-title`}
              aria-describedby={`${confirmationId}-description`}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelDelete();
                }
              }}
            >
              <h2 id={`${confirmationId}-title`}>
                Dit dagoverzicht verwijderen?
              </h2>
              <p id={`${confirmationId}-description`}>
                Je verwijdert het dagoverzicht van {dateText(date, true)} en
                eventuele niet-opgeslagen wijzigingen van dit dagoverzicht. Je
                losse check-ins, cravings en kleine momenten blijven bewaard. Je
                kunt dit niet ongedaan maken.
              </p>
              <div className="dp-actions">
                <button
                  type="button"
                  className="dp-button"
                  ref={cancelDeleteRef}
                  onClick={cancelDelete}
                >
                  Behouden
                </button>
                <Button
                  onClick={() => {
                    setError("");
                    if (
                      onSave(
                        {
                          ...state,
                          days: state.days.filter((item) => item.date !== date),
                        },
                        "Dagoverzicht verwijderd.",
                      )
                    ) {
                      finish("deleted");
                    } else
                      showError(
                        "Verwijderen is niet gelukt. Je dagoverzicht en wijzigingen blijven bewaard.",
                      );
                  }}
                >
                  Ja, verwijderen
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="dp-text-button"
              ref={deleteButtonRef}
              onClick={() => setConfirmDelete(true)}
            >
              Dagoverzicht verwijderen
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function ExerciseView({
  moment,
  onBack,
  navigate,
  fromSupport = false,
}: {
  moment?: Moment;
  onBack: (id?: string) => void;
  navigate: (path: string) => void;
  fromSupport?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 0) return;
    stepHeadingRef.current?.focus({ preventScroll: true });
    stepHeadingRef.current?.scrollIntoView({
      block: "center",
      behavior: "auto",
    });
  }, [step]);
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
        <section className="dp-card dp-exercise-card">
          <div className="dp-exercise-progress" aria-hidden="true">
            {steps.map((item, i) => (
              <span key={item.number} className={i <= step ? "active" : ""} />
            ))}
          </div>
          <p className="dp-hint">Stap {step + 1} van 5</p>
          <div className="dp-exercise-number" aria-hidden="true">
            {current.number}
          </div>
          <h2 ref={stepHeadingRef} tabIndex={-1}>
            Noem {current.number} {current.sense}
          </h2>
          <p>{current.prompt}</p>
          <label className="dp-field">
            Wat merk je op?{" "}
            <span className="dp-hint">
              Optioneel. Alleen voor deze stap; bij doorgaan of overslaan wordt
              deze tekst gewist. De notitie komt niet in je dagboek.
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
        </section>
      ) : (
        <div className="dp-card dp-exercise-done">
          <span className="dp-round-icon">
            <Leaf size={27} />
          </span>
          <h2 ref={stepHeadingRef} tabIndex={-1}>
            Neem even de tijd.
          </h2>
          <p>
            Je hoeft je niet anders te voelen. Als je wilt, kun je nu vastleggen
            hoe het met je gaat.
          </p>
          <div className="dp-actions">
            {moment ? (
              <Button primary onClick={() => onBack(moment.id)}>
                Terug naar mijn nameting
                <ArrowRight size={17} />
              </Button>
            ) : (
              <>
                <Button primary onClick={() => navigate("/moment/new")}>
                  Check-in na de oefening
                  <ArrowRight size={17} />
                </Button>
                <Button onClick={() => onBack()}>
                  {fromSupport
                    ? "Terug naar mijn houvast"
                    : "Terug naar hulpmiddelen"}
                </Button>
              </>
            )}
          </div>
          {!moment && (
            <p className="dp-hint">
              Je legt dan alleen vast hoe het nu gaat. Er wordt geen gevoel van
              vóór de oefening ingevuld.
            </p>
          )}
          <p className="dp-hint">
            Het openen of afronden van de oefening registreert niet automatisch
            dat je deze hebt geprobeerd.
          </p>
        </div>
      )}
    </div>
  );
}
