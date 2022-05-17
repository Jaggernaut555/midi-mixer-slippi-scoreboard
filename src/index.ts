import { Assignment, ButtonType } from "midi-mixer-plugin";
import { FirebaseOptions, initializeApp } from 'firebase/app';
import { getFirestore, getDoc, setDoc, doc, DocumentReference, DocumentData } from 'firebase/firestore/lite';
import { GameEndType, GameStartType, SlippiGame, characters, PlayerType } from "@slippi/slippi-js";
import chokidar from 'chokidar';
import _ from 'lodash';
import { getScoreboard, resetScore, updateScoreboard } from "./scoreboard";
import { determineWinner, updateWinner } from "./winner";

/*
From thread: http://8wr.io/threads/external-access-to-modify-fields-via-api.40/
Database: eightway-io
Snapshot: scoreboard/<your_package_id>/<your_page_id>/fields
*/

export interface scoreboard {
  // set score
  sets_1s: number,
  sets_1: string | null,
  sets_2s: number,
  sets_2: string | null,
  // middle title
  game_1: string | null,
  round_1: string | null,
  // player scores and names
  players_1s: number,
  players_1: string | null,
  players_2s: number,
  players_2: string | null,
  // Winners/Losers indicator
  WL_1: "[W]" | "[L]",
  WL_2: "[W]" | "[L]",

  // Include any unknown fields that I don't care about modifying but don't want to lose
  [prop: string]: any,
}

let settings: Record<string, any>

let options: FirebaseOptions = {
  projectId: "eightway-io",
}
let fb = initializeApp(options);
let fs = getFirestore(fb);
let docRef: DocumentReference<DocumentData>;

let currentGame: SlippiGame
let currentGameWatcher: chokidar.FSWatcher;
let playerCode: string;
let replayWatcher: chokidar.FSWatcher | null;
let testingMode: false;

async function init() {
  settings = await $MM.getSettings();

  // package then page
  let packageKey = settings["packagekey"];
  let pageKey = settings["pagekey"];
  let slippiFolder = settings["slippidirectory"];
  playerCode = settings["connectcode"];
  testingMode = settings["testingMode"];

  docRef = doc(fs, "scoreboard", packageKey, pageKey, "fields")
  console.log("loaded config");

  replayWatcher = chokidar.watch(`${slippiFolder}\\**\\*.slp`,
    {
      persistent: true,
      // Polling uses more CPU than necessary
      // usePolling: true,
      ignoreInitial: true,
      ignored: [`${slippiFolder}\\Spectate\\**`],
    }).on('add', watchForNewReplays);
}

async function initSpectate() {
  settings = await $MM.getSettings();

  // package then page
  let packageKey = settings["packagekey"];
  let pageKey = settings["pagekey"];
  let slippiFolder = settings["slippidirectory"];
  playerCode = settings["connectcode"];
  testingMode = settings["testingMode"];

  docRef = doc(fs, "scoreboard", packageKey, pageKey, "fields")
  console.log("loaded config");
  console.log("Waiting for spectator replay");

  replayWatcher = chokidar.watch(`${slippiFolder}\\Spectate\\*.slp`,
    {
      persistent: true,
      // Polling uses more CPU than necessary
      // usePolling: true,
      ignoreInitial: true,
      ignored: [],
    }).on('add', watchForNewReplays);
}

async function deactivate() {
  if (replayWatcher) {
    // replayWatcher.off('add', watchForNewReplays);
    replayWatcher.close();
  }
  replayWatcher = null;
}

function watchForNewReplays(path: string, stats: string) {
  console.log("New game found")
  let game = new SlippiGame(path, { processOnTheFly: true });

  // Don't track games that are already over
  const end = game.getGameEnd();
  if (end && !testingMode) {
    console.log("Skipping completed game");
    return;
  }

  currentGame = game;
  let gamePath = currentGame.getFilePath();
  console.log(gamePath);

  try {
    trackNewGame();
  }
  catch (err) {
    console.log(err);
    log.error(err);
    return;
  }

  if (currentGameWatcher) {
    currentGameWatcher.off('change', GameListener);
  }

  if (gamePath === null) {
    return;
  }

  currentGameWatcher = chokidar.watch(gamePath).on('change', GameListener);
}

function trackNewGame() {
  // Get game settings – stage, characters, etc
  const settings = currentGame.getSettings();

  if (settings === null) {
    console.log("No game found");
  }
  else {
    $MM.setSettingsStatus("slippistatus", "Tracking game")
    getScoreboard(docRef).then(sb => {
      setNames(sb, settings);
    });
  }
}

export function getPlayerIndex(slippiData: GameStartType): number {
  for (let player of slippiData.players) {
    if (player.connectCode == playerCode) {
      return player.port - 1;
    }
  }
  // If code not found default to 0
  return 0;
}

export function getPlayerPort(slippiData: GameStartType): number {
  for (let player of slippiData.players) {
    if (player.connectCode == playerCode) {
      return player.port;
    }
  }
  // If code not found default to 1
  return 1;
}

export function getTeams(playerPort: number, slippiData: GameStartType) {
  let players = slippiData.players;

  let playerTeam = players.find((p) => {
    return p.port == playerPort
  })?.teamId ?? 0;

  let teamA = players.filter((p) => {
    return p.teamId == playerTeam;
  });
  let teamB = players.filter((p) => {
    return p.teamId != playerTeam;
  });

  return [teamA, teamB];
}

function getCharacterInfo(player: PlayerType): string {
  if (player.characterId === null || player.characterColor === null) {
    return "";
  }
  let character = characters.getCharacterShortName(player.characterId);
  let color = characters.getCharacterColorName(player.characterId, player.characterColor);
  return `${player.displayName}||${character}||${color}`;
}

async function setNames(data: scoreboard, gameSettings: GameStartType) {
  // Check if sets names are player connect codes
  // If new names reset set and score counts
  // Prefer provided code on players_1 side

  let playerIndex = getPlayerIndex(gameSettings);

  if (gameSettings.players.length === 4) {
    // teams
    // Can be any order
    let playerPort = getPlayerPort(gameSettings)

    let [playerTeam, oppTeam] = getTeams(playerPort, gameSettings);

    // Create codes for each team
    let playerTeamCode = playerTeam.map((player) => {
      return player.connectCode;
    }).join("&&");
    let oppTeamCode = oppTeam.map((player) => {
      return player.connectCode;
    }).join("&&");

    // Reset scores if teams change
    if (data.sets_1 != playerTeamCode || data.sets_2 != oppTeamCode) {
      resetScore(data);
    }

    let playerTeamInfo = playerTeam.map((player) => getCharacterInfo(player)).join("&&");
    let oppTeamInfo = oppTeam.map((player) => getCharacterInfo(player)).join("&&");

    // Update character or team changes
    if (playerTeamInfo !== data.players_1 || oppTeamInfo !== data.players_2) {
      data.players_1 = playerTeam.map((player) => getCharacterInfo(player)).join("&&");
      data.sets_1 = playerTeamCode;

      data.players_2 = oppTeam.map((player) => getCharacterInfo(player)).join("&&");
      data.sets_2 = oppTeamCode;
    }
  }
  else {
    // Only 2 players
    let oppIndex = 1 - playerIndex;

    // If new connect code reset the scores
    if (data.sets_2 != gameSettings.players[oppIndex].connectCode
      || data.sets_1 != gameSettings.players[playerIndex].connectCode) {
      resetScore(data);
    }
    
    let playerCharacterInfo = getCharacterInfo(gameSettings.players[playerIndex])
    let oppCharacterInfo = getCharacterInfo(gameSettings.players[oppIndex])

    // update player/character changes
    if (playerCharacterInfo !== data.players_1 || oppCharacterInfo !== data.players_2) {
      data.players_1 = playerCharacterInfo;
      data.sets_1 = gameSettings.players[playerIndex].connectCode;
      data.players_2 = oppCharacterInfo;
      data.sets_2 = gameSettings.players[oppIndex].connectCode;
    }

  }
  
  await updateScoreboard(docRef, data);

  if (testingMode) {
    console.log(currentGame);
    updateWinner(docRef, currentGame);
  }
}


function GameListener(event: string) {
  try {
    const end = currentGame.getGameEnd();
    if (end) {
      console.log("Game ended");
      $MM.setSettingsStatus("slippistatus", "Waiting for game")
      updateWinner(docRef, currentGame);
      currentGameWatcher.off('change', GameListener);
    }
  }
  catch (error) {
    console.log(error);
  }
}

const runButton = new ButtonType("RunButton", {
  name: "Toggle slippi tracking",
  active: false,
});
runButton.on("pressed", () => {
  runButton.active = !runButton.active;
  if (runButton.active) {
    // activate tracking
    $MM.setSettingsStatus("slippistatus", "Waiting for game")

    init();
  }
  else {
    // deactivate tracking
    $MM.setSettingsStatus("slippistatus", "Not running")
    deactivate();
  }
});

const spectateButton = new ButtonType("SpectateButton", {
  name: "Toggle slippi spcetator tracking",
  active: false,
});
spectateButton.on("pressed", () => {
  spectateButton.active = !spectateButton.active;
  if (spectateButton.active) {
    // activate tracking
    $MM.setSettingsStatus("slippistatus", "Waiting to spectate game")

    initSpectate();
  }
  else {
    // deactivate tracking
    $MM.setSettingsStatus("slippistatus", "Not running")
    deactivate();
  }
});
