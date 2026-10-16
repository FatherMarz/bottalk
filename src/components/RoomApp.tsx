import ContactSetup from "./ContactSetup";
import { Avatar, Mark } from "./Identity";
import {
  connectionKey,
  contactHasJoined,
  isBotEvent,
  mergeRoomContacts,
  ownBotForRoom,
  ownerRoomUrl,
  roomBotNames,
  sameBot,
  sameConnection,
  validBotName,
} from "@/lib/contacts";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  asked,
  threadsFor,
  eventsInThread,
  threadUrl,
  createRoom,
  demoEvents,
  fetchRoom,
  nameFor,
  parseRoom,
  postEvent,
  readLocal,
  remember,
  rooms,
  roomUrl,
  writeLocal,
  type Contact,
  type Event,
  type RoomRef,
} from "@/lib/room";

type DialogName = "new" | "join" | "contact" | "name" | "bot" | "thread" | null;
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => opener?.focus?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function MessageText({ text }: { text: string }) {
  return (
    <p className="message-text">
      {text
        .split(/(`[^`]+`)/g)
        .map((part, i) =>
          part.startsWith("`") && part.endsWith("`") ? (
            <code key={i}>{part.slice(1, -1)}</code>
          ) : (
            part
          ),
        )}
    </p>
  );
}
export default function RoomApp({
  demo = false,
  room = false,
}: {
  demo?: boolean;
  room?: boolean;
}) {
  const [events, setEvents] = useState<Event[]>(() =>
    demo ? demoEvents() : [],
  );
  const [ref, setRef] = useState<RoomRef | null>(null);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("Opening room");
  const [saved, setSaved] = useState(rooms);
  const [contacts, setContacts] = useState<Contact[]>(() =>
    demo
      ? [
          { name: "Aster", url: "/demo" },
          { name: "Orbit", url: "/demo" },
        ]
      : readLocal("bottalk-contacts", []),
  );
  const [author, setAuthor] = useState<string>(() =>
    readLocal("bottalk-name", ""),
  );
  const [botPreferences, setBotPreferences] = useState<Record<string, string>>(
    () => readLocal("bottalk-room-bots", {}),
  );
  const participantNames = roomBotNames(events);
  const ownBot = demo
    ? "Aster"
    : ref
      ? ownBotForRoom(
          roomUrl(ref),
          contacts,
          botPreferences,
          participantNames,
          readLocal("bottalk-own-bot", ""),
        )
      : "";
  const visibleContacts = contacts
    .filter((contact) => {
      if (room && ref && sameConnection(contact.url, roomUrl(ref)))
        return !!ownBot && !sameBot(contact.name, ownBot);
      const me = ownBotForRoom(contact.url, contacts, botPreferences, [], "");
      return !me || !sameBot(contact.name, me);
    })
    .filter((contact) => !demo || !sameBot(contact.name, ownBot));
  const needsConnection = (contact: Contact) =>
    !!(
      room &&
      ref &&
      sameConnection(contact.url, roomUrl(ref)) &&
      !contactHasJoined(events, contact.name)
    );
  const rememberOwnBot = (url: string, name: string) => {
    setBotPreferences((previous) => {
      const next = { ...previous, [connectionKey(url)]: name };
      if (!demo) writeLocal("bottalk-room-bots", next);
      return next;
    });
  };
  const [selectedThread, setSelectedThread] = useState(() => {
    const fragment = location.hash.split("&").slice(1).join("&");
    return (
      new URLSearchParams(fragment).get("thread") ||
      new URLSearchParams(location.search).get("thread") ||
      (demo ? "website" : "main")
    );
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = `${demo ? "demo" : ref?.id || "loading"}:${selectedThread}`;
  const draft = drafts[draftKey] || "";
  const setDraft = (value: string) =>
    setDrafts((previous) => ({ ...previous, [draftKey]: value }));
  const [sending, setSending] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [contactToConnect, setContactToConnect] = useState<
    Contact | undefined
  >();
  const [value, setValue] = useState("");
  const [second, setSecond] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [showWork, setShowWork] = useState(false);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState<Event | null>(null);
  const [theme, setTheme] = useState(() =>
    readLocal("bottalk-theme-v2", "dark"),
  );
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const roomIdentity = useRef("");
  const threads = threadsFor(events);
  const currentThread = threads.find((thread) => thread.id === selectedThread);
  const visibleEvents = eventsInThread(events, selectedThread);
  const loadingRoom = room && !error && connection === "Opening room";
  const badLink = room && !ref && !!error;
  const title =
    currentThread?.name ||
    (room && !events.length
      ? loadingRoom
        ? "Opening room…"
        : "Room"
      : "Thread unavailable");
  const otherRooms = Object.entries(saved).filter(
    ([, item]) =>
      !contacts.some(
        (contact) => contact.url.split("&")[0] === item.url.split("&")[0],
      ),
  );
  const switchThread = (id: string) => {
    setSelectedThread(id);
    setReply(null);
    setSearch("");
    setShowWork(false);
    setMobileNav(false);
    nearBottom.current = true;
    history.replaceState(
      null,
      "",
      demo
        ? `/demo?thread=${encodeURIComponent(id)}`
        : ref
          ? threadUrl(ref, id)
          : location.href,
    );
  };
  const open = demo || room;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeLocal("bottalk-theme-v2", theme);
  }, [theme]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!room && !demo) return;
    let alive = true;
    let generation = 0;
    const navigate = () => {
      const current = ++generation;
      const params = new URLSearchParams(
        location.hash.split("&").slice(1).join("&"),
      );
      setSelectedThread(
        params.get("thread") ||
          new URLSearchParams(location.search).get("thread") ||
          (demo ? "website" : "main"),
      );
      setReply(null);
      setSearch("");
      setMobileNav(false);
      nearBottom.current = true;
      callStarted.current = false;
      if (!room) return;
      void parseRoom(location.href)
        .then((result) => {
          if (!alive || current !== generation) return;
          const ownHint = params.get("me");
          if (ownHint && validBotName(ownHint))
            rememberOwnBot(roomUrl(result), ownHint);
          if (params.has("me")) {
            params.delete("me");
            history.replaceState(
              null,
              "",
              `${location.pathname}${location.search}#${location.hash.slice(1).split("&")[0]}${params.size ? `&${params}` : ""}`,
            );
          }
          const identity = `${result.id}.${Array.from(result.raw).join(",")}`;
          if (identity !== roomIdentity.current) {
            roomIdentity.current = identity;
            setEvents([]);
            setConnection("Opening room");
            setError("");
            setRef(result);
          }
        })
        .catch((error) => {
          if (alive && current === generation) {
            setError(error.message);
            setConnection("Invalid invitation");
            setRef(null);
            setEvents([]);
          }
        });
    };
    navigate();
    window.addEventListener("hashchange", navigate);
    window.addEventListener("popstate", navigate);
    return () => {
      alive = false;
      window.removeEventListener("hashchange", navigate);
      window.removeEventListener("popstate", navigate);
    };
  }, [room, demo]);
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const next = await fetchRoom(ref);
        if (!alive) return;
        setEvents(next);
        setConnection("Connected");
        setError("");
        remember(ref, nameFor(next));
        setSaved(rooms());
        const peers = roomBotNames(next);
        if (ownBot)
          setContacts((previous) => {
            const merged = mergeRoomContacts(
              previous,
              peers,
              roomUrl(ref),
              ownBot,
            );
            writeLocal("bottalk-contacts", merged);
            return merged;
          });
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          if ((e as Error).name === "DecryptError") {
            setConnection("Cannot read this room");
            return;
          }
          setConnection("Reconnecting");
        }
      }
      if (alive) timer = setTimeout(tick, document.hidden ? 12000 : 2500);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ref, ownBot]);
  useEffect(() => {
    if (nearBottom.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [events, search, selectedThread]);
  const botNames = roomBotNames(visibleEvents).map(
    (name) =>
      participantNames.find((candidate) => sameBot(candidate, name)) || name,
  );
  const pending = visibleEvents.filter(
    (e) =>
      e.kind === "approval" &&
      !events.some(
        (result) =>
          result.kind === "approval-result" && result.re === e.clientId,
      ),
  );
  const conversation = visibleEvents.filter(
    (e) =>
      !["meta", "contact", "presence", "status"].includes(e.kind || "") &&
      (!search ||
        `${e.author} ${e.text}`.toLowerCase().includes(search.toLowerCase())),
  );
  const callStarted = useRef(false);
  const askContact = async (contact: Contact) => {
    const me =
      ref && sameConnection(contact.url, roomUrl(ref))
        ? ownBot
        : ownBotForRoom(contact.url, contacts, botPreferences, [], "");
    if (me && sameBot(contact.name, me)) {
      setError("That's your bot. Choose another contact.");
      return;
    }
    if (open && !currentThread) {
      setError("Choose a thread before calling a contact.");
      return;
    }
    if (!open || (!demo && ref && !sameConnection(contact.url, roomUrl(ref)))) {
      const destination = ownerRoomUrl(contact.url, me);
      location.href = `${destination}${destination.includes("#") ? "&" : "?"}call=${encodeURIComponent(contact.name)}`;
      return;
    }
    if (!ownBot && !demo) {
      setValue("");
      setDialog("bot");
      return;
    }
    if (needsConnection(contact)) {
      setError("");
      setContactToConnect({ ...contact, me: ownBot });
      setDialog("contact");
      return;
    }
    if (!author.trim() && !demo) {
      setValue("");
      setDialog("name");
      setNotice("Set your display name once, then call your contact.");
      return;
    }
    try {
      await publish({
        author: author || "You",
        role: "human",
        kind: "turn",
        protocol: 2,
        intent: "conversation",
        to: contact.name,
        project: currentThread?.project,
        text: "Join the conversation. Read the current room context and reply with what you are working on and how you can help.",
      });
      setNotice(
        demo
          ? `Example call to ${contact.name}. No bot was contacted.`
          : `Calling ${contact.name}`,
      );
      setMobileNav(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    const call =
      location.hash.match(/&call=([^&]+)/)?.[1] ||
      new URLSearchParams(location.search).get("call");
    if (
      call &&
      ref &&
      connection === "Connected" &&
      author &&
      ownBot &&
      !callStarted.current
    ) {
      callStarted.current = true;
      void askContact({ name: decodeURIComponent(call), url: roomUrl(ref) });
      history.replaceState(null, "", threadUrl(ref, selectedThread));
    }
  }, [ref, connection, author, ownBot]);
  const publish = async (event: Omit<Event, "ts" | "clientId">) => {
    if (demo) {
      const result = {
        thread: selectedThread,
        ...event,
        clientId: crypto.randomUUID(),
        ts: Date.now(),
      };
      setEvents((prev) => [...prev, result]);
      return result;
    }
    if (!ref) throw new Error("The room is not connected yet.");
    const result = await postEvent(ref, { thread: selectedThread, ...event });
    setEvents((prev) =>
      prev.some((item) => item.clientId === result.clientId)
        ? prev
        : [...prev, result],
    );
    return result;
  };
  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || sending) return;
    if (!currentThread) {
      setError("This thread is unavailable. Choose a thread from the sidebar.");
      return;
    }
    if (!author.trim() && !demo) {
      setValue("");
      setDialog("name");
      return;
    }
    setSending(true);
    setError("");
    const text = draft.trim();
    try {
      const addressed = asked(text);
      if (addressed.to && !ownBot && !demo) {
        setValue("");
        setDialog("bot");
        return;
      }
      if (addressed.to && ownBot && sameBot(addressed.to, ownBot))
        throw new Error("That's your bot. Choose another contact.");
      if (addressed.to && !demo && !contactHasJoined(events, addressed.to))
        throw new Error(
          "That bot has not joined this room yet. Use Connect in Contacts.",
        );
      await publish({
        author: author || "You",
        role: "human",
        ...addressed,
        project: addressed.project || currentThread?.project,
        ...(reply ? { re: reply.clientId } : {}),
      });
      setDraft("");
      setReply(null);
      nearBottom.current = true;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
      composer.current?.focus();
    }
  };
  const openDialog = (name: DialogName) => {
    setValue("");
    setSecond("");
    setError("");
    setContactToConnect(undefined);
    setDialog(name);
  };
  const submitDialog = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (dialog === "new") {
        const next = await createRoom(value);
        location.href = roomUrl(next);
        return;
      }
      if (dialog === "join") {
        const next = await parseRoom(value);
        location.href = roomUrl(next);
        return;
      }
      if (dialog === "thread") {
        if (
          threads.some(
            (thread) =>
              thread.name.toLowerCase() === value.trim().toLowerCase(),
          )
        )
          throw new Error("A thread with that name already exists.");
        const project = second.trim();
        if (project && !/^[\w.-]+$/.test(project))
          throw new Error(
            "Project names use letters, numbers, dots, underscores, or hyphens.",
          );
        const id = crypto.randomUUID().replaceAll("-", "");
        await publish({
          author: author || "You",
          role: "human",
          kind: "thread",
          thread: id,
          text: value.trim(),
          ...(project ? { project } : {}),
        });
        switchThread(id);
      }
      if (dialog === "name") {
        setAuthor(value.trim());
        writeLocal("bottalk-name", value.trim());
      }
      if (dialog === "bot") {
        if (!ref || !validBotName(value.trim()))
          throw new Error("Choose your bot's name.");
        rememberOwnBot(roomUrl(ref), value.trim());
      }
      setDialog(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, done = "Copied to clipboard") => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(done);
    } catch {
      setNotice(
        "Copy is unavailable in this browser. Copy the address bar instead.",
      );
    }
  };
  return (
    <div className="room-app">
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileNav ? "is-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <a className="brand" href="/app">
          <Mark />
          <span>bot talk</span>
        </a>
        {
          <>
            <div className="nav-section-heading">
              {open ? "Threads" : "Other rooms"}
              <button
                className="icon-button"
                aria-label={open ? "New thread" : "Create a room"}
                onClick={() => openDialog(open ? "thread" : "new")}
              >
                +
              </button>
            </div>
            <nav className="room-nav" aria-label={open ? "Threads" : "Rooms"}>
              {open
                ? threads.map((thread) => (
                    <button
                      type="button"
                      key={thread.id}
                      className={`room-nav-item thread-item ${thread.id === selectedThread ? "selected" : ""}`}
                      onClick={() => switchThread(thread.id)}
                      aria-current={
                        thread.id === selectedThread ? "page" : undefined
                      }
                    >
                      <span className="thread-symbol" aria-hidden="true">
                        #
                      </span>
                      <span>
                        {thread.name}
                        {thread.project && <small>{thread.project}</small>}
                      </span>
                      {events.some(
                        (event) =>
                          event.thread === thread.id &&
                          event.kind === "approval" &&
                          !events.some(
                            (result) =>
                              result.re === event.clientId &&
                              result.kind === "approval-result",
                          ),
                      ) && (
                        <span
                          className="thread-attention"
                          aria-label="Approval pending"
                        />
                      )}
                    </button>
                  ))
                : otherRooms.map(([id, item]) => (
                    <a key={id} className="room-nav-item" href={item.url}>
                      <span className="room-symbol">↗</span>
                      <span>
                        {item.name}
                        <small>Shared room</small>
                      </span>
                    </a>
                  ))}
              {!open && !Object.keys(saved).length && (
                <p className="nav-empty">No rooms yet.</p>
              )}
              <button className="nav-link" onClick={() => openDialog("join")}>
                <span>↳</span> Join with an invitation
              </button>
            </nav>
          </>
        }
        {open && (
          <button
            className="own-bot-choice"
            disabled={demo}
            onClick={() => {
              setError("");
              setValue(ownBot);
              setDialog("bot");
            }}
            aria-label={
              ownBot
                ? `Your bot: ${ownBot}${demo ? "" : ". Change your bot"}`
                : "Choose your bot"
            }
          >
            <Avatar name={ownBot || "You"} bot small />
            <span>
              <small>Your bot</small>
              <strong>{ownBot || "Choose your bot"}</strong>
            </span>
            <span aria-hidden="true">⌄</span>
          </button>
        )}
        <div className="nav-section-heading contacts-heading">
          Contacts
          <button
            className="icon-button"
            aria-label="Add a contact"
            onClick={() => openDialog("contact")}
          >
            +
          </button>
        </div>
        <div className="contacts-list">
          {visibleContacts.map((contact) => (
            <div className="contact-row" key={contact.name}>
              <Avatar name={contact.name} bot small />
              <div>
                <strong>{contact.name}</strong>
                <small>
                  {needsConnection(contact)
                    ? "Needs bot connection"
                    : open &&
                        (demo ||
                          (ref && sameConnection(contact.url, roomUrl(ref))))
                      ? "Call in this thread"
                      : "Open conversation"}
                </small>
              </div>
              <button
                className="contact-call"
                onClick={() => void askContact(contact)}
                aria-label={`${needsConnection(contact) ? "Connect" : "Call"} ${contact.name}`}
              >
                {needsConnection(contact) ? "Connect" : "Call"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          ))}
          {!visibleContacts.length && (
            <p className="nav-empty">
              {open && !ownBot
                ? "Choose your bot to see your contacts."
                : open
                  ? "No other bots have joined yet."
                  : "No contacts yet."}
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <a className="nav-link" href="/guide.md">
            <span>⌘</span> Setup guide (text file)
          </a>
          <div className="profile">
            <button
              className="profile-name"
              onClick={() => {
                setValue(author);
                setDialog("name");
              }}
            >
              <Avatar name={author || "You"} small />
              <span>{author || "Set your name"}</span>
            </button>
            <button
              className="icon-button theme-button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? "◐" : "◑"}
            </button>
          </div>
          <p className="privacy-line">End-to-end encrypted</p>
        </div>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              ☰
            </button>
            <span className="room-symbol">↗</span>
            <span>
              {open
                ? loadingRoom || badLink
                  ? "Room"
                  : title
                : "Your contacts"}
            </span>
            {demo && <span className="example-label">Interactive example</span>}
          </div>
          <div className="header-actions">
            {open && !badLink && (
              <>
                <button
                  className="quiet-button work-toggle"
                  onClick={() => setShowWork(!showWork)}
                  aria-expanded={showWork}
                  aria-controls="work-panel"
                >
                  {showWork ? "Hide current work" : "Show current work"}
                </button>
                <button
                  className="quiet-button"
                  onClick={() =>
                    demo
                      ? setNotice(
                          "This is an example room. Create your own to invite someone.",
                        )
                      : void copy(
                          threadUrl(ref!, selectedThread),
                          "Invite link copied. Anyone with it can read this room.",
                        )
                  }
                  disabled={!demo && !ref}
                >
                  Copy invite link
                </button>
              </>
            )}
          </div>
        </header>
        {badLink ? (
          <section className="room-error-card" aria-labelledby="bad-link-title">
            <h1 id="bad-link-title">This room link doesn't work</h1>
            <p className="error" role="alert">
              {error}
            </p>
            <div className="welcome-actions">
              <button
                className="primary-button"
                onClick={() => openDialog("join")}
              >
                Join with an invitation
              </button>
              <a className="quiet-button" href="/app">
                Go to your workspace
              </a>
            </div>
          </section>
        ) : open ? (
          <>
            <section className="room-heading">
              <div>
                <h1>{title}</h1>
                {currentThread?.project && (
                  <p className="thread-project">{currentThread.project}</p>
                )}
              </div>
              <div
                className={`connection ${demo ? "demo-connection" : ""}`}
                role="status"
              >
                <span
                  className={
                    connection === "Connected" && !demo
                      ? "connected-dot"
                      : "neutral-dot"
                  }
                />
                {demo ? "Sample conversation" : connection}
              </div>
            </section>
            <div className="room-body">
              <section className="conversation-panel" aria-label="Conversation">
                <div className="conversation-tools">
                  <span>
                    Conversation{" "}
                    <span className="count">{conversation.length}</span>
                  </span>
                  <label className="search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      aria-label="Search conversation"
                      placeholder="Find in conversation"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                <div
                  className="conversation-scroll"
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                  aria-label="Messages"
                  tabIndex={0}
                  ref={scroll}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    nearBottom.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                  }}
                >
                  <div className="day-divider">
                    <span>
                      {demo ? "Example conversation" : "Conversation history"}
                    </span>
                  </div>
                  {!conversation.length && (
                    <div className="conversation-empty">
                      <Mark />
                      {search ? (
                        <>
                          <h2>No matching messages</h2>
                          <p>Try another name or word.</p>
                        </>
                      ) : loadingRoom ? (
                        <h2>Opening room…</h2>
                      ) : !demo && !ownBot ? (
                        <>
                          <h2>Choose your bot first</h2>
                          <p>Pick which bot in this room is yours.</p>
                          <div className="empty-actions">
                            <button
                              className="primary-button"
                              onClick={() => {
                                setError("");
                                setValue(ownBot);
                                setDialog("bot");
                              }}
                            >
                              Choose your bot
                            </button>
                          </div>
                        </>
                      ) : !demo &&
                        !participantNames.some(
                          (name) => !sameBot(name, ownBot),
                        ) ? (
                        <>
                          <h2>No one else is here yet</h2>
                          <p>
                            Waiting for the other bot to join. Send them the
                            invite link.
                          </p>
                          <div className="empty-actions">
                            <button
                              className="primary-button"
                              disabled={!ref}
                              onClick={() =>
                                void copy(
                                  threadUrl(ref!, selectedThread),
                                  "Invite link copied. Anyone with it can read this room.",
                                )
                              }
                            >
                              Copy invite link
                            </button>
                            <button
                              className="quiet-button"
                              onClick={() => openDialog("contact")}
                            >
                              Add a bot contact
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h2>Start a conversation</h2>
                          <p>Call a contact or send a message.</p>
                        </>
                      )}
                    </div>
                  )}
                  {conversation.map((event) => (
                    <article
                      key={event.clientId}
                      className={`message ${["action", "done", "refused", "approval-result"].includes(event.kind || "") ? "message-progress" : ""} ${event.kind === "refused" ? "is-refused" : ""}`}
                    >
                      {[
                        "action",
                        "done",
                        "refused",
                        "approval-result",
                      ].includes(event.kind || "") ? (
                        <>
                          <span
                            className="progress-check"
                            role="img"
                            aria-label={
                              {
                                refused: "Could not finish",
                                done: "Done",
                                action: "Working",
                              }[event.kind || ""] || "Decision"
                            }
                          >
                            {event.kind === "refused" ? "!" : "✓"}
                          </span>
                          <div>
                            <span className="progress-author">
                              {event.author}
                            </span>{" "}
                            {event.kind !== "approval-result" && (
                              <span className="progress-label">
                                {event.kind === "refused"
                                  ? "Could not finish"
                                  : event.kind === "done"
                                    ? "Done"
                                    : "Working"}
                              </span>
                            )}{" "}
                            <time
                              className="progress-time"
                              dateTime={new Date(event.ts).toISOString()}
                            >
                              {new Date(event.ts).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </time>
                            <br />
                            {event.text}
                          </div>
                        </>
                      ) : (
                        <>
                          <Avatar name={event.author} bot={isBotEvent(event)} />
                          <div className="message-content">
                            <div className="message-heading">
                              <strong>{event.author}</strong>
                              {isBotEvent(event) && (
                                <span className="bot-label">BOT</span>
                              )}
                              <time dateTime={new Date(event.ts).toISOString()}>
                                {new Date(event.ts).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </time>
                            </div>
                            {event.re &&
                              events.find(
                                (parent) => parent.clientId === event.re,
                              ) && (
                                <div className="request-reply">
                                  Replying to{" "}
                                  {
                                    events.find(
                                      (parent) => parent.clientId === event.re,
                                    )!.author
                                  }
                                </div>
                              )}
                            {["turn", "ask"].includes(event.kind || "") && (
                              <div className="request-label">
                                Calling {event.to}
                                {event.project ? ` · ${event.project}` : ""}
                              </div>
                            )}
                            {event.kind === "approval" ? (
                              <div className="approval-card">
                                <span className="approval-label">
                                  Approval requested
                                </span>
                                <MessageText text={event.text} />
                                <div className="approval-status">
                                  {events.find(
                                    (result) =>
                                      result.kind === "approval-result" &&
                                      result.re === event.clientId,
                                  )?.text ||
                                    (event.expiresAt &&
                                    event.expiresAt < Date.now()
                                      ? "Request expired"
                                      : demo
                                        ? "Example request. No email sent."
                                        : "Awaiting a decision by email.")}
                                </div>
                                {demo &&
                                  !events.some(
                                    (result) => result.re === event.clientId,
                                  ) && (
                                    <div className="approval-actions">
                                      <button
                                        className="primary-button"
                                        onClick={() =>
                                          void publish({
                                            author: author || "You",
                                            kind: "approval-result",
                                            re: event.clientId,
                                            text: "Approved the production deploy.",
                                          })
                                        }
                                      >
                                        Approve
                                      </button>
                                      <button
                                        className="quiet-button"
                                        onClick={() =>
                                          void publish({
                                            author: author || "You",
                                            kind: "approval-result",
                                            re: event.clientId,
                                            text: "Declined the production deploy.",
                                          })
                                        }
                                      >
                                        Decline
                                      </button>
                                    </div>
                                  )}
                              </div>
                            ) : (
                              <MessageText text={event.text} />
                            )}
                            <button
                              className="reply-button"
                              aria-label={`Reply to ${event.author}`}
                              onClick={() => {
                                setReply(event);
                                composer.current?.focus();
                              }}
                            >
                              Reply
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  ))}
                </div>
                <form className="composer-area" onSubmit={(e) => void send(e)}>
                  {reply && (
                    <div className="reply-context">
                      Replying to {reply.author}
                      <button
                        className="icon-button"
                        aria-label="Cancel reply"
                        onClick={() => setReply(null)}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="composer">
                    <textarea
                      ref={composer}
                      aria-label="Message"
                      rows={2}
                      maxLength={8000}
                      placeholder="Say something, or @a-bot ask for a hand…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                          void send();
                      }}
                    />
                    <div className="composer-bottom">
                      <span>{demo ? "Example room" : "Message room"}</span>
                      <button
                        className="send-button"
                        type="submit"
                        disabled={sending || !draft.trim() || (!demo && !ref)}
                        aria-label="Send message"
                      >
                        {sending ? "…" : "↑"}
                      </button>
                    </div>
                  </div>
                  <div className="composer-note">
                    <span>{demo ? "Fictional activity" : "Encrypted"}</span>
                    <span>⌘ Enter to send</span>
                  </div>
                </form>
              </section>
              <aside
                id="work-panel"
                className={`work-panel ${showWork ? "show-work" : ""}`}
                aria-label="Current work"
              >
                <div className="work-panel-top">
                  <h2>Current work</h2>
                </div>
                {!botNames.length && (
                  <p className="work-empty">No updates yet.</p>
                )}
                {botNames.map((name) => {
                  const state = visibleEvents
                    .filter(
                      (event) =>
                        sameBot(event.author, name) &&
                        ["status", "answer", "done", "refused"].includes(
                          event.kind || "",
                        ),
                    )
                    .at(-1);
                  const approval = pending.find((event) =>
                    sameBot(event.author, name),
                  );
                  return (
                    <div className="agent-work" key={name}>
                      <div className="agent-work-heading">
                        <Avatar name={name} bot small />
                        <strong>{name}</strong>
                        {sameBot(name, ownBot) && (
                          <small className="own-agent-label">Your bot</small>
                        )}
                        <span
                          className={`work-status ${approval ? "needs-input" : ""}`}
                        >
                          {approval
                            ? "Needs approval"
                            : state?.state === "done" || state?.kind === "done"
                              ? "Done"
                              : state?.state === "working"
                                ? "Working"
                                : state?.kind === "refused" ||
                                    state?.state === "blocked"
                                  ? "Could not finish"
                                  : "Idle"}
                        </span>
                      </div>
                      <p>
                        {approval?.text ||
                          state?.text ||
                          "No work in progress."}
                      </p>
                      {state && (
                        <time>
                          {state.state === "done" || state.kind === "done"
                            ? "Done · "
                            : "Updated "}
                          {new Date(state.ts).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      )}
                    </div>
                  );
                })}
              </aside>
            </div>
          </>
        ) : (
          <section className="welcome">
            <h1>Your contacts</h1>
            <p>
              Add a bot once. Call by name. Keep each project in its own thread.
            </p>
            <div className="welcome-actions">
              <button
                className="primary-button"
                onClick={() => openDialog("contact")}
              >
                Add a bot contact <span aria-hidden="true">↗</span>
              </button>
              <a className="quiet-button" href="/demo">
                View example
              </a>
            </div>
            {visibleContacts.length > 0 && (
              <div className="contact-book" aria-label="Saved bot contacts">
                {visibleContacts.map((contact) => (
                  <article className="contact-book-card" key={contact.name}>
                    <Avatar name={contact.name} bot />
                    <div>
                      <h2>
                        <a href={ownerRoomUrl(contact.url, contact.me || "")}>
                          {contact.name}
                        </a>
                      </h2>
                      <p>
                        {contact.me
                          ? `Your bot: ${contact.me}`
                          : "Saved contact"}
                      </p>
                    </div>
                    <div className="contact-book-actions">
                      <a
                        href={ownerRoomUrl(contact.url, contact.me || "")}
                        className="quiet-button"
                      >
                        Open conversation ↗
                      </a>
                      <button
                        className="quiet-button"
                        onClick={() => {
                          setContactToConnect(contact);
                          setDialog("contact");
                        }}
                      >
                        Connection instructions
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {otherRooms.length > 0 && (
              <div className="recent-rooms">
                <h2>Other rooms</h2>
                {otherRooms.map(([id, item]) => (
                  <a href={item.url} key={id}>
                    {item.name}
                    <span>Open room ↗</span>
                  </a>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {dialog && (
        <Modal
          close={() => {
            setDialog(null);
            setError("");
          }}
          title={
            {
              new: "Create room",
              thread: "New thread",
              join: "Join room",
              contact: contactToConnect
                ? `Connect ${contactToConnect.name}`
                : "Add a bot contact",
              name: "Your name",
              bot: "Your bot",
            }[dialog]
          }
        >
          {dialog === "contact" ? (
            <ContactSetup
              initial={contactToConnect}
              contacts={contacts}
              demo={demo}
              peerConnection={
                !!contactToConnect && needsConnection(contactToConnect)
              }
              onSaved={(contact) => {
                let next = [
                  ...contacts.filter(
                    (item) =>
                      item.name.toLowerCase() !== contact.name.toLowerCase(),
                  ),
                  contact,
                ];
                if (contact.me) {
                  rememberOwnBot(contact.url, contact.me);
                  next = mergeRoomContacts(next, [], contact.url, contact.me);
                }
                setContacts(next);
                if (!demo) {
                  writeLocal("bottalk-contacts", next);
                  setSaved(rooms());
                }
              }}
            />
          ) : dialog === "bot" ? (
            <form
              onSubmit={(e) => void submitDialog(e)}
              className="bot-choice-form"
            >
              <div
                className="bot-choice-list"
                role="group"
                aria-label="Bots in this room"
              >
                {participantNames.map((name) => (
                  <button
                    key={name}
                    className="bot-choice-option"
                    type="button"
                    aria-pressed={sameBot(name, value)}
                    onClick={() => setValue(name)}
                  >
                    <Avatar name={name} bot small />
                    <strong>{name}</strong>
                    <span>{sameBot(name, value) ? "Selected" : ""}</span>
                  </button>
                ))}
              </div>
              <label className="field-label">
                Your bot's name
                <input
                  required
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={80}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary-button" disabled={busy}>
                {busy ? "Saving…" : "Save your bot"}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void submitDialog(e)}>
              <label className="field-label">
                {dialog === "thread"
                  ? "Thread name"
                  : dialog === "new"
                    ? "Room name"
                    : dialog === "join"
                      ? "Invitation link"
                      : "Your name"}
                <input
                  autoFocus
                  required
                  value={value}
                  maxLength={dialog === "join" ? 2000 : 80}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    dialog === "thread"
                      ? "For example, mobile app"
                      : dialog === "new"
                        ? "The project you’re working on"
                        : dialog === "join"
                          ? "https://…/room#…"
                          : "How you appear in the room"
                  }
                />
              </label>
              {dialog === "thread" && (
                <label className="field-label">
                  Project (optional)
                  <input
                    value={second}
                    onChange={(e) => setSecond(e.target.value)}
                    placeholder="For example, website"
                    maxLength={80}
                  />
                </label>
              )}
              <p className="form-help">
                {dialog === "thread"
                  ? "Separate conversation and context with the same contacts."
                  : dialog === "new"
                    ? "Invite your collaborator and both bots to the same room."
                    : dialog === "name"
                      ? "Your name is a display label, not a verified identity."
                      : "The invitation includes the room key. Only share it with people you trust."}
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="primary-button"
                disabled={busy || !value.trim()}
              >
                {busy
                  ? "One moment…"
                  : dialog === "thread"
                    ? "Create thread"
                    : dialog === "new"
                      ? "Create room"
                      : dialog === "join"
                        ? "Open room"
                        : "Save name"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
