import assert from "node:assert/strict";
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
} from "../src/lib/contacts";
import type { Event, Contact } from "../src/lib/room";
const url = `https://example.com/room#${"a".repeat(24)}.${"b".repeat(43)}`;
const other = `https://example.com/room#${"c".repeat(24)}.${"d".repeat(43)}`;
const event = (author: string, values: Partial<Event> = {}): Event => ({
  author,
  text: "Fixture",
  clientId: crypto.randomUUID(),
  ts: Date.now(),
  ...values,
});
const events = [
  event("Aster", { kind: "contact", role: "bot", protocol: 2 }),
  event("aster's bot", { kind: "done" }),
  event("Orbit", { kind: "turn", role: "bot" }),
  event("Observer", { role: "human" }),
  event("Legacy observer"),
];
assert.deepEqual(
  roomBotNames(events),
  ["Aster", "Orbit"],
  "Legacy bot labels must not create duplicate or human contacts",
);
assert.equal(
  isBotEvent(event("Aster")),
  false,
  "A human does not become a bot because they share a name",
);
assert.equal(
  isBotEvent(event("Orbit", { role: "human", kind: "approval" })),
  false,
);
assert.equal(sameBot("ASTER", "aster's bot"), true);
assert.equal(contactHasJoined(events, "Aster"), true);
assert.equal(
  contactHasJoined(events, "Orbit"),
  false,
  "Old history or a caller's message does not prove their listener joined",
);
assert.equal(
  contactHasJoined(
    [...events, event("Orbit", { kind: "contact", protocol: 2 })],
    "orbit",
  ),
  true,
);
assert.equal(
  contactHasJoined([event("Orbit", { kind: "contact", protocol: 1 })], "Orbit"),
  false,
);
assert.equal(sameConnection(url, url + "&thread=project&me=Aster"), true);
assert.equal(sameConnection(url, other), false);
assert.equal(
  ownBotForRoom(url, [], {}, ["Aster"]),
  "",
  "A lone participant is not automatically your bot",
);
assert.equal(
  ownBotForRoom(
    url,
    [{ name: "Orbit", me: "Aster", url: url + "&thread=project" }],
    {},
    ["Aster", "Orbit"],
  ),
  "Aster",
);
assert.equal(
  ownBotForRoom(
    url,
    [{ name: "Orbit", me: "Aster", url }],
    { [connectionKey(url)]: "Orbit" },
    ["Aster", "Orbit"],
  ),
  "Orbit",
  "Explicit choice overrides old browser contacts",
);
assert.equal(ownBotForRoom(url, [], {}, ["Aster", "Orbit"], "aster"), "aster");
assert.equal(ownBotForRoom(url, [], {}, ["Orbit"], "Aster"), "");
const stale: Contact[] = [
  { name: "ASTER", url: url + "&thread=project" },
  { name: "Nova", me: "Aster", url: other },
];
const merged = mergeRoomContacts(stale, roomBotNames(events), url, "Aster");
assert.deepEqual(
  merged,
  [stale[1], { name: "Orbit", me: "Aster", url }],
  "Your own bot is removed from this room's contacts without deleting another connection",
);
assert.equal(
  mergeRoomContacts(stale, ["Aster"], url, ""),
  stale,
  "Unknown identity must not auto-add everyone as a callable contact",
);
assert.ok(
  !mergeRoomContacts(merged, ["aster's bot", "Orbit"], url, "Aster").some(
    (c) => sameConnection(c.url, url) && sameBot(c.name, "Aster"),
  ),
);
const opening = new URL(ownerRoomUrl(url + "&thread=project", "Aster"));
assert.equal(opening.search, "");
assert.ok(opening.hash.includes("&me=Aster"));
assert.ok(opening.hash.includes("thread=project"));
for (const name of ["__proto__", "constructor", "a bot", ""])
  assert.equal(validBotName(name), false);
console.log(
  "PASS: own-bot selection, room-scoped identity, legacy aliases, human/bot labels, stale self-contact removal, observer safety, and private opener hints.",
);
