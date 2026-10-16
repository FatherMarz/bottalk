import { useEffect, useState } from "react";
import { request } from "@/lib/room";
import { b64urlDecode, importKey, open } from "@/lib/wallCrypto";
type Details = {
  text: string;
  resume: string;
  author: string;
  project?: string;
  threadName?: string;
};
export default function Approval() {
  const [details, setDetails] = useState<Details | null>(null);
  const [status, setStatus] = useState("Loading request…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, roomId, keyRaw, token, action] = location.hash
    .slice(1)
    .split(".");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (!requestId || !roomId || !keyRaw || !token)
          throw new Error(
            "This approval link is incomplete. Ask for a new request.",
          );
        const result = await request("/api/approval", {
          action: "get",
          id: requestId,
        });
        const key = await importKey(b64urlDecode(keyRaw));
        const decoded = JSON.parse(
          await open(key, roomId, requestId, result.ct),
        ) as Details;
        if (
          !decoded ||
          typeof decoded.text !== "string" ||
          typeof decoded.resume !== "string" ||
          typeof decoded.author !== "string" ||
          (decoded.project !== undefined &&
            typeof decoded.project !== "string") ||
          (decoded.threadName !== undefined &&
            typeof decoded.threadName !== "string")
        )
          throw new Error(
            "This request cannot be verified. Ask for a new approval request.",
          );
        if (alive) {
          setDetails(decoded);
          setStatus(
            result.status === "pending" &&
              Date.parse(result.expiresAt) < Date.now()
              ? "expired"
              : result.status,
          );
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [requestId, roomId, keyRaw, token]);
  const decide = async (decision: "approved" | "declined") => {
    setBusy(true);
    setError("");
    try {
      const result = await request("/api/approval", {
        action: "decide",
        id: requestId,
        token,
        decision,
      });
      setStatus(result.status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="approval-page">
      <div className="approval-review">
        <a href="/" className="brand">
          bot talk
        </a>
        <h1>
          {status === "approved"
            ? "Approved"
            : status === "declined"
              ? "Declined"
              : status === "expired"
                ? "Request expired"
                : "Approval requested"}
        </h1>
        {details && (
          <>
            <p>
              <strong>{details.author}</strong>
              {details.project ? ` · ${details.project}` : ""}
              {details.threadName ? ` · ${details.threadName}` : ""}
            </p>
            <div className="approval-card">
              <p className="message-text">{details.text}</p>
              <h2>What the bot will do</h2>
              <p className="message-text">{details.resume}</p>
            </div>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {status === "pending" && details && (
          <>
            <small>
              Your decision applies to this exact action. The bot can continue
              after approval.
            </small>
            <div className="approval-actions">
              <button
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void decide(action === "decline" ? "declined" : "approved")
                }
              >
                {busy
                  ? "Saving…"
                  : action === "decline"
                    ? "Decline this action"
                    : "Approve this action"}
              </button>
            </div>
          </>
        )}
        {["approved", "declined", "expired"].includes(status) && (
          <small>
            {status === "approved"
              ? "The waiting bot will pick this up. You can close this page."
              : status === "declined"
                ? "The bot will not perform this action. You can close this page."
                : "Ask the bot to send a new request if the action is still needed."}
          </small>
        )}
        {!details && !error && <p>{status}</p>}
      </div>
    </main>
  );
}
