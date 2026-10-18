import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Goes back one step; falls back to the home page when there is no history.
export default function BackButton({ label = "Back", className = "" }) {
  const navigate = useNavigate();
  const go = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));
  return (
    <button type="button" onClick={go} className={`inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors ${className}`}>
      <ArrowLeft className="w-4 h-4" /> {label}
    </button>
  );
}