import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read config
const configPath = join(__dirname, 'firebase-applet-config.json');
const configData = JSON.parse(readFileSync(configPath, 'utf8'));

const app = initializeApp(configData);
const db = getFirestore(app, configData.firestoreDatabaseId || '(default)');

const users = [
  // Reporters
  { id: 'reporter-bruna', name: 'Bruna Froehner', role: 'reporter' },
  { id: 'reporter-tiago', name: 'Tiago Silva', role: 'reporter' },
  { id: 'reporter-ricardo', name: 'Ricardo Vilches', role: 'reporter' },
  { id: 'reporter-thais', name: 'Thais Travençoli', role: 'reporter' },
  { id: 'reporter-kainan', name: 'Kainan Lucas', role: 'reporter' },
  { id: 'reporter-rivaroli', name: 'Rivaroli', role: 'reporter' },
  { id: 'reporter-joao', name: 'João Gimenes', role: 'reporter' },
  { id: 'reporter-leonardo', name: 'Leonardo Gomes', role: 'reporter' },
  { id: 'reporter-marcelo', name: 'Marcelo Borges', role: 'reporter' },
  { id: 'reporter-fernanda', name: 'Fernanda Xavier', role: 'reporter' },
  { id: 'reporter-ana', name: 'Ana Vaz', role: 'reporter' },
  { id: 'reporter-eduardo', name: 'Eduardo Scola', role: 'reporter' },
  { id: 'reporter-paulo', name: 'Paulo Gomes', role: 'reporter' },
  // Admins
  { id: 'admin-guilherme', name: 'Guilherme Drabovski', role: 'admin' },
  { id: 'admin-luana', name: 'Luana Vasconcelos', role: 'admin' },
  { id: 'admin-weslley', name: 'Weslley Maia', role: 'admin' },
  { id: 'admin-fabio', name: 'Fabio Cooti', role: 'admin' },
  // Pauteiros
  { id: 'pauteiro-rafaela', name: 'Rafaela', role: 'pauteiro' },
  { id: 'pauteiro-alana', name: 'Alana', role: 'pauteiro' },
  { id: 'pauteiro-jefferson', name: 'Jefferson', role: 'pauteiro' },
  { id: 'pauteiro-sabrina', name: 'Sabrina', role: 'pauteiro' },
  { id: 'pauteiro-paola', name: 'Paola', role: 'pauteiro' },
  { id: 'pauteiro-pedro', name: 'Pedro', role: 'pauteiro' },
  // Cinegrafistas
  { id: 'cinegrafista-jefferson', name: 'Jefferson Weiss', role: 'cinegrafista' }
];

async function seed() {
  for (const user of users) {
    const userRef = doc(db, 'users', user.id);
    await setDoc(userRef, {
      name: user.name,
      email: `${user.name.split(' ')[0].toLowerCase()}@ric.com.br`,
      role: user.role,
      createdAt: Date.now()
    }, { merge: true });
    console.log(`Added user: ${user.name}`);
  }
  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch(console.error);
