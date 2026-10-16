import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { parseLocations, serializeLocations } from "../../lib/locations";

export default function LocationEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [entry, setEntry] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [popup, setPopup] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const locations = parseLocations(value);
  const listId = useId();
  const selected = new Set(locations.map((location) => location.toLocaleLowerCase()));
  const suggestions = recents.filter((location) => !selected.has(location.toLocaleLowerCase()) &&
    location.toLocaleLowerCase().includes(entry.trim().toLocaleLowerCase()));
  const expanded = adding && suggestions.length > 0 && popup !== null;

  useEffect(() => {
    if (!adding) return;
    const controller = new AbortController();
    void fetch("/api/locations/recent", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data: { locations?: unknown } = await response.json();
        if (!controller.signal.aborted && Array.isArray(data.locations)) {
          setRecents(parseLocations(data.locations.filter((location): location is string => typeof location === "string").join("; ")));
        }
      }).catch(() => { /* Recent suggestions are optional; manual entry stays available. */ });
    return () => controller.abort();
  }, [adding]);

  useLayoutEffect(() => {
    if (!adding || !suggestions.length) return;
    function position() {
      const bounds = inputRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const scrollPane = inputRef.current?.closest(".plan-document-scroll")?.getBoundingClientRect();
      if (bounds.bottom < (scrollPane?.top ?? 0) || bounds.top > (scrollPane?.bottom ?? window.innerHeight)) {
        setPopup(null); return;
      }
      const width = Math.min(Math.max(bounds.width, 240), 400, window.innerWidth - 24);
      const below = window.innerHeight - bounds.bottom - 12;
      const above = bounds.top - 12;
      const upwards = below < 210 && above > below;
      setPopup({ left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)), width,
        ...(upwards ? { bottom: window.innerHeight - bounds.top + 6 } : { top: bounds.bottom + 6 }),
        maxHeight: Math.max(0, Math.min(252, (upwards ? above : below) - 6)) });
    }
    position();
    const observer = new ResizeObserver(position);
    if (inputRef.current) observer.observe(inputRef.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [adding, suggestions.length]);

  useEffect(() => {
    if (!adding) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !fieldRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) {
        setAdding(false); setEntry(""); setActiveIndex(-1); setPopup(null);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [adding]);

  useLayoutEffect(() => {
    if (activeIndex >= 0) popupRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useLayoutEffect(() => {
    if (adding) inputRef.current?.focus({ preventScroll: true });
    else if (restoreFocus.current) {
      addButtonRef.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [adding]);

  function close() {
    restoreFocus.current = true;
    setEntry("");
    setAdding(false);
    setActiveIndex(-1);
    setPopup(null);
  }

  function add(location = entry) {
    if (inputRef.current?.matches(":disabled")) return;
    const next = serializeLocations([...locations, ...parseLocations(location)]);
    if (next !== value) onChange(next);
    close();
  }

  return <div className="field location-field" ref={fieldRef} onBlur={(event) => {
    if (adding && !event.currentTarget.contains(event.relatedTarget)) {
      setAdding(false); setEntry(""); setActiveIndex(-1); setPopup(null);
    }
  }}>
    <span className="field-label">Locations</span>
    <div className="location-editor">
      {locations.map((location) => <span className="location-chip" key={location}>
        <span>{location}</span>
        <button type="button" aria-label={`Remove ${location}`} onClick={() => onChange(serializeLocations(locations.filter((item) => item !== location)))}>
          <X size={13} aria-hidden="true" /></button>
      </span>)}
      {adding ? <div className="location-add-input">
        <input ref={inputRef} aria-label="New location" value={entry} maxLength={500} autoComplete="off"
          role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
          aria-activedescendant={expanded && activeIndex >= 0 && activeIndex < suggestions.length ? `${listId}-${activeIndex}` : undefined}
          placeholder="City, state or Remote" onChange={(event) => { setEntry(event.target.value); setActiveIndex(-1); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
              event.preventDefault();
              setActiveIndex((index) => event.key === "ArrowDown" ? (index + 1) % suggestions.length :
                (index <= 0 ? suggestions.length - 1 : index - 1));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (activeIndex >= 0 && suggestions[activeIndex]) add(suggestions[activeIndex]);
              else if (entry.trim()) add();
            }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
          }} />
        <button type="button" aria-label="Add location" disabled={!entry.trim()} onClick={() => add()}><Plus size={16} /></button>
        <button type="button" aria-label="Cancel adding location" onClick={close}><X size={16} /></button>
      </div> : <button ref={addButtonRef} className="location-add" type="button" aria-label="Add location"
        onClick={() => { setRecents([]); setAdding(true); }}><Plus size={15} aria-hidden="true" /> Add location</button>}
    </div>
    {expanded && createPortal(<div className="location-recents" ref={popupRef} style={popup || undefined}>
      <div className="location-recents-heading" id={`${listId}-label`}>Recents</div>
      <div className="location-recents-list" id={listId} role="listbox" aria-labelledby={`${listId}-label`}>
        {suggestions.map((location, index) => <button type="button" tabIndex={-1} key={location} id={`${listId}-${index}`} role="option"
          aria-selected={activeIndex === index} data-index={index} className="location-recent-option"
          onPointerMove={() => setActiveIndex(index)} onPointerDown={(event) => event.preventDefault()}
          onClick={() => add(location)}>{location}</button>)}
      </div>
    </div>, document.body)}
  </div>;
}
