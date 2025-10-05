import express from 'express';

export const pagesRouter = express.Router();

// Add this new route to handle the redirect
// This will redirect any traffic from the root URL ('/') to ('/tickets')
pagesRouter.get('/', (req, res) => res.redirect('/tickets'));

// Minimal UI to exercise APIs. Uses localStorage token via script.
pagesRouter.get('/tickets', (req, res) => res.render('tickets'));
pagesRouter.get('/tickets/new', (req, res) => res.render('new'));
pagesRouter.get('/tickets/:id', (req, res) => res.render('show'));