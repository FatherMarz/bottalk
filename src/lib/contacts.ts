import type { Contact, Event } from "./room";

export function validBotName(name: string) {
  return (
    /^[\w.-]+$/.test(name) &&
    !["__proto__", "constructor", "prototype"].includes(name.toLowerCase())
  );
}

// Older listeners used an owner's name with this suffix for bot responses.
export function botName(name: string) {
  return name.trim().replace(/['’]s bot$/i, "");
}
export function sameBot(a: string, b: string) {
  return botName(a).toLowerCase() === botName(b).toLowerCase();
}
export function isBotEvent(event: Event) {
  if (event.role) return event.role === "bot";
  return [
    "contact",
    "status",
    "action",
    "answer",
    "done",
    "refused",
    "approval",
  ].includes(event.kind || "");
}
export function roomBotNames(events: Event[]) {
  const names = new Map<string, string>();
  for (const event of [
    ...events.filter((e) => e.kind === "contact"),
    ...events.filter(isBotEvent),
  ]) {
    const name = botName(event.author);
    if (validBotName(name) && !names.has(name.toLowerCase()))
      names.set(name.toLowerCase(), name);
  }
  return [...names.values()];
}
export function connectionKey(url: string) {
  return url.includes("#")
    ? url.split("#")[1].split("&")[0]
    : url.split("?")[0];
}
export function contactHasJoined(events: Event[], name: string) {
  return events.some(
    (event) =>
      event.kind === "contact" &&
      event.protocol === 2 &&
      sameBot(event.author, name),
  );
}
export function sameConnection(a: string, b: string) {
  return connectionKey(a) === connectionKey(b);
}
export function ownerRoomUrl(url: string, me: string) {
  if (!url.includes("#") || !validBotName(me)) return url;
  const [base, ...parts] = url.split("&");
  const params = new URLSearchParams(parts.join("&"));
  params.set("me", me);
  return `${base}&${params}`;
}
export function ownBotForRoom(
  url: string,
  contacts: Contact[],
  preferences: Record<string, string>,
  names: string[],
  defaultBot = "",
) {
  const remembered = preferences[connectionKey(url)];
  if (remembered && validBotName(remembered)) return remembered;
  const configured = contacts.find(
    (contact) => sameConnection(contact.url, url) && contact.me,
  )?.me;
  if (configured && validBotName(configured)) return configured;
  return validBotName(defaultBot) &&
    names.some((name) => sameBot(name, defaultBot))
    ? defaultBot
    : "";
}
export function mergeRoomContacts(
  previous: Contact[],
  names: string[],
  url: string,
  me: string,
) {
  if (!me) return previous;
  const merged = previous
    .filter(
      (contact) =>
        !sameConnection(contact.url, url) || !sameBot(contact.name, me),
    )
    .map((contact) =>
      sameConnection(contact.url, url) ? { ...contact, me } : contact,
    );
  for (const name of names) {
    if (
      !sameBot(name, me) &&
      !merged.some((contact) => sameBot(contact.name, name))
    )
      merged.push({ name, me, url });
  }
  return merged;
}
