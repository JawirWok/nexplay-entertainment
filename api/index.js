const app = require('../server');

module.exports = (req, res) => {
    try {
        return app(req, res);
    } catch (err) {
        console.error('Lambda handler uncaught error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Serverless Function Error', message: err.message });
        }
    }
};

