import type { SceneElement } from "./SceneSurface";
import { defaultAppearance } from "./scene-timeline";
import type { Appearance } from "./scene-timeline";

export function ElementAppearanceControls({
  element,
  onChange,
  disabled,
}: {
  element: SceneElement;
  onChange: (changes: Partial<SceneElement>) => void;
  disabled: boolean;
}) {
  const value = element.appearance || defaultAppearance();
  const change = (patch: Partial<Appearance>) =>
    onChange({ appearance: { ...value, ...patch } });
  return (
    <fieldset disabled={disabled}>
      <label className="timeline-checkbox">
        <input
          type="checkbox"
          checked={element.aspectLocked ?? element.kind === "text"}
          onChange={(event) => onChange({ aspectLocked: event.target.checked })}
        />
        Lock aspect ratio
      </label>
      <label>
        Layer name
        <input
          aria-label="Layer name"
          maxLength={200}
          value={element.name || ""}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <label>
        Object opacity (%)
        <input
          aria-label="Object opacity (%)"
          type="number"
          min={0}
          max={100}
          value={Math.round(value.opacity * 100)}
          onChange={(event) => {
            const n = event.target.valueAsNumber;
            if (n >= 0 && n <= 100) change({ opacity: n / 100 });
          }}
        />
      </label>
      {element.kind === "text" && (
        <label>
          Text color opacity (%)
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(value.fillOpacity * 100)}
            onChange={(event) => {
              const n = event.target.valueAsNumber;
              if (n >= 0 && n <= 100) change({ fillOpacity: n / 100 });
            }}
          />
        </label>
      )}
      {element.nativeShape && (
        <>
          <label>
            Shape
            <select
              aria-label="Shape geometry"
              value={element.nativeShape}
              onChange={(event) =>
                onChange({
                  nativeShape: event.target
                    .value as SceneElement["nativeShape"],
                })
              }
            >
              {[
                "rectangle",
                "rounded-rectangle",
                "ellipse",
                "line",
                "arrow",
                "triangle",
                "diamond",
              ].map((shape) => (
                <option key={shape}>{shape}</option>
              ))}
            </select>
          </label>
          {(["fill", "stroke"] as const).map((field) => (
            <div key={field} className="visual-numbers">
              <label>
                {field === "fill" ? "Fill color" : "Outline color"}
                <input
                  aria-label={`${field} color`}
                  type="color"
                  value={value[field]}
                  onChange={(event) => change({ [field]: event.target.value })}
                />
              </label>
              <label>
                {field} opacity (%)
                <input
                  aria-label={`${field} opacity (%)`}
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(value[`${field}Opacity`] * 100)}
                  onChange={(event) => {
                    const n = event.target.valueAsNumber;
                    if (n >= 0 && n <= 100)
                      change({ [`${field}Opacity`]: n / 100 });
                  }}
                />
              </label>
            </div>
          ))}
          <label>
            Outline width
            <input
              type="number"
              min={0}
              max={50}
              value={value.strokeWidth}
              onChange={(event) => {
                const n = event.target.valueAsNumber;
                if (n >= 0 && n <= 50) change({ strokeWidth: n });
              }}
            />
          </label>
          {element.nativeShape === "rounded-rectangle" && (
            <label>
              Corner radius
              <input
                type="number"
                min={0}
                max={500}
                value={value.cornerRadius}
                onChange={(event) => {
                  const n = event.target.valueAsNumber;
                  if (n >= 0 && n <= 500) change({ cornerRadius: n });
                }}
              />
            </label>
          )}
        </>
      )}
      {(["shadow", "bevel", "emboss"] as const).map((key) => (
        <details key={key} className="visual-effect">
          <summary>
            {key === "shadow"
              ? "Drop shadow"
              : key === "bevel"
                ? "Bevel"
                : "Emboss"}
          </summary>
          <label className="timeline-checkbox">
            <input
              type="checkbox"
              checked={value[key].enabled}
              onChange={(event) =>
                change({
                  [key]: { ...value[key], enabled: event.target.checked },
                })
              }
            />
            Enabled
          </label>
          <label>
            Shadow color
            <input
              type="color"
              value={value[key].color}
              onChange={(event) =>
                change({ [key]: { ...value[key], color: event.target.value } })
              }
            />
          </label>
          <div className="visual-numbers">
            {(["opacity", "size", "blur", "angle"] as const).map((field) => (
              <label key={field}>
                {field}
                {field === "opacity" ? " (%)" : ""}
                <input
                  aria-label={`${key} ${field}`}
                  type="number"
                  min={field === "angle" ? -360 : 0}
                  max={field === "angle" ? 360 : field === "opacity" ? 100 : 64}
                  step={1}
                  value={
                    field === "opacity"
                      ? Math.round(value[key][field] * 100)
                      : value[key][field]
                  }
                  onChange={(event) => {
                    const n = event.target.valueAsNumber;
                    const max =
                      field === "angle" ? 360 : field === "opacity" ? 100 : 64;
                    if (
                      Number.isFinite(n) &&
                      n >= (field === "angle" ? -360 : 0) &&
                      n <= max
                    )
                      change({
                        [key]: {
                          ...value[key],
                          [field]: field === "opacity" ? n / 100 : n,
                        },
                      });
                  }}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="button button-outline"
            onClick={() => change({ [key]: defaultAppearance()[key] })}
          >
            Reset {key}
          </button>
        </details>
      ))}
      {(element.kind === "text" || element.kind === "shape") && (
        <p className="field-hint">
          Bevel and emboss approximate raised/recessed edges with silhouette
          lighting. Imported PowerPoint geometry retains its original fill.
        </p>
      )}
    </fieldset>
  );
}
