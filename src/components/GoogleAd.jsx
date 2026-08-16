import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";

export default function GoogleAd({ className = "" }) {
  const adRef = useRef(null);
  const pushed = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (_) {}
  }, []);

  return (
    <div className={`rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-widest text-slate-600">Advertisement</span>
        <button
          onClick={() => navigate("/login")}
          className="inline-flex items-center gap-1 text-[10px] text-amber-500/70 hover:text-amber-400 transition-colors"
        >
          <LogIn className="h-2.5 w-2.5" />
          Sign in to remove ads
        </button>
      </div>
      <div className="px-2 pb-2">
        <ins
          ref={adRef}
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client="ca-pub-7667770686607690"
          data-ad-slot="5324007653"
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
}