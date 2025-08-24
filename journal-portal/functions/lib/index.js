"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPdf = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Initialize Firebase Admin
admin.initializeApp();
// PDF Proxy Function - Creates clean, secure URLs and serves PDFs without CORS issues
exports.getPdf = functions.https.onRequest(async (req, res) => {
    try {
        // Set CORS headers to allow embedding in iframe
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('X-Frame-Options', 'SAMEORIGIN'); // Allow iframe embedding from same origin
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        // Only allow GET requests
        if (req.method !== 'GET') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        // Get journal ID from URL path: /pdf/journal-id
        const journalId = req.path.split('/').pop();
        if (!journalId) {
            res.status(400).send('Journal ID required');
            return;
        }
        console.log(`📄 PDF request for journal: ${journalId}`);
        // Get journal document from Firestore
        const journalDoc = await admin
            .firestore()
            .collection('journals')
            .doc(journalId)
            .get();
        if (!journalDoc.exists) {
            console.log(`❌ Journal not found: ${journalId}`);
            res.status(404).send('Journal not found');
            return;
        }
        const journalData = journalDoc.data();
        if (!(journalData === null || journalData === void 0 ? void 0 : journalData.pdfUrl)) {
            console.log(`❌ No PDF URL for journal: ${journalId}`);
            res.status(404).send('PDF not available');
            return;
        }
        // Increment view count
        try {
            await journalDoc.ref.update({
                viewCount: admin.firestore.FieldValue.increment(1),
            });
            console.log(`📊 Incremented view count for journal: ${journalId}`);
        }
        catch (viewCountError) {
            console.error('Warning: Could not increment view count:', viewCountError);
            // Don't fail the request if view count update fails
        }
        // Get the file from Firebase Storage
        const bucket = admin.storage().bucket();
        // Extract file path from Firebase Storage URL
        const url = new URL(journalData.pdfUrl);
        const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);
        if (!pathMatch) {
            console.log(`❌ Invalid storage URL format: ${journalData.pdfUrl}`);
            res.status(500).send('Invalid PDF reference');
            return;
        }
        const filePath = decodeURIComponent(pathMatch[1]);
        const file = bucket.file(filePath);
        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
            console.log(`❌ PDF file not found: ${filePath}`);
            res.status(404).send('PDF file not found');
            return;
        }
        // Get file metadata
        const [metadata] = await file.getMetadata();
        // Set appropriate headers for PDF
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `inline; filename="${sanitizeFilename(journalData.title || 'journal')}.pdf"`);
        res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        if (metadata.size) {
            res.set('Content-Length', metadata.size.toString());
        }
        console.log(`✅ Serving PDF: ${journalData.title} (${filePath})`);
        // Stream the file directly to the response
        const stream = file.createReadStream();
        stream.on('error', (error) => {
            console.error('❌ Stream error:', error);
            if (!res.headersSent) {
                res.status(500).send('Error streaming PDF');
            }
        });
        stream.pipe(res);
    }
    catch (error) {
        console.error('❌ PDF proxy error:', error);
        if (!res.headersSent) {
            res.status(500).send('Internal server error');
        }
    }
});
// Helper function to sanitize filename for PDF download
function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-z0-9\s\-_\.]/gi, '') // Remove special characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .substring(0, 50); // Limit length
}
//# sourceMappingURL=index.js.map