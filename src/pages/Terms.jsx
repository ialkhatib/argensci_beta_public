import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

const LAST_UPDATED = "July 25, 2026";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to ArgenSci
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-6 w-6 text-amber-400 shrink-0" />
          <h1 className="text-2xl font-semibold text-slate-100">Terms of Use</h1>
        </div>
        <p className="text-xs text-slate-600 mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 text-sm text-slate-400 leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">1. Acceptance of Terms</h2>
            <p>By accessing or using ArgenSci ("the Platform", "we", "us"), you agree to be bound by these Terms of Use. If you do not agree with any part of these terms, you must not use the Platform. We reserve the right to update these terms at any time; continued use of the Platform after changes are posted constitutes your acceptance of the revised terms.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">2. Nature of the Platform — Tool Aggregation</h2>
            <p>ArgenSci is a <span className="text-slate-300 font-medium">tool aggregation platform</span>. It consolidates publicly available data sources, third-party financial APIs, and AI-powered analysis engines into a single, convenient interface at the click of a button. ArgenSci does not independently originate, verify, or guarantee the accuracy of the underlying data it aggregates. All information displayed — including price data, AI-generated narratives, market intelligence reports, and forecasts — is sourced from or derived from third-party services and models. Users should be aware that the accuracy and timeliness of such data is subject to the limitations of those underlying sources.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">3. No Financial Advice</h2>
            <p>Nothing on ArgenSci constitutes financial, investment, legal, or tax advice. All content — including price forecasts, AI-generated market narratives, macro factor analysis, and news summaries — is provided for <span className="text-slate-300 font-medium">informational and educational purposes only</span>. You should not rely on any information from this Platform to make investment or financial decisions. Always consult a qualified financial professional before making any investment.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">4. No Warranty — "As Is" Basis</h2>
            <p>The Platform is provided on an "as is" and "as available" basis, without warranties of any kind, express or implied. We do not warrant that the Platform will be uninterrupted, error-free, or free of harmful components. We expressly disclaim all warranties including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, and non-infringement.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">5. Forecasts and Quantitative Models</h2>
            <p>ArgenSci uses quantitative models (including Geometric Brownian Motion with fat-tail adjustments) to generate price forecasts. These models are based on historical data and statistical assumptions. <span className="text-slate-300 font-medium">Past performance is not indicative of future results.</span> All forecasts are probabilistic estimates, not predictions. The confidence intervals displayed represent statistical ranges derived from historical volatility — they do not guarantee that future prices will fall within those bounds.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">6. AI-Generated Content Disclaimer</h2>
            <p className="mb-3">ArgenSci is an AI-assisted market research and information aggregation platform. Content may be generated, summarized, or analyzed using commercial AI models, quantitative algorithms, and publicly available information. References to companies, organizations, governments, individuals, products, securities, events, or other entities are generated automatically and <span className="text-slate-300 font-medium">do not imply endorsement, affiliation, approval, or factual certainty</span>. The inclusion of any entity, event, or statement reflects the output of automated systems and should not be interpreted as a representation of fact, opinion, recommendation, or intent by ArgenSci.</p>
            <p className="mb-3">Users are solely responsible for independently verifying all information using primary and authoritative sources before relying on it for any financial, investment, legal, commercial, or other important decision.</p>
            <p><span className="text-slate-300 font-medium">Nothing on ArgenSci constitutes financial, investment, legal, tax, or other professional advice, and no content should be relied upon as the sole basis for making decisions.</span></p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">7. Data Sources and Third-Party Content</h2>
            <p>Price data is sourced from publicly available market data providers (including Yahoo Finance / COMEX). News and macro intelligence is gathered via web search and AI synthesis. ArgenSci has no affiliation with these sources and cannot guarantee their accuracy or availability. Third-party content remains the property of its respective owners.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">8. Limitation of Liability</h2>
            <p>To the fullest extent permitted by applicable law, ArgenSci and its operators shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the Platform, including but not limited to financial losses, loss of data, or any other damages, even if we have been advised of the possibility of such damages.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">9. User Accounts and Access Tiers</h2>
            <p>The Platform offers a Lite (unauthenticated) tier and a Pro (authenticated) tier. Features and quality of analysis differ between tiers. We reserve the right to modify, suspend, or discontinue any tier or feature at any time without notice. Accounts may be terminated at our discretion for violation of these terms.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">10. Intellectual Property</h2>
            <p>The ArgenSci name, logo, interface design, and original code are the intellectual property of ArgenSci and its operators. You may not copy, reproduce, distribute, or create derivative works from any part of the Platform without express written permission. Underlying third-party data, AI models, and APIs remain the property of their respective owners.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">11. Privacy</h2>
            <p>By using the Platform, you acknowledge that we may collect usage data, authentication information, and saved preferences. We do not sell personal data to third parties. Data you provide (such as email address upon registration) is used solely to operate the Platform and communicate with you about your account.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">12. Governing Law</h2>
            <p>These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising from use of the Platform shall be resolved through good-faith negotiation before pursuing any other remedy.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-slate-200 mb-2">13. Contact</h2>
            <p>If you have questions or concerns about these Terms, you may contact us through the Platform or by email at <a href="mailto:i@argensci.com" className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors">i@argensci.com</a>. We aim to respond to all enquiries within a reasonable time.</p>
          </section>

        </div>

        <div className="mt-12 border-t border-white/5 pt-6 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} ArgenSci. All rights reserved.</p>
          <Link to="/" className="hover:text-slate-400 transition-colors">Back to app</Link>
        </div>
      </div>
    </div>
  );
}