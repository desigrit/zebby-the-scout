import { useEffect, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import SettingsAction from "./SettingsAction";

export default function AnalysisGuide() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) { element.close(); opener.current?.focus({ preventScroll: true }); }
  }, [open]);
  return <>
    <button ref={opener} type="button" className="settings-link analysis-guide-link" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <CircleHelp size={13} aria-hidden="true" />Need help deciding?
    </button>
    <dialog ref={dialog} className="analysis-dialog analysis-guide-dialog" aria-labelledby="analysis-guide-title"
      onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)}>
      <header className="analysis-dialog-header"><h2 id="analysis-guide-title">Need help deciding?</h2>
        <SettingsAction className="analysis-dialog-close" icon={X} iconOnly aria-label="Close analysis guide" title="Close" onClick={() => setOpen(false)} />
      </header>
      <div className="analysis-dialog-body"><dl className="analysis-guide-options">
        <div><dt>Zebby credits</dt><dd>Buy a pack and choose an online model. No API key or signup needed.</dd></div>
        <div><dt>Local server</dt><dd>Ideal if you have your own GPU. Connect to Ollama and use the models you already run.</dd></div>
        <div><dt>Downloaded model</dt><dd>Ideal for offline use with your GPU or Apple Silicon. Zebby recommends models for your hardware and can also use your CPU.</dd></div>
        <div><dt>OpenAI / Claude API key</dt><dd>Use your own key. Usage is billed directly to your OpenAI or Anthropic account.</dd></div>
      </dl></div>
    </dialog>
  </>;
}
