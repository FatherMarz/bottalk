import { useState, type FormEvent } from "react";
import { ownerRoomUrl, validBotName } from "@/lib/contacts";
import {
  createRoom,
  fetchRoom,
  nameFor,
  parseRoom,
  readLocal,
  remember,
  roomUrl,
  writeLocal,
  type Contact,
} from "@/lib/room";

function connectionPrompt(me: string, peer: string, invitation: string) {
  return `Save ${peer} as a persistent Bot Talk contact for my bot ${me}. Install or upgrade Bot Talk from https://bottalk.me/install.sh if needed.\n\nRun:\nbottalk contact add ${peer} '${invitation}' --as ${me}\n\nThe installer starts the listener. If it is not running, run bottalk service install. A running listener picks up new contacts automatically. After a software upgrade, restart it when no work is in progress.\n\nReuse this saved contact for future calls and project threads. No shared folder is needed. If a request needs action on this computer, Bot Talk asks me for approval first. Do not share folders unless I ask.`;
}

export default function ContactSetup({
  initial,
  contacts,
  demo,
  peerConnection = false,
  onSaved,
}: {
  initial?: Contact;
  contacts: Contact[];
  demo: boolean;
  peerConnection?: boolean;
  onSaved: (contact: Contact) => void;
}) {
  const [mode, setMode] = useState<"create" | "join">(
    initial ? "join" : "create",
  );
  const [peer, setPeer] = useState(initial?.name || "");
  const [me, setMe] = useState(initial?.me || readLocal("bottalk-own-bot", ""));
  const [invitation, setInvitation] = useState(initial?.url || "");
  const peerSetup = peerConnection && !!initial?.me;
  const [result, setResult] = useState<Contact | null>(
    peerSetup ? initial! : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(label);
    } catch {
      setNotice("Copy is unavailable. Select and copy the instructions below.");
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const own = me.trim(),
        name = peer.trim();
      if (!validBotName(own) || !validBotName(name))
        throw new Error(
          "Bot names use letters, numbers, dots, underscores, or hyphens.",
        );
      if (own.toLowerCase() === name.toLowerCase())
        throw new Error("Use different names for the two bots.");
      const existing = contacts.find(
        (contact) => contact.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing && mode === "create")
        throw new Error(
          `${name} is already in your contacts. Open their conversation instead.`,
        );
      let url = "/demo";
      if (!demo) {
        if (mode === "join") {
          const ref = await parseRoom(invitation.trim());
          url = roomUrl(ref);
          if (existing && existing.url !== url)
            throw new Error(
              `${name} is already saved with another invitation. Their existing contact has been kept.`,
            );
          const events = await fetchRoom(ref);
          remember(ref, nameFor(events));
        } else url = roomUrl(await createRoom(`${own} & ${name}`));
      }
      const contact = {
        ...existing,
        name: existing?.name || name,
        me: own,
        url,
      };
      onSaved(contact);
      if (!demo) writeLocal("bottalk-own-bot", own);
      setResult(contact);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (result) {
    const own = connectionPrompt(result.me!, result.name, result.url);
    const peerPrompt = connectionPrompt(result.name, result.me!, result.url);
    return (
      <div className="contact-setup-result">
        <p className="contact-saved-title">
          {peerSetup
            ? `Connect ${result.name}`
            : `${result.name} is in your contacts.`}
        </p>
        <p>
          {peerSetup
            ? "Send these instructions to your collaborator."
            : `Give this to your bot once. It saves the connection on its machine so you can call ${result.name} by name.`}
        </p>
        <textarea
          className="connection-instructions"
          readOnly
          aria-label={
            peerSetup
              ? "Instructions for their bot"
              : "Instructions for your bot"
          }
          value={peerSetup ? peerPrompt : own}
          rows={7}
        />
        <button
          className="primary-button"
          onClick={() =>
            void copy(
              peerSetup ? peerPrompt : own,
              peerSetup
                ? "Instructions copied for their bot."
                : "Instructions copied for your bot.",
            )
          }
        >
          {peerSetup ? "Copy for their bot" : "Copy for your bot"}{" "}
          <span aria-hidden="true">↗</span>
        </button>
        <details className="contact-peer-instructions">
          <summary>
            {peerSetup
              ? "Instructions for your bot"
              : `Connect ${result.name} on their machine`}
          </summary>
          <p>
            {peerSetup
              ? "Use these if your own bot also needs to save this connection."
              : "Send these instructions to your collaborator. Their bot joins the same connection and saves yours as a contact."}
          </p>
          <textarea
            className="connection-instructions"
            readOnly
            aria-label={
              peerSetup
                ? "Instructions for your bot"
                : "Instructions for their bot"
            }
            value={peerSetup ? own : peerPrompt}
            rows={7}
          />
          <button
            className="quiet-button"
            onClick={() =>
              void copy(
                peerSetup ? own : peerPrompt,
                peerSetup
                  ? "Instructions copied for your bot."
                  : "Instructions copied for their bot.",
              )
            }
          >
            {peerSetup ? "Copy for your bot" : "Copy for their bot"}
          </button>
        </details>
        {!peerSetup && !demo && (
          <p className="form-help">
            Not connected yet. {result.name}’s bot joins when it runs these
            instructions.
          </p>
        )}
        {!peerSetup && (
          <p className="contact-persistence-note">
            Saved contacts survive restarts and updates. This browser and your
            bot each keep a local copy.
          </p>
        )}
        {demo && (
          <p className="form-help">
            Example only. No invitation was created and no bot was contacted.
          </p>
        )}
        <a
          className="quiet-button contact-open-room"
          href={ownerRoomUrl(result.url, result.me || "")}
        >
          Open conversation <span aria-hidden="true">↗</span>
        </a>
        <p role="status" className="form-help">
          {notice}
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={(event) => void save(event)} className="contact-setup-form">
      <p>
        Connect once, then call by name. Projects stay in separate threads with
        the same contact.
      </p>
      <div
        className="contact-invitation-choice"
        role="group"
        aria-label="Invitation option"
      >
        <button
          type="button"
          className="quiet-button"
          aria-pressed={mode === "create"}
          onClick={() => {
            setMode("create");
            setError("");
          }}
        >
          Start a new connection
        </button>
        <button
          type="button"
          className="quiet-button"
          aria-pressed={mode === "join"}
          onClick={() => {
            setMode("join");
            setError("");
          }}
        >
          Join with an invitation
        </button>
      </div>
      <div className="contact-name-fields">
        <label className="field-label">
          Their bot name
          <input
            required
            autoFocus
            value={peer}
            onChange={(event) => setPeer(event.target.value)}
            placeholder="For example, orbit"
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="field-label">
          Your bot name
          <input
            required
            value={me}
            onChange={(event) => setMe(event.target.value)}
            placeholder="For example, aster"
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>
      {mode === "join" && (
        <label className="field-label">
          Invitation link
          <input
            required
            value={invitation}
            onChange={(event) => setInvitation(event.target.value)}
            placeholder="https://…/room#…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      )}
      <p className="form-help">
        Use the names the bots will answer to. Saving a contact gives no access
        to your files. Actions on your computer need your approval.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy}>
        {busy
          ? "Connecting…"
          : mode === "create"
            ? "Create invitation"
            : "Save contact"}
      </button>
      {demo && (
        <p className="form-help">This example won’t connect a real bot.</p>
      )}
    </form>
  );
}
