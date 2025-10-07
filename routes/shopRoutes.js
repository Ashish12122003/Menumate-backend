// routes/shopRoutes.js

const express = require('express');
const router = express.Router();
const { createShop, getMyShops, uploadUpiQrCode, deleteShop } = require('../controllers/shopController');
const { getOrdersForVendorShop } = require('../controllers/orderController'); 
const { getReviewsForShop } = require('../controllers/reviewController');
const { upload } = require('../config/cloudinary');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const { uploadQR } = require('../config/cloudinary');

// Import routers for nested routes
const analyticsRouter = require('./analyticsRoutes');
const menuRouter = require('./menuRoutes');
const categoryRouter = require('./categoryRoutes');
const tableRouter = require('./tableRoutes');


// Forward any requests like /:shopId/review to the reviewRouter
router.get('/:shopId/reviews', getReviewsForShop);

// Apply the vendor protection middleware to all routes in this file
router.use(protect);

// Routes for /api/shops (creating a shop or getting the vendor's list of shops)
router.route('/')
    .post(createShop)
    .get(getMyShops);

// Delete a shop (only by the owner vendor)
router.delete("/:shopId", deleteShop);

// Route for a vendor to upload their UPI QR Code for a specific shop
router.route('/:shopId/upi-qr')
    .put(uploadQR.single('qrImage'), uploadUpiQrCode);

// Route for a vendor to get all orders for a specific shop
router.get('/:shopId/orders', getOrdersForVendorShop);



// Analytics routes
router.use('/:shopId/analytics', analyticsRouter);

// Re-route nested resource requests to their respective routers
router.use('/:shopId/menu', menuRouter);
router.use('/:shopId/categories', categoryRouter);
router.use('/:shopId/tables', tableRouter);

module.exports = router;