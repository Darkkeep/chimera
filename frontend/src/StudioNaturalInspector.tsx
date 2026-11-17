import type { SceneElement, SceneLayout } from "./SceneSurface";
import { defaultAppearance } from "./scene-timeline";

/**
 * The first controls a Studio author sees are determined by their selection.
 * All edits call the existing SceneVisualEditor commit/update handlers; this
 * component does not own a competing draft, save path, or AI integration.
 */
export function StudioNaturalInspector({
  element, layout, title, onTitleChange, onChange, onStageChange, images, disabled,
}: {
  element: SceneElement | undefined;
  layout: SceneLayout;
  title: string;
  onTitleChange: (value: string) => void;
  onChange: (changes: Partial<SceneElement>) => void;
  onStageChange: (changes: Partial<SceneLayout>) => void;
  images: { id: string; filename: string }[];
  disabled: boolean;
}) {
  const locked = Boolean(element?.locked);
  const inactive = disabled || locked;
  const geometry: ("x" | "y" | "width" | "height")[] = ["x", "y", "width", "height"];
  return <section className="studio-natural-inspector" aria-label="Contextual properties">
    <div className="studio-natural-heading" aria-live="polite">
      <span className="studio-natural-kicker">{element ? `${element.kind.toUpperCase()} SELECTED` : "SCENE SELECTED"}</span>
      <strong>{element ? element.name || (element.kind === "text" ? element.text.slice(0, 36) || "Text layer" : element.kind === "image" ? "Image layer" : "Shape layer") : "Scene properties"}</strong>
      <p>{element ? locked ? "This object is locked. Unlock it in Layers to make changes." : "Changes appear on the canvas immediately. Save scene when finished." : "Select an element to edit it, or change the scene's basic settings here."}</p>
    </div>

    {!element ? <fieldset className="studio-natural-fields" disabled={disabled}>
      <label>Scene title
        <input aria-label="Studio scene title" value={title} maxLength={120} onChange={event => onTitleChange(event.target.value)} />
      </label>
      <label>Background color
        <input aria-label="Studio scene background color" type="color" value={layout.backgroundColor} onChange={event => onStageChange({ backgroundColor: event.target.value })} />
      </label>
      <p className="studio-natural-helper">Canvas size, background images, layers and timeline options remain available in the sections below.</p>
    </fieldset> : <fieldset className="studio-natural-fields" disabled={inactive}>
      {element.kind === "text" && <>
        <label>Text
          <textarea aria-label="Studio selected text" rows={3} maxLength={50000} value={element.text} onChange={event => onChange({ text: event.target.value })}/>
        </label>
        <div className="studio-natural-split">
          <label>Font size
            <input aria-label="Studio font size" type="number" min={1} max={500} value={element.fontSize} onChange={event => {const number=event.target.valueAsNumber; if(Number.isFinite(number) && number>=1 && number<=500) onChange({fontSize:number});}}/>
          </label>
          <label>Text color
            <input aria-label="Studio text color" type="color" value={element.color} onChange={event=>onChange({color:event.target.value})}/>
          </label>
        </div>
        <label>Typeface
          <select aria-label="Studio typeface" value={element.fontFamily} onChange={event=>onChange({fontFamily:event.target.value})}>
            {[...new Set([element.fontFamily,"sans-serif","serif","monospace","Manrope"])].map(font=><option value={font} key={font}>{font}</option>)}
          </select>
        </label>
        <div className="studio-natural-format" role="group" aria-label="Text formatting">
          <button type="button" aria-label="Studio bold" aria-pressed={element.bold} onClick={()=>onChange({bold:!element.bold})}><b>B</b></button>
          <button type="button" aria-label="Studio italic" aria-pressed={element.italic} onClick={()=>onChange({italic:!element.italic})}><i>I</i></button>
          <select aria-label="Studio alignment" value={element.align} onChange={event=>onChange({align:event.target.value as SceneElement["align"]})}>
            <option value="left">Align left</option><option value="center">Center</option><option value="right">Align right</option>
          </select>
        </div>
      </>}
      {element.kind === "image" && <>
        <label>Image
          <select aria-label="Studio selected image" value={element.assetId || ""} onChange={event=>onChange({assetId:event.target.value || null})}>
            <option value="">Choose image</option>
            {images.map(asset=><option value={asset.id} key={asset.id}>{asset.filename}</option>)}
          </select>
        </label>
        <p className="studio-natural-helper">Drag handles to crop or resize using the existing canvas tools. Alternative text is managed in the scene's media/accessibility settings.</p>
      </>}
      {element.kind === "shape" && <>
        <label>Shape fill
          <input aria-label="Studio shape fill" type="color" value={element.appearance?.fill || "#168da8"} onChange={event=>onChange({appearance:{...(element.appearance || defaultAppearance()),fill:event.target.value}})}/>
        </label>
        <p className="studio-natural-helper">Stroke, shadows and effects are available in Appearance below.</p>
      </>}
      <div className="studio-natural-divider">Position and size</div>
      <div className="studio-natural-geometry">
        {geometry.map(field=><label key={field}>{field.toUpperCase()}
          <input type="number" aria-label={`Studio ${field}`} value={Math.round(element[field]*100)/100}
            min={field==="width"||field==="height"?20:-10000}
            max={10000}
            onChange={event=>{const number=event.target.valueAsNumber;if(Number.isFinite(number)&&Math.abs(number)<=10000&&((field!=="width"&&field!=="height")||number>=20))onChange({[field]:number});}}/>
        </label>)}
      </div>
      <p className="studio-natural-helper">For rotation, appearance, animation and precise layer order, expand an advanced section below.</p>
    </fieldset>}
  </section>;
}
