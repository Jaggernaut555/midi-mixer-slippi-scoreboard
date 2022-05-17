import { DocumentReference, getDoc, setDoc } from "firebase/firestore/lite";
import { scoreboard as Scoreboard } from ".";

export async function getScoreboard(docRef: DocumentReference, retry: boolean = true): Promise<Scoreboard> {
    try {
        const scoreSnapshot = await getDoc(docRef);
        if (scoreSnapshot.exists()) {
            return scoreSnapshot.data() as Scoreboard;
        }
        else {
            console.log("failed");
        }
    }
    catch (err) {
        console.log(err);
        log.error(err);
        if (retry) {
            console.log("retrying");
            return getScoreboard(docRef, false);
        }
    }
    return null as any;
}

export function resetScore(data: Scoreboard) {
    data.sets_1s = 0;
    data.sets_2s = 0;
    data.players_1s = 0;
    data.players_2s = 0;
    data.WL_1 = "[W]";
    data.WL_2 = "[W]";
}

export async function updateScoreboard(docRef: DocumentReference, scoreboard: Scoreboard) {
    try {
        await setDoc(docRef, scoreboard);
    }
    catch (err: any) {
        console.error("Error updating scoreboard");
        console.log(err);
        log.error(err);
        $MM.showNotification("Error determining winner");
    }
}