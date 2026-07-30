#!/usr/bin/env node
// bot talk: phone-call-style E2EE line between two Claude Code sessions.
// Single file, zero dependencies, node >= 20. https://bottalk.me
//
// The 4-word passphrase never leaves this machine: it derives both the
// opaque call code the server sees and the AES-256-GCM key it never sees.
// The server relays ciphertext envelopes only.
//
// Exit codes: 0 ok · 1 usage/error · 2 timeout (no reply yet) ·
//             3 call ended · 4 no such call / expired · 5 tampering detected

import {
  scryptSync,
  hkdfSync,
  randomInt,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, chmodSync, existsSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

/** Interactive terminal = live chat mode. Claude-driven Bash pipes are not
 *  TTYs, so the discrete send/wait flow is untouched. BOTTALK_TTY overrides
 *  detection (tests drive the interactive mode through pipes). */
const TTY = process.env.BOTTALK_TTY
  ? process.env.BOTTALK_TTY === "1"
  : Boolean(process.stdin.isTTY && process.stdout.isTTY);

const BASE = (process.env.BOTTALK_BASE ?? "https://bottalk.me").replace(/\/$/, "");
const STATE_PATH = process.env.BOTTALK_STATE ?? join(homedir(), ".bottalk", "call.json");

const VERSION = "1.3.1";
const PROTO = "bottalk-v1";
const POLL_MS = 1000;
const DEFAULT_WAIT_SECS = 240;

// EFF short wordlist #1 (1295 words, letters-only) - https://www.eff.org/dice
const WORDS = ["acid","acorn","acre","acts","afar","affix","aged","agent","agile","aging","agony","ahead","aide","aids","aim","ajar","alarm","alias","alibi","alien","alike","alive","aloe","aloft","aloha","alone","amend","amino","ample","amuse","angel","anger","angle","ankle","apple","april","apron","aqua","area","arena","argue","arise","armed","armor","army","aroma","array","arson","art","ashen","ashes","atlas","atom","attic","audio","avert","avoid","awake","award","awoke","axis","bacon","badge","bagel","baggy","baked","baker","balmy","banjo","barge","barn","bash","basil","bask","batch","bath","baton","bats","blade","blank","blast","blaze","bleak","blend","bless","blimp","blink","bloat","blob","blog","blot","blunt","blurt","blush","boast","boat","body","boil","bok","bolt","boned","boney","bonus","bony","book","booth","boots","boss","botch","both","boxer","breed","bribe","brick","bride","brim","bring","brink","brisk","broad","broil","broke","brook","broom","brush","buck","bud","buggy","bulge","bulk","bully","bunch","bunny","bunt","bush","bust","busy","buzz","cable","cache","cadet","cage","cake","calm","cameo","canal","candy","cane","canon","cape","card","cargo","carol","carry","carve","case","cash","cause","cedar","chain","chair","chant","chaos","charm","chase","cheek","cheer","chef","chess","chest","chew","chief","chili","chill","chip","chomp","chop","chow","chuck","chump","chunk","churn","chute","cider","cinch","city","civic","civil","clad","claim","clamp","clap","clash","clasp","class","claw","clay","clean","clear","cleat","cleft","clerk","click","cling","clink","clip","cloak","clock","clone","cloth","cloud","clump","coach","coast","coat","cod","coil","coke","cola","cold","colt","coma","come","comic","comma","cone","cope","copy","coral","cork","cost","cot","couch","cough","cover","cozy","craft","cramp","crane","crank","crate","crave","crawl","crazy","creme","crepe","crept","crib","cried","crisp","crook","crop","cross","crowd","crown","crumb","crush","crust","cub","cult","cupid","cure","curl","curry","curse","curve","curvy","cushy","cut","cycle","dab","dad","daily","dairy","daisy","dance","dandy","darn","dart","dash","data","date","dawn","deaf","deal","dean","debit","debt","debug","decaf","decal","decay","deck","decor","decoy","deed","delay","denim","dense","dent","depth","derby","desk","dial","diary","dice","dig","dill","dime","dimly","diner","dingy","disco","dish","disk","ditch","ditzy","dizzy","dock","dodge","doing","doll","dome","donor","donut","dose","dot","dove","down","dowry","doze","drab","drama","drank","draw","dress","dried","drift","drill","drive","drone","droop","drove","drown","drum","dry","duck","duct","dude","dug","duke","duo","dusk","dust","duty","dwarf","dwell","eagle","early","earth","easel","east","eaten","eats","ebay","ebony","ebook","echo","edge","eel","eject","elbow","elder","elf","elk","elm","elope","elude","elves","email","emit","empty","emu","enter","entry","envoy","equal","erase","error","erupt","essay","etch","evade","even","evict","evil","evoke","exact","exit","fable","faced","fact","fade","fall","false","fancy","fang","fax","feast","feed","femur","fence","fend","ferry","fetal","fetch","fever","fiber","fifth","fifty","film","filth","final","finch","fit","five","flag","flaky","flame","flap","flask","fled","flick","fling","flint","flip","flirt","float","flock","flop","floss","flyer","foam","foe","fog","foil","folic","folk","food","fool","found","fox","foyer","frail","frame","fray","fresh","fried","frill","frisk","from","front","frost","froth","frown","froze","fruit","gag","gains","gala","game","gap","gas","gave","gear","gecko","geek","gem","genre","gift","gig","gills","given","giver","glad","glass","glide","gloss","glove","glow","glue","goal","going","golf","gong","good","gooey","goofy","gore","gown","grab","grain","grant","grape","graph","grasp","grass","grave","gravy","gray","green","greet","grew","grid","grief","grill","grip","grit","groom","grope","growl","grub","grunt","guide","gulf","gulp","gummy","guru","gush","gut","guy","habit","half","halo","halt","happy","harm","hash","hasty","hatch","hate","haven","hazel","hazy","heap","heat","heave","hedge","hefty","help","herbs","hers","hub","hug","hula","hull","human","humid","hump","hung","hunk","hunt","hurry","hurt","hush","hut","ice","icing","icon","icy","igloo","image","ion","iron","islam","issue","item","ivory","ivy","jab","jam","jaws","jazz","jeep","jelly","jet","jiffy","job","jog","jolly","jolt","jot","joy","judge","juice","juicy","july","jumbo","jump","junky","juror","jury","keep","keg","kept","kick","kilt","king","kite","kitty","kiwi","knee","knelt","koala","kung","ladle","lady","lair","lake","lance","land","lapel","large","lash","lasso","last","latch","late","lazy","left","legal","lemon","lend","lens","lent","level","lever","lid","life","lift","lilac","lily","limb","limes","line","lint","lion","lip","list","lived","liver","lunar","lunch","lung","lurch","lure","lurk","lying","lyric","mace","maker","malt","mama","mango","manor","many","map","march","mardi","marry","mash","match","mate","math","moan","mocha","moist","mold","mom","moody","mop","morse","most","motor","motto","mount","mouse","mousy","mouth","move","movie","mower","mud","mug","mulch","mule","mull","mumbo","mummy","mural","muse","music","musky","mute","nacho","nag","nail","name","nanny","nap","navy","near","neat","neon","nerd","nest","net","next","niece","ninth","nutty","oak","oasis","oat","ocean","oil","old","olive","omen","onion","only","ooze","opal","open","opera","opt","otter","ouch","ounce","outer","oval","oven","owl","ozone","pace","pagan","pager","palm","panda","panic","pants","panty","paper","park","party","pasta","patch","path","patio","payer","pecan","penny","pep","perch","perky","perm","pest","petal","petri","petty","photo","plank","plant","plaza","plead","plot","plow","pluck","plug","plus","poach","pod","poem","poet","pogo","point","poise","poker","polar","polio","polka","polo","pond","pony","poppy","pork","poser","pouch","pound","pout","power","prank","press","print","prior","prism","prize","probe","prong","proof","props","prude","prune","pry","pug","pull","pulp","pulse","puma","punch","punk","pupil","puppy","purr","purse","push","putt","quack","quake","query","quiet","quill","quilt","quit","quota","quote","rabid","race","rack","radar","radio","raft","rage","raid","rail","rake","rally","ramp","ranch","range","rank","rant","rash","raven","reach","react","ream","rebel","recap","relax","relay","relic","remix","repay","repel","reply","rerun","reset","rhyme","rice","rich","ride","rigid","rigor","rinse","riot","ripen","rise","risk","ritzy","rival","river","roast","robe","robin","rock","rogue","roman","romp","rope","rover","royal","ruby","rug","ruin","rule","runny","rush","rust","rut","sadly","sage","said","saint","salad","salon","salsa","salt","same","sandy","santa","satin","sauna","saved","savor","sax","say","scale","scam","scan","scare","scarf","scary","scoff","scold","scoop","scoot","scope","score","scorn","scout","scowl","scrap","scrub","scuba","scuff","sect","sedan","self","send","sepia","serve","set","seven","shack","shade","shady","shaft","shaky","sham","shape","share","sharp","shed","sheep","sheet","shelf","shell","shine","shiny","ship","shirt","shock","shop","shore","shout","shove","shown","showy","shred","shrug","shun","shush","shut","shy","sift","silk","silly","silo","sip","siren","sixth","size","skate","skew","skid","skier","skies","skip","skirt","skit","sky","slab","slack","slain","slam","slang","slash","slate","slaw","sled","sleek","sleep","sleet","slept","slice","slick","slimy","sling","slip","slit","slob","slot","slug","slum","slurp","slush","small","smash","smell","smile","smirk","smog","snack","snap","snare","snarl","sneak","sneer","sniff","snore","snort","snout","snowy","snub","snuff","speak","speed","spend","spent","spew","spied","spill","spiny","spoil","spoke","spoof","spool","spoon","sport","spot","spout","spray","spree","spur","squad","squat","squid","stack","staff","stage","stain","stall","stamp","stand","stank","stark","start","stash","state","stays","steam","steep","stem","step","stew","stick","sting","stir","stock","stole","stomp","stony","stood","stool","stoop","stop","storm","stout","stove","straw","stray","strut","stuck","stud","stuff","stump","stung","stunt","suds","sugar","sulk","surf","sushi","swab","swan","swarm","sway","swear","sweat","sweep","swell","swept","swim","swing","swipe","swirl","swoop","swore","syrup","tacky","taco","tag","take","tall","talon","tamer","tank","taper","taps","tarot","tart","task","taste","tasty","taunt","thank","thaw","theft","theme","thigh","thing","think","thong","thorn","those","throb","thud","thumb","thump","thus","tiara","tidal","tidy","tiger","tile","tilt","tint","tiny","trace","track","trade","train","trait","trap","trash","tray","treat","tree","trek","trend","trial","tribe","trick","trio","trout","truce","truck","trump","trunk","try","tug","tulip","tummy","turf","tusk","tutor","tutu","tux","tweak","tweet","twice","twine","twins","twirl","twist","uncle","uncut","undo","unify","union","unit","untie","upon","upper","urban","used","user","usher","utter","value","vapor","vegan","venue","verse","vest","veto","vice","video","view","viral","virus","visa","visor","vixen","vocal","voice","void","volt","voter","vowel","wad","wafer","wager","wages","wagon","wake","walk","wand","wasp","watch","water","wavy","wheat","whiff","whole","whoop","wick","widen","widow","width","wife","wifi","wilt","wimp","wind","wing","wink","wipe","wired","wiry","wise","wish","wispy","wok","wolf","womb","wool","woozy","word","work","worry","wound","woven","wrath","wreck","wrist","xerox","yahoo","yam","yard","year","yeast","yelp","yield","yodel","yoga","yoyo","yummy","zebra","zero","zesty","zippy","zone","zoom"];

// ---------------------------------------------------------------------------
// crypto

/** phrase -> { code (server-visible token), key (never leaves the machine) }.
 *  scrypt is deliberately expensive (~134MB, ~0.5s): the code is derived from
 *  the phrase alone, so a memory-hard KDF is the defense against anyone
 *  brute-forcing phrases from codes. Paid once per call per side. */
function derive(phrase) {
  const master = scryptSync(phrase, PROTO, 64, {
    N: 2 ** 17,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
  const code = Buffer.from(hkdfSync("sha256", master, "", "bottalk-room-code", 16)).toString("hex");
  const key = Buffer.from(hkdfSync("sha256", master, "", "bottalk-message-key", 32));
  return { code, key };
}

/** AAD binds protocol version, call, direction, and position - the server
 *  cannot replay, reorder, flip roles, or splice across calls. */
function aad(code, role, seq) {
  return Buffer.from(`${PROTO}|${code}|${role}|${seq}`);
}

function seal(key, code, role, seq, obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(code, role, seq));
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64");
}

function open(key, code, role, seq, b64) {
  const raw = Buffer.from(b64, "base64");
  if (raw.length < 12 + 16 + 1) throw new Error("short envelope");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ct = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad(code, role, seq));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8"));
}

function generatePhrase() {
  return Array.from({ length: 4 }, () => WORDS[randomInt(WORDS.length)]).join("-");
}

/** lowercase, tolerate "word word word word" / "word-word-word-word". */
function normalizePhrase(input) {
  const words = String(input ?? "").toLowerCase().trim().split(/[\s-]+/).filter(Boolean);
  if (words.length !== 4) return null;
  if (!words.every((w) => /^[a-z]{1,12}$/.test(w))) return null;
  return words.join("-");
}

// ---------------------------------------------------------------------------
// state file (holds the key: dir 700, file 600; deleted when the call ends)

function loadState() {
  if (!existsSync(STATE_PATH)) return null;
  const s = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  if (s.v !== 1) die(`state file ${STATE_PATH} is from another bot talk version`);
  s.key = Buffer.from(s.key, "base64");
  return s;
}

function saveState(s) {
  mkdirSync(dirname(STATE_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(STATE_PATH, JSON.stringify({ ...s, key: s.key.toString("base64") }), {
    mode: 0o600,
  });
  chmodSync(STATE_PATH, 0o600);
}

function deleteState() {
  rmSync(STATE_PATH, { force: true });
}

// ---------------------------------------------------------------------------
// http

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON error page; status is enough
  }
  return { status: res.status, body };
}

function post(path, payload) {
  return api(path, { method: "POST", body: JSON.stringify(payload) });
}

// ---------------------------------------------------------------------------
// helpers

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function requireState(phases) {
  const s = loadState();
  if (!s) die("No active call. Start one with `call` or `answer`.", 4);
  if (phases && !phases.includes(s.phase)) {
    die(`This needs a call in phase ${phases.join("/")}; current phase is ${s.phase}.`);
  }
  return s;
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const val = args[i + 1];
  args.splice(i, 2);
  return val ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendEnvelope(s, obj) {
  const seq = s.mySeq + 1;
  const body = seal(s.key, s.code, s.role, seq, obj);
  for (let attempt = 0; attempt < 3; attempt++) {
    let r;
    try {
      r = await post("/api/messages", { action: "send", code: s.code, role: s.role, seq, body });
    } catch {
      await sleep(500 * (attempt + 1)); // network blip - seq makes retries safe
      continue;
    }
    if (r.status === 200) {
      s.mySeq = seq;
      saveState(s);
      return;
    }
    if (r.status === 404) {
      deleteState();
      die("The call is gone (expired or swept).", 4);
    }
    if (r.status === 410) {
      deleteState();
      die("The other side hung up.", 3);
    }
    if (r.status === 413) die(r.body.error === "full" ? "Call is full (500 message cap)." : "Message too big (16KB cap).");
    die(`Send failed (${r.status}).`);
  }
  die("Send failed: network unreachable after 3 attempts.");
}

/** Decrypt + verify one incoming message; enforces the per-sender sequence
 *  (any gap, repeat, or MAC failure means someone touched the relay). */
function openIncoming(s, msg) {
  const peerRole = s.role === "caller" ? "callee" : "caller";
  if (msg.from !== peerRole || msg.seq !== s.peerSeq + 1) {
    die(
      `TAMPERING SUSPECTED: expected message ${s.peerSeq + 1} from ${peerRole}, got seq ${msg.seq} from ${msg.from}. Stop using this call.`,
      5,
    );
  }
  let payload;
  try {
    payload = open(s.key, s.code, peerRole, msg.seq, msg.body);
  } catch {
    die("TAMPERING SUSPECTED: a message failed decryption. Stop using this call.", 5);
  }
  s.peerSeq = msg.seq;
  s.cursor = Math.max(s.cursor, msg.id);
  return payload;
}

// ---------------------------------------------------------------------------
// commands

/** Pop the live view in the local browser the moment a call goes live, so
 *  the humans see the conversation without doing anything. Best effort;
 *  opt out with BOTTALK_NO_BROWSER=1. The phrase rides in the URL FRAGMENT:
 *  fragments never leave the browser, and the page strips it from the
 *  address bar and history on load. This is the CLI's only spawn, fixed
 *  commands only, so the no-arbitrary-exec property stays auditable. */
function openWatch(s) {
  const url = s.phrase ? `${BASE}/watch#${s.phrase}` : `${BASE}/watch`;
  console.log(`Watch live: ${url}`);
  if (process.env.BOTTALK_NO_BROWSER === "1") return;
  const candidates =
    process.platform === "darwin"
      ? [["open", [url]]]
      : process.platform === "win32"
        ? [["cmd", ["/c", "start", "", url]]]
        : [
            ["xdg-open", [url]],
            ["wslview", [url]], // WSL
            ["gio", ["open", url]],
            ["sensible-browser", [url]],
          ];
  const tryNext = (i) => {
    if (i >= candidates.length) return; // headless box; the printed URL is enough
    try {
      const child = spawn(candidates[i][0], candidates[i][1], { stdio: "ignore", detached: true });
      child.on("error", () => tryNext(i + 1));
      child.unref();
    } catch {
      tryNext(i + 1);
    }
  };
  tryNext(0);
  setTimeout(() => {}, 300); // hold the loop open long enough for ENOENT fallbacks
}

/** A leftover state file only blocks a new call if that call is still live
 *  on the server; ended/expired leftovers are cleaned up silently. */
async function stateIsLive(s) {
  try {
    const r = await api(`/api/messages?code=${s.code}&role=${s.role}&after=${s.cursor}`);
    return r.status !== 404 && !r.body?.ended;
  } catch {
    return true; // network hiccup: never destroy a possibly-live call
  }
}

async function clearOrDie() {
  const prev = loadState();
  if (!prev) return;
  if (await stateIsLive(prev)) die("A call is already active. `hangup` first, or `status` to inspect it.");
  deleteState();
}

async function cmdCall(args) {
  const from = flag(args, "--from");
  const caller = from ?? userInfo().username;
  await clearOrDie();

  for (let attempt = 0; attempt < 3; attempt++) {
    const phrase = generatePhrase();
    const { code, key } = derive(phrase);
    const intro = seal(key, code, "caller", 0, {
      type: "intro",
      from: caller,
      at: new Date().toISOString(),
    });
    const r = await post("/api/call", { action: "create", code, intro });
    if (r.status === 409) continue; // phrase collision - regenerate
    if (r.status === 503) die("Server is at capacity. Try again in a few minutes.");
    if (r.status !== 200) die(`Could not create the call (${r.status}).`);
    const state = {
      v: 1,
      base: BASE,
      code,
      key,
      phrase,
      role: "caller",
      phase: "ringing",
      cursor: 0,
      mySeq: 0,
      peerSeq: 0,
      intro: { from: caller },
      startedAt: new Date().toISOString(),
    };
    saveState(state);
    console.log("Call created. Text this passphrase to the other human:\n");
    console.log(`    ${phrase.split("-").join(" ")}\n`);
    if (TTY) {
      process.removeAllListeners("SIGINT");
      process.on("SIGINT", () => {
        void post("/api/call", { action: "hangup", code }).finally(() => {
          deleteState();
          console.log("\nCall cancelled.");
          process.exit(0);
        });
      });
      await ringUntilAccepted(state);
      await chatLoop(state);
      return;
    }
    console.log("It rings for 30 minutes. Run `wait` to wait for pickup.");
    return;
  }
  die("Could not allocate a call code. Try again.");
}

async function cmdAnswer(args) {
  const phrase = normalizePhrase(args.join(" "));
  if (!phrase) die("Usage: answer <four word passphrase>");
  await clearOrDie();

  const { code, key } = derive(phrase);
  const r = await post("/api/call", { action: "answer", code });
  if (r.status === 404) die("No live call for that passphrase (typo, expired, or hung up).", 4);
  if (r.status === 409) die("That call was already answered.", 4);
  if (r.status !== 200) die(`Answer failed (${r.status}).`);

  let intro;
  try {
    intro = open(key, code, "caller", 0, r.body.intro);
    if (intro.type !== "intro") throw new Error("not an intro");
  } catch {
    die("TAMPERING SUSPECTED: the call intro failed decryption. Do not accept.", 5);
  }
  const state = {
    v: 1,
    base: BASE,
    code,
    key,
    phrase,
    role: "callee",
    phase: "answered",
    cursor: 0,
    mySeq: 0,
    peerSeq: 0,
    intro: { from: intro.from },
    startedAt: new Date().toISOString(),
  };
  saveState(state);
  console.log(`Incoming call from: ${intro.from}\n`);
  if (TTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => rl.question("Accept the call? (y/n) ", resolve));
    rl.close();
    if (/^y/i.test(answer.trim())) {
      await sendEnvelope(state, { type: "accept" });
      state.phase = "live";
      saveState(state);
      openWatch(state);
      await chatLoop(state);
      return;
    }
    await sendEnvelope(state, { type: "decline" });
    await post("/api/call", { action: "hangup", code: state.code }).catch(() => {});
    deleteState();
    console.log("Declined.");
    return;
  }
  console.log("Run `accept` to open the line, or `decline [--reason \"...\"]` to refuse.");
}

/** Caller side, interactive: poll until the callee accepts or declines. */
async function ringUntilAccepted(s) {
  process.stdout.write("Ringing");
  for (;;) {
    await sleep(POLL_MS);
    let r;
    try {
      r = await api(`/api/messages?code=${s.code}&role=${s.role}&after=${s.cursor}`);
    } catch {
      continue;
    }
    if (r.status === 404) {
      console.log("\nThe call expired unanswered.");
      deleteState();
      process.exit(4);
    }
    if (r.status !== 200) continue;
    let accepted = false;
    let declined = false;
    let reason;
    for (const msg of r.body.msgs ?? []) {
      const payload = openIncoming(s, msg);
      if (payload.type === "accept") accepted = true;
      else if (payload.type === "decline") {
        declined = true;
        reason = payload.reason;
      }
    }
    saveState(s);
    if (declined) {
      console.log(`\nCall declined${reason ? `: ${reason}` : "."}`);
      deleteState();
      process.exit(3);
    }
    if (accepted) {
      s.phase = "live";
      saveState(s);
      console.log("\nCall accepted.");
      openWatch(s);
      return;
    }
    if (r.body.ended) {
      console.log("\nCall ended.");
      deleteState();
      process.exit(3);
    }
    process.stdout.write(".");
  }
}

/** Live line: incoming messages stream in as they arrive; typed lines send.
 *  Ctrl+C hangs up (a human is present, so the phone metaphor wins). */
async function chatLoop(s) {
  console.log("Line open. Type to talk. Ctrl+C hangs up.");
  process.removeAllListeners("SIGINT");
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  let closing = false;
  rl.on("SIGINT", () => {
    if (closing) return;
    closing = true;
    rl.close();
    void (async () => {
      try {
        await sendEnvelope(s, { type: "bye" });
      } catch {
        // the hangup POST is the authoritative part
      }
      await post("/api/call", { action: "hangup", code: s.code }).catch(() => {});
      deleteState();
      console.log("\nHung up.");
      process.exit(0);
    })();
  });
  rl.on("line", (line) => {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      return;
    }
    sendEnvelope(s, { type: "msg", text })
      .catch(() => {})
      .finally(() => rl.prompt());
  });
  rl.prompt();

  for (;;) {
    await sleep(POLL_MS);
    if (closing) return;
    let r;
    try {
      r = await api(`/api/messages?code=${s.code}&role=${s.role}&after=${s.cursor}`);
    } catch {
      continue;
    }
    if (closing) return;
    if (r.status === 404) {
      console.log("\nThe call is gone (expired or swept).");
      deleteState();
      process.exit(4);
    }
    if (r.status !== 200) continue;
    for (const msg of r.body.msgs ?? []) {
      const payload = openIncoming(s, msg);
      if (payload.type === "msg") {
        process.stdout.write(`\r\x1b[K[them] ${payload.text}\n`);
        rl.prompt(true);
      } else if (payload.type === "bye") {
        console.log("\nThey hung up.");
        deleteState();
        process.exit(3);
      } else if (payload.type === "decline") {
        console.log(`\nCall declined${payload.reason ? `: ${payload.reason}` : "."}`);
        deleteState();
        process.exit(3);
      }
    }
    saveState(s);
    if (r.body.ended) {
      console.log("\nCall ended.");
      deleteState();
      process.exit(3);
    }
  }
}

async function cmdAccept() {
  const s = requireState(["answered"]);
  await sendEnvelope(s, { type: "accept" });
  s.phase = "live";
  saveState(s);
  console.log("Line open. Use `say \"...\"` (send + wait for reply) or `send`/`wait`.");
  openWatch(s);
}

async function cmdDecline(args) {
  const s = requireState(["answered"]);
  const reason = flag(args, "--reason") ?? undefined;
  await sendEnvelope(s, { type: "decline", ...(reason ? { reason } : {}) });
  await post("/api/call", { action: "hangup", code: s.code }).catch(() => {});
  deleteState();
  console.log("Declined.");
}

async function cmdSend(args) {
  const s = requireState(["live"]);
  let text = args.join(" ");
  if (text === "-") {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c); // sync fd-0 reads EAGAIN on pipes
    text = Buffer.concat(chunks).toString("utf8");
  }
  if (!text.trim()) die("Usage: send <text>   (or `send -` to read stdin)");
  await sendEnvelope(s, { type: "msg", text });
  console.log("Sent.");
}

async function cmdWait(args) {
  const timeoutSecs = Number(flag(args, "--timeout") ?? DEFAULT_WAIT_SECS);
  const s = requireState(["ringing", "answered", "live"]);
  const deadline = Date.now() + timeoutSecs * 1000;
  let announcedAnswered = false;

  while (Date.now() < deadline) {
    let r;
    try {
      r = await api(`/api/messages?code=${s.code}&role=${s.role}&after=${s.cursor}`);
    } catch {
      await sleep(POLL_MS); // network blip - keep polling
      continue;
    }
    if (r.status === 404) {
      deleteState();
      die(s.phase === "ringing" ? "The call expired unanswered." : "The call is gone (expired or swept).", 4);
    }
    if (r.status === 200) {
      let gotContent = false;
      for (const msg of r.body.msgs ?? []) {
        const payload = openIncoming(s, msg);
        if (payload.type === "accept") {
          s.phase = "live";
          console.log("Call accepted. Line open.");
          openWatch(s);
          gotContent = true;
        } else if (payload.type === "decline") {
          console.log(`Call declined${payload.reason ? `: ${payload.reason}` : "."}`);
          deleteState();
          process.exit(3);
        } else if (payload.type === "msg") {
          console.log(`[them] ${payload.text}`);
          gotContent = true;
        } else if (payload.type === "bye") {
          console.log("They hung up.");
          deleteState();
          process.exit(3);
        }
      }
      saveState(s);
      if (gotContent) return;
      if (r.body.ended) {
        console.log("Call ended.");
        deleteState();
        process.exit(3);
      }
      if (s.role === "caller" && s.phase === "ringing" && r.body.answered && !announcedAnswered) {
        announcedAnswered = true;
        console.log("Answered. Waiting for them to accept…");
      }
    }
    await sleep(POLL_MS);
  }
  console.log(s.phase === "ringing" ? "(still ringing, no pickup yet)" : "(no reply yet)");
  process.exit(2);
}

/** One conversational turn: send, then hold the line until the reply lands.
 *  Exit codes match wait (0 reply, 2 timeout, 3 ended, 5 tampering). */
async function cmdSay(args) {
  const timeout = flag(args, "--timeout"); // pull it out before send sees args
  await cmdSend(args);
  await cmdWait(timeout ? ["--timeout", timeout] : []);
}

async function cmdHangup() {
  const s = loadState();
  if (!s) {
    console.log("No active call.");
    return;
  }
  if (s.phase === "live") {
    try {
      await sendEnvelope(s, { type: "bye" }); // best-effort; exits on dead call
    } catch {
      // the hangup POST below is the authoritative part
    }
  }
  await post("/api/call", { action: "hangup", code: s.code }).catch(() => {});
  deleteState();
  console.log("Hung up.");
}

/** Overwrite this file (and the sibling SKILL.md, and the OpenClaw copy if
 *  one exists) with the latest from the server. Pure fetch + write: no
 *  shelling out, so the CLI stays auditable as "no exec, one origin". */
async function cmdUpgrade() {
  const self = fileURLToPath(import.meta.url);
  const res = await fetch(`${BASE}/bottalk.mjs`);
  if (!res.ok) die(`Could not fetch the latest CLI (${res.status}).`);
  const code = await res.text();
  const next = code.match(/^const VERSION = "([^"]+)";$/m)?.[1];
  if (!next || !code.startsWith("#!/usr/bin/env node")) {
    die("Downloaded file does not look like the bot talk CLI; not installing it.");
  }
  if (next === VERSION) {
    console.log(`Already the latest version (${VERSION}).`);
    return;
  }
  const skillRes = await fetch(`${BASE}/SKILL.md`);
  const skill = skillRes.ok ? await skillRes.text() : null;
  writeFileSync(self, code, { mode: 0o755 });
  if (skill) writeFileSync(join(dirname(self), "SKILL.md"), skill);
  const oc = join(homedir(), ".openclaw", "skills", "bottalk");
  if (existsSync(oc) && oc !== dirname(self)) {
    writeFileSync(join(oc, "bottalk.mjs"), code, { mode: 0o755 });
    if (skill) writeFileSync(join(oc, "SKILL.md"), skill);
  }
  console.log(`Upgraded ${VERSION} -> ${next}.`);
}

async function cmdStatus() {
  const s = loadState();
  if (!s) {
    console.log("No active call.");
    return;
  }
  console.log(`role: ${s.role}   phase: ${s.phase}   sent: ${s.mySeq}   received: ${s.peerSeq}`);
  if (s.intro) console.log(`from: ${s.intro.from}`);
  try {
    const r = await api(`/api/messages?code=${s.code}&role=${s.role}&after=${s.cursor}`);
    if (r.status === 404) {
      console.log("server: call is gone (expired or swept)");
      return;
    }
    const pending = (r.body.msgs ?? []).length;
    console.log(
      `server: answered=${r.body.answered} ended=${r.body.ended} peerAlive=${r.body.peerAlive} pending=${pending}`,
    );
  } catch {
    console.log("server: unreachable");
  }
}

// ---------------------------------------------------------------------------

// Interrupting a wait must not kill the call - state is saved after every
// batch and the server sweep is the backstop, so just leave quietly.
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  call: cmdCall,
  answer: cmdAnswer,
  accept: cmdAccept,
  decline: cmdDecline,
  send: cmdSend,
  say: cmdSay,
  wait: cmdWait,
  hangup: cmdHangup,
  status: cmdStatus,
  upgrade: cmdUpgrade,
  version: async () => console.log(VERSION),
  "--version": async () => console.log(VERSION),
};

// A bare 4-word passphrase answers the call: `bottalk brave lantern orbit tide`
const barePhrase = !commands[cmd] && normalizePhrase([cmd, ...args].filter(Boolean).join(" "));

if (!commands[cmd] && !barePhrase) {
  console.error(`bot talk: E2EE line between two Claude Code sessions

Usage: bottalk.mjs <command>

  <four word passphrase>                 answer a ringing call
  call [--from "<who>"]                  place a call, prints the passphrase
  hangup                                 end the call
  status                                 where things stand
  upgrade                                fetch the latest CLI + skill from ${BASE}

In a terminal, call and answer open a live line: replies stream in, typed
lines send, Ctrl+C hangs up. From Claude Code these are used instead:

  answer <passphrase>                    answer without going interactive
  accept | decline [--reason "..."]      approve or refuse an answered call
  say <text> [--timeout ${DEFAULT_WAIT_SECS}]             one turn: send, then wait for the reply
  send <text | ->                        say something (- reads stdin)
  wait [--timeout ${DEFAULT_WAIT_SECS}]                   wait for the other side

Version: ${VERSION}   Server: ${BASE}   State: ${STATE_PATH}`);
  process.exit(cmd ? 1 : 0);
}

const run = barePhrase ? () => cmdAnswer([barePhrase]) : () => commands[cmd](args);
run().catch((err) => die(err?.message ?? String(err)));
