// lib/auth.js — Middleware verifikasi Firebase ID Token

const { auth, db } = require('./firebase');

/**
 * Verifikasi token dari header Authorization: Bearer <token>
 * Return { uid, role } atau throw error
 */
async function verifyToken(req) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) throw { status: 401, message: 'Token tidak ada' };

    const decoded = await auth.verifyIdToken(token);
    const snap = await db.ref(`users/${decoded.uid}/role`).once('value');
    const role = snap.val() || 'user';

    return { uid: decoded.uid, role };
}

/**
 * Pastikan role === 'admin', throw 403 kalau bukan
 */
async function requireAdmin(req) {
    const user = await verifyToken(req);
    if (user.role !== 'admin') throw { status: 403, message: 'Akses ditolak' };
    return user;
}

/**
 * Handle CORS preflight OPTIONS
 */
function handleOptions(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).end();
}

module.exports = { verifyToken, requireAdmin, handleOptions };
