import { useLayoutEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { parseLocations, serializeLocations } from "../../lib/locations";

export default function LocationEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [entry, setEntry] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const locations = parseLocations(value);

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
  }

  function add() {
    const next = serializeLocations([...locations, ...parseLocations(entry)]);
    if (next !== value) onChange(next);
    close();
  }

  return <div className="field location-field">
    <span className="field-label">Locations</span>
    <div className="location-editor">
      {locations.map((location) => <span className="location-chip" key={location}>
        <span>{location}</span>
        <button type="button" aria-label={`Remove ${location}`} onClick={() => onChange(serializeLocations(locations.filter((item) => item !== location)))}>
          <X size={13} aria-hidden="true" /></button>
      </span>)}
      {adding ? <div className="location-add-input">
        <input ref={inputRef} aria-label="New location" value={entry} maxLength={500}
          placeholder="City, state or Remote" onChange={(event) => setEntry(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") { event.preventDefault(); if (entry.trim()) add(); }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
          }} />
        <button type="button" aria-label="Add location" disabled={!entry.trim()} onClick={add}><Plus size={16} /></button>
        <button type="button" aria-label="Cancel adding location" onClick={close}><X size={16} /></button>
      </div> : <button ref={addButtonRef} className="location-add" type="button" aria-label="Add location"
        onClick={() => setAdding(true)}><Plus size={15} aria-hidden="true" /> Add location</button>}
    </div>
    {!locations.length && !adding && <small>Add each location listed in the posting, if any.</small>}
  </div>;
}
