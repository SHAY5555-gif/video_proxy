/**
 * IMPORTANT ROUTE ORDER FIX
 * 
 * The current server.js has a critical issue: the 404 handler is placed BEFORE
 * some important routes like /transcribe, /health, and /test-proxy.
 * 
 * This causes these routes to be unreachable because the 404 handler catches
 * all requests before they can reach these routes.
 * 
 * To fix this issue:
 * 
 * 1. Move the entire 404 handler code block (beginning at line ~1832) to the
 *    very end of the file, right after all other route definitions.
 * 
 * 2. The 404 handler block looks like this:
 *    // Custom 404 handler
 *    app.use((req, res) => {
 *      // ... HTML response code ...
 *    });
 * 
 * 3. The correct order of routes should be:
 *    - Regular middleware (cors, etc.)
 *    - All specific routes (/, /proxy, /youtube-info, /download, /transcribe, /health, /test-proxy)
 *    - 404 handler (the catch-all at the VERY END)
 * 
 * Once this is fixed, the /transcribe endpoint will work correctly.
 */

// Example of proper Express.js route order:
/*
const express = require('express');
const app = express();

// 1. Global middleware first
app.use(express.json());
app.use(cors());

// 2. Specific routes
app.get('/', (req, res) => { /* ... */ });
app.get('/api/items', (req, res) => { /* ... */ });
app.post('/api/items', (req, res) => { /* ... */ });

// 3. Dynamic routes with parameters
app.get('/api/items/:id', (req, res) => { /* ... */ });

// 4. LAST: 404 handler (catch-all for unmatched routes)
app.use((req, res) => {
  res.status(404).send('Not Found');
});

app.listen(3000);
*/ 