"use client";

import {
  Contrast,
  Minus,
  Moon,
  Plus,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type DisplayTheme = "dark" | "pure-black" | "sepia" | "light";

type DisplaySettings = {
  theme: DisplayTheme;
  brightness: number;
  contrast: number;
  fontSize: number;
  warmth: number;
};

type DisplaySettingsContextValue = {
  settings: DisplaySettings;
  setSettings: (settings: DisplaySettings) => void;
};

const STORAGE_KEY = "fluentia-display-settings";
const DEFAULT_SETTINGS: DisplaySettings = {
  theme: "dark",
  brightness: 100,
  contrast: 100,
  fontSize: 100,
  warmth: 0,
};

const THEMES: { id: DisplayTheme; label: string; icon: typeof Moon }[] = [
  { id: "dark", label: "Dark", icon: Moon },
  { id: "pure-black", label: "Pure black", icon: Contrast },
  { id: "sepia", label: "Sepia", icon: Sparkles },
  { id: "light", label: "Light", icon: Sun },
];

const DisplaySettingsContext = createContext<DisplaySettingsContextValue | null>(null);

function isDisplaySettings(value: unknown): value is DisplaySettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DisplaySettings>;
  return (
    THEMES.some(({ id }) => id === candidate.theme) &&
    typeof candidate.brightness === "number" &&
    typeof candidate.contrast === "number" &&
    typeof candidate.fontSize === "number" &&
    typeof candidate.warmth === "number"
  );
}

export function useDisplaySettings() {
  const context = useContext(DisplaySettingsContext);
  if (!context) throw new Error("useDisplaySettings must be used within DisplaySettingsProvider");
  return context;
}

export function DisplaySettingsControl() {
  const { settings, setSettings } = useDisplaySettings();
  const [open, setOpen] = useState(false);
  const customizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !customizerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={customizerRef} className="display-customizer">
      {open && (
        <section className="display-customizer-panel" aria-label="Display and appearance settings">
          <header className="display-customizer-header">
            <div>
              <p className="display-customizer-eyebrow">FLUENTIA</p>
              <h2>Display &amp; appearance</h2>
            </div>
            <div className="display-customizer-actions">
              <button
                className="display-customizer-reset"
                type="button"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
                aria-label="Reset display settings to defaults"
              >
                <RotateCw size={14} />
                <span>Reset</span>
              </button>
              <button
                className="display-customizer-close"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close display settings"
              >
                <SlidersHorizontal size={17} />
              </button>
            </div>
          </header>

          <fieldset className="display-theme-options">
            <legend>Theme</legend>
            <div className="display-theme-grid">
              {THEMES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`display-theme-option${settings.theme === id ? " is-selected" : ""}`}
                  aria-pressed={settings.theme === id}
                  onClick={() => setSettings({ ...settings, theme: id })}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="display-range-group">
            <label htmlFor="display-brightness">
              <Sun size={15} />
              <span>Brightness</span>
              <output>{settings.brightness}%</output>
            </label>
            <input
              id="display-brightness"
              type="range"
              min="70"
              max="120"
              value={settings.brightness}
              onChange={(event) => setSettings({ ...settings, brightness: Number(event.target.value) })}
            />
          </div>

          <div className="display-range-group">
            <label htmlFor="display-contrast">
              <Contrast size={15} />
              <span>Contrast</span>
              <output>{settings.contrast}%</output>
            </label>
            <input
              id="display-contrast"
              type="range"
              min="70"
              max="120"
              value={settings.contrast}
              onChange={(event) => setSettings({ ...settings, contrast: Number(event.target.value) })}
            />
          </div>

          <div className="display-range-group">
            <label htmlFor="display-warmth">
              <Sparkles size={15} />
              <span>Warmth</span>
              <output>{settings.warmth}%</output>
            </label>
            <input
              id="display-warmth"
              type="range"
              min="0"
              max="50"
              value={settings.warmth}
              onChange={(event) => setSettings({ ...settings, warmth: Number(event.target.value) })}
            />
          </div>

          <div className="display-font-size">
            <div className="display-font-label">
              <span>Reading text</span>
              <output>{settings.fontSize}%</output>
            </div>
            <div className="display-font-controls">
              <button
                type="button"
                aria-label="Decrease reading text size"
                disabled={settings.fontSize <= 80}
                onClick={() => setSettings({ ...settings, fontSize: Math.max(80, settings.fontSize - 5) })}
              >
                <Minus size={16} />
              </button>
              <div className="display-font-meter" aria-hidden="true">
                <span style={{ width: `${((settings.fontSize - 80) / 60) * 100}%` }} />
              </div>
              <button
                type="button"
                aria-label="Increase reading text size"
                disabled={settings.fontSize >= 140}
                onClick={() => setSettings({ ...settings, fontSize: Math.min(140, settings.fontSize + 5) })}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        className={`display-customizer-trigger${open ? " is-open" : ""}`}
        aria-label={open ? "Close display settings" : "Open display settings"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={16} />
      </button>
    </div>
  );
}

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<DisplaySettings>(DEFAULT_SETTINGS);
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isDisplaySettings(parsed)) setSettingsState(parsed);
      }
    } catch {
      // Ignore unavailable storage and malformed saved settings.
    } finally {
      setStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.displayTheme = settings.theme;
    root.dataset.fontScaleActive = String(settings.fontSize !== 100);
    root.classList.toggle("light", settings.theme === "light");
    root.style.setProperty("--display-brightness", String(settings.brightness / 100));
    root.style.setProperty("--display-contrast", String(settings.contrast / 100));
    root.style.setProperty("--display-font-scale", String(settings.fontSize / 100));
    root.style.setProperty("--display-warmth", String(settings.warmth / 100));

    if (storageLoaded) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // The customizer remains usable when storage is unavailable.
      }
    }
  }, [settings, storageLoaded]);

  const setSettings = (nextSettings: DisplaySettings) => setSettingsState(nextSettings);
  const customFilter =
    settings.brightness === 100 && settings.contrast === 100 && settings.warmth === 0 && settings.theme !== "sepia"
      ? "none"
      : `brightness(${settings.brightness / 100}) contrast(${settings.contrast / 100}) sepia(${(settings.warmth / 100) * 0.5 + (settings.theme === "sepia" ? 0.35 : 0)})`;
  const contentStyle = { "--display-filter": customFilter } as CSSProperties;

  return (
    <DisplaySettingsContext.Provider value={{ settings, setSettings }}>
      <div id="fluentia-display-content" style={contentStyle}>
        {children}
      </div>
    </DisplaySettingsContext.Provider>
  );
}