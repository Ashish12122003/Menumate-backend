const mongoose = require('mongoose');
const Review = require('../models/review');
const Order = require('../models/order');
const Shop = require('../models/shop');

// @desc    Create a review for a completed order
// @route   POST /api/orders/:orderId/review
// @access  Private (User only)
const createReview = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    // 1. Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // 2. Security & Validation Checks
    if (order.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'You can only review your own orders.' });
    }
    if (order.orderStatus !== 'Completed') {
      return res.status(400).json({ success: false, message: 'You can only review completed orders.' });
    }
    const existingReview = await Review.findOne({ order: orderId });
    if (existingReview) {
      return res.status(400).json({ success: false, message: 'You have already submitted a review for this order.' });
    }

    // 3. Create and save the new review
    const review = await Review.create({
      rating,
      comment,
      user: userId,
      shop: order.shop,
      order: orderId
    });

    res.status(201).json({
      success: true,
      message: 'Thank you for your review!',
      data: review
    });
  } catch (error) {
    console.error("Create Review Error:", error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Get all reviews for a specific shop (Public access)
// @route   GET /api/shops/:shopId/reviews
// @access  Public
const getReviewsForShop = async (req, res) => {
  try {
    const { shopId } = req.params;

    // ✅ Get all reviews for this shop
    const reviews = await Review.find({ shop: shopId })
      .populate('user', 'name') // only user's name
      .sort({ createdAt: -1 });

    // ✅ Calculate average rating
    const stats = await Review.aggregate([
      { $match: { shop: new mongoose.Types.ObjectId(shopId) } },
      {
        $group: {
          _id: '$shop',
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 }
        }
      }
    ]);

    const averageRating = stats.length > 0 ? parseFloat(stats[0].averageRating.toFixed(1)) : 0;

    res.status(200).json({
      success: true,
      count: reviews.length,
      averageRating,
      data: reviews
    });

  } catch (error) {
    console.error("Get Reviews Error:", error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = {
  createReview,
  getReviewsForShop
};
