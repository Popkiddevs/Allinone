import { Boom } from '@hapi/boom';
import Baileys, { DisconnectReason, delay, useMultiFileAuthState } from '@whiskeysockets/baileys';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import PastebinAPI from 'pastebin-js';
import path, { dirname } from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';

const app = express();
const pastebin = new PastebinAPI('l3iUR_iaeRN-kvTNLKfPFDio39NuKZGF'); // Replace with your Pastebin API key

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(cors());
const PORT = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to create a random session ID
function createRandomId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 10 }, () => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
}

let sessionFolder = `./auth/${createRandomId()}`;

// Clear session folder
const clearState = () => {
  if (fs.existsSync(sessionFolder)) {
    fs.rmdirSync(sessionFolder, { recursive: true });
  }
};

// Delete session folder
const deleteSessionFolder = () => {
  if (fs.existsSync(sessionFolder)) {
    fs.rmdirSync(sessionFolder, { recursive: true });
    console.log('Deleted the session folder.');
  }
};

// Serve the pairing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

// Handle pairing request
app.get('/pair', async (req, res) => {
  const phone = req.query.phone;

  if (!phone) {
    return res.status(400).json({ error: 'Please provide a phone number.' });
  }

  try {
    const code = await startPairing(phone);
    res.json({ code });
  } catch (error) {
    console.error('Error in WhatsApp authentication:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Start WhatsApp pairing
async function startPairing(phone) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

      const client = Baileys.makeWASocket({
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: state,
      });

      if (!client.authState.creds.registered) {
        const phoneNumber = phone.replace(/[^0-9]/g, '');
        if (phoneNumber.length < 11) {
          return reject(new Error('Please enter your number with the country code.'));
        }

        setTimeout(async () => {
          try {
            const code = await client.requestPairingCode(phoneNumber);
            console.log(`Pairing Code: ${code}`);
            resolve(code);
          } catch (error) {
            console.error('Error requesting pairing code:', error);
            reject(new Error('Failed to request pairing code.'));
          }
        }, 2000);
      }

      client.ev.on('creds.update', saveCreds);

      client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          await delay(10000);

          try {
            const output = await pastebin.createPasteFromFile(
              `${sessionFolder}/creds.json`,
              'Ethix-MD',
              null,
              1,
              'N'
            );
            const sessionId = 'Sarkarmd$' + output.split('https://pastebin.com/')[1];
            console.log(sessionId);

            await client.sendMessage(client.user.id, { text: sessionId });
            await client.sendMessage(client.user.id, {
              text: '> ❌ DO NOT SHARE THIS SESSION-ID WITH ANYBODY',
            });

            deleteSessionFolder();
            process.send('reset');
          } catch (error) {
            console.error('Error uploading session to Pastebin:', error);
            reject(new Error('Failed to upload session data.'));
          }
        }

        if (connection === 'close') {
          const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          console.error('Connection closed:', DisconnectReason[reason] || reason);
          process.send('reset');
        }
      });
    } catch (error) {
      console.error('An error occurred:', error);
      reject(error);
    }
  });
}

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
