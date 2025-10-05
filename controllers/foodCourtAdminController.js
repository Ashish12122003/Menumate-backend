// controllers/foodCourtAdminController.js
const Shop = require('../models/shop');
const FoodCourt = require('../models/foodCourt');

// @desc    Get all shops with 'Pending' status for the manager's food court
// @route   GET /api/manager/pending-shops
// @access  Private (Food Court Manager only)
const getPendingShops = async (req, res) => {
    try {
        // The req.foodCourtId is attached by our new 'authorizeManager' middleware
        const foodCourtId = req.foodCourtId;

        const pendingShops = await Shop.find({
            foodCourt: foodCourtId,
            status: 'Pending'
        }).populate('owner', 'name email number'); // Show owner details

        res.status(200).json({
            success: true,
            count: pendingShops.length,
            data: pendingShops
        });
    } catch (error) {
        console.error("Get Pending Shops Error:", error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Approve or Reject a pending shop application
// @route   PATCH /api/manager/shops/:shopId/status
// @access  Private (Food Court Manager only)
const updateShopStatus = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { status } = req.body; // Expecting 'Approved' or 'Rejected'
        const foodCourtId = req.foodCourtId;

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status provided.' });
        }

        const shop = await Shop.findById(shopId);
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found.' });
        }

        // CRITICAL SECURITY CHECK: Ensure the shop belongs to the manager's food court
        if (shop.foodCourt.toString() !== foodCourtId.toString()) {
            return res.status(403).json({ success: false, message: "Access denied. This shop is not in your food court." });
        }

        shop.status = status;
        await shop.save();

        res.status(200).json({
            success: true,
            message: `Shop has been successfully ${status}.`,
            data: shop
        });

    } catch (error) {
        console.error("Update Shop Status Error:", error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get analytics for the manager's specific food court
// @route   GET /api/manager/analytics
// @access  Private (Food Court Manager only)
const getFoodCourtAnalytics = async (req, res, next) => {
    try {
        const foodCourtId = req.foodCourtId; // From authorizeManager middleware

        // Find all shops that belong to this food court
        const shopsInFoodCourt = await Shop.find({ foodCourt: foodCourtId }).select('_id');
        const shopIds = shopsInFoodCourt.map(s => s._id);

        // Run aggregation queries only on orders from those shops
        const [
            totalStats,
            salesByShop
        ] = await Promise.all([
            Order.aggregate([
                { $match: { shop: { $in: shopIds }, orderStatus: 'Completed' } },
                { $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalOrders: { $sum: 1 }
                }}
            ]),
            Order.aggregate([
                { $match: { shop: { $in: shopIds }, orderStatus: 'Completed' } },
                { $group: {
                    _id: '$shop',
                    shopTotalRevenue: { $sum: '$totalAmount' }
                }},
                { $lookup: { from: 'shops', localField: '_id', foreignField: '_id', as: 'shopDetails' } },
                { $unwind: '$shopDetails' },
                { $project: { _id: 0, shopId: '$_id', shopName: '$shopDetails.name', shopTotalRevenue: 1 } }
            ])
        ]);
        
        const analyticsData = {
            foodCourtId,
            totalRevenue: totalStats[0]?.totalRevenue || 0,
            totalOrders: totalStats[0]?.totalOrders || 0,
            salesByShop: salesByShop
        };

        res.status(200).json({ success: true, data: analyticsData });

    } catch (error) {
        console.error("Food Court Analytics Error:", error);
        next(error);
    }
};

const getAllFoodCourts = async (req, res, next) => {
    try {
        const foodCourts = await FoodCourt.find();
        res.status(200).json({
            success: true,
            foodCourts: foodCourts
        });
    } catch (error) {
        next(error);
    }
};
// ----------------------------



module.exports = {
    getPendingShops,
    updateShopStatus,
    getFoodCourtAnalytics,
    getAllFoodCourts
};