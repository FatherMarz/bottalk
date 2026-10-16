import { useEffect, useRef, useState } from "react";
import { request } from "@/lib/room";
import { b64urlDecode, importKey, open } from "@/lib/wallCrypto";
type Details = {
  text: string;
  resume: string;
  author: string;
  project?: string | null;
  threadName?: string;
  where?: string;
  mode?: string;
  requester?: string;
};
const optionalText = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";
export default function Approval() {
  const [details, setDetails] = useState<Details | null>(null);
  const [status, setStatus] = useState("loading");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const approveRef = useRef<HTMLButtonElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);
  // A link carries one decision. A local review link also carries the decline token.
  const [requestId, roomId, keyRaw, token, action, declineToken] =
    location.hash.slice(1).split(".");
  const canApprove = action !== "decline";
  const canDecline = action === "decline" || !!declineToken;
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (!requestId || !roomId || !keyRaw || !token)
          throw new Error(
            "This approval link is incomplete. Ask for a new request.",
          );
        const result = await request(
          "/api/approval",
          { action: "get", id: requestId },
          "This request is no longer available. Ask for a new one.",
        );
        const key = await importKey(b64urlDecode(keyRaw));
        const decoded = JSON.parse(
          await open(key, roomId, requestId, result.ct),
        ) as Details;
        if (
          !decoded ||
          typeof decoded.text !== "string" ||
          typeof decoded.resume !== "string" ||
          typeof decoded.author !== "string" ||
          !optionalText(decoded.project) ||
          !optionalText(decoded.threadName) ||
          !optionalText(decoded.where) ||
          !optionalText(decoded.mode) ||
          !optionalText(decoded.requester)
        )
          throw new Error(
            "This request cannot be verified. Ask for a new approval request.",
          );
        if (alive) {
          setDetails(decoded);
          setExpiresAt(result.expiresAt || "");
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
      const result = await request(
        "/api/approval",
        {
          action: "decide",
          id: requestId,
          token:
            decision === "declined" && action !== "decline"
              ? declineToken
              : token,
          decision,
        },
        "This request is no longer available. Ask for a new one.",
      );
      setStatus(result.status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const broken = !details && !!error;
  const heading = broken
    ? "This approval link doesn't work"
    : status === "approved"
      ? "Approved"
      : status === "declined"
        ? "Declined"
        : status === "expired"
          ? "Request expired"
          : status === "loading"
            ? "Opening request"
            : "Approval requested";
  const pendingDecision = status === "pending" && !!details;
  useEffect(() => {
    document.title = `Bot Talk | ${
      broken
        ? "Link Problem"
        : status === "approved"
          ? "Approved"
          : status === "declined"
            ? "Declined"
            : status === "expired"
              ? "Request Expired"
              : status === "loading"
                ? "Opening Request"
                : "Approval Requested"
    }`;
  }, [broken, status]);
  useEffect(() => {
    if (pendingDecision)
      (action === "decline" ? declineRef : approveRef).current?.focus();
  }, [pendingDecision, action]);
  const expires = Date.parse(expiresAt);
  const errorText =
    error && !error.includes("Ask")
      ? `${error} Ask the bot to send a new request.`
      : error;
  return (
    <main className="approval-page">
      <div className="approval-review">
        <a href="/" className="brand">
          bot talk
        </a>
        <h1>{heading}</h1>
        {details && (
          <>
            <p>
              <strong>{details.author}</strong>
              {details.project ? ` · ${details.project}` : ""}
              {details.threadName ? ` · ${details.threadName}` : ""}
            </p>
            {details.requester && details.requester !== details.author && (
              <p>Asked by {details.requester}</p>
            )}
            <div className="approval-card">
              <p className="message-text">{details.text}</p>
              <h2>What the bot will do</h2>
              <p className="message-text">{details.resume}</p>
              {(details.where || details.mode) && (
                <p className="approval-expires">
                  {details.where ? `Runs in: ${details.where}` : ""}
                  {details.where && details.mode ? " · " : ""}
                  {details.mode ? `Permission mode: ${details.mode}` : ""}
                </p>
              )}
            </div>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {errorText}
          </p>
        )}
        {pendingDecision && (
          <>
            {!Number.isNaN(expires) && (
              <p className="approval-expires">
                Expires{" "}
                {new Date(expires).toLocaleString([], {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
            <small>
              Approving lets {details!.author} do only the action above. It
              can’t be reused.
            </small>
            <div className="approval-actions">
              {canApprove && (
                <button
                  ref={approveRef}
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void decide("approved")}
                >
                  {busy ? "Saving…" : "Approve"}
                </button>
              )}
              {canDecline && (
                <button
                  ref={declineRef}
                  className={canApprove ? "quiet-button" : "primary-button"}
                  disabled={busy}
                  onClick={() => void decide("declined")}
                >
                  {busy && !canApprove ? "Saving…" : "Decline"}
                </button>
              )}
            </div>
            {!canDecline && (
              <small>
                To decline, use the Decline link in the email. Or do nothing
                and the request expires.
              </small>
            )}
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
        {!details && !error && <p role="status">Loading request…</p>}
      </div>
    </main>
  );
}
