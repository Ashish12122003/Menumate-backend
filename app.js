// app.js

const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/database");
const cors = require("cors");

const http = require('http');
const { Server } = require("socket.io");

// Import Routes
const publicRoutes = require("./routes/publicRoutes");
const userRoute = require("./routes/userRoutes");
const vendorRoute = require("./routes/vendorRoutes");
const shopRoutes = require("./routes/shopRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const vendorOrderRoutes = require("./routes/vendorOrderRoutes");
const adminRoutes = require("./routes/adminRoutes");
const foodCourtAdminRoutes = require("./routes/foodCourtAdminRoutes"); 
const registrationRoutes = require("./routes/registrationRoutes");

dotenv.config();

const app = express();

// ----------------------
// CORS FIX
// ----------------------
// Frontend origin
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ----------------------
// socket.io setup
// ----------------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ----------------------
// Middlewares
// ----------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Make socket.io instance available in routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ----------------------
// Database 
// ----------------------
connectDB();

// ----------------------
// Routes
// ----------------------
app.get("/", (req, res) => res.json({
  success: true,
  message: "Welcome to MenuMate API v2 (Multi-Shop Ready!)"
}));

app.use("/api/public", publicRoutes);
app.use("/api/register", registrationRoutes);
app.use("/api/users", userRoute);
app.use("/api/vendor", vendorRoute);
app.use("/api/vendor/orders", vendorOrderRoutes);
app.use("/api/shops", shopRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes); 
app.use("/api/manager", foodCourtAdminRoutes); 

// ----------------------
// SOCKET.IO CONNECTION LOGIC
// ----------------------
io.on('connection', (socket) => {
  console.log('✅ A client connected:', socket.id);
 
  // Vendor joins their shop room
  socket.on('joinShopRoom', (shopId) => {
    socket.join(shopId);
    console.log(`💻 Client ${socket.id} joined room ${shopId}`);
  });

  // Customer joins their private room
  socket.on('joinUserRoom', (userId) => {
    socket.join(userId);
    console.log(`👤 Customer client ${socket.id} joined room ${userId}`);
  }); 
 
  // Waiter call logic
  socket.on('call_waiter_request', (data) => {
    const destinationShopId = data.targetShopId || data.shopId;
    if (destinationShopId && data.tableNumber) {
      io.to(destinationShopId).emit('waiter_call_alert', {
        tableNumber: data.tableNumber,
        time: new Date()
      });
      console.log(`🔔 Emitted 'waiter_call_alert' for table ${data.tableNumber} to room ${destinationShopId}`);
    } else {
      console.log("Waiter call received with missing shop ID data:", data);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// ----------------------
// Image upload error handling
// ----------------------
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 5MB'
    });
  }

  if (err.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed'
    });
  }

  if (err.message && err.message.includes('cloudinary')) {
    return res.status(400).json({
      success: false,
      message: 'Image upload failed. Please try again.'
    });
  }

  res.status(500).json({
    success: false,
    message: 'Server Error'
  });
});

// ----------------------
// Start server
// ----------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
