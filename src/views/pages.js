import express from 'express';

export const pagesRouter = express.Router();

// Minimal UI to exercise APIs. Uses localStorage token via script.
pagesRouter.get('/tickets', (req, res) => res.render('tickets'));
pagesRouter.get('/tickets/new', (req, res) => res.render('new'));
pagesRouter.get('/tickets/:id', (req, res) => res.render('show'));


