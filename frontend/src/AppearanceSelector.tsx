import { useEffect, useLayoutEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Appearance = "light" | "dark" | "system";
const storageKey = "chimera.appearance";
const systemQuery = "(prefers-color-scheme: dark)";
const normalize = (value: string | null): Appearance => value === "light" || value === "dark" || value === "system" ? value : "dark";

function readAppearance(): Appearance {
  try { return normalize(window.localStorage.getItem(storageKey)); }
  catch { return "dark"; }
}

function applyAppearance(preference: Appearance) {
  const resolved = preference === "system" ? (window.matchMedia(systemQuery).matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
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
      {([{ value: "light", label: "Light", Icon: Sun }, { value: "dark", label: "Dark", Icon: Moon }, { value: "system", label: "System", Icon: Monitor }] as const).map(({ value, label, Icon }) =>
        <label key={value} className={preference === value ? "is-active" : ""}>
          <input type="radio" name="appearance" value={value} checked={preference === value} onChange={() => {
            setPreference(value);
            try { window.localStorage.setItem(storageKey, value); } catch { /* Still usable when browser storage is unavailable. */ }
          }} />
          <Icon size={15} aria-hidden="true" /><span>{label}</span>
        </label>,
      )}
    </div>
  </fieldset>;
}
