import {
  useEffect,
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

type DialogName =
  | "new"
  | "join"
  | "contact"
  | "setup"
  | "name"
  | "thread"
  | null;
function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}
function Avatar({
  name,
  bot = false,
  small = false,
}: {
  name: string;
  bot?: boolean;
  small?: boolean;
}) {
  const tone = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4;
  return (
    <span
      className={`avatar tone-${tone} ${small ? "avatar-small" : ""} ${bot ? "avatar-bot" : ""}`}
      aria-hidden="true"
    >
      {bot ? (
        <svg
          className="avatar-glyph"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          {tone === 0 ? (
            <>
              <circle cx="16" cy="16" r="7.5" />
              <ellipse
                cx="16"
                cy="16"
                rx="13"
                ry="5"
                transform="rotate(-38 16 16)"
              />
              <circle className="glyph-point" cx="24" cy="7" r="2" />
            </>
          ) : tone === 1 ? (
            <>
              <rect x="7" y="7" width="9" height="9" rx="2" />
              <rect x="16" y="16" width="9" height="9" rx="2" />
              <path d="M20.5 7v9M7 20.5h9" />
            </>
          ) : tone === 2 ? (
            <>
              <path d="M16 4.5v23M4.5 16h23M8 8l16 16M8 24 24 8" />
              <circle cx="16" cy="16" r="5" />
            </>
          ) : (
            <>
              <path d="M16 4 27 24H5L16 4Z" />
              <path d="m16 12 6.5 12h-13L16 12Z" />
              <circle className="glyph-point" cx="16" cy="26.5" r="1.5" />
            </>
          )}
        </svg>
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
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
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
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
  const title = currentThread?.name || "Thread unavailable";
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
        const peers = [
          ...new Set(
            next.filter((e) => e.kind === "contact").map((e) => e.author),
          ),
        ];
        if (peers.length)
          setContacts((previous) => {
            const merged = [...previous];
            for (const name of peers)
              if (
                !merged.some((c) => c.name.toLowerCase() === name.toLowerCase())
              )
                merged.push({ name, url: roomUrl(ref) });
            writeLocal("bottalk-contacts", merged);
            return merged;
          });
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
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
  }, [ref]);
  useEffect(() => {
    if (nearBottom.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [events, search, selectedThread]);
  const botNames = [
    ...new Set(
      visibleEvents
        .filter(
          (e) =>
            e.role === "bot" ||
            ["status", "action", "done", "refused", "approval"].includes(
              e.kind || "",
            ),
        )
        .map((e) => e.author),
    ),
  ];
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
    if (open && !currentThread) {
      setError("Choose a thread before calling a contact.");
      return;
    }
    if (!open || (!demo && ref && contact.url !== roomUrl(ref))) {
      location.href = `${contact.url}${contact.url.includes("#") ? "&" : "?"}call=${encodeURIComponent(contact.name)}`;
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
      !callStarted.current
    ) {
      callStarted.current = true;
      void askContact({ name: decodeURIComponent(call), url: roomUrl(ref) });
      history.replaceState(null, "", threadUrl(ref, selectedThread));
    }
  }, [ref, connection, author]);
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
      await publish({
        author: author || "You",
        role: "human",
        ...asked(text),
        project: asked(text).project || currentThread?.project,
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
      if (dialog === "contact") {
        const url = demo ? "/demo" : roomUrl(await parseRoom(second));
        const next = [
          ...contacts.filter(
            (c) => c.name.toLowerCase() !== value.trim().toLowerCase(),
          ),
          { name: value.trim(), url },
        ];
        setContacts(next);
        if (!demo) writeLocal("bottalk-contacts", next);
      }
      setDialog(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied to clipboard");
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
        <a className="brand" href="/">
          <Mark />
          <span>bot talk</span>
        </a>
        <div className="nav-section-heading">
          {open ? "Threads" : "Your rooms"}
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
            : Object.entries(saved).map(([id, item]) => (
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
          {contacts.map((contact) => (
            <div className="contact-row" key={contact.name}>
              <Avatar name={contact.name} bot small />
              <div>
                <strong>{contact.name}</strong>
                <small>{open ? "Call in this thread" : "Shared room"}</small>
              </div>
              <button
                className="contact-call"
                onClick={() => void askContact(contact)}
                aria-label={`Call ${contact.name}`}
              >
                Call <span aria-hidden="true">↗</span>
              </button>
            </div>
          ))}
          {!contacts.length && <p className="nav-empty">No contacts yet.</p>}
        </div>
        <div className="sidebar-bottom">
          <button className="nav-link" onClick={() => openDialog("setup")}>
            <span>⌘</span> Connect your bot
          </button>
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
            <span>{open ? title : "Your workspace"}</span>
            {demo && <span className="example-label">Interactive example</span>}
          </div>
          <div className="header-actions">
            {open && (
              <>
                <button
                  className="quiet-button work-toggle"
                  onClick={() => setShowWork(!showWork)}
                >
                  Current work
                </button>
                <button
                  className="quiet-button"
                  onClick={() =>
                    demo
                      ? setNotice(
                          "This is an example room. Create your own to invite someone.",
                        )
                      : void copy(threadUrl(ref!, selectedThread))
                  }
                  disabled={!demo && !ref}
                >
                  Invite <span aria-hidden="true">↗</span>
                </button>
              </>
            )}
          </div>
        </header>
        {open ? (
          <>
            <section className="room-heading">
              <div>
                <h1>{title}</h1>
                {currentThread?.project && (
                  <p className="thread-project">{currentThread.project}</p>
                )}
              </div>
              <div className={`connection ${demo ? "demo-connection" : ""}`}>
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
                      <h2>
                        {search
                          ? "No matching messages"
                          : "Start a conversation"}
                      </h2>
                      <p>
                        {search
                          ? "Try another name or word."
                          : "Call a contact or send a message."}
                      </p>
                    </div>
                  )}
                  {conversation.map((event) => (
                    <article
                      key={event.clientId}
                      className={`message ${["action", "done", "refused", "approval-result"].includes(event.kind || "") ? "message-progress" : ""}`}
                    >
                      {[
                        "action",
                        "done",
                        "refused",
                        "approval-result",
                      ].includes(event.kind || "") ? (
                        <>
                          <span className="progress-check" aria-hidden="true">
                            {event.kind === "refused" ? "!" : "✓"}
                          </span>
                          <div>
                            <span className="progress-author">
                              {event.author}
                            </span>{" "}
                            {event.text}
                          </div>
                        </>
                      ) : (
                        <>
                          <Avatar
                            name={event.author}
                            bot={
                              event.role === "bot" ||
                              botNames.includes(event.author)
                            }
                          />
                          <div className="message-content">
                            <div className="message-heading">
                              <strong>{event.author}</strong>
                              {(event.role === "bot" ||
                                botNames.includes(event.author)) && (
                                <span className="bot-label">BOT</span>
                              )}
                              <time dateTime={new Date(event.ts).toISOString()}>
                                {new Date(event.ts).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </time>
                            </div>
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
                        event.author === name &&
                        ["status", "answer", "done", "refused"].includes(
                          event.kind || "",
                        ),
                    )
                    .at(-1);
                  const approval = pending.find(
                    (event) => event.author === name,
                  );
                  return (
                    <div className="agent-work" key={name}>
                      <div className="agent-work-heading">
                        <Avatar name={name} bot small />
                        <strong>{name}</strong>
                        <span
                          className={`work-status ${approval ? "needs-input" : ""}`}
                        >
                          {approval
                            ? "Needs approval"
                            : state?.state === "done" || state?.kind === "done"
                              ? "Ready"
                              : state?.state === "working"
                                ? "Working"
                                : "Last update"}
                        </span>
                      </div>
                      <p>
                        {approval?.text ||
                          state?.text ||
                          "Part of the conversation."}
                      </p>
                      {state && (
                        <time>
                          Updated{" "}
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
            <h1>Your workspace</h1>
            <p>Call a contact to work together in a shared room.</p>
            <div className="welcome-actions">
              <button
                className="primary-button"
                onClick={() => openDialog("new")}
              >
                Create a room <span aria-hidden="true">↗</span>
              </button>
              <a className="quiet-button" href="/demo">
                View example
              </a>
            </div>
            {Object.entries(saved).length > 0 && (
              <div className="recent-rooms">
                <h2>Recent rooms</h2>
                {Object.entries(saved).map(([id, item]) => (
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
              contact: "Add contact",
              setup: "Connect your bot",
              name: "Your name",
            }[dialog]
          }
        >
          {dialog === "setup" ? (
            <div className="setup-content">
              <p>Install Bot Talk on each machine.</p>
              <div className="copy-command">
                <code>curl -fsSL https://bottalk.me/install.sh | bash</code>
                <button
                  className="quiet-button"
                  onClick={() =>
                    void copy("curl -fsSL https://bottalk.me/install.sh | bash")
                  }
                >
                  Copy
                </button>
              </div>
              <p>
                Give your bot the room link. Configure project access and email
                locally.
              </p>
              <button
                className="primary-button"
                onClick={() =>
                  ref
                    ? void copy(roomUrl(ref))
                    : setNotice(
                        "Create a room first, then share its invitation with your bot.",
                      )
                }
              >
                Copy room invitation
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void submitDialog(e)}>
              <label className="field-label">
                {dialog === "thread"
                  ? "Thread name"
                  : dialog === "new"
                    ? "Room name"
                    : dialog === "join"
                      ? "Invitation link"
                      : dialog === "contact"
                        ? "Bot name"
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
                          : dialog === "contact"
                            ? "Bot name"
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
              {dialog === "contact" && (
                <label className="field-label">
                  Shared room invitation
                  <input
                    required={!demo}
                    value={second}
                    onChange={(e) => setSecond(e.target.value)}
                    placeholder="https://…/room#…"
                  />
                </label>
              )}
              <p className="form-help">
                {dialog === "thread"
                  ? "Separate conversation and context with the same contacts."
                  : dialog === "contact"
                    ? "Contacts stay on this device. Use the same bot name as the listener on their machine."
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
                      : dialog === "contact"
                        ? "Save contact"
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
