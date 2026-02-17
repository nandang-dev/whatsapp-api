# WhatsApp API dengan Swagger dan QR Code Generator

Project ini adalah API server untuk mengelola WhatsApp menggunakan `whatsapp-web.js` dengan dokumentasi Swagger dan endpoint untuk menghasilkan QR Code.

## Fitur

- ✅ **QR Code Generator** - Endpoint untuk mendapatkan QR Code dalam format image
- ✅ **Swagger Documentation** - Dokumentasi API yang lengkap dan interaktif
- ✅ **Send Message** - Mengirim pesan WhatsApp melalui API
- ✅ **Status Check** - Mengecek status koneksi WhatsApp
- ✅ **Logout** - Logout dan reset session WhatsApp

## Instalasi

1. **Clone atau download project ini**

2. **Install dependencies:**
```bash
npm install
```

3. **Setup environment (opsional):**
```bash
cp .env.example .env
```

Edit file `.env` jika ingin mengubah port (default: 3000)

4. **Jalankan server:**
```bash
npm start
```

Atau untuk development dengan auto-reload:
```bash
npm run dev
```

## Penggunaan

### 1. Akses Swagger Documentation

Buka browser dan akses:
```
http://localhost:3000/api-docs
```

### 2. Mendapatkan QR Code

**Via Browser:**
```
http://localhost:3000/api/qrcode
```
Ini akan menampilkan QR Code sebagai image PNG.

**Via API (JSON):**
```bash
curl http://localhost:3000/api/qrcode \
  -H "Accept: application/json"
```

Response:
```json
{
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "status": "ready",
  "connected": false
}
```

### 3. Scan QR Code

1. Buka WhatsApp di smartphone Anda
2. Pergi ke Settings > Linked Devices
3. Klik "Link a Device"
4. Scan QR Code yang ditampilkan di browser/API response

### 4. Cek Status Koneksi

```bash
curl http://localhost:3000/api/status
```

Response:
```json
{
  "status": "connected",
  "connected": true,
  "message": "WhatsApp sudah terhubung",
  "hasQrCode": false
}
```

### 5. Mengirim Pesan

```bash
curl -X POST http://localhost:3000/api/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "number": "6281234567890",
    "message": "Hello dari API!"
  }'
```

**Catatan:** 
- Format nomor: gunakan kode negara tanpa tanda + (contoh: 6281234567890 untuk Indonesia)
- Nomor harus sudah pernah mengirim pesan ke Anda atau sudah ada di kontak

### 6. Logout

```bash
curl -X POST http://localhost:3000/api/logout
```

Ini akan logout dari WhatsApp dan menghapus session. QR Code baru akan tersedia setelah beberapa saat.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Info API |
| GET | `/api-docs` | Swagger UI Documentation |
| GET | `/api/qrcode` | Get QR Code (image atau JSON) |
| GET | `/api/status` | Check connection status |
| POST | `/api/send-message` | Send WhatsApp message |
| POST | `/api/logout` | Logout dari WhatsApp |

## Struktur Project

```
whatsapp-api/
├── server.js          # Main server file
├── package.json       # Dependencies
├── .env.example       # Environment variables example
├── .gitignore         # Git ignore file
└── README.md          # Documentation
```

## Dependencies

- **express** - Web framework
- **whatsapp-web.js** - WhatsApp Web API client
- **qrcode** - QR Code generator
- **swagger-ui-express** - Swagger UI
- **swagger-jsdoc** - Swagger documentation generator
- **cors** - CORS middleware
- **dotenv** - Environment variables

## Troubleshooting

### QR Code tidak muncul
- Tunggu beberapa detik setelah server start
- Refresh halaman atau hit endpoint lagi
- Cek console untuk error messages

### Pesan tidak terkirim
- Pastikan WhatsApp sudah terhubung (cek `/api/status`)
- Pastikan nomor sudah benar formatnya
- Pastikan nomor sudah pernah mengirim pesan ke Anda atau ada di kontak
- Coba kirim nomor dengan format fleksibel (mis: `+62 812-3456-7890`, API akan normalisasi otomatis)
- Setelah update `whatsapp-web.js`, jalankan `POST /api/clear-session`, restart server, lalu scan QR ulang

### Error saat install
- Pastikan Node.js versi 14 atau lebih baru
- Hapus `node_modules` dan `package-lock.json`, lalu install ulang

## Catatan Penting

⚠️ **Security:**
- Jangan expose API ini ke public tanpa authentication
- Gunakan HTTPS di production
- Jangan commit file `.env` dan `.wwebjs_auth/`

⚠️ **WhatsApp:**
- WhatsApp Web API tidak resmi, gunakan dengan hati-hati
- Jangan spam pesan, bisa terkena ban
- Session disimpan di folder `.wwebjs_auth/`

## License

ISC
