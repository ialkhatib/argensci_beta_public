import React from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, BrainCircuit, BarChart2, Zap, ChevronDown } from "lucide-react";

const FEATURES = [
  {
    icon: BarChart2,
    title: "Peak & Dip Detection",
    desc: "Topological prominence analysis across any date range and binning scale — find every significant market inflection point automatically.",
  },
  {
    icon: BrainCircuit,
    title: "AI Market Intelligence",
    desc: "Two-pass LLM synthesis grounded in live web sources. Each forecast is backed by verified verbatim quotes — no hallucinated numbers.",
  },
  {
    icon: TrendingUp,
    title: "GBM Forecast Cone",
    desc: "Geometric Brownian Motion with Student-t₄ fat-tail adjustment. Probabilistic price projection with 68% and 95% confidence bands.",
  },
  {
    icon: Zap,
    title: "One Click, Many Tools",
    desc: "ArgenSci aggregates live price feeds, AI news synthesis, quantitative modelling, and structural driver analysis into a single interface.",
  },
];

export default function HeroSection({ onEnter, isAuthenticated }) {
  const navigate = useNavigate();

  return (
    <div className="relative">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-amber-400/8 blur-3xl" />
        <div className="absolute top-1/2 right-0 h-72 w-72 rounded-full bg-slate-400/5 blur-3xl" />
      </div>

      {/* Hero copy */}
      <div className="text-center pt-20 pb-12 px-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/[0.06] px-4 py-1.5 text-xs font-medium text-amber-400 uppercase tracking-widest mb-6">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          Precious Metals Intelligence
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-4">
          ArgenSci
        </h1>
        <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed mb-2">
          An interactive market intelligence platform for precious metals — combining live price data, quantitative forecasting, and news synthesis in one place.
        </p>
        <p className="text-sm text-slate-600 max-w-lg mx-auto mb-10">
          A single platform that consolidates live feeds, AI models, and financial tools so you can get deep market analysis at the click of a button.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onEnter}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold px-6 py-3 text-sm transition-colors shadow-lg shadow-amber-500/20"
          >
            <BarChart2 className="h-4 w-4" /> Open Dashboard
          </button>
          {!isAuthenticated && (
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 font-medium px-6 py-3 text-sm transition-colors"
            >
              <Zap className="h-4 w-4 text-amber-400" /> Sign in for Pro
            </button>
          )}
          <a
            href="mailto:i@argensci.com"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-slate-400 font-medium px-6 py-3 text-sm transition-colors"
          >
            Help
          </a>
        </div>

        <button
          onClick={onEnter}
          className="mt-12 flex flex-col items-center gap-1 mx-auto text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <span>Scroll to dashboard</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </button>
      </div>

      {/* Feature cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 px-4 pb-16">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-amber-500/20 bg-amber-500/[0.06]">
              <Icon className="h-4 w-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-white/5 mx-4" />
    </div>
  );
}