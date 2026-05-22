"use client";

import { useEffect, useState } from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { Input } from "./input";

/**
 * Imperative confirm/prompt dialogs that match the app's Modal styling.
 *
 * Native window.confirm() / window.prompt() look out of place against a polished
 * admin UI, and are blocked or styled inconsistently across browsers. This
 * module exposes promise-based helpers that resolve like the native API but
 * render through the same <Modal /> component used elsewhere.
 *
 * Usage:
 *   const ok = await confirmDialog({ title: "Delete?", message: "..." });
 *   const reason = await promptDialog({ title: "Reason", initialValue: "" });
 *
 * <ConfirmDialogRoot /> must be mounted once near the top of the admin tree.
 */

type ConfirmRequest = {
  kind: "confirm";
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
};

type PromptRequest = {
  kind: "prompt";
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: string | null) => void;
};

type Request = ConfirmRequest | PromptRequest;

let activeRequest: Request | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function confirmDialog(opts: Omit<ConfirmRequest, "kind" | "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    activeRequest = { kind: "confirm", ...opts, resolve };
    notify();
  });
}

export function promptDialog(opts: Omit<PromptRequest, "kind" | "resolve">): Promise<string | null> {
  return new Promise((resolve) => {
    activeRequest = { kind: "prompt", ...opts, resolve };
    notify();
  });
}

function useActiveRequest(): Request | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return activeRequest;
}

export function ConfirmDialogRoot() {
  const req = useActiveRequest();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (req?.kind === "prompt") setValue(req.initialValue || "");
  }, [req]);

  if (!req) return null;

  const close = (result: boolean | string | null) => {
    if (req.kind === "confirm") (req as ConfirmRequest).resolve(result as boolean);
    else (req as PromptRequest).resolve(result as string | null);
    activeRequest = null;
    notify();
  };

  return (
    <Modal
      open={true}
      onClose={() => close(req.kind === "confirm" ? false : null)}
      title={req.title}
    >
      <div className="space-y-4">
        {req.kind === "confirm" && (
          <p className="text-sm text-gray-700 leading-relaxed">{req.message}</p>
        )}
        {req.kind === "prompt" && (
          <>
            {req.message && (
              <p className="text-sm text-gray-700 leading-relaxed">{req.message}</p>
            )}
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={req.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") close(value);
              }}
            />
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => close(req.kind === "confirm" ? false : null)}
          >
            {req.cancelLabel || "Cancel"}
          </Button>
          <Button
            variant={
              req.kind === "confirm" && req.destructive ? "danger" : "primary"
            }
            onClick={() => close(req.kind === "confirm" ? true : value)}
          >
            {req.confirmLabel || (req.kind === "confirm" ? "Confirm" : "OK")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
