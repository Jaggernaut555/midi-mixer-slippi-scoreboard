import { Assignment, ButtonType } from "midi-mixer-plugin";
import { FirebaseOptions, initializeApp } from 'firebase/app';
import { getFirestore, getDoc, setDoc, doc, DocumentReference, DocumentData } from 'firebase/firestore/lite';
import { GameEndType, GameStartType, SlippiGame } from "@slippi/slippi-js";
import chokidar from 'chokidar';
import _ from 'lodash';

/*
From thread: http://8wr.io/threads/external-access-to-modify-fields-via-api.40/
Database: eightway-io
Snapshot: scoreboard/<your_package_id>/<your_page_id>/fields
*/

interface scoreboard {
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

  // Include any unknown fields that I don't care about modifying but don't want to lose
  [prop: string]: any,
}

let settings: Record<string,any>

let options: FirebaseOptions = {
  projectId: "eightway-io",
}
let fb = initializeApp(options);
let fs = getFirestore(fb);
let docRef: DocumentReference<DocumentData>;

let currentGame: SlippiGame
let currentGameSettings: GameStartType
let currentGameWatcher: chokidar.FSWatcher;
let myCode: string;
let replayWatcher: chokidar.FSWatcher | null;

async function init() {
  settings = await $MM.getSettings();

  // package then page
  let packageKey = settings["packagekey"];
  let pageKey = settings["pagekey"];
  let slippiFolder = settings["slippidirectory"];
  myCode = settings["connectcode"];

  docRef = doc(fs, "scoreboard", packageKey, pageKey, "fields")

  console.log("loaded config");
  // console.log(settings);

  replayWatcher = chokidar.watch(`${slippiFolder}\\**\\*.slp`,
        {
            persistent: true,
            // Polling uses more CPU than necessary
            // usePolling: true,
            ignoreInitial: true,
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
  currentGame = new SlippiGame(path, { processOnTheFly: true });
  let gamePath = currentGame.getFilePath();
  console.log(gamePath);
  trackNewGame();

  if (currentGameWatcher) {
    currentGameWatcher.off('change', GameListener);
  }

  if (gamePath === null) {
    return;
  }

  currentGameWatcher = chokidar.watch(gamePath).on('change', GameListener );
}

function trackNewGame() {
  // Get game settings – stage, characters, etc
  const settings = currentGame.getSettings();
  // console.log(settings);

  if (settings === null) {
      console.log("No game found");
  }
  else {
      currentGameSettings = settings;
      $MM.setSettingsStatus("slippistatus", "Tracking game")
      let t = getScoreboard();
      t.then(x => {
          console.log(x);
          setNames(x, settings);
      });
  }
}

async function getScoreboard(): Promise<scoreboard> {
  const scoreSnapshot = await getDoc(docRef);
  if (scoreSnapshot.exists()) {
      return scoreSnapshot.data() as scoreboard;
  }
  else {
      console.log("failed");
  }
  return null as any;
}

function getMyIndex(slippiData: GameStartType): number {
  if (slippiData.players[0].connectCode != myCode) {
      return 1;
  }
  return 0;
}

async function setNames(data: scoreboard, slippiData: GameStartType) {
  // Check if sets names are player connect codes
  // If new names reset set and score counts
  // Prefer my code on players_1 side
  let myIndex = getMyIndex(slippiData);
  let theirIndex = 1 - myIndex;

  if (data.sets_2 != slippiData.players[theirIndex].connectCode
      || data.sets_1 != myCode) {
      resetScore(data);
      data.players_1 = slippiData.players[myIndex].displayName;
      data.sets_1 = slippiData.players[myIndex].connectCode;
      data.players_2 = slippiData.players[theirIndex].displayName;
      data.sets_2 = slippiData.players[theirIndex].connectCode;
  }

  await setDoc(docRef, data);
}

function resetScore(data: scoreboard) {
  data.sets_1s = 0;
  data.sets_2s = 0;
  data.players_1s = 0;
  data.players_2s = 0;
}

/// Return index of winner (0/1) or unknown (-1)
function determineWinner(end: GameEndType): number {
  const myIndex = getMyIndex(currentGameSettings);
  const theirIndex = 1 - myIndex;
  const latestFrame = _.get(currentGame.getLatestFrame(), 'players') || [];
  const playerStocks = _.get(latestFrame, [myIndex, 'post', 'stocksRemaining']);
  const oppStocks = _.get(latestFrame, [theirIndex, 'post', 'stocksRemaining']);
  switch(end.gameEndMethod) {
      case 1:
          // Time out
          // could determine stocks/percent
          return -1;
      case 2:
          // Someone won on stocks
          if (playerStocks === 0 && oppStocks === 0) {
              // Can this happen?
              return -1;
          }
      
          return playerStocks === 0 ? theirIndex : myIndex;
      case 7:
          // Someone pressed L+R+A+Start
          // if only 1 player at 1 stock they probably lost
          if (playerStocks === 1 && !(oppStocks === 1)) {
              return theirIndex;
          }
          else if (!(playerStocks === 1) && oppStocks === 1) {
              return myIndex;
          }
          // If nobody was at 1 stock there's no winner
          return -1;
  }
  return -1;
}

function updateWinner(end: GameEndType) {
  // determine which index won
  let i = determineWinner(end);
  if (i < 0 || i > 1)
  {
      console.log("Unknown winner");
      return;
  }
  // get scoreboard
  // increase score
  getScoreboard().then((s) => {
      const myIndex = getMyIndex(currentGameSettings);
      if (i === myIndex) {
          // I win
          s.players_1s += 1;
      }
      else {
          // they win
          s.players_2s += 1;
      }
      setDoc(docRef, s);
  });
}

function GameListener(event: string) {
  try {
      // console.log("changed");
      const end = currentGame.getGameEnd();
      if (end) {
          console.log("Game ended");
          $MM.setSettingsStatus("slippistatus", "Waiting for game")
          updateWinner(end);
          currentGameWatcher.off('change', GameListener);
      }
  }
  catch (error) {
      console.log(error);
  }
}

const fakeAssignment = new Assignment("Rando", {
  name: "Fake assignment"
})

fakeAssignment.on("volumeChanged", (level:number) => {
  fakeAssignment.volume = level;
})

const runButton = new ButtonType("RunButton", {
  name: "Toggle slippi tracking",
  active: false,
});

runButton.on("pressed", () => {
  runButton.active = !runButton.active;
  if (runButton.active) {
    // activate tracking
    $MM.setSettingsStatus("slippistatus", "Waiting for game")
  
    init().then(() => {
      getScoreboard().then(x => {
        console.log(x);
      });
    });
  }
  else {
    // deactivate tracking
    $MM.setSettingsStatus("slippistatus", "Not running")
    deactivate();
  }
})