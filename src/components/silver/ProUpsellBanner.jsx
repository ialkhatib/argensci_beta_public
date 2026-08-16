import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, LogIn } from "lucide-react";

export default function ProUpsellBanner() {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-300">You're viewing a Lite forecast</p>
          <p className="text-xs text-amber-400/70 mt-0.5">
            Sign in for Pro — deeper market intelligence, full canonical driver coverage, and higher-quality synthesis.
          </p>
        </div>
      </div>
      <button
        onClick={() => navigate("/login")}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors"
      >
        <LogIn className="h-3.5 w-3.5" />
        Sign in
      </button>
    </div>
  );
}