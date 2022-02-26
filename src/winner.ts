import { GameEndType, PlayerType, PostFrameUpdateType, PreFrameUpdateType, SlippiGame } from "@slippi/slippi-js";
import { DocumentReference } from "firebase/firestore/lite";
import _ from "lodash";
import { getMyIndex, getMyPort, getTeamIndex, getTeams } from ".";
import { getScoreboard, updateScoreboard } from "./scoreboard";

const LEFTSCORE = 0;
const RIGHTSCORE = 1;

/// Return index of winner (0/1) or unknown (-1)
export function determineWinner(game: SlippiGame): number {

    let gameSettings = game.getSettings();
    let end = game.getGameEnd();
    

    if (!gameSettings || !end) {
        throw new Error("Current game does not exist");
    }

    const latestFrame = _.get(game.getLatestFrame(), 'players') || [];


    let playerStocks: number;
    let oppStocks: number;

    if (gameSettings.players.length != 2) {
        // team game
        [playerStocks, oppStocks] = determineTeamWinner(game);
    }
    else {
        const myIndex = getMyIndex(gameSettings);
        const theirIndex = 1 - myIndex;
        playerStocks = _.get(latestFrame, [myIndex, 'post', 'stocksRemaining']);
        oppStocks = _.get(latestFrame, [theirIndex, 'post', 'stocksRemaining']);
    }

    switch (end.gameEndMethod) {
        case 1:
            // Time out
            // could determine stocks/percent
            return -1;
        case 2:
        case 3:
            // 2: Someone won on stocks
            // 3: Team won on stocks
            if (playerStocks === 0 && oppStocks === 0) {
                // Can this happen?
                return -1;
            }

            return playerStocks === 0 ? RIGHTSCORE : LEFTSCORE;
        case 7:
            // Someone pressed L+R+A+Start
            // if only 1 player at 1 stock they probably lost
            if (playerStocks === 1 && !(oppStocks === 1)) {
                return RIGHTSCORE;
            }
            else if (!(playerStocks === 1) && oppStocks === 1) {
                return LEFTSCORE;
            }
            // If nobody was at 1 stock there's no winner
            return -1;
    }
    return -1;
}

function determineTeamWinner(game: SlippiGame) {
    let gameSettings = game.getSettings();
    let end = game.getGameEnd();

    if (!gameSettings || !end) {
        throw new Error("Current game does not exist");
    }

    let myPort = getMyPort(gameSettings)
    let [myTeam, theirTeam] = getTeams(myPort, gameSettings);

    const latestFrame = _.get(game.getLatestFrame(), 'players') || [];
    const myStocks = getTeamStockCount(latestFrame, myTeam);
    const theirStocks = getTeamStockCount(latestFrame, theirTeam);

    return [myStocks, theirStocks];
}

interface FrameData {
    [playerIndex: number]: {
        pre: PreFrameUpdateType;
        post: PostFrameUpdateType;
    } | null;
}

function getTeamStockCount(latestFrame: FrameData, team: PlayerType[]) {
    let stockCount = 0;

    for (let player of team) {
        stockCount += _.get(latestFrame, [(player.port - 1), 'post', 'stocksRemaining'], 0);
    }

    return stockCount;
}

export function updateWinner(docRef: DocumentReference, game: SlippiGame) {
    // determine which index won
    let i = determineWinner(game);
    if (i < 0 || i > 1) {
        console.log("Unknown winner");
        return;
    }
    // get scoreboard
    // increase score
    getScoreboard(docRef).then((s) => {
        if (i === LEFTSCORE) {
            // I win
            s.players_1s += 1;
        }
        else {
            // they win
            s.players_2s += 1;
        }
        updateScoreboard(docRef, s);
    });
}