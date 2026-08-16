import React, { useState } from "react";
import { Settings, LogOut } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AccountSettingsDialog({ user, credits, logout, triggerClassName, triggerLabel }) {
  const [abandonConfirmed, setAbandonConfirmed] = useState(false);
  const hasCredits = typeof credits === "number" && credits > 0;

  return (
    <AlertDialog onOpenChange={() => setAbandonConfirmed(false)}>
      <AlertDialogTrigger asChild>
        {triggerLabel ? (
          <button className={triggerClassName}>{triggerLabel}</button>
        ) : (
          <button className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] transition-colors">
            <Settings className="h-5 w-5" />
          </button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Account settings</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{user?.email && <span className="font-medium text-foreground">{user.email}</span>}</span>
            <span className="block mt-2 font-semibold text-rose-500">Delete account</span>
            <span className="block">This will deactivate your account and forfeit any remaining credits. If you sign up again with the same email, you will start with zero credits.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasCredits && (
          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 mt-1">
            <input
              type="checkbox"
              checked={abandonConfirmed}
              onChange={(e) => setAbandonConfirmed(e.target.checked)}
              className="mt-0.5 accent-rose-500 h-4 w-4 shrink-0"
            />
            <span className="text-sm text-rose-300 leading-snug">
              I understand I will forfeit my remaining{" "}
              <span className="font-semibold">{credits} credit{credits !== 1 ? "s" : ""}</span> and will not receive the introductory 3 credits if I re-register.
            </span>
          </label>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
            onClick={() => logout("/")}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          <AlertDialogAction
            disabled={hasCredits && !abandonConfirmed}
            className="bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={async () => {
              try {
                const forfeitedCredits = typeof credits === "number" ? credits : 0;
                // Write ledger entry first so the audit trail is complete
                if (forfeitedCredits > 0) {
                  await base44.entities.CreditLedger.create({
                    userId: user.id,
                    userEmail: user.email ?? "",
                    amount: -forfeitedCredits,
                    balanceBefore: forfeitedCredits,
                    balanceAfter: 0,
                    type: "account_deactivation",
                    timestamp: new Date().toISOString(),
                  });
                }
                // Soft-deactivate: zero credits and mark as having received initial credits
                // so if the same email re-registers they start with 0 (not 3) credits.
                // User record and all associated data (reports, ledger) are preserved.
                await base44.auth.updateMe({
                  credits: 0,
                  hasReceivedInitialCredits: true,
                  deactivated: true,
                });
              } catch (_) {}
              logout(true);
            }}
          >
            Delete my account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}