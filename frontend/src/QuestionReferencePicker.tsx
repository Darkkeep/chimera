import { useEffect, useId, useRef, useState } from "react";

export function QuestionReferencePicker({ label, singular, values, available, disabled, onChange }: {
  label: string;
  singular: string;
  values: string[];
  available: string[];
  disabled: boolean;
  onChange: (values: string[]) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const key = (value: string) => value.trim().toLowerCase();
  const known = new Map<string, string>();
  for (const value of available) if (!known.has(key(value))) known.set(key(value), value);
  const selected = new Set(values.map(key));
  const query = search.trim();
  const matches = [...known.values()].filter(value => !selected.has(key(value)) && key(value).includes(key(query))).sort((a, b) => a.localeCompare(b));
  const create = query.length > 0 && !known.has(key(query)) && !selected.has(key(query));
  const options = [...matches.map(value => ({ value, create: false })), ...(create ? [{ value: query, create: true }] : [])];
  const atLimit = values.length >= 50;
  useEffect(() => {
    if (open && active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function choose(value: string) {
    if (disabled || atLimit || selected.has(key(value))) return;
    onChange([...values, value]);
    setSearch("");
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  }
  return <fieldset disabled={disabled} className="question-reference-picker" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); }
  }}>
    <legend>{label}</legend>
    {values.length > 0 && <ul className="question-tag-list" aria-label={`Selected ${label.toLowerCase()}`}>
      {values.map(value => <li key={value}><span>{value}</span><button type="button" className="button button-outline" aria-label={`Remove ${singular} ${value}`} onClick={() => onChange(values.filter(existing => existing !== value))}>Remove</button></li>)}
    </ul>}
    <label htmlFor={id}>Search or create a {singular}</label>
    <div className="question-reference-input">
      <input id={id} ref={input} role="combobox" aria-autocomplete="list" aria-expanded={open && !disabled} aria-controls={`${id}-options`} aria-activedescendant={open && active >= 0 && active < options.length ? `${id}-option-${active}` : undefined}
        maxLength={200} value={search} placeholder={`Search project ${label.toLowerCase()}`} autoComplete="off"
        onFocus={() => setOpen(true)} onChange={event => { setSearch(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive(current => options.length ? (event.key === "ArrowDown" ? Math.min(current + 1, options.length - 1) : current <= 0 ? options.length - 1 : current - 1) : -1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (open && active >= 0 && options[active]) choose(options[active].value);
            else {
              const exact = known.get(key(query));
              if (exact || create) choose(exact ?? query);
            }
          } else if (event.key === "Escape" && open) {
            event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1);
          }
        }} />
      <button type="button" className="button button-outline" aria-label={`Toggle ${label.toLowerCase()} dropdown`} aria-expanded={open && !disabled} onClick={() => {
        if (open) { setOpen(false); setActive(-1); } else { input.current?.focus(); setOpen(true); }
      }}>Select</button>
    </div>
    {open && !disabled && <div className="question-reference-dropdown">
      <ul ref={list} id={`${id}-options`} role="listbox" aria-label={`Available ${label.toLowerCase()}`}>
        {options.map((option, index) => <li id={`${id}-option-${index}`} key={option.value} role="option" aria-selected={active === index} aria-disabled={atLimit}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(option.value)}>
          {option.create ? `Create ${singular} "${option.value}"` : option.value}
        </li>)}
      </ul>
      {!options.length && <p>No matching values. Type a new {singular} to create one.</p>}
    </div>}
    {atLimit && <p role="status">50 selected. Remove a {singular} before adding another.</p>}
  </fieldset>;
}
