const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3030;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage untuk QR code
let qrCodeData = null;
let client = null;
let clientReady = false;

function normalizePhoneNumber(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/\D/g, '');
}

function parseChatTarget(input) {
  if (typeof input !== 'string') {
    return { error: 'Nomor tujuan harus berupa string' };
  }

  const raw = input.trim();
  if (!raw) {
    return { error: 'Nomor tujuan tidak boleh kosong' };
  }

  if (raw.includes('@')) {
    return { chatId: raw, normalizedNumber: raw, isDirectUser: raw.endsWith('@c.us') };
  }

  const normalizedNumber = normalizePhoneNumber(raw);
  if (!normalizedNumber) {
    return { error: 'Format nomor tidak valid' };
  }

  return {
    chatId: `${normalizedNumber}@c.us`,
    normalizedNumber,
    isDirectUser: true
  };
}

async function resolveChatId(input) {
  const parsed = parseChatTarget(input);
  if (parsed.error) return parsed;

  // Hanya validasi direct user. Group/newsletter id tetap dipakai apa adanya.
  if (!parsed.isDirectUser) return parsed;

  const normalizedNumber = normalizePhoneNumber(parsed.normalizedNumber.replace('@c.us', ''));
  if (!normalizedNumber) {
    return { error: 'Format nomor tidak valid' };
  }

  try {
    const numberId = await client.getNumberId(normalizedNumber);
    const serialized =
      typeof numberId === 'string' ? numberId : numberId?._serialized;

    if (!serialized) {
      return { error: `Nomor ${normalizedNumber} tidak terdaftar di WhatsApp` };
    }

    return {
      chatId: serialized,
      normalizedNumber
    };
  } catch (err) {
    console.error(`Error validating number ${normalizedNumber}:`, err.message || err);
    return {
      chatId: `${normalizedNumber}@c.us`,
      normalizedNumber
    };
  }
}

// Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp API',
      version: '1.0.0',
      description: 'API untuk mengelola WhatsApp menggunakan whatsapp-web.js dengan QR Code Generator',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./server.js'], // Path to the API files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Initialize WhatsApp Client
function initializeWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  // Loading Screen Event
  client.on('loading_screen', (percent, message) => {
    console.log(`Loading: ${percent}% - ${message}`);
  });

  // QR Code Event
  client.on('qr', async (qr) => {
    console.log('QR Code received, generating image...');
    try {
      // Generate QR code as data URL
      qrCodeData = await qrcode.toDataURL(qr);
      console.log('QR Code generated successfully');
    } catch (err) {
      console.error('Error generating QR code:', err);
      qrCodeData = null;
    }
  });

  // Ready Event
  client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    clientReady = true;
    qrCodeData = null; // Clear QR code when ready
  });

  // Authentication Event
  client.on('authenticated', () => {
    console.log('WhatsApp Client authenticated');
  });

  // Authentication Failure Event
  client.on('auth_failure', (msg) => {
    console.error('Authentication failure:', msg);
    clientReady = false;
    qrCodeData = null;
  });

  // Disconnected Event
  client.on('disconnected', (reason) => {
    console.log('WhatsApp Client disconnected:', reason);
    clientReady = false;
    qrCodeData = null;
  });

  // Change State Event
  client.on('change_state', (state) => {
    console.log('Client state changed:', state);
  });

  // Initialize client
  client.initialize().catch(err => {
    console.error('Error initializing client:', err);
  });
}

// Initialize WhatsApp on server start
initializeWhatsApp();

/**
 * @swagger
 * /api/qrcode:
 *   get:
 *     summary: Mendapatkan QR Code untuk autentikasi WhatsApp
 *     tags: [WhatsApp]
 *     responses:
 *       200:
 *         description: QR Code berhasil dihasilkan
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qrCode:
 *                   type: string
 *                   description: QR Code dalam format base64 data URL
 *                 status:
 *                   type: string
 *                   example: "ready"
 *       404:
 *         description: QR Code belum tersedia
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "QR Code belum tersedia. Silakan tunggu beberapa saat."
 *                 status:
 *                   type: string
 *                   example: "not_ready"
 */
app.get('/api/qrcode', (req, res) => {
  if (clientReady) {
    return res.json({
      message: 'WhatsApp sudah terhubung. QR Code tidak diperlukan lagi.',
      status: 'connected',
      connected: true
    });
  }

  if (!qrCodeData) {
    return res.status(404).json({
      message: 'QR Code belum tersedia. Silakan tunggu beberapa saat.',
      status: 'not_ready',
      connected: false
    });
  }

  // Return as JSON with base64 data URL
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({
      qrCode: qrCodeData,
      status: 'ready',
      connected: false
    });
  }

  // Return as image
  const base64Data = qrCodeData.replace(/^data:image\/png;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.send(imageBuffer);
});

/**
 * @swagger
 * /api/status:
 *   get:
 *     summary: Mengecek status koneksi WhatsApp
 *     tags: [WhatsApp]
 *     responses:
 *       200:
 *         description: Status koneksi WhatsApp
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "connected"
 *                 connected:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "WhatsApp sudah terhubung"
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: clientReady ? 'connected' : 'disconnected',
    connected: clientReady,
    message: clientReady 
      ? 'WhatsApp sudah terhubung' 
      : 'WhatsApp belum terhubung. Silakan scan QR Code terlebih dahulu.',
    hasQrCode: !!qrCodeData
  });
});

/**
 * @swagger
 * /api/send-message:
 *   post:
 *     summary: Mengirim pesan WhatsApp
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - number
 *               - message
 *             properties:
 *               number:
 *                 type: string
 *                 description: "Nomor WhatsApp (format: 6281234567890)"
 *                 example: "6281234567890"
 *               message:
 *                 type: string
 *                 description: Isi pesan yang akan dikirim
 *                 example: "Hello, ini adalah pesan dari API"
 *     responses:
 *       200:
 *         description: Pesan berhasil dikirim
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Pesan berhasil dikirim"
 *                 messageId:
 *                   type: string
 *                   example: "3EB0C767F26EE5B6D123"
 *       400:
 *         description: Bad request - parameter tidak lengkap
 *       500:
 *         description: Error saat mengirim pesan
 */
app.post('/api/send-message', async (req, res) => {
  if (!clientReady) {
    return res.status(400).json({
      success: false,
      message: 'WhatsApp belum terhubung. Silakan scan QR Code terlebih dahulu.'
    });
  }

  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).json({
      success: false,
      message: 'Parameter number dan message harus diisi'
    });
  }

  try {
    const target = await resolveChatId(number);
    if (target.error) {
      return res.status(400).json({
        success: false,
        message: target.error
      });
    }
    
    const result = await client.sendMessage(target.chatId, message);
    
    res.json({
      success: true,
      message: 'Pesan berhasil dikirim',
      messageId: result.id._serialized,
      to: target.normalizedNumber
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengirim pesan',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/send-batch-message:
 *   post:
 *     summary: Mengirim pesan WhatsApp ke multiple nomor (batch)
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipients
 *             properties:
 *               recipients:
 *                 type: array
 *                 description: "Array of recipients. Format 1 (strings): [\"6281234567890\", \"6289876543210\"]. Format 2 (objects): [{\"number\": \"6281234567890\", \"message\": \"Pesan khusus\"}]"
 *                 items:
 *                   type: string
 *                   example: "6281234567890"
 *                 example: ["6281234567890", "6289876543210"]
 *               message:
 *                 type: string
 *                 description: Isi pesan yang akan dikirim ke semua nomor (jika recipients adalah array of strings)
 *                 example: "Hello, ini adalah pesan broadcast dari API"
 *               delay:
 *                 type: integer
 *                 description: "Delay antar pesan dalam milliseconds (default: 1000ms)"
 *                 example: 1000
 *                 default: 1000
 *     responses:
 *       200:
 *         description: Hasil pengiriman batch message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total:
 *                   type: integer
 *                   description: Total nomor yang akan dikirim
 *                   example: 2
 *                 sent:
 *                   type: integer
 *                   description: Jumlah pesan yang berhasil dikirim
 *                   example: 2
 *                 failed:
 *                   type: integer
 *                   description: Jumlah pesan yang gagal dikirim
 *                   example: 0
 *                 results:
 *                   type: array
 *                   description: Detail hasil untuk setiap nomor
 *                   items:
 *                     type: object
 *                     properties:
 *                       number:
 *                         type: string
 *                         example: "6281234567890"
 *                       success:
 *                         type: boolean
 *                         example: true
 *                       messageId:
 *                         type: string
 *                         example: "3EB0C767F26EE5B6D123"
 *                       error:
 *                         type: string
 *                         example: null
 *       400:
 *         description: Bad request - parameter tidak lengkap atau format salah
 *       500:
 *         description: Error saat mengirim batch message
 */
app.post('/api/send-batch-message', async (req, res) => {
  if (!clientReady) {
    return res.status(400).json({
      success: false,
      message: 'WhatsApp belum terhubung. Silakan scan QR Code terlebih dahulu.'
    });
  }

  const { recipients, message, delay = 1000 } = req.body;

  // Validasi
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Parameter recipients harus berupa array dan tidak boleh kosong'
    });
  }

  // Jika recipients adalah array of strings, pastikan ada message
  const isStringArray = recipients.every(item => typeof item === 'string');
  if (isStringArray && !message) {
    return res.status(400).json({
      success: false,
      message: 'Parameter message harus diisi jika recipients adalah array of strings'
    });
  }

  // Validasi delay
  const delayMs = Math.max(100, Math.min(delay || 1000, 10000)); // Min 100ms, Max 10s

  try {
    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    // Process setiap recipient
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      let targetNumber, targetMessage;

      // Parse recipient
      if (typeof recipient === 'string') {
        // Array of strings - gunakan message yang sama
        targetNumber = recipient;
        targetMessage = message;
      } else if (typeof recipient === 'object' && recipient.number && recipient.message) {
        // Array of objects - gunakan message custom
        targetNumber = recipient.number;
        targetMessage = recipient.message;
      } else {
        // Invalid format
        results.push({
          number: recipient?.number || recipient || 'unknown',
          success: false,
          messageId: null,
          error: 'Format recipient tidak valid'
        });
        failedCount++;
        continue;
      }

      try {
        const target = await resolveChatId(targetNumber);
        if (target.error) {
          results.push({
            number: targetNumber,
            success: false,
            messageId: null,
            error: target.error
          });
          failedCount++;
          continue;
        }

        // Kirim pesan
        const result = await client.sendMessage(target.chatId, targetMessage);
        
        results.push({
          number: target.normalizedNumber,
          success: true,
          messageId: result.id._serialized,
          error: null
        });
        sentCount++;

        // Delay antar pesan (kecuali untuk pesan terakhir)
        if (i < recipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`Error sending message to ${targetNumber}:`, error);
        results.push({
          number: targetNumber,
          success: false,
          messageId: null,
          error: error.message
        });
        failedCount++;
      }
    }

    res.json({
      success: true,
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      results: results
    });
  } catch (error) {
    console.error('Error sending batch message:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengirim batch message',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/logout:
 *   post:
 *     summary: Logout dari WhatsApp (menghapus session)
 *     tags: [WhatsApp]
 *     responses:
 *       200:
 *         description: Logout berhasil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Logout berhasil"
 */
app.post('/api/logout', async (req, res) => {
  try {
    if (client) {
      await client.logout();
      await client.destroy();
      clientReady = false;
      qrCodeData = null;
      
      // Reinitialize client
      setTimeout(() => {
        initializeWhatsApp();
      }, 2000);
    }
    
    res.json({
      success: true,
      message: 'Logout berhasil. QR Code baru akan tersedia dalam beberapa saat.'
    });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal logout',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/clear-session:
 *   post:
 *     summary: Hapus session dan force regenerate QR Code
 *     tags: [WhatsApp]
 *     responses:
 *       200:
 *         description: Session berhasil dihapus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Session berhasil dihapus. QR Code baru akan tersedia dalam beberapa saat."
 */
app.post('/api/clear-session', async (req, res) => {
  try {
    // Destroy existing client
    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        console.error('Error destroying client:', err);
      }
    }
    
    clientReady = false;
    qrCodeData = null;
    
    // Delete session folder
    const sessionPath = path.join(__dirname, '.wwebjs_auth');
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log('Session folder deleted');
    }
    
    // Reinitialize client
    setTimeout(() => {
      initializeWhatsApp();
    }, 2000);
    
    res.json({
      success: true,
      message: 'Session berhasil dihapus. QR Code baru akan tersedia dalam beberapa saat.'
    });
  } catch (error) {
    console.error('Error clearing session:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal menghapus session',
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp API dengan Swagger',
    endpoints: {
      swagger: '/api-docs',
      qrcode: '/api/qrcode',
      status: '/api/status',
      sendMessage: 'POST /api/send-message',
      sendBatchMessage: 'POST /api/send-batch-message',
      logout: 'POST /api/logout',
      clearSession: 'POST /api/clear-session'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
  console.log('Initializing WhatsApp client...');
});
