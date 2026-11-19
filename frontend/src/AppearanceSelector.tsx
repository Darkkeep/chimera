import { useEffect, useLayoutEffect, useState } from "react";
import { Monitor, Moon, Sun, Palette } from "lucide-react";

type Appearance = "purple" | "light" | "dark" | "system";
const storageKey = "chimera.appearance";
const systemQuery = "(prefers-color-scheme: dark)";
const normalize = (value: string | null): Appearance => value === "purple" || value === "light" || value === "dark" || value === "system" ? value : "purple";

function readAppearance(): Appearance {
  try { return normalize(window.localStorage.getItem(storageKey)); }
  catch { return "purple"; }
}

function applyAppearance(preference: Appearance) {
  const resolved = preference === "system" ? (window.matchMedia(systemQuery).matches ? "dark" : "light") : preference;
  document.documentElement.dataset.appearance = resolved;
  document.documentElement.dataset.theme = resolved === "light" ? "light" : "dark";
  document.documentElement.style.colorScheme = resolved === "light" ? "light" : "dark";
}

// Called before React renders to avoid showing the wrong theme on startup.
export function initializeAppearance() { applyAppearance(readAppearance()); }

export function AppearanceSelector() {
  const [preference, setPreference] = useState<Appearance>(readAppearance);

  useLayoutEffect(() => { applyAppearance(preference); }, [preference]);
  useEffect(() => {
    const media = window.matchMedia(systemQuery);
    const onSystemChange = () => applyAppearance(preference);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setPreference(readAppearance());
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [preference]);

  return <fieldset data-onboarding="workspace.appearance" className="appearance-selector">
    <legend>Appearance</legend>
    <div className="appearance-options">
      {([{ value: "purple", label: "DARKROGUE", description: "Purple · Chimera 2.0 default", Icon: Palette }, { value: "dark", label: "Classic Dark", description: "Charcoal · Classic Chimera", Icon: Moon }, { value: "light", label: "Light Temple", description: "Ivory & blue · Manteion", Icon: Sun }, { value: "system", label: "System", description: "Follow device appearance", Icon: Monitor }] as const).map(({ value, label, description, Icon }) =>
        <label key={value} className={preference === value ? "is-active" : ""}>
          <input type="radio" name="appearance" aria-label={label} value={value} checked={preference === value} onChange={() => {
            setPreference(value);
            try { window.localStorage.setItem(storageKey, value); } catch { /* Still usable when browser storage is unavailable. */ }
          }} />
          <Icon size={15} aria-hidden="true" /><span className="appearance-option-copy"><strong>{label}</strong><small>{description}</small></span>
        </label>,
      )}
    </div>
  </fieldset>;
}
