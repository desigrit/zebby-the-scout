import { useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { Resume } from "../../lib/application-types";

export default function ResumePicker({ resumes, value, file, onSelect, onFile, disabled = false }: {
  resumes: Resume[]; value: string; file: File | null; onSelect: (id: string) => void;
  onFile: (file: File | null) => void; disabled?: boolean;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return <div className="field resume-field">
    <label htmlFor={id}>Resume</label>
    <select id={id} value={file ? "" : value} disabled={disabled || !resumes.length}
      onChange={(event) => { setError(""); onFile(null); if (input.current) input.current.value = ""; onSelect(event.target.value); }}>
      <option value="">{file ? "New resume selected" : "Choose a saved resume"}</option>
      {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.filename}</option>)}
    </select>
    <button className={`upload-control${error ? " has-error" : ""}`} type="button" disabled={disabled} aria-describedby={error ? `${id}-error` : undefined} onClick={() => input.current?.click()}>
      <Upload size={17} aria-hidden="true" /><span>{file ? file.name : "Upload resume"}</span>
      {file && <small>Replace</small>}
    </button>
    <input ref={input} className="visually-hidden" tabIndex={-1} aria-hidden="true" type="file"
      accept=".pdf,.docx,.doc" disabled={disabled} onChange={(event) => {
        const selected = event.target.files?.[0] || null;
        if (selected) {
          const problem = !selected.size ? "This file is empty. Choose another resume." : selected.size > 10 * 1024 * 1024
            ? "Choose a resume under 10 MB." : !/\.(pdf|docx?)$/i.test(selected.name) ? "Choose a PDF or Word file." : "";
          setError(problem);
          if (!problem) { onSelect(""); onFile(selected); }
        }
        event.target.value = "";
      }} />
    {error && <span id={`${id}-error`} className="field-validation" role="alert">{error}</span>}
    <small>PDF or Word · Up to 10 MB</small>
  </div>;
}
