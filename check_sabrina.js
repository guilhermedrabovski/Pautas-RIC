import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  const usersRef = collection(db, 'users');
  const snap = await getDocs(usersRef);
  snap.forEach(doc => {
    const data = doc.data();
    if (data.name && data.name.toLowerCase().includes('sabrina')) {
      console.log(`id: ${doc.id}, name: ${data.name}, email: ${data.email}`);
    }
  });
}
main();
