// api/orders/generate-id.js
// GET /api/orders/generate-id
// Generate ID pesanan unik format HBJ-DDMMYY-001
// Butuh login (Bearer token)

const { db } = require('../../lib/firebase');
const { verifyToken, handleOptions } = require('../../lib/auth');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(res);

    try {
        await verifyToken(req); // harus login

        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const prefix = `HBJ-${dd}${mm}${yy}`;

        // Ambil semua pesanan dengan prefix hari ini
        const snap = await db.ref('pesanan')
            .orderByChild('kode')
            .startAt(prefix)
            .endAt(prefix + '\uf8ff')
            .once('value');

        const existing = snap.val()
            ? Object.values(snap.val()).map(o => o.kode)
            : [];

        let counter = 1;
        let kode;
        do {
            kode = `${prefix}-${String(counter).padStart(3, '0')}`;
            counter++;
        } while (existing.includes(kode));

        res.status(200).json({ success: true, kode });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ success: false, message: err.message || 'Server error' });
    }
};
