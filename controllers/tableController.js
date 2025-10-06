// controllers/tableController.js
const Table = require('../models/table');
const Shop = require('../models/shop');

// Helper function to check permissions, keeping the code DRY (Don't Repeat Yourself)
const checkTablePermissions = async (shopId, currentUser) => {
    const shop = await Shop.findById(shopId);
    if (!shop) {
        return { authorized: false, status: 404, message: 'Shop not found' };
    }

    let isAuthorized = false;
    let errorMessage = 'You do not have permission to manage tables for this shop.';

    // Rule 1: Super Admin can do anything.
    if (currentUser.role === 'admin') {
        isAuthorized = true;
    } 
    // Rule 2: Check if it's a food court shop.
    else if (shop.foodCourt) {
        // Only the designated manager of THIS food court can act.
        if (currentUser.managesFoodCourt && currentUser.managesFoodCourt.toString() === shop.foodCourt.toString()) {
            isAuthorized = true;
        } else {
            errorMessage = 'Only the Admin or Food Court Manager can manage tables for this shop.';
        }
    } 
    // Rule 3: It must be a standalone shop.
    else {
        // Only the owner of THIS standalone shop can act.
        if (shop.owner.toString() === currentUser._id.toString()) {
            isAuthorized = true;
        }
    }

    if (!isAuthorized) {
        return { authorized: false, status: 403, message: errorMessage };
    }

    return { authorized: true, shop }; // Return the shop object if authorized
};


// @desc    Create a new table/QR for a specific shop
// @route   POST /api/shops/:shopId/tables
// @access  Private (Conditional: Admin, Manager, or Shop Owner)
const createTableForShop = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { tableNumber, qrIdentifier, tableNumbers } = req.body;
        
        const authCheck = await checkTablePermissions(shopId, req.vendor);
        if (!authCheck.authorized) {
            return res.status(authCheck.status).json({ success: false, message: authCheck.message });
        }
        
        let createdTables = [];

        if (tableNumbers && Array.isArray(tableNumbers)) {
            // Bulk creation logic
            const tablesToCreate = tableNumbers.map(t => ({
                shop: shopId,
                tableNumber: t.tableNumber,
                qrIdentifier: t.qrIdentifier
            }));
            createdTables = await Table.insertMany(tablesToCreate);
        } else if (tableNumber && qrIdentifier) {
            // Single table creation logic
            const newTable = await Table.create({
                shop: shopId,
                tableNumber: tableNumber,
                qrIdentifier: qrIdentifier
            });
            createdTables.push(newTable);
        } else {
            return res.status(400).json({ success: false, message: "A tableNumber and qrIdentifier are required." });
        }

        res.status(201).json({
            success: true,
            message: `${createdTables.length} QR code(s) created successfully.`,
            data: createdTables
        });

    } catch (error) {
        console.error("Create Table error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};


// @desc    Get all tables/QRs for a specific shop
// @route   GET /api/shops/:shopId/tables
// @access  Private (Conditional)
const getTablesForShop = async (req, res) => {
    try {
        const { shopId } = req.params;

        // 1. Perform the same authorization check to ensure only allowed users can VIEW tables
        const authCheck = await checkTablePermissions(shopId, req.vendor);
        if (!authCheck.authorized) {
            return res.status(authCheck.status).json({ success: false, message: authCheck.message });
        }

        // 2. If authorized, find the tables
        const tables = await Table.find({ shop: shopId });

        res.status(200).json({
            success: true,
            count: tables.length,
            data: tables
        });

    } catch (error) {
        console.error("Get Tables error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const deleteTableForShop = async (req, res) => {
  try {
    const { shopId, qrIdentifier } = req.params;
    await Table.findOneAndDelete({ shop: shopId, qrIdentifier });
    res.status(200).json({ message: 'Table deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete table' });
  }
};

module.exports = {
    createTableForShop,
    getTablesForShop,
    deleteTableForShop
};