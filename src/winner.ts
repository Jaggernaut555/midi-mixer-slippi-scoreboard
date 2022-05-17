import { GameEndType, GameStartType, PlayerType, PostFrameUpdateType, PreFrameUpdateType, SlippiGame } from "@slippi/slippi-js";
import { DocumentReference } from "firebase/firestore/lite";
import _ from "lodash";
import { getPlayerIndex, getPlayerPort, getTeams } from ".";
import { getScoreboard, updateScoreboard } from "./scoreboard";

const LEFTSCORE = 0;
const RIGHTSCORE = 1;

/// Return index of winner (0/1) or unknown (-1)
export function determineWinner(game: SlippiGame): number {
    try {
        let gameSettings = game.getSettings();
        let end = game.getGameEnd();


        if (!gameSettings || !end) {
            console.log(game, gameSettings, end);
            log.error(game, gameSettings, end);
            throw new Error("Current game does not exist");
        }

        const latestFrame = _.get(game.getLatestFrame(), 'players') || [];


        let playerStocks: number;
        let oppStocks: number;

        if (gameSettings.players.length != 2) {
            // team game
            [playerStocks, oppStocks] = determineTeamWinner(game, end, gameSettings);
        }
        else {
            const playerIndex = getPlayerIndex(gameSettings);
            const oppIndex = 1 - playerIndex;
            playerStocks = _.get(latestFrame, [playerIndex, 'post', 'stocksRemaining']);
            oppStocks = _.get(latestFrame, [oppIndex, 'post', 'stocksRemaining']);
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
    }
    catch (err: any) {
        console.log("Error determining winner");
        console.log(err);
        log.error("err");
        $MM.showNotification("Error determining winner")
    }
    return -1;
}

function determineTeamWinner(game: SlippiGame, end: GameEndType, gameSettings: GameStartType) {
    if (!gameSettings || !end) {
        console.log(game);
        log.error(game);
        throw new Error("Current team game does not exist");
    }

    let playerPort = getPlayerPort(gameSettings)
    let [playerTeam, oppTeam] = getTeams(playerPort, gameSettings);

    const latestFrame = _.get(game.getLatestFrame(), 'players') || [];
    const playerStocks = getTeamStockCount(latestFrame, playerTeam);
    const oppStocks = getTeamStockCount(latestFrame, oppTeam);

    return [playerStocks, oppStocks];
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
    // For some reason need to make sure they're numbers. Sometimes 8wr saves them as strings
    getScoreboard(docRef).then((s) => {
        if (i === LEFTSCORE) {
            // I win
            s.players_1s = Number(s.players_1s)
            s.players_1s += 1;
        }
        else {
            // they win
            s.players_2s = Number(s.players_2s)
            s.players_2s += 1;
        }
        updateScoreboard(docRef, s);
    });
}