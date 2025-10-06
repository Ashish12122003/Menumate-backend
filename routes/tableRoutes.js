// routes/tableRoutes.js
const express = require('express');
// We need mergeParams: true to access :shopId from the parent shop router
const router = express.Router({ mergeParams: true }); 

const { createTableForShop, getTablesForShop, deleteTableForShop } = require('../controllers/tableController');

// Define the routes for the base URL ('/') of this router
router.route('/')
    .post(createTableForShop)   // POST /api/shops/:shopId/tables
    .get(getTablesForShop);     // GET /api/shops/:shopId/tables


router.delete('/:qrIdentifier', deleteTableForShop);

module.exports = router; 