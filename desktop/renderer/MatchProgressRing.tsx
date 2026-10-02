export default function MatchProgressRing({ label = "Analyzing resume match" }: { label?: string }) {
  return <span className="match-progress" role="status" aria-label={label}>
    <svg className="match-progress-ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="match-progress-track" cx="12" cy="12" r="9" />
      <circle className="match-progress-arc" cx="12" cy="12" r="9" />
    </svg>
  </span>;
}
