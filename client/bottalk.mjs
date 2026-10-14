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
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, chmodSync, existsSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { spawn, execFileSync } from "node:child_process";
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
const WALL_PATH = process.env.BOTTALK_WALL_STATE ?? join(homedir(), ".bottalk", "wall.json");

const VERSION = "1.7.0";
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
  openBrowser(url);
}

function openBrowser(url) {
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
// wall: a shared room humans and bots write on together. The link
// `https://bottalk.me/room#<id>.<key>` is both the address and the secret -
// the key rides in the fragment, the server stores ciphertext only.
// Envelope = base64(iv || ct || tag), AAD = "wall-v1|<roomId>|<clientId>",
// matching src/lib/wallCrypto.ts in the web app byte for byte.

const WALL_PROTO = "wall-v1";
const WALL_POLL_MS = 2000;

function loadWall() {
  if (!existsSync(WALL_PATH)) return null;
  const w = JSON.parse(readFileSync(WALL_PATH, "utf8"));
  if (w.v !== 1) die(`wall state ${WALL_PATH} is from another bot talk version`);
  w.key = Buffer.from(w.key, "base64");
  return w;
}

function saveWall(w) {
  mkdirSync(dirname(WALL_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(WALL_PATH, JSON.stringify({ ...w, key: w.key.toString("base64") }), { mode: 0o600 });
  chmodSync(WALL_PATH, 0o600);
}

function wallSeal(key, roomId, clientId, obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${WALL_PROTO}|${roomId}|${clientId}`));
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64");
}

function wallOpen(key, roomId, clientId, b64) {
  const raw = Buffer.from(b64, "base64");
  if (raw.length < 12 + 16 + 1) throw new Error("short envelope");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ct = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(`${WALL_PROTO}|${roomId}|${clientId}`));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8"));
}

function wallId() {
  return randomBytes(12).toString("hex");
}

/** Accept `bottalk wall <url>` (bottalk.me/room#<id>.<key>) or a bare
 *  `#<id>.<key>` fragment. Returns { id, key } or dies. */
function parseWallRef(input) {
  const m = /#?([a-f0-9]{24})\.([A-Za-z0-9_-]{43,64})/.exec(String(input ?? ""));
  if (!m) return null;
  const key = Buffer.from(m[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (key.length !== 32) return null;
  return { id: m[1], key };
}

function wallUrl(w) {
  return `${BASE}/room#${w.id}.${Buffer.from(w.key).toString("base64url")}`;
}

async function wallApi(payload) {
  const r = await post("/api/wall", payload);
  if (r.status === 404) die("That wall is gone (unsaved rooms expire after a week of quiet).", 4);
  if (r.status !== 200) die(`Wall request failed (${r.status}).`);
  return r.body;
}

async function wallPost(w, text, author) {
  const clientId = randomBytes(16).toString("hex");
  await wallApi({
    action: "post",
    id: w.id,
    notes: [{ client_id: clientId, ct: wallSeal(w.key, w.id, clientId, { text, author, ts: Date.now() }) }],
  });
  return clientId;
}

/** `seen` holds note ids this machine already read or wrote, so `chat wait`
 *  only returns what somebody else posted since. */
function markSeen(w, ids) {
  const seen = new Set(w.seen ?? []);
  for (const id of ids) seen.add(id);
  w.seen = [...seen];
  saveWall(w);
}

function printNotes(notes) {
  for (const n of notes) console.log(`[${n.author ?? "?"}] ${n.text}`);
}

async function chatWait(w, timeoutSecs) {
  const deadline = Date.now() + timeoutSecs * 1000;
  while (Date.now() < deadline) {
    let fetched;
    try {
      fetched = await wallFetch(w);
    } catch {
      await sleep(WALL_POLL_MS); // network blip - keep polling
      continue;
    }
    const seen = new Set(w.seen ?? []);
    const fresh = fetched.notes.filter((n) => !seen.has(n.clientId));
    if (fresh.length > 0) {
      printNotes(fresh);
      markSeen(w, fresh.map((n) => n.clientId));
      return;
    }
    await sleep(WALL_POLL_MS);
  }
  console.log("(nothing new yet)");
  process.exit(2);
}

async function wallFetch(w) {
  const body = await wallApi({ action: "fetch", id: w.id });
  const out = [];
  for (const n of body.notes ?? []) {
    if (n.ct === null) continue; // deleted
    try {
      const obj = wallOpen(w.key, w.id, n.client_id, n.ct);
      out.push({ clientId: n.client_id, ...obj });
    } catch {
      die("TAMPERING SUSPECTED: a wall note failed decryption. Do not trust this wall.", 5);
    }
  }
  return { name: body.name ?? null, notes: out };
}

// `chat` is the primary name and the default way bots talk; a call is the fallback.
// `wall` is kept as an alias for existing scripts.
async function cmdChat(args) {
  const sub = args.shift() ?? "";

  if (sub === "new") {
    const author = flag(args, "--from") ?? userInfo().username;
    const id = wallId();
    await post("/api/wall", { action: "create", id });
    const w = { v: 1, id, key: randomBytes(32), author, seen: [] };
    saveWall(w);
    console.log(`Room created. Send this link to the other person (Signal/SMS):\n`);
    console.log(`    ${wallUrl(w)}\n`);
    console.log(`Their bot joins with: bottalk chat <link>`);
    openBrowser(wallUrl(w));
    return;
  }

  if (sub === "post" || sub === "note" || sub === "say") {
    const timeout = sub === "say" ? Number(flag(args, "--timeout") ?? DEFAULT_WAIT_SECS) : null;
    let text = args.join(" ");
    if (text === "-") {
      const chunks = [];
      for await (const c of process.stdin) chunks.push(c);
      text = Buffer.concat(chunks).toString("utf8");
    }
    if (!text.trim()) die('Usage: chat post "<text>"   (or `chat post -` to read stdin)');
    const w = loadWall();
    if (!w) die("No chat open. `chat new` to start one, or `chat <link>` to join one.");
    markSeen(w, [await wallPost(w, text.trim(), w.author ?? userInfo().username)]);
    console.log("Posted.");
    if (timeout !== null) await chatWait(w, timeout);
    return;
  }

  if (sub === "wait") {
    const timeout = Number(flag(args, "--timeout") ?? DEFAULT_WAIT_SECS);
    const w = loadWall();
    if (!w) die("No chat open. `chat <link>` to join one.");
    await chatWait(w, timeout);
    return;
  }

  if (sub === "ls") {
    const w = loadWall();
    if (!w) die("No chat open. `chat <link>` to join one.");
    const { name, notes } = await wallFetch(w);
    if (name) console.log(`[${name}]`);
    if (notes.length === 0) console.log("(the chat is empty)");
    printNotes(notes);
    markSeen(w, notes.map((n) => n.clientId));
    return;
  }

  if (sub === "rm") {
    const w = loadWall();
    if (!w) die("No chat open.");
    const { notes } = await wallFetch(w);
    const needle = args.join(" ").trim();
    const hit = notes.find((n) => n.clientId.startsWith(needle) || n.text.includes(needle));
    if (!hit) die(`No note matches "${needle}". Notes: ` + notes.map((n) => JSON.stringify(n.text)).join(" | "));
    await wallApi({ action: "delete", id: w.id, client_id: hit.clientId });
    console.log("Removed.");
    return;
  }

  if (sub === "save") {
    const name = args.join(" ").trim();
    if (!name) die("Usage: chat save <project name>");
    const w = loadWall();
    if (!w) die("No chat open.");
    await wallApi({ action: "save", id: w.id, name });
    console.log(`Saved as project "${name}". The room no longer expires.`);
    return;
  }

  if (sub === "link") {
    const w = loadWall();
    if (!w) die("No chat open.");
    console.log(wallUrl(w));
    return;
  }

  if (sub === "projects") {
    const r = await api("/api/walls");
    const walls = r.body?.walls ?? [];
    if (walls.length === 0) {
      console.log("No saved projects yet.");
      return;
    }
    const mine = loadWall();
    for (const p of walls) {
      const mark = mine && mine.id === p.id ? "  <- open" : "";
      console.log(`${p.name}   (saved ${String(p.savedAt).slice(0, 10)})${mark}`);
    }
    return;
  }

  // `bottalk wall <link>` joins (or switches to) a room.
  const ref = parseWallRef(sub);
  if (ref) {
    const author = flag(args, "--from") ?? userInfo().username;
    saveWall({ v: 1, id: ref.id, key: ref.key, author, seen: [] });
    const w = loadWall();
    console.log(`Chat open: ${wallUrl(w)}`);
    const { name, notes } = await wallFetch(w);
    if (name) console.log(`project: ${name}`);
    if (notes.length === 0) console.log("(the chat is empty)");
    printNotes(notes);
    markSeen(w, notes.map((n) => n.clientId));
    openBrowser(wallUrl(w));
    return;
  }

  console.error(`Usage: bottalk chat <subcommand>   (alias: bottalk wall ...)

  chat new [--from "<who>"]     start a room, prints the link
  chat <link> [--from "<who>"]  join a room from its bottalk.me/room#... link
  chat say "<text>"             post, then wait for the next reply
  chat post "<text>"            write a note ("-" reads stdin)
  chat wait [--timeout ${DEFAULT_WAIT_SECS}]     wait for a new note from someone else
  chat ls                       read the chat
  chat rm <text-or-id>          remove a note
  chat save <project-name>      keep the chat (otherwise it expires in a week)
  chat link                     print the chat link again
  chat projects                 list saved projects`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// line: a standing room between two people where each one's bot answers the
// other with no human in the loop. It is an ordinary room underneath (same
// crypto, same server), never saved, so it never shows in the public project
// list. Each owner shares named project folders; the bot works only there.
//
// A note to a bot carries { to, project, kind: "ask" }. A human on the web
// page writes "@<name> <project>: <text>". The bot's progress comes back as
// { re, kind: "action" } notes and its answer as { re, kind: "done" }.
//
// Wake-up: polling the room would keep the database awake around the clock,
// so a content-free ping goes through ntfy (BOTTALK_PUSH, default ntfy.sh)
// on a topic derived from the room key. A slow poll is the backstop.

const LINES_PATH = process.env.BOTTALK_LINES ?? join(homedir(), ".bottalk", "lines.json");
const LINE_STATE_PATH = LINES_PATH.replace(/\.json$/, "") + "-state.json";
const PUSH = (process.env.BOTTALK_PUSH ?? "https://ntfy.sh").replace(/\/$/, "");
const PUSH_OFF = PUSH === "off";
const LINE_POLL_SECS = Number(process.env.BOTTALK_LINE_POLL ?? (PUSH_OFF ? 60 : 600));
const LINE_TOUCH_MS = 24 * 3600 * 1000;
const LINE_BOT_TIMEOUT_MS = 60 * 60 * 1000;
const LINE_KEEP_NOTES = 300; // rooms hold 500 live notes; trim the oldest past 450
const LINE_MODES = ["bypassPermissions", "auto", "acceptEdits", "dontAsk", "manual", "plan"];

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(obj, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** lines.json is the owner's config (written only by line commands);
 *  lines-state.json is the listener's memory (seen notes, bot sessions). */
function loadLines() {
  const c = readJson(LINES_PATH, { v: 1, lines: {} });
  for (const l of Object.values(c.lines)) l.keyBuf = Buffer.from(l.key, "base64url");
  return c;
}

function saveLines(c) {
  const out = { ...c, lines: {} };
  for (const [n, l] of Object.entries(c.lines)) {
    const { keyBuf, ...rest } = l;
    out.lines[n] = rest;
  }
  writeJson(LINES_PATH, out);
}

function pickLine(c, args) {
  const want = flag(args, "--line");
  const names = Object.keys(c.lines);
  if (names.length === 0) die("No line yet. `line new --me <your name> --name <their name>` or `line join <link>`.");
  if (want) {
    if (!c.lines[want]) die(`No line called "${want}". Lines: ${names.join(", ")}`);
    return [want, c.lines[want]];
  }
  if (names.length > 1) die(`More than one line. Add --line <name>. Lines: ${names.join(", ")}`);
  return [names[0], c.lines[names[0]]];
}

function lineWall(l) {
  return { id: l.id, key: l.keyBuf };
}

function pingTopic(l) {
  return "bottalk-" + createHash("sha256").update(`bottalk-line-ping|${l.id}|`).update(l.keyBuf).digest("hex").slice(0, 32);
}

async function linePing(l) {
  if (PUSH_OFF) return;
  try {
    await fetch(`${PUSH}/${pingTopic(l)}`, { method: "POST", body: "1" });
  } catch {
    // The slow poll still picks the note up.
  }
}

async function linePost(l, obj) {
  const clientId = randomBytes(16).toString("hex");
  await wallApi({
    action: "post",
    id: l.id,
    notes: [{ client_id: clientId, ct: wallSeal(l.keyBuf, l.id, clientId, { ts: Date.now(), ...obj }) }],
  });
  return clientId;
}

/** A web-page note "@aster stash: fix the login" becomes an ask. */
function parseAsk(note) {
  if (note.kind === "ask" && note.to) return { to: note.to, project: note.project ?? null, text: note.text };
  if (note.kind) return null;
  const m = /^\s*@([\w.-]+)\s+(?:([\w.-]+):\s+)?([\s\S]+)$/.exec(note.text ?? "");
  if (!m) return null;
  return { to: m[1], project: m[2] ?? null, text: m[3] };
}

function sameName(a, b) {
  return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
}

function lineUrl(l) {
  return `${BASE}/room#${l.id}.${l.keyBuf.toString("base64url")}`;
}

/** Wait for notes that answer `askId`. Prints actions as they arrive and
 *  returns on the done or refused note. */
async function lineWaitFor(l, askId, timeoutSecs) {
  const printed = new Set();
  const deadline = Date.now() + timeoutSecs * 1000;
  while (Date.now() < deadline) {
    let notes = [];
    try {
      notes = (await wallFetch(lineWall(l))).notes;
    } catch {
      await sleep(WALL_POLL_MS * 2);
      continue;
    }
    for (const n of notes) {
      if (n.re !== askId || printed.has(n.clientId)) continue;
      printed.add(n.clientId);
      console.log(`[${n.author ?? "?"}${n.kind === "action" ? "" : ` ${n.kind}`}] ${n.text}`);
      if (n.kind === "done" || n.kind === "refused") return;
    }
    await sleep(WALL_POLL_MS * 2);
  }
  console.log(`(still working; run \`bottalk line wait ${askId}\` to keep waiting)`);
  process.exit(2);
}

function runBot({ bin, cwd, mode, prompt, resume, env }) {
  return new Promise((resolve) => {
    const args = ["-p", prompt, "--output-format", "json", "--permission-mode", mode];
    if (resume) args.push("--resume", resume);
    const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill("SIGTERM"), LINE_BOT_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out);
        resolve({ ok: code === 0 && !j.is_error, text: j.result ?? "", session: j.session_id ?? null, error: err.trim() });
      } catch {
        resolve({ ok: false, error: (err || out).trim().slice(-2000) || `claude exited ${code}` });
      }
    });
  });
}

function botPrompt(l, from, project, text) {
  return [
    `${from} sent you a message over a bot talk line. You are ${l.me}'s bot, working for ${l.me}.`,
    `${l.me} shared the project "${project}" (this folder) with ${from}. Work only inside it.`,
    `${from} can ask you to answer questions, change code, commit, push or deploy. Do what they ask.`,
    `${l.me} is not watching. Do not wait for anyone to approve anything.`,
    `Every time you change something (edit a file, commit, push, deploy, install, run a migration),`,
    `post one line about it right away: bottalk line post "<what you did and where>"`,
    `Never post or print secrets, keys or passwords.`,
    `Your last message is posted back to ${from} for you as the answer. Keep it short and plain.`,
    ``,
    `Message from ${from}:`,
    text,
  ].join("\n");
}

async function handleAsk(name, l, st, note, ask) {
  const shared = Object.keys(l.projects ?? {});
  let project = ask.project;
  if (!project && shared.length === 1) project = shared[0];
  const author = `${l.me}'s bot`;
  if (!project || !l.projects?.[project]) {
    const why = project ? `${l.me} has not shared "${project}".` : "Name a project.";
    const list = shared.length ? `Shared projects: ${shared.join(", ")}.` : `${l.me} has not shared any projects yet.`;
    await linePost(l, { author, kind: "refused", re: note.clientId, text: `${why} ${list}` });
    await linePing(l);
    return;
  }
  const p = l.projects[project];
  const cwd = p.path;
  if (!existsSync(cwd)) {
    await linePost(l, { author, kind: "refused", re: note.clientId, text: `The folder for "${project}" is missing on ${l.me}'s machine.` });
    await linePing(l);
    return;
  }
  await linePost(l, { author, kind: "action", re: note.clientId, text: `started on "${project}"` });
  const sessions = (st.lines[name].sessions ??= {});
  const env = { BOTTALK_LINES: LINES_PATH, BOTTALK_LINE: name, BOTTALK_LINE_RE: note.clientId, BOTTALK_NO_BROWSER: "1" };
  const prompt = botPrompt(l, note.author ?? "the other side", project, ask.text);
  const bin = lineBin();
  let r = await runBot({ bin, cwd, mode: p.mode, prompt, resume: sessions[project], env });
  if (!r.ok && sessions[project]) {
    // An expired or missing session: start fresh rather than fail the ask.
    r = await runBot({ bin, cwd, mode: p.mode, prompt, resume: null, env });
  }
  if (r.session) sessions[project] = r.session;
  const text = r.ok ? r.text || "(done, no reply text)" : `The bot failed: ${r.error || "unknown error"}`;
  await linePost(l, { author, kind: "done", re: note.clientId, text: text.slice(0, 12000) });
  await linePing(l);
}

function lineBin() {
  return loadLines().claude_bin || process.env.BOTTALK_CLAUDE || "claude";
}

/** One pass over one line: act on new asks for this owner, keep the room
 *  alive, trim old notes. */
async function lineCheck(name, st) {
  const c = loadLines(); // re-read: the owner can share or unshare while we run
  const l = c.lines[name];
  if (!l) return;
  st.lines[name] ??= { seen: [], primed: false };
  const ls = st.lines[name];
  const { notes } = await wallFetch(lineWall(l));
  const seen = new Set(ls.seen);
  if (!ls.primed) {
    // First start: never replay old history.
    for (const n of notes) seen.add(n.clientId);
    ls.primed = true;
  }
  for (const n of notes) {
    if (seen.has(n.clientId)) continue;
    seen.add(n.clientId);
    ls.seen = [...seen];
    writeJson(LINE_STATE_PATH, st);
    const ask = parseAsk(n);
    if (!ask || !sameName(ask.to, l.me)) continue;
    console.log(`${new Date().toISOString()} [${name}] ask from ${n.author}: ${ask.text.slice(0, 120)}`);
    await handleAsk(name, l, st, n, ask);
  }
  const live = new Set(notes.map((n) => n.clientId));
  ls.seen = [...seen].filter((id) => live.has(id));
  if (!ls.touched || Date.now() - ls.touched > LINE_TOUCH_MS) {
    await wallApi({ action: "touch", id: l.id });
    ls.touched = Date.now();
  }
  if (notes.length > 450) {
    for (const n of notes.slice(0, notes.length - LINE_KEEP_NOTES)) {
      await wallApi({ action: "delete", id: l.id, client_id: n.clientId });
    }
  }
  writeJson(LINE_STATE_PATH, st);
}

/** Stream ntfy pings for every line's topic; resolve on the first one. */
function waitForPing(topics, maxMs) {
  return new Promise((resolve) => {
    if (PUSH_OFF || topics.length === 0) return setTimeout(resolve, maxMs);
    const ac = new AbortController();
    const done = () => {
      clearTimeout(timer);
      ac.abort();
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    (async () => {
      try {
        const r = await fetch(`${PUSH}/${topics.join(",")}/json`, { signal: ac.signal });
        let buf = "";
        for await (const chunk of r.body) {
          buf += Buffer.from(chunk).toString("utf8");
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            try {
              if (JSON.parse(line).event === "message") return done();
            } catch {}
          }
        }
        // Stream closed: back off a little, then let the loop re-check.
        setTimeout(done, 5000);
      } catch {
        if (!ac.signal.aborted) setTimeout(done, 15000);
      }
    })();
  });
}

async function lineListen() {
  const c0 = loadLines();
  if (c0.path_env) process.env.PATH = c0.path_env;
  console.log(`${new Date().toISOString()} bot talk line listener ${VERSION} (push: ${PUSH_OFF ? "off" : PUSH})`);
  const st = readJson(LINE_STATE_PATH, { v: 1, lines: {} });
  for (;;) {
    const c = loadLines();
    const names = Object.keys(c.lines);
    for (const name of names) {
      try {
        await lineCheck(name, st);
      } catch (e) {
        console.error(`${new Date().toISOString()} [${name}] ${e?.message ?? e}`);
      }
    }
    await waitForPing(names.map((n) => pingTopic(c.lines[n])), LINE_POLL_SECS * 1000);
  }
}

function serviceInstall() {
  const c = loadLines();
  const node = process.execPath;
  const cli = fileURLToPath(import.meta.url);
  const which = (cmd) => {
    try {
      return execFileSync("sh", ["-lc", `command -v ${cmd}`], { encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  };
  c.claude_bin = process.env.BOTTALK_CLAUDE || which("claude") || c.claude_bin;
  if (!c.claude_bin) die("Claude Code (`claude`) was not found on PATH. Install it first.");
  c.path_env = process.env.PATH;
  saveLines(c);
  const log = join(dirname(LINES_PATH), "line.log");
  const isWsl = process.platform === "linux" && /microsoft/i.test(readFileSync("/proc/version", "utf8"));

  if (process.platform === "darwin") {
    const plist = join(homedir(), "Library", "LaunchAgents", "me.bottalk.line.plist");
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    mkdirSync(dirname(plist), { recursive: true });
    writeFileSync(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>me.bottalk.line</string>
  <key>ProgramArguments</key><array><string>${esc(node)}</string><string>${esc(cli)}</string><string>line</string><string>listen</string></array>
  <key>EnvironmentVariables</key><dict><key>BOTTALK_LINES</key><string>${esc(LINES_PATH)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${esc(log)}</string>
  <key>StandardErrorPath</key><string>${esc(log)}</string>
</dict></plist>
`,
    );
    const uid = process.getuid();
    try {
      execFileSync("launchctl", ["bootout", `gui/${uid}/me.bottalk.line`], { stdio: "ignore" });
    } catch {}
    execFileSync("launchctl", ["bootstrap", `gui/${uid}`, plist]);
    console.log(`Listener running. It starts again at every login. Log: ${log}`);
    return;
  }

  if (isWsl) {
    // WSL stops when no Windows process holds it open, so Windows starts the
    // listener at logon. conhost --headless keeps the console window hidden.
    const distro = process.env.WSL_DISTRO_NAME;
    if (!distro) die("WSL_DISTRO_NAME is not set; run this from a WSL shell.");
    const tr = `conhost.exe --headless wsl.exe -d ${distro} -e sh -c "BOTTALK_LINES='${LINES_PATH}' '${node}' '${cli}' line listen >> '${log}' 2>&1"`;
    execFileSync("schtasks.exe", ["/create", "/f", "/tn", "bottalk-line", "/sc", "onlogon", "/tr", tr], { stdio: "inherit" });
    execFileSync("schtasks.exe", ["/run", "/tn", "bottalk-line"], { stdio: "inherit" });
    console.log(`Listener running. Windows starts it again at every login. Log: ${log}`);
    return;
  }

  if (process.platform === "linux") {
    const unit = join(homedir(), ".config", "systemd", "user", "bottalk-line.service");
    mkdirSync(dirname(unit), { recursive: true });
    writeFileSync(
      unit,
      `[Unit]
Description=bot talk line listener

[Service]
Environment=BOTTALK_LINES=${LINES_PATH}
ExecStart=${node} ${cli} line listen
Restart=always
RestartSec=10
StandardOutput=append:${log}
StandardError=append:${log}

[Install]
WantedBy=default.target
`,
    );
    execFileSync("systemctl", ["--user", "daemon-reload"]);
    execFileSync("systemctl", ["--user", "enable", "--now", "bottalk-line.service"]);
    console.log(`Listener running. Log: ${log}`);
    return;
  }

  die("No service support for this system. Run `bottalk line listen` in a terminal that stays open.");
}

function serviceUninstall() {
  if (process.platform === "darwin") {
    const plist = join(homedir(), "Library", "LaunchAgents", "me.bottalk.line.plist");
    try {
      execFileSync("launchctl", ["bootout", `gui/${process.getuid()}/me.bottalk.line`], { stdio: "ignore" });
    } catch {}
    rmSync(plist, { force: true });
  } else if (process.platform === "linux" && /microsoft/i.test(readFileSync("/proc/version", "utf8"))) {
    try {
      execFileSync("schtasks.exe", ["/end", "/tn", "bottalk-line"], { stdio: "ignore" });
    } catch {}
    execFileSync("schtasks.exe", ["/delete", "/f", "/tn", "bottalk-line"], { stdio: "inherit" });
    try {
      execFileSync("pkill", ["-f", "bottalk.mjs line listen"], { stdio: "ignore" });
    } catch {}
  } else if (process.platform === "linux") {
    execFileSync("systemctl", ["--user", "disable", "--now", "bottalk-line.service"]);
    rmSync(join(homedir(), ".config", "systemd", "user", "bottalk-line.service"), { force: true });
  }
  console.log("Listener stopped and removed.");
}

async function cmdLine(args) {
  const sub = args.shift() ?? "";

  if (sub === "new" || sub === "join") {
    const me = flag(args, "--me") ?? userInfo().username;
    let id;
    let key;
    let name = flag(args, "--name");
    if (sub === "new") {
      if (!name) die('Usage: line new --me <your name> --name <their name>');
      id = wallId();
      key = randomBytes(32);
      await post("/api/wall", { action: "create", id });
    } else {
      const ref = parseWallRef(args.join(" "));
      if (!ref) die("Usage: line join <link> --me <your name> [--name <their name>]");
      id = ref.id;
      key = ref.key;
      name ??= "line";
    }
    const c = loadLines();
    if (c.lines[name]) die(`A line called "${name}" exists already. Pick another --name.`);
    c.lines[name] = { id, key: key.toString("base64url"), me, projects: {} };
    saveLines(c);
    const l = loadLines().lines[name];
    await linePost(l, { author: me, text: `${me} ${sub === "new" ? "opened" : "joined"} the line.` });
    if (sub === "new") {
      console.log(`Line "${name}" created. Send this link to them once (Signal/SMS):\n`);
      console.log(`    ${lineUrl(l)}\n`);
      console.log(`They run: bottalk line join <link> --me <their name> --name ${me}`);
    } else {
      console.log(`Joined line "${name}".`);
    }
    console.log(`Share a project with: bottalk line share <project> [folder]   (run inside the folder)`);
    console.log(`Then start the listener: bottalk line service install`);
    return;
  }

  if (sub === "share") {
    const c = loadLines();
    const [name, l] = pickLine(c, args);
    // auto: no prompts, but Claude Code's own safety check still reviews each
    // risky step. bypassPermissions is there for owners who want no check.
    const mode = flag(args, "--mode") ?? "auto";
    if (!LINE_MODES.includes(mode)) die(`--mode must be one of: ${LINE_MODES.join(", ")}`);
    const [project, folder] = args;
    if (!project || !/^[\w.-]+$/.test(project)) die("Usage: line share <project-name> [folder] [--mode <mode>]");
    const path = resolvePath(folder ?? process.cwd());
    if (!existsSync(path)) die(`No such folder: ${path}`);
    l.projects ??= {};
    l.projects[project] = { path, mode };
    saveLines(c);
    await linePost(loadLines().lines[name], { author: l.me, text: `${l.me} shared "${project}" on this line.` });
    console.log(`Shared "${project}" (${path}) on line "${name}". Their asks run with --permission-mode ${mode}.`);
    return;
  }

  if (sub === "unshare") {
    const c = loadLines();
    const [name, l] = pickLine(c, args);
    const project = args[0];
    if (!l.projects?.[project]) die(`"${project}" is not shared on line "${name}".`);
    delete l.projects[project];
    saveLines(c);
    await linePost(loadLines().lines[name], { author: l.me, text: `${l.me} stopped sharing "${project}".` });
    console.log(`Stopped sharing "${project}".`);
    return;
  }

  if (sub === "ls" || sub === "") {
    const c = loadLines();
    const names = Object.keys(c.lines);
    if (names.length === 0) die("No line yet. `line new --me <you> --name <them>` or `line join <link> --me <you>`.", sub ? 1 : 0);
    for (const n of names) {
      const l = c.lines[n];
      const shared = Object.entries(l.projects ?? {}).map(([p, v]) => `${p} (${v.path}, ${v.mode})`);
      console.log(`${n}: you are "${l.me}". Shared: ${shared.length ? shared.join("; ") : "nothing"}`);
      console.log(`  ${lineUrl(l)}`);
    }
    return;
  }

  if (sub === "ask") {
    const c = loadLines();
    const [name, l] = pickLine(c, args);
    const project = flag(args, "--project");
    const timeout = Number(flag(args, "--timeout") ?? DEFAULT_WAIT_SECS);
    const [to, ...rest] = args;
    let text = rest.join(" ");
    if (text === "-") {
      const chunks = [];
      for await (const ch of process.stdin) chunks.push(ch);
      text = Buffer.concat(chunks).toString("utf8");
    }
    if (!to || !text.trim()) die('Usage: line ask <their name> "<text>" [--project <name>]');
    const id = await linePost(l, { author: l.me, kind: "ask", to, project, text: text.trim() });
    await linePing(l);
    console.log(`Asked ${to}'s bot (${id}).`);
    await lineWaitFor(l, id, timeout);
    return;
  }

  if (sub === "wait") {
    const c = loadLines();
    const [name, l] = pickLine(c, args);
    const timeout = Number(flag(args, "--timeout") ?? DEFAULT_WAIT_SECS);
    if (!args[0]) die("Usage: line wait <ask id>");
    await lineWaitFor(l, args[0], timeout);
    return;
  }

  if (sub === "post") {
    // Used by the bot while it works; BOTTALK_LINE / BOTTALK_LINE_RE come from the listener.
    const c = loadLines();
    if (process.env.BOTTALK_LINE) args.push("--line", process.env.BOTTALK_LINE);
    const [, l] = pickLine(c, args);
    let text = args.join(" ");
    if (text === "-") {
      const chunks = [];
      for await (const ch of process.stdin) chunks.push(ch);
      text = Buffer.concat(chunks).toString("utf8");
    }
    if (!text.trim()) die('Usage: line post "<text>"');
    const re = process.env.BOTTALK_LINE_RE;
    await linePost(l, re ? { author: `${l.me}'s bot`, kind: "action", re, text: text.trim() } : { author: l.me, text: text.trim() });
    if (!re && /^\s*@[\w.-]+\s/.test(text)) await linePing(l);
    console.log("Posted.");
    return;
  }

  if (sub === "listen") return lineListen();

  if (sub === "service") {
    const action = args[0];
    if (action === "install") return serviceInstall();
    if (action === "uninstall") return serviceUninstall();
    die("Usage: line service install | uninstall");
  }

  if (sub === "leave") {
    const c = loadLines();
    const [name] = pickLine(c, args);
    delete c.lines[name];
    saveLines(c);
    console.log(`Left line "${name}" on this machine.`);
    return;
  }

  console.error(`Usage: bottalk line <subcommand>

  line new --me <you> --name <them>       open a standing line, prints the link
  line join <link> --me <you> --name <them>   join a line from its link
  line share <project> [folder] [--mode <mode>]   let their bot's asks run in this folder
  line unshare <project>                   stop sharing it
  line ls                                  lines and shared projects
  line ask <them> "<text>" [--project <p>]    ask their bot, wait for its answer
  line wait <ask id>                       keep waiting for an answer
  line post "<text>"                       write on the line (the bot uses this)
  line service install | uninstall         run the listener in the background
  line listen                              run the listener in this terminal
  line leave                               forget a line on this machine

Add --line <name> when you have more than one line.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
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
  chat: cmdChat,
  wall: cmdChat,
  line: cmdLine,
  upgrade: cmdUpgrade,
  version: async () => console.log(VERSION),
  "--version": async () => console.log(VERSION),
};

// A bare 4-word passphrase answers the call: `bottalk brave lantern orbit tide`
const barePhrase = !commands[cmd] && normalizePhrase([cmd, ...args].filter(Boolean).join(" "));

if (!commands[cmd] && !barePhrase) {
  console.error(`bot talk: E2EE line between two Claude Code sessions

Usage: bottalk.mjs <command>

  chat new [--from "<who>"]              start a room (the default way bots talk)
  chat <link>                            join a room
  chat say | post | wait | ls | save     talk in the room (alias: wall)
  line new | join | share | ask | ...    standing line: their bot answers yours, no human needed

  <four word passphrase>                 answer a ringing call
  call [--from "<who>"]                  place a live call, prints the passphrase
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
