import pythiaIcon from "./assets/pythia-talk/pythia.png";

export function PythiaProcessing({ detail, title = "Pythia Processing" }: { detail: string; title?: string }) {
  return <div className="pythia-processing" role="status" aria-live="polite">
    <span className="pythia-processing-orb" aria-hidden="true"><img src={pythiaIcon} alt="" width={40} height={40} /></span>
    <div><strong>{title}</strong><p>{detail}</p></div>
    <span className="pythia-processing-dots" aria-hidden="true"><i /><i /><i /></span>
  </div>;
}
