const mongoose = require("mongoose");
const Order = require("../models/order");
const Shop = require("../models/shop");
const User = require("../models/user");
const Rating = require("../models/review");

// Helper to calculate start date based on duration
const getDateRange = (duration) => {
  const now = new Date();
  let startDate;

  switch (duration) {
    case "day":
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case "week":
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case "month":
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case "3month":
      startDate = new Date(now.setMonth(now.getMonth() - 3));
      break;
    case "6month":
      startDate = new Date(now.setMonth(now.getMonth() - 6));
      break;
    default:
      startDate = new Date(0); // all-time
  }

  return { startDate, endDate: new Date() };
};

const getShopAnalytics = async (req, res) => {
  try {
    const { shopId } = req.params;
    const { duration = "day" } = req.query; // optional from frontend
    const vendorId = req.vendor._id;

    // Verify ownership
    const shop = await Shop.findById(shopId);
    if (!shop || shop.owner.toString() !== vendorId.toString()) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { startDate, endDate } = getDateRange(duration);

    const [
      totalStats,
      topSellingItems,
      tablePerformance,
      repeatCustomersAgg,
      averageRating,
      allCustomerIds,
    ] = await Promise.all([
      // Revenue & Orders
      Order.aggregate([
        {
          $match: {
            shop: new mongoose.Types.ObjectId(shopId),
            orderStatus: "Completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalAmount" },
            totalOrders: { $sum: 1 },
          },
        },
      ]),

      // Top-selling items
      Order.aggregate([
        {
          $match: {
            shop: new mongoose.Types.ObjectId(shopId),
            orderStatus: "Completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.menuItem",
            name: { $first: "$items.name" },
            totalQuantitySold: { $sum: "$items.quantity" },
          },
        },
        { $sort: { totalQuantitySold: -1 } },
      ]),

      // Top tables (fixed)
      Order.aggregate([
        {
          $match: {
            shop: new mongoose.Types.ObjectId(shopId),
            orderStatus: "Completed",
            createdAt: { $gte: startDate, $lte: endDate },
            tableNumber: { $nin: [null, "", undefined] },
          },
        },
        {
          $group: {
            _id: { $toString: "$tableNumber" },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { orderCount: -1 } },
        { $limit: 5 },
      ]),

      // Repeat customers
      Order.aggregate([
        {
          $match: {
            shop: new mongoose.Types.ObjectId(shopId),
            orderStatus: "Completed",
            createdAt: { $gte: startDate, $lte: endDate },
            user: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$user",
            orderCount: { $sum: 1 },
          },
        },
        { $match: { orderCount: { $gt: 1 } } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userInfo",
          },
        },
        { $unwind: "$userInfo" },
        {
          $project: {
            _id: 0,
            userId: "$userInfo._id",
            name: "$userInfo.name",
            email: "$userInfo.email",
            phone: "$userInfo.phone",
            orderCount: 1,
          },
        },
        { $sort: { orderCount: -1 } },
      ]),

      // Average rating
      Rating.aggregate([
        { $match: { shop: new mongoose.Types.ObjectId(shopId) } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
          },
        },
      ]),

      // All unique customers
      Order.distinct("user", {
        shop: new mongoose.Types.ObjectId(shopId),
        user: { $ne: null },
      }),
    ]);

    // Fetch customer info
    const allCustomers = await User.find(
      { _id: { $in: allCustomerIds } },
      "name email phone createdAt"
    ).lean();

    // Identify top & least selling items
    const mostFavItem = topSellingItems[0] || null;
    const leastFavItem =
      topSellingItems.length > 0 ? topSellingItems[topSellingItems.length - 1] : null;

    const analyticsData = {
      totalRevenue: totalStats[0]?.totalRevenue || 0,
      totalOrders: totalStats[0]?.totalOrders || 0,
      averageRating: parseFloat(averageRating[0]?.averageRating?.toFixed(1)) || 0,
      mostFavItem: mostFavItem
        ? { name: mostFavItem.name, count: mostFavItem.totalQuantitySold }
        : null,
      leastFavItem: leastFavItem
        ? { name: leastFavItem.name, count: leastFavItem.totalQuantitySold }
        : null,
      topTables: tablePerformance.map((t) => ({
        tableNumber: t._id,
        orderCount: t.orderCount,
      })),
      totalCustomers: allCustomers.length,
      repeatCustomersCount: repeatCustomersAgg.length,
      repeatCustomers: repeatCustomersAgg,
      allCustomers,
    };

    res.status(200).json({ success: true, data: analyticsData });
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

module.exports = { getShopAnalytics };
