// controllers/orderController.js
const MenuItem = require('../models/menuItem');
const mongoose = require('mongoose');
const Order = require('../models/order');
const ParentOrder = require('../models/parentOrder');
const Cart = require('../models/cart');
const Shop = require('../models/shop');
const User = require('../models/user'); // Added for manual population in vendor orders

// Helper function to generate IDs explicitly in the controller
async function generateShortOrderId(modelName, prefix) {
    const Model = mongoose.model(modelName);
    const count = await Model.countDocuments();
    const timestamp = Date.now().toString().slice(-4);
    return `${prefix}-${count + 1}-${timestamp}`;
}

// @desc    Place a new order from the user's cart (handles both single shop and food court)
// @route   POST /api/orders
// @access  Private (User only)
const placeOrder = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { paymentMethod, tableId } = req.body;
        const cart = await Cart.findOne({ user: userId });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: "Your cart is empty." });
        }

        const io = req.io; 

        // Get all unique menu item IDs from the cart
        const menuItemIds = cart.items.map(item => item.menuItem);
        // Fetch the source-of-truth prices from the database
        const menuItems = await MenuItem.find({ '_id': { $in: menuItemIds } });
        const priceMap = menuItems.reduce((map, item) => {
            map[item._id] = item.price;
            return map;
        }, {});

        // Now, calculate the true total based on DB prices
        let trueTotalAmount = 0;
        for (const item of cart.items) {
            if (!priceMap[item.menuItem]) {
                throw new Error(`Menu item with ID ${item.menuItem} not found.`);
            }
            trueTotalAmount += priceMap[item.menuItem] * item.quantity;
        }
        // -----------------------------------------------------------

        // --- FOOD COURT ORDER LOGIC ---
        if (cart.foodCourt) {
            const itemsByShop = cart.items.reduce((acc, item) => {
                const shopId = item.shop.toString();
                if (!acc[shopId]) { acc[shopId] = []; }
                acc[shopId].push(item);
                return acc;
            }, {});

            const parentOrderId = await generateShortOrderId('ParentOrder', 'FC');
            const newParentOrder = new ParentOrder({
                shortOrderId: parentOrderId,
                user: userId,
                foodCourt: cart.foodCourt,
                table: tableId,
                totalAmount: cart.subtotal,
                paymentMethod,
                paymentStatus: 'Pending',
            });
            const parentOrder = await newParentOrder.save();

            const subOrderPromises = Object.keys(itemsByShop).map(async (shopId) => {
                const shopItems = itemsByShop[shopId];
                const shopSubtotal = shopItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

                const subOrderId = await generateShortOrderId('Order', 'MM');
                const newSubOrder = new Order({
                    shortOrderId: subOrderId,
                    parentOrder: parentOrder._id,
                    user: userId, shop: shopId, table: tableId,
                    items: shopItems,
                    subtotal: shopSubtotal,
                    totalAmount: shopSubtotal,
                    paymentMethod, paymentStatus: 'Pending'
                });
                const subOrder = await newSubOrder.save();

                parentOrder.subOrders.push(subOrder._id);
                io.to(shopId).emit('new_order', subOrder);
            });

            await Promise.all(subOrderPromises);
            await parentOrder.save();
            await Cart.findByIdAndDelete(cart._id);

            // --- IMPROVEMENT 2: POPULATE SUB-ORDERS IN RESPONSE ---
            const finalParentOrder = await ParentOrder.findById(parentOrder._id).populate({
                path: 'subOrders',
                populate: { path: 'shop', select: 'name' }
            });

            // --- IMPROVEMENT 3: SEND SOCKET CONFIRMATION TO CUSTOMER ---
            io.to(userId.toString()).emit('order_confirmed', {
                success: true,
                message: 'Your food court order has been placed!',
                order: finalParentOrder
            });

            return res.status(201).json({ success: true, message: "Order placed successfully!", data: parentOrder });

        } else {
            // --- SINGLE SHOP ORDER LOGIC ---
            const shop = await Shop.findById(cart.shop);
            if (!shop || !shop.isActive) { return res.status(400).json({ success: false, message: "This shop is not accepting orders." }); }

            const singleOrderId = await generateShortOrderId('Order', 'MM');
            const newSingleOrder = new Order({
                shortOrderId: singleOrderId,
                user: userId, shop: cart.shop, table: tableId,
                items: cart.items,
                subtotal: cart.subtotal,
                totalAmount: cart.subtotal,
                paymentMethod, paymentStatus: 'Pending'
            });
            const savedOrder = await newSingleOrder.save();

            await Cart.findByIdAndDelete(cart._id);
            io.to(cart.shop.toString()).emit('new_order', savedOrder);

            io.to(userId.toString()).emit('order_confirmed', {
                success: true,
                message: 'Your order has been placed successfully!',
                order: savedOrder
            });

            return res.status(201).json({ success: true, message: "Order placed successfully!", data: savedOrder });
        }
    } catch (error) {
        console.error("Place Order Error:", error);
        next(error);
    }
};

// @desc    Get all orders for the logged-in user
// @route   GET /api/orders
// @access  Private (User only)
const getMyOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ user: req.user._id })
            .populate('shop', 'name address')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch (error) { next(error); }
};

// @desc    Get a single order by its ID
// @route   GET /api/orders/:id
// @access  Private (User only)
const getOrderById = async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id).populate('shop', 'name address');
        if (!order) { return res.status(404).json({ success: false, message: 'Order not found.' }); }
        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized to view this order.' });
        }
        res.status(200).json({ success: true, data: order });
    } catch (error) { next(error); }
};

// @desc    Update an order's status (for Vendors)
// @route   PATCH /api/vendor/orders/:orderId/status
// @access  Private (Vendor only)
const updateOrderStatusByVendor = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const vendorId = req.vendor._id;

        const validStatuses = ['Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid order status.' });
        }

        const order = await Order.findById(orderId).populate('shop');
        if (!order) { return res.status(404).json({ success: false, message: 'Order not found.' }); }

        if (order.shop.owner.toString() !== vendorId.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to update this order.' });
        }

        order.orderStatus = status;

        if (status === 'Completed') {
            order.completedAt = new Date();
        }

        await order.save();

        const io = req.io;
        io.to(order.user.toString()).emit('order_status_update', order);

        res.status(200).json({ success: true, message: `Order status updated to ${status}`, data: order });
    } catch (error) { next(error); }
};

// @desc    Get all orders for a specific shop (for Vendors)
// @route   GET /api/shops/:shopId/orders
// @access  Private (Vendor only)
const getOrdersForVendorShop = async (req, res, next) => {
    try {
        const { shopId } = req.params;
        const vendorId = req.vendor._id;

        // Security Check
        const shop = await Shop.findById(shopId);
        if (!shop || shop.owner.toString() !== vendorId.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied. You do not own this shop.' });
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = { shop: shopId };
        if (req.query.status) { query.orderStatus = req.query.status; }

        // The fix: Populate the 'table' and 'user' fields
        const orders = await Order.find(query)
                                  .populate('table', 'tableNumber') // Populate the table object with its tableNumber
                                  .populate('user', 'name phone') // Populate the user object with name and phone
                                  .sort({ createdAt: -1 })
                                  .lean();

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders
        });

    } catch (error) {
        console.error("Get Orders for Vendor Error:", error);
        next(error);
    }
};



module.exports = { placeOrder, getMyOrders, getOrderById, updateOrderStatusByVendor, getOrdersForVendorShop };