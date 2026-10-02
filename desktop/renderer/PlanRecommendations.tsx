import { useEffect, useRef, useState } from "react";
import { Check, Copy, Plus, X } from "lucide-react";

export default function PlanRecommendations({ kind, values, importance, busy, onChange }: {
  kind: "keywords" | "themes"; values: string[]; importance: Array<number | null>;
  busy: boolean; onChange: (values: string[]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const focusNewRow = useRef(false);
  const [copied, setCopied] = useState<{ index: number; text: string } | null>(null);
  const [copyError, setCopyError] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyword = kind === "keywords";
  const noun = keyword ? "keyword" : "theme";
  const count = values.filter((value) => value.trim()).length;
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  async function copy(text: string, index: number) {
    setCopied(null); setCopyError(""); clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ index, text });
      copyTimer.current = setTimeout(() => setCopied(null), 1800);
    } catch { setCopyError("Could not copy. Select the text and copy it."); }
  }

  useEffect(() => {
    if (!focusNewRow.current) return;
    focusNewRow.current = false;
    const fields = root.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    fields?.[fields.length - 1]?.focus();
  }, [values.length]);

  return <section className={`recommendations recommendations-${kind}`} aria-label={keyword ? "Core ATS keywords" : "Core resume themes"}>
    <div className="recommendations-head"><div><h4>{keyword ? "Core ATS keywords" : "Core resume themes"}</h4>
      <small>{count} {keyword ? "keywords" : "themes"}</small></div></div>
    <span className="visually-hidden" role="status">{copied ? `Copied ${noun} ${copied.index + 1}` : ""}</span>
    {copyError && <p className="form-error" role="alert">{copyError}</p>}
    <div className="recommendations-list" ref={root}>
      {values.length === 0 && <p className="recommendations-empty">Analyze to find {keyword ? "key terms" : "resume priorities"}.</p>}
      {values.map((text, index) => <div className="recommendation-row" key={index}>
        {keyword ? <input value={text} aria-label={`Core ATS keyword ${index + 1}`} placeholder="Keyword or phrase"
          maxLength={200} disabled={busy} onChange={(event) => onChange(values.map((value, i) => i === index ? event.target.value : value))} />
          : <textarea value={text} aria-label={`Core resume theme ${index + 1}`} placeholder="Experience a strong CV should demonstrate"
            rows={2} maxLength={1000} disabled={busy} onChange={(event) => onChange(values.map((value, i) => i === index ? event.target.value : value))} />}
        <span className={`recommendation-importance ${importance[index] == null ? "unrated" : ""}`}
          title={importance[index] == null ? "Refresh analysis to estimate this item's importance." : `Estimated importance to the job: ${importance[index]}%`}
          aria-label={importance[index] == null ? "Importance unrated" : `${importance[index]}% importance to the job`}>
          {importance[index] == null ? "Unrated" : `${importance[index]}%`}</span>
        <button className="recommendation-copy" type="button" disabled={busy || !text.trim()}
          aria-label={`Copy ${noun} ${index + 1}`} title={copied?.index === index && copied.text === text ? "Copied" : "Copy"}
          onClick={() => void copy(text, index)}>
          {copied?.index === index && copied.text === text ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}</button>
        <button className="recommendation-remove" type="button" disabled={busy} aria-label={`Remove ${noun} ${index + 1}`}
          title={`Remove ${noun}`} onClick={() => onChange(values.filter((_, i) => i !== index))}><X size={14} aria-hidden="true" /></button>
      </div>)}
    </div>
    <button className="recommendation-add" type="button" disabled={busy || values.length >= 100}
      onClick={() => { focusNewRow.current = true; onChange([...values, ""]); }}><Plus size={15} aria-hidden="true" /> Add {noun}</button>
  </section>;
}
