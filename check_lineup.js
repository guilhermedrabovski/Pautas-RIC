import admin from "firebase-admin";
import fs from "fs";

const key = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

async function run() {
  const settings = await db.collection('settings').doc('defaultLineup').get();
  console.log("DEFAULT LINEUP TIMES:", settings.data()?.times);
}
run();
