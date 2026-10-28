import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ImageOff } from "lucide-react";
import type { Project } from "./App";
import "./background-image-picker.css";

type Props = {
  project: Project;
  value: string | null | undefined;
  onChange: (value: string | null | undefined) => void;
  label: string;
  allowInherit?: boolean;
  disabled?: boolean;
};

export function BackgroundImagePicker({ project, value, onChange, label, allowInherit = false, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const images = project.storyboard.assets.filter(asset => asset.kind === "image");
  const projectImage = images.find(asset => asset.id === project.storyboard.backgroundAsset);
  const choices = [
    ...(allowInherit ? [{ value: undefined, label: `Use project background (${projectImage?.filename || "None"})`, image: projectImage }] : []),
    { value: null, label: "None", image: undefined },
    ...[...images.filter(asset => asset.role === "background"), ...images.filter(asset => asset.role !== "background")]
      .map(image => ({ value: image.id, label: image.filename, image })),
  ];
  const selected = choices.find(choice => choice.value === value);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function thumbnail(image: typeof projectImage) {
    return image ? <img src={`/api/projects/${project.id}/assets/${image.id}`} alt="" /> : <ImageOff size={24} aria-hidden="true" />;
  }

  return <div className="background-image-picker" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); toggle.current?.focus();
    }
  }}>
    <span className="background-image-label" id={`${id}-label`}>{label}</span>
    <button ref={toggle} type="button" role="combobox" aria-labelledby={`${id}-label`} aria-describedby={`${id}-value`} aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={`${id}-options`} disabled={disabled} className="background-image-toggle" onClick={() => setOpen(value => !value)} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
    }}>
      {thumbnail(selected?.image)}<span id={`${id}-value`}>{selected?.label || "Unavailable image"}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && !disabled && <div ref={list} id={`${id}-options`} className="background-image-options" role="listbox" aria-labelledby={`${id}-label`} onKeyDown={event => {
      const options = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || [])];
      const index = options.findIndex(option => option === document.activeElement);
      const next = event.key === "ArrowDown" ? (index + 1) % options.length : event.key === "ArrowUp" ? (index - 1 + options.length) % options.length : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : null;
      if (next !== null) { event.preventDefault(); options[next]?.focus(); }
    }}>
      {choices.map((choice, index) => <button type="button" role="option" aria-selected={choice.value === value} key={index} tabIndex={-1} onClick={() => {
        onChange(choice.value); setOpen(false); toggle.current?.focus();
      }}>{thumbnail(choice.image)}<span>{choice.label}{choice.image?.role === "background" && <small>PowerPoint master</small>}</span></button>)}
    </div>}
  </div>;
}
