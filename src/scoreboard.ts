import { DocumentReference, getDoc, setDoc } from "firebase/firestore/lite";
import { scoreboard as Scoreboard } from ".";

export async function getScoreboard(docRef: DocumentReference): Promise<Scoreboard> {
    const scoreSnapshot = await getDoc(docRef);
    if (scoreSnapshot.exists()) {
        return scoreSnapshot.data() as Scoreboard;
    }
    else {
        console.log("failed");
    }
    return null as any;
}

export function resetScore(data: Scoreboard) {
    data.sets_1s = 0;
    data.sets_2s = 0;
    data.players_1s = 0;
    data.players_2s = 0;
}

export async function updateScoreboard(docRef: DocumentReference, scoreboard: Scoreboard) {
    await setDoc(docRef, scoreboard);
}