// api/ratings.js
// GET /api/ratings  → rata-rata rating dari semua testimoni
// Public, tidak butuh login

const { db } = require('../lib/firebase');
const { handleOptions } = require('../lib/auth');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(res);
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
    }

    try {
        const snap = await db.ref('testimoni').once('value');
        const data = snap.val();

        if (!data) {
            return res.status(200).json({ success: true, avg: 5.0, total: 0 });
        }

        const vals = Object.values(data)
            .map(t => Number(t.rating))
            .filter(r => r >= 1 && r <= 5);

        const avg = vals.length
            ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
            : 5.0;

        res.status(200).json({ success: true, avg, total: vals.length });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
