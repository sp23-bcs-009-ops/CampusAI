const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const fs       = require('fs');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Temporary storage for uploaded PDFs
const upload = multer({ dest: 'uploads/' });

app.post('/upload-timetable', upload.single('pdf'), async (req, res) => {
  if (req.file) {
    try {
      await fs.promises.unlink(req.file.path);
    } catch {
      return res.status(500).json({ success: false, error: 'UPLOAD_CLEANUP_FAILED' });
    }
  }
  return res.status(410).json({
    success: false,
    error: 'TEXT_PDF_UPLOAD_MOVED',
    message: 'Upload timetables through the FastAPI Text PDF endpoint. Image/scan PDFs are not supported.',
  });
});

app.get('/', (_, res) => res.json({ status: 'CampusAI Server running ✅' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 CampusAI Server started on http://localhost:${PORT}`);
  console.log('📡 PDF uploads must use the FastAPI Text PDF endpoint.\n');
});
