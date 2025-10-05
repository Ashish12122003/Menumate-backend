// models/vendor.js

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const vendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"]
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"]
    },
    number: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      match: [/^[0-9]{10}$/, "Phone number must be 10 digits"]
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"]
      // ⚠️ In production, always hash password before saving
    },
    role: {
      type: String,
      enum: ["vendor", "admin"],
      default: "admin"
    },
       managesFoodCourt: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FoodCourt',
        default: null // If this is set, this user is a Food Court Admin
    }
    // ⚠️ Don't store confirm_password in DB.
    // Validate it at controller level before saving password
  },
  {
    timestamps: true

  } // adds createdAt and updatedAt
);

vendorSchema.pre('save', async function (next) {
  // Only hash if password is modified
  if (!this.isModified('password')) return next();

  // Hash password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);
  next();
});


module.exports = mongoose.model("Vendor", vendorSchema);
