import { Boom } from '@hapi/boom';
import Baileys, { DisconnectReason, delay, useMultiFileAuthState } from '@whiskeysockets/baileys';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import PastebinAPI from 'pastebin-js';
import path, { dirname } from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';

// Initialize Pastebin API
const pastebin = new PastebinAPI('l3iUR_iaeRN-kvTNLKfPFDio39NuKZGF');

// Initialize Express app
const app = express();

// Middleware to disable caching
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Enable CORS
app.use(cors());

// Define server port
const PORT = process.env.PORT || 8000;

// Helper function to create random session ID
function createRandomId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 10; i++) {
    id += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return id;
}

// Define session folder path
let sessionFolder = `./auth/${createRandomId()}`;
if (fs.existsSync(sessionFolder)) {
  try {
    fs.rmdirSync(sessionFolder, { recursive: true });
    console.log('Deleted the "SESSION" folder.');
  } catch (err) {
    console.error('Error deleting the "SESSION" folder:', err);
  }
}

// Function to delete session folder
function deleteSessionFolder() {
  if (!fs.existsSync(sessionFolder)) {
    console.log('The "SESSION" folder does not exist.');
    return;
  }

  try {
    fs.rmdirSync(sessionFolder, { recursive: true });
    console.log('Deleted the "SESSION" folder.');
  } catch (err) {
    console.error('Error deleting the "SESSION" folder:', err);
  }
}

// Define the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

// Define pairing route
app.get('/pair', async (req, res) => {
  let phone = req.query.phone;

  if (!phone) return res.json({ error: 'Please Provide Phone Number' });

  try {
    const code = await startnigg(phone);
    res.json({ code });
  } catch (error) {
    console.error('Error in WhatsApp authentication:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Function to start WhatsApp pairing
async function startnigg(phone) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(sessionFolder)) {
        await fs.mkdirSync(sessionFolder);
      }

      const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

      const negga = Baileys.makeWASocket({
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: state,
      });

      if (!negga.authState.creds.registered) {
        let phoneNumber = phone.replace(/[^0-9]/g, '');
        if (phoneNumber.length < 11) {
          return reject(new Error('Please Enter Your Number With Country Code !!'));
        }
        setTimeout(async () => {
          try {
            let code = await negga.requestPairingCode(phoneNumber);
            console.log(`Your Pairing Code : ${code}`);
            resolve(code);
          } catch (requestPairingCodeError) {
            const errorMessage = 'Error requesting pairing code from WhatsApp';
            console.error(errorMessage, requestPairingCodeError);
            reject(new Error(errorMessage));
          }
        }, 2000);
      }

      negga.ev.on('creds.update', saveCreds);

      negga.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          await delay(10000);

          // Upload credentials to Pastebin
          const output = await pastebin.createPasteFromFile(
            `${sessionFolder}/creds.json`,
            'Ethix-MD',
            null,
            1,
            'N'
          );
          const sessi = 'Sarkarmd$' + output.split('https://pastebin.com/')[1];
          console.log(sessi);
          await delay(2000);
          
          // Send session ID to user
          let guru = await negga.sendMessage(negga.user.id, { text: sessi });
          await delay(2000);
          await negga.sendMessage(
            negga.user.id,
            { text: '> ❌ DO NOT SHARE THIS SESSION-ID WITH ANYBODY' },
            { quoted: guru }
          );

          console.log('Connected to WhatsApp Servers');

          try {
            deleteSessionFolder();
          } catch (error) {
            console.error('Error deleting session folder:', error);
          }

          process.send('reset');
        }

        if (connection === 'close') {
          let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          handleConnectionClose(reason);
        }
      });

      negga.ev.on('messages.upsert', () => {});
    } catch (error) {
      console.error('An Error Occurred:', error);
      throw new Error('An Error Occurred');
    }
  });
}

// Function to handle connection close reason
function handleConnectionClose(reason) {
  switch (reason) {
    case DisconnectReason.connectionClosed:
      console.log('[Connection closed, reconnecting....!]');
      process.send('reset');
      break;
    case DisconnectReason.connectionLost:
      console.log('[Connection Lost from Server, reconnecting....!]');
      process.send('reset');
      break;
    case DisconnectReason.loggedOut:
      clearState();
      console.log('[Device Logged Out, Please Try to Login Again....!]');
      process.send('reset');
      break;
    case DisconnectReason.restartRequired:
      console.log('[Server Restarting....!]');
      startnigg();
      break;
    case DisconnectReason.timedOut:
      console.log('[Connection Timed Out, Trying to Reconnect....!]');
      process.send('reset');
      break;
    case DisconnectReason.badSession:
      console.log('[BadSession exists, Trying to Reconnect....!]');
      clearState();
      process.send('reset');
      break;
    case DisconnectReason.connectionReplaced:
      console.log('[Connection Replaced, Trying to Reconnect....!]');
      process.send('reset');
      break;
    default:
      console.log('[Server Disconnected: Unknown reason]');
      process.send('reset');
  }
}

// Start the Express server
app.listen(PORT, () => {
  console.log(`API Running on PORT:${PORT}`);
});
