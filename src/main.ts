import './style.css'
import { Chat } from 'twitch-js'

interface Config {
  token?: string
  username?: string
  channel: string

  sounds?: Map<string, Sound>
  soundList?: string
  usersounds?: Map<string, Sound>
  usersounds_played: string[]

  enabled: boolean
  volume: number
  ping_enabled: boolean
  admins: string[]
  debug: boolean
  devMode: boolean
  apiPrefix: string
}

interface Sound {
    num: number,
    key: string,
    filename: string,
    filetype: "mp3" | 'webm',
    aliases: string[]
}

type Player = HTMLAudioElement | HTMLVideoElement

type LogLevel = "log" | "info" | "warn" | "error"

const COIN_MAX = 100;
let chat: any;
let activeUsers: Map<string, number> = new Map();
let soundlist: string[] = [];

function getConfig() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);

  const config: Config = {
    admins: ["jvpeek", "echtkpvl"],
    channel: "jvpeek",
    enabled: true,
    ping_enabled: true,
    usersounds_played: [],
    volume: 1,
    debug: false,
    devMode: false,
    apiPrefix: '',
  };

  // Parse channel parameter
  if (urlParams.has("channel")) {
    config.channel = urlParams.get("channel")?.toLowerCase() || 'jvpeek';
  }

  if (urlParams.has("volume")) {
    const vol = Number(urlParams.get("volume"));

    if (!isNaN(vol)) {
      config.volume = vol;
    }

  }

  if (urlParams.has("noping")) {
    config.ping_enabled = false;
  }

  if (urlParams.has("username") && urlParams.has("token")) {
    config.username = urlParams.get("username") as string;
    config.token = urlParams.get("token") as string;
  }

  if (urlParams.has('debug')) {
    config.debug = true
  }

  if (urlParams.has('devMode')) {
    config.apiPrefix = 'https://jvpeek.de/ext/sb/'
  }

  return config;
}

const config: Config = getConfig();

function log(msg: string | Error, level: LogLevel = 'info') {
  if (config.debug) {
    console[level](msg);
  }
}

function ping() {
  if (!config.ping_enabled || !config.enabled) {
    return;
  }

  fetch('ping.php?channel=' + config.channel)
    .catch(err => log(err, "error"));
}

function reloadSounds() {
  fetch(`${config.apiPrefix}sounds/?channel=${config.channel}`)
    .then(res => res.json())
    .then(json => populateSounds(json, "sounds"))
    .catch(err => log(err, "error"));

  fetch(`${config.apiPrefix}usersounds/`)
    .then((res) => res.json())
    .then(json => populateSounds(json, "usersounds"))
    .catch((err) => log(err, "error"));
}

reloadSounds();

function createPlayer(type: 'AUDIO' | 'VIDEO', key: string, filename: string, target: string) {
  const player = document.createElement(type) as HTMLMediaElement;
  player.dataset.key = key;
  player.src = `${target}/${filename}`;
  return player;
}

function populateSounds(sounds: Sound[], target: 'usersounds' | 'sounds') {
  log(`Check out this JSON! ${sounds}`);
  const container = document.getElementById(target + "box") as HTMLDivElement;
  container.innerHTML = '';

  config[target] = new Map<string, Sound>()

  for (const s of sounds) {
    const { key, filename, username, filetype } = s as any
    const type = filetype === "mp3" ? 'AUDIO' : 'VIDEO'
    const player = createPlayer(type, key, filename, target);
    container.appendChild(player)

    config[target].set(username ? username : key, s);
  }

  if (target === 'sounds' && config.sounds) {
    let msg = "Sounds:";

    for (const [key] of config.sounds.keys()) {
      if (msg.length > 450) {
        soundlist.push(msg);
        msg = "Ausserdem: ";
      }

      msg += " !" + key;
    }
  }

  setVolumes();
}

function setVolumes() {
  let players = Array.from(
    document.querySelectorAll("audio, video")
  ) as HTMLMediaElement[];

  for (const p of players) {
    p.volume = config.volume;
  }
}

function playSound(cmd: string, usersound: boolean = false) {
  if (config.enabled == false) {
    return;
  }

  const selector = `${ usersound ? "#usersoundsbox" : "#soundsbox" } [data-key="${cmd}"]`;
  const player = document.querySelector(selector) as Player;

  if (!player) {
    return;
  }

  const type = player.tagName;

  player.currentTime = 0;
  player.play();

  if (type === 'video') {
    player.style.visibility = "visible";
  }

  player.addEventListener("ended", () => {
    player.style.visibility = "hidden";
    player.currentTime = 0;
  });
}

function chatsay(text: string) {
  if (config.token !== undefined) {
    chat.say(config.channel, text);
    return;
  }

  log(text, 'warn');
}

const countCoins = (() => {
  let count = 0;

  return (username: string) => {
    ++count;

    if (count >= COIN_MAX) {
      const key = Math.round(Math.random()) ? "1up" : "gameover";
      playSound(key, false);
      count = 0;

      let lives = activeUsers.get(username) as number;
      activeUsers.set(username, key === "1up" ? ++lives : --lives);

      if (lives <= 0) {
        log(`username is dead`);
      }

      // send to api
    }
  }
})()

const handleMessage = (msg: any) => {
  if (msg.event !== "PRIVMSG") {
    return;
  }

  if (activeUsers.has(msg.username) === false) {
    activeUsers.set(msg.username, 3);
  }

  if (config.usersounds && !msg.message.startsWith("!")) {
    if (config.usersounds_played.includes(msg.username)) {
      log(msg.username + " wurde schon begrüßt");
    } else {
      log(msg.username + " wurde noch nicht begrüßt");
      playSound(msg.username + "-intro", true);
      config.usersounds_played.push(msg.username);
      return;
    }
  }

  if (msg.message.startsWith("@") && msg.message.indexOf(" ") > 0) {
    msg.message = msg.message.substr(msg.message.indexOf(" ") + 1);
  }

  if (msg.message.startsWith("!") !== true || !config.sounds) {
    return;
  }

  const [cmdRaw, value] = msg.message.split(' ')
  const cmd = cmdRaw.slice(1);

  // generate list on populateSounds
  if (cmd === "sounds") {
    for (const msg of soundlist) {
      chatsay(msg);
    }
    return;
  }

  if (cmd === 'syscheck') {
    chatsay("/me soundboard is ready");
    return;
  }

  if (
    msg.tags.mod == 1 ||
    msg.tags.badges.broadcaster == "1" ||
    config.admins.includes(msg.username)
  ) {
    switch (cmd) {
      case "reloadsounds":
        reloadSounds();
        chatsay("/me sounds aktualisiert");
        return;
      case "enablesounds":
        config.enabled = true;
        chatsay("sounds aktiviert");
        return;
      case "disablesounds":
        config.enabled = false;
        chatsay("sounds deaktiviert");
        return;
      case "volume":
        const val = parseFloat(value)
        config.volume = isNaN(val) ? config.volume : val;
        chatsay(`Volume is now ${100 * config.volume}%`)
        break;
      default:
        break;
    }
  }

  if (config.sounds.has(cmd)) {
    const lives = activeUsers.get(msg.username) as number;

    if (cmd === 'coin' && lives  <= 0) {
      return;
    }

    playSound(cmd, false);

    if (cmd === 'coin') {
      countCoins(msg.username);
    }
  }
};

window.addEventListener("load", async function () {
  chat = new Chat({
    token: config.token,
    username: config.username,
    log: { level: "info" },
  });

  chat.on("*", handleMessage);

  await chat.connect();
  await chat.join(config.channel);
  window.setInterval(ping, 20000);
});
