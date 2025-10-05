// controllers/vendorController.js

const Vendor = require("../models/vendor");
const { comparePassword, hashPassword } = require("../utils/hash");
const { createJWT } = require("../utils/jwt");
const Shop = require("../models/shop"); // Import shop model (for cleanup on delete)

// ==================================================================
// REGISTER VENDOR
// ==================================================================
const registerVendor = async (req, res, next) => {
    try {
        const { name, email, number, password } = req.body;
        if (!name || !email || !number || !password) {
            return res.status(400).json({ success: false, message: "Please provide all required fields" });
        }
        const emailLower = email.toLowerCase();
        const existingVendor = await Vendor.findOne({ $or: [{ email: emailLower }, { number }] });
        if (existingVendor) {
            return res.status(400).json({ success: false, message: "Vendor already exists with this email or number" });
        }
        const newVendor = await Vendor.create({ name, email: emailLower, number, password });
        const token = createJWT({ id: newVendor._id, role: newVendor.role });
        res.status(201).json({
            success: true,
            message: "Vendor registered successfully.",
            token,
            data: { id: newVendor._id, name: newVendor.name, email: newVendor.email }
        });
    } catch (error) { next(error); }
};

// ==================================================================
// LOGIN VENDOR
// ==================================================================

const loginVendor = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required" });
        }
        const emailLower = email.toLowerCase();
        const vendor = await Vendor.findOne({ email: emailLower }).select("+password");
        if (!vendor || !(await comparePassword(password, vendor.password))) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const token = createJWT({ id: vendor._id, role: vendor.role });
        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            data: { id: vendor._id, name: vendor.name, email: vendor.email , role: vendor.role }
        });
    } catch (error) { next(error); }
};

// ==================================================================
// UPDATE VENDOR PROFILE
// ==================================================================
const updateVendor = async (req, res) => {
    try {
        const { name, number, password } = req.body;

        // 1) Find vendor
        const vendor = await Vendor.findById(req.vendor._id);
        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
        };
        // 2) Update fields
        if (name) vendor.name = name;
        if (number) vendor.number = number;
        if (password) vendor.password = await hashPassword(password); // hash new password

        // 3) Save updated vendor
        const updatedVendor = await vendor.save();

        // 4) Response
        res.status(200).json({
            success: true,
            message: "Vendor profile updated successfully",
            data: {
                vendor: {
                    id: updatedVendor._id,
                    name: updatedVendor.name,
                    email: updatedVendor.email
                }
            }
        });

    } catch (error) {
        console.error("Update vendor error:", error);
        res.status(500).json({ success: false, message: "Server error during update" });
    }
};

// ==================================================================
// LOGOUT VENDOR
// ==================================================================
const logoutVendor = (req, res) => {
    // NOTE: Since JWT is stateless, logout is handled on client-side
    // Here we just return a success response
    res.status(200).json({
        success: true,
        message: "Logged out successfully"
    });
};

// ==================================================================
// DELETE VENDOR
// ==================================================================
const deleteVendor = async (req, res) => {
    try {
        // 1) Delete vendor
        await Vendor.findByIdAndDelete(req.vendor._id);
        // 2) OPTIONAL: Also delete associated shops
        await Shop.deleteMany({ owner: req.vendor._id });
        res.status(200).json({
            success: true,
            message: "Vendor account and associated shops deleted successfully"
        }); 
    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};


module.exports = {
    registerVendor, 
    loginVendor,
    logoutVendor,
    updateVendor,
    deleteVendor
};
