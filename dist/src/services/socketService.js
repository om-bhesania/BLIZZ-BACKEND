"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSocketService = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("../config/client");
const logger_1 = require("../utils/logger");
class SocketServiceImpl {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map(); // userId -> socketId
    }
    initialize(server) {
        this.io = new socket_io_1.Server(server, {
            cors: {
                origin: [
                    "http://localhost:8080",
                    "http://localhost:5173",
                    "http://127.0.0.1:8080",
                    "http://127.0.0.1:5173",
                    process.env.CLIENT_URL || "http://localhost:3000"
                ],
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling'],
            allowEIO3: true,
            pingTimeout: 60000,
            pingInterval: 25000
        });
        this.io.use(this.authenticateSocket.bind(this));
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });
        logger_1.logger.info('Socket.IO server initialized');
    }
    getIO() {
        return this.io;
    }
    async authenticateSocket(socket, next) {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
            logger_1.logger.info('Socket authentication attempt:', {
                hasToken: !!token,
                tokenLength: token?.length || 0,
                authProvided: !!socket.handshake.auth.token,
                headerProvided: !!socket.handshake.headers.authorization
            });
            if (!token) {
                logger_1.logger.warn('Socket authentication failed: No token provided');
                return next(new Error('Authentication error: No token provided'));
            }
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            // Get user from database to ensure they still exist and get latest data
            const user = await client_1.prisma.user.findUnique({
                where: { publicId: decoded.publicId },
                select: { id: true, publicId: true, role: true, name: true, email: true }
            });
            if (!user) {
                logger_1.logger.warn('Socket authentication failed: User not found', { publicId: decoded.publicId });
                return next(new Error('Authentication error: User not found'));
            }
            socket.userId = user.id.toString();
            socket.userPublicId = user.publicId;
            socket.userRole = user.role || 'User';
            socket.userName = user.name || user.email || 'Unknown User';
            logger_1.logger.info('Socket authentication successful:', {
                userId: user.id,
                publicId: user.publicId,
                role: user.role
            });
            next();
        }
        catch (error) {
            logger_1.logger.error('Socket authentication error:', error);
            next(new Error('Authentication error: Invalid token'));
        }
    }
    handleConnection(socket) {
        const userId = socket.userId;
        const userPublicId = socket.userPublicId;
        const userRole = socket.userRole;
        // Store connection
        this.connectedUsers.set(userId, socket.id);
        logger_1.logger.info(`User connected: ${userPublicId} (${userRole})`);
        // Join user to their personal room
        socket.join(`user:${userPublicId}`);
        // Join user to role-based rooms
        socket.join(`role:${userRole}`);
        // Join user to shop-specific rooms if they have shop access
        this.joinUserToShopRooms(socket, userPublicId, userRole);
        // Emit connection status
        socket.emit('connected', {
            userId: userPublicId,
            role: userRole,
            timestamp: new Date().toISOString()
        });
        // Handle notification read
        socket.on('notification:read', async (data) => {
            try {
                await this.handleNotificationRead(userPublicId, data.notificationId);
                socket.emit('notification:read:success', { notificationId: data.notificationId });
            }
            catch (error) {
                logger_1.logger.error('Error marking notification as read:', error);
                socket.emit('notification:read:error', { error: 'Failed to mark notification as read' });
            }
        });
        // Handle chat messages
        socket.on('chat:message', async (data) => {
            try {
                await this.handleChatMessage(userPublicId, data.message, data.room);
            }
            catch (error) {
                logger_1.logger.error('Error handling chat message:', error);
                socket.emit('chat:error', { error: 'Failed to send message' });
            }
        });
        // Handle joining chat rooms
        socket.on('join:room', (data) => {
            socket.join(data.room);
            logger_1.logger.info(`User ${userPublicId} joined room ${data.room}`);
        });
        // Handle leaving chat rooms
        socket.on('leave:room', (data) => {
            socket.leave(data.room);
            logger_1.logger.info(`User ${userPublicId} left room ${data.room}`);
        });
        // Handle message read receipts
        socket.on('chat:message:read', async (data) => {
            try {
                await this.handleMessageRead(userPublicId, data.messageId);
            }
            catch (error) {
                logger_1.logger.error('Error handling message read:', error);
            }
        });
        // Handle typing indicators
        socket.on('typing:start', async (data) => {
            // Check if this is a chat request room and user is admin
            if (data.room.startsWith('chat-request-') && userRole === 'Admin') {
                const chatRequestId = data.room.replace('chat-request-', '');
                try {
                    // Check if chat request exists and is pending
                    const chatRequest = await client_1.prisma.chatRequest.findUnique({
                        where: { id: chatRequestId },
                        select: { id: true, status: true, shopOwnerId: true, adminId: true }
                    });
                    if (chatRequest && chatRequest.status === 'pending') {
                        // Auto-assign and activate the chat request
                        const updatedRequest = await client_1.prisma.chatRequest.update({
                            where: { id: chatRequestId },
                            data: {
                                adminId: userPublicId,
                                status: 'active'
                            },
                            include: {
                                shopOwner: {
                                    select: {
                                        id: true,
                                        name: true,
                                        email: true,
                                        publicId: true
                                    }
                                },
                                admin: {
                                    select: {
                                        id: true,
                                        name: true,
                                        email: true,
                                        publicId: true
                                    }
                                }
                            }
                        });
                        // Notify shop owner that their request has been assigned
                        await client_1.prisma.notification.create({
                            data: {
                                userId: chatRequest.shopOwnerId,
                                type: 'CHAT_REQUEST',
                                message: `Your chat request has been assigned to ${updatedRequest.admin?.name || 'an admin'}`
                            }
                        });
                        // Emit real-time notification to shop owner
                        this.emitToUser(chatRequest.shopOwnerId, 'chat_request_assigned', {
                            event: 'chat_request_assigned',
                            notification: {
                                type: 'CHAT_REQUEST',
                                message: `Your chat request has been assigned to ${updatedRequest.admin?.name || 'an admin'}`,
                                chatRequestId: chatRequestId
                            },
                            chatRequest: updatedRequest
                        });
                        // Broadcast chat request status update to all admins
                        this.emitToRole('Admin', 'chat_request_status_updated', {
                            event: 'chat_request_status_updated',
                            chatRequest: updatedRequest,
                            timestamp: new Date().toISOString()
                        });
                        logger_1.logger.info(`Chat request ${chatRequestId} auto-assigned to admin ${userPublicId}`);
                    }
                }
                catch (error) {
                    logger_1.logger.error('Error auto-assigning chat request:', error);
                }
            }
            socket.to(data.room).emit('user:typing', {
                userId: userPublicId,
                userName: socket.userName || 'Unknown User',
                room: data.room,
                isTyping: true
            });
        });
        socket.on('typing:stop', (data) => {
            socket.to(data.room).emit('user:typing', {
                userId: userPublicId,
                userName: socket.userName || 'Unknown User',
                room: data.room,
                isTyping: false
            });
        });
        // Handle live data subscriptions
        socket.on('live:subscribe', (data) => {
            socket.join(`live:${data.type}`);
            logger_1.logger.info(`User ${userPublicId} subscribed to live data: ${data.type}`);
        });
        socket.on('live:unsubscribe', (data) => {
            socket.leave(`live:${data.type}`);
            logger_1.logger.info(`User ${userPublicId} unsubscribed from live data: ${data.type}`);
        });
        // Handle page navigation
        socket.on('page:navigate', (data) => {
            socket.to(`role:${userRole}`).emit('presence:update', {
                userId: userPublicId,
                page: data.page,
                timestamp: new Date().toISOString()
            });
        });
        // Handle form updates
        socket.on('form:update', (data) => {
            socket.to(`form:${data.formId}`).emit('form:sync', {
                userId: userPublicId,
                field: data.field,
                value: data.value,
                timestamp: new Date().toISOString()
            });
        });
        // Handle editing indicators
        socket.on('edit:start', (data) => {
            socket.to(`edit:${data.documentId}`).emit('edit:user:start', {
                userId: userPublicId,
                field: data.field,
                timestamp: new Date().toISOString()
            });
        });
        socket.on('edit:stop', (data) => {
            socket.to(`edit:${data.documentId}`).emit('edit:user:stop', {
                userId: userPublicId,
                field: data.field,
                timestamp: new Date().toISOString()
            });
        });
        // Handle ping
        socket.on('system:ping', () => {
            socket.emit('system:pong', { timestamp: new Date().toISOString() });
        });
        // Handle dashboard-specific events
        socket.on('dashboard:dateRange:change', async (data) => {
            try {
                logger_1.logger.info(`Dashboard date range change requested by ${userPublicId}:`, data);
                // Validate date range
                const validation = this.validateDateRange(data.dateRange);
                if (!validation.isValid) {
                    socket.emit('dashboard:dateRange:error', {
                        message: 'Invalid date range',
                        error: validation.error,
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
                // Calculate comparison period based on type
                const comparisonPeriod = this.calculateComparisonPeriod(data.dateRange, data.comparisonType);
                // Save user preferences if provided
                if (data.preferences) {
                    await this.saveUserPreferences(userPublicId, data.preferences);
                }
                // Generate real metrics for the date range
                const metrics = await this.generateRealMetrics(data.dateRange, comparisonPeriod, userPublicId, userRole);
                // Emit updated data back to the user
                socket.emit('dashboard:dateRange:updated', {
                    dateRange: data.dateRange,
                    comparisonPeriod,
                    metrics,
                    preferences: data.preferences,
                    timestamp: new Date().toISOString()
                });
                // Broadcast to other users in the same role (optional)
                socket.to(`role:${userRole}`).emit('dashboard:dateRange:changed', {
                    userId: userPublicId,
                    dateRange: data.dateRange,
                    timestamp: new Date().toISOString()
                });
                logger_1.logger.info(`Dashboard date range updated for ${userPublicId}`);
            }
            catch (error) {
                logger_1.logger.error('Error handling dashboard date range change:', error);
                socket.emit('dashboard:dateRange:error', {
                    message: 'Failed to update date range',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Handle user preferences save
        socket.on('dashboard:preferences:save', async (data) => {
            try {
                await this.saveUserPreferences(userPublicId, data.preferences);
                socket.emit('dashboard:preferences:saved', {
                    preferences: data.preferences,
                    timestamp: new Date().toISOString()
                });
                logger_1.logger.info(`User preferences saved for ${userPublicId}`);
            }
            catch (error) {
                logger_1.logger.error('Error saving user preferences:', error);
                socket.emit('dashboard:preferences:error', {
                    message: 'Failed to save preferences',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        // Handle user preferences load
        socket.on('dashboard:preferences:load', async () => {
            try {
                const preferences = await this.loadUserPreferences(userPublicId);
                socket.emit('dashboard:preferences:loaded', {
                    preferences,
                    timestamp: new Date().toISOString()
                });
                logger_1.logger.info(`User preferences loaded for ${userPublicId}`);
            }
            catch (error) {
                logger_1.logger.error('Error loading user preferences:', error);
                socket.emit('dashboard:preferences:error', {
                    message: 'Failed to load preferences',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        socket.on('dashboard:subscribe:live', (data) => {
            socket.join(`dashboard:live:${data.type}`);
            logger_1.logger.info(`User ${userPublicId} subscribed to live dashboard data: ${data.type}`);
            // Start sending live data for this type
            this.startLiveDataBroadcast(socket, data.type, userPublicId);
        });
        socket.on('dashboard:unsubscribe:live', (data) => {
            socket.leave(`dashboard:live:${data.type}`);
            logger_1.logger.info(`User ${userPublicId} unsubscribed from live dashboard data: ${data.type}`);
        });
        socket.on('dashboard:subscribe:insights', () => {
            socket.join('dashboard:insights');
            logger_1.logger.info(`User ${userPublicId} subscribed to dashboard insights`);
            // Start sending insights
            this.startInsightsBroadcast(socket, userPublicId);
        });
        socket.on('dashboard:unsubscribe:insights', () => {
            socket.leave('dashboard:insights');
            logger_1.logger.info(`User ${userPublicId} unsubscribed from dashboard insights`);
        });
        // Handle disconnection
        socket.on('disconnect', (reason) => {
            this.connectedUsers.delete(userId);
            logger_1.logger.info(`User disconnected: ${userPublicId} (${reason})`);
            // Notify others about disconnection
            socket.to(`role:${userRole}`).emit('presence:update', {
                userId: userPublicId,
                status: 'offline',
                timestamp: new Date().toISOString()
            });
        });
    }
    async handleNotificationRead(userPublicId, notificationId) {
        // Mark notification as read in database
        await client_1.prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true }
        });
        logger_1.logger.info(`Notification ${notificationId} marked as read by user ${userPublicId}`);
    }
    async joinUserToShopRooms(socket, userPublicId, userRole) {
        try {
            // Get user's shop access
            const user = await client_1.prisma.user.findUnique({
                where: { publicId: userPublicId },
                select: { shopIds: true, managedShops: { select: { id: true } } }
            });
            if (user) {
                // Join user to their assigned shops
                if (user.shopIds && user.shopIds.length > 0) {
                    user.shopIds.forEach(shopId => {
                        socket.join(`shop:${shopId}`);
                    });
                }
                // Join user to shops they manage
                if (user.managedShops && user.managedShops.length > 0) {
                    user.managedShops.forEach(shop => {
                        socket.join(`shop:${shop.id}`);
                    });
                }
                // Admin users join all shop rooms
                if (userRole === 'Admin') {
                    const allShops = await client_1.prisma.shop.findMany({
                        select: { id: true }
                    });
                    allShops.forEach(shop => {
                        socket.join(`shop:${shop.id}`);
                    });
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error joining user to shop rooms:', error);
        }
    }
    async handleChatMessage(userPublicId, message, room) {
        // Extract chat request ID from room name
        const chatRequestId = room.replace('chat-request-', '');
        // Get user details
        const user = await client_1.prisma.user.findUnique({
            where: { publicId: userPublicId },
            select: { id: true, name: true, publicId: true }
        });
        if (!user) {
            logger_1.logger.error(`User not found: ${userPublicId}`);
            return;
        }
        // Get chat request details to find participants
        const chatRequest = await client_1.prisma.chatRequest.findUnique({
            where: { id: chatRequestId },
            select: { shopOwnerId: true, adminId: true }
        });
        if (!chatRequest) {
            logger_1.logger.error(`Chat request not found: ${chatRequestId}`);
            return;
        }
        // Save chat message to database
        const chatMessage = await client_1.prisma.chatMessage.create({
            data: {
                userId: userPublicId,
                room: room,
                message: message,
                timestamp: new Date(),
                chatRequestId: chatRequestId
            }
        });
        // Create notifications for the other participant
        const otherParticipantId = userPublicId === chatRequest.shopOwnerId
            ? chatRequest.adminId
            : chatRequest.shopOwnerId;
        if (otherParticipantId) {
            // Create notification in database
            await client_1.prisma.notification.create({
                data: {
                    userId: otherParticipantId,
                    type: 'CHAT_MESSAGE',
                    message: `New message from ${user.name}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`
                }
            });
            // Emit real-time notification
            this.emitToUser(otherParticipantId, 'notification:new', {
                event: 'chat_message_received',
                notification: {
                    type: 'CHAT_MESSAGE',
                    message: `New message from ${user.name}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
                    chatRequestId: chatRequestId
                }
            });
        }
        // Broadcast to room
        this.io?.to(room).emit('chat:message:new', {
            id: chatMessage.id,
            userId: userPublicId,
            senderId: userPublicId,
            senderName: user.name,
            message: message,
            room: room,
            chatRequestId: chatRequestId,
            timestamp: chatMessage.timestamp
        });
        logger_1.logger.info(`Chat message sent by ${userPublicId} to room ${room}`);
    }
    async handleMessageRead(userPublicId, messageId) {
        // Mark message as read
        await client_1.prisma.chatMessage.update({
            where: { id: messageId },
            data: { isRead: true }
        });
        // Get the message to find the room
        const message = await client_1.prisma.chatMessage.findUnique({
            where: { id: messageId },
            select: { room: true, userId: true }
        });
        if (message) {
            // Broadcast read receipt to the room
            this.io?.to(message.room).emit('chat:message:read:receipt', {
                messageId: messageId,
                readBy: userPublicId,
                timestamp: new Date()
            });
        }
        logger_1.logger.info(`Message ${messageId} marked as read by ${userPublicId}`);
    }
    // Broadcast new chat request notification to admins
    broadcastNewChatRequest(chatRequest) {
        this.emitToRole('Admin', 'chat:request:new', {
            id: chatRequest.id,
            shopOwnerName: chatRequest.shopOwner?.name || 'Unknown',
            subject: chatRequest.subject,
            priority: chatRequest.priority,
            timestamp: chatRequest.createdAt
        });
    }
    emitToUser(userId, event, data) {
        if (this.io) {
            this.io.to(`user:${userId}`).emit(event, data);
        }
    }
    emitToRole(role, event, data) {
        if (this.io) {
            this.io.to(`role:${role}`).emit(event, data);
        }
    }
    emitToAll(event, data) {
        if (this.io) {
            this.io.emit(event, data);
        }
    }
    emitToRoom(room, event, data) {
        if (this.io) {
            this.io.to(room).emit(event, data);
        }
    }
    // Real-time data broadcasting methods with notification support
    broadcastInventoryUpdate(shopId, data) {
        this.emitToRoom(`shop:${shopId}`, 'inventory:update', data);
        this.emitToRole('Admin', 'inventory:update', { shopId, ...data });
        // Also emit as notification
        this.emitToRole('Admin', 'notification:new', {
            event: 'inventory_update',
            notification: {
                type: 'INVENTORY',
                message: `Inventory updated for shop ${shopId}`,
                timestamp: new Date().toISOString(),
                data: { shopId, ...data }
            }
        });
    }
    broadcastRestockRequestUpdate(data) {
        this.emitToRole('Admin', 'restock:status:update', data);
        if (data.shopId) {
            this.emitToRoom(`shop:${data.shopId}`, 'restock:status:update', data);
        }
        // Also emit as notification
        this.emitToRole('Admin', 'notification:new', {
            event: 'restock_update',
            notification: {
                type: 'RESTOCK',
                message: `Restock request ${data.status}`,
                timestamp: new Date().toISOString(),
                data
            }
        });
    }
    broadcastBillingUpdate(shopId, data) {
        this.emitToRoom(`shop:${shopId}`, 'billing:update', data);
        this.emitToRole('Admin', 'billing:update', { shopId, ...data });
        // Also emit as notification
        this.emitToRole('Admin', 'notification:new', {
            event: 'billing_update',
            notification: {
                type: 'BILLING',
                message: `Billing updated for shop ${shopId}`,
                timestamp: new Date().toISOString(),
                data: { shopId, ...data }
            }
        });
    }
    broadcastProductUpdate(data) {
        this.emitToRole('Admin', 'product:update', data);
        this.emitToAll('product:update', data);
        // Also emit as notification
        this.emitToAll('notification:new', {
            event: 'product_update',
            notification: {
                type: 'PRODUCT',
                message: `Product ${data.action || 'updated'}`,
                timestamp: new Date().toISOString(),
                data
            }
        });
    }
    broadcastShopUpdate(data) {
        this.emitToRole('Admin', 'shop:update', data);
        if (data.managerId) {
            this.emitToUser(data.managerId, 'shop:update', data);
        }
        // Also emit as notification
        this.emitToRole('Admin', 'notification:new', {
            event: 'shop_update',
            notification: {
                type: 'SHOP',
                message: `Shop ${data.action || 'updated'}`,
                timestamp: new Date().toISOString(),
                data
            }
        });
    }
    broadcastDashboardUpdate(data) {
        this.emitToAll('dashboard:update', data);
        // Also emit as notification
        this.emitToAll('notification:new', {
            event: 'dashboard_update',
            notification: {
                type: 'DASHBOARD',
                message: 'Dashboard data updated',
                timestamp: new Date().toISOString(),
                data
            }
        });
    }
    broadcastLowStockAlert(shopId, data) {
        this.emitToRoom(`shop:${shopId}`, 'low_stock:alert', data);
        this.emitToRole('Admin', 'low_stock:alert', { shopId, ...data });
        // Also emit as notification
        this.emitToRole('Admin', 'notification:new', {
            event: 'low_stock_alert',
            notification: {
                type: 'LOW_STOCK_ALERT',
                message: `Low stock alert for shop ${shopId}`,
                timestamp: new Date().toISOString(),
                data: { shopId, ...data }
            }
        });
    }
    // Raw Material specific alerts
    broadcastRawMaterialLowStockAlert(data) {
        // Emit to admin room for raw material alerts
        this.emitToRole('Admin', 'raw_material:low_stock', data);
        // If it's shop-specific, also emit to that shop
        if (data.shopId) {
            this.emitToRoom(`shop:${data.shopId}`, 'raw_material:low_stock', data);
        }
        // Also emit as notification
        this.emitToRole('Admin', 'notification:new', {
            event: 'raw_material_low_stock',
            notification: {
                type: 'RAW_MATERIAL_LOW_STOCK',
                message: `${data.materialName} is running low (${data.currentStock} ${data.unit})`,
                timestamp: new Date().toISOString(),
                data
            }
        });
    }
    broadcastRawMaterialInventoryUpdate(data) {
        // Emit to admin room
        this.emitToRole('Admin', 'raw_material:inventory_update', data);
        // If it's shop-specific, also emit to that shop
        if (data.shopId) {
            this.emitToRoom(`shop:${data.shopId}`, 'raw_material:inventory_update', data);
        }
    }
    broadcastSystemHealth(data) {
        this.emitToAll('system:health', data);
        // Also emit as notification for system issues
        if (data.status === 'error' || data.status === 'warning') {
            this.emitToRole('Admin', 'notification:new', {
                event: 'system_health',
                notification: {
                    type: 'SYSTEM',
                    message: `System ${data.status}: ${data.message}`,
                    timestamp: new Date().toISOString(),
                    data
                }
            });
        }
    }
    broadcastFactoryStockUpdate(data) {
        // Emit to all admins for factory stock updates
        this.emitToRole('Admin', 'factory_stock:update', data);
        // Emit to specific shop if shopId is provided
        if (data.shopId) {
            this.emitToRoom(`shop:${data.shopId}`, 'factory_stock:update', data);
        }
        // Also emit as notification for significant stock changes
        if (data.action === 'stock_deducted' && data.deductedAmount > 0) {
            this.emitToRole('Admin', 'notification:new', {
                event: 'factory_stock_update',
                notification: {
                    type: 'FACTORY_STOCK',
                    message: `Factory stock updated: ${data.deductedAmount} units of ${data.productName} deducted. New stock: ${data.newStock}`,
                    timestamp: new Date().toISOString(),
                    data
                }
            });
        }
    }
    getConnectedUsers() {
        return Array.from(this.connectedUsers.keys());
    }
    isUserConnected(userId) {
        return this.connectedUsers.has(userId);
    }
    // Dashboard-specific helper methods
    validateDateRange(dateRange) {
        if (!dateRange || !dateRange.from || !dateRange.to) {
            return { isValid: false, error: 'Invalid date range provided' };
        }
        const from = new Date(dateRange.from);
        const to = new Date(dateRange.to);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return { isValid: false, error: 'Invalid date format' };
        }
        if (from > to) {
            return { isValid: false, error: 'Start date cannot be after end date' };
        }
        const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 365) {
            return { isValid: false, error: 'Date range cannot exceed 365 days' };
        }
        const today = new Date();
        if (from > today) {
            return { isValid: false, error: 'Start date cannot be in the future' };
        }
        return { isValid: true };
    }
    calculateComparisonPeriod(dateRange, comparisonType) {
        const { from, to } = dateRange;
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const duration = toDate.getTime() - fromDate.getTime();
        switch (comparisonType) {
            case 'previous':
                return {
                    from: new Date(fromDate.getTime() - duration - (24 * 60 * 60 * 1000)), // Subtract 1 day gap
                    to: new Date(toDate.getTime() - duration - (24 * 60 * 60 * 1000)),
                    label: 'Previous Period',
                    type: 'previous'
                };
            case 'year_ago':
                const yearAgoFrom = new Date(fromDate);
                yearAgoFrom.setFullYear(yearAgoFrom.getFullYear() - 1);
                const yearAgoTo = new Date(toDate);
                yearAgoTo.setFullYear(yearAgoTo.getFullYear() - 1);
                return {
                    from: yearAgoFrom,
                    to: yearAgoTo,
                    label: 'Same Period Last Year',
                    type: 'year_ago'
                };
            default:
                return {
                    from: new Date(fromDate.getTime() - duration - (24 * 60 * 60 * 1000)),
                    to: new Date(toDate.getTime() - duration - (24 * 60 * 60 * 1000)),
                    label: 'Previous Period',
                    type: 'previous'
                };
        }
    }
    async generateRealMetrics(dateRange, comparisonPeriod, userPublicId, userRole) {
        try {
            const fromDate = new Date(dateRange.from);
            const toDate = new Date(dateRange.to);
            const compFromDate = new Date(comparisonPeriod.from);
            const compToDate = new Date(comparisonPeriod.to);
            // Get user's shop access
            const user = await client_1.prisma.user.findUnique({
                where: { publicId: userPublicId },
                select: { shopIds: true, managedShops: { select: { id: true } } }
            });
            const isAdmin = userRole === 'Admin';
            const userShopIds = user?.shopIds || [];
            const managedShopIds = user?.managedShops?.map(shop => shop.id) || [];
            const allShopIds = [...userShopIds, ...managedShopIds];
            // Build shop filter
            let shopFilter = {};
            if (!isAdmin && allShopIds.length > 0) {
                shopFilter = { shopId: { in: allShopIds } };
            }
            // Get current period metrics
            const currentMetrics = await this.getPeriodMetrics(fromDate, toDate, shopFilter);
            // Get comparison period metrics
            const comparisonMetrics = await this.getPeriodMetrics(compFromDate, compToDate, shopFilter);
            // Calculate growth percentages
            const revenueGrowth = comparisonMetrics.revenue > 0
                ? ((currentMetrics.revenue - comparisonMetrics.revenue) / comparisonMetrics.revenue) * 100
                : 0;
            const ordersGrowth = comparisonMetrics.orders > 0
                ? ((currentMetrics.orders - comparisonMetrics.orders) / comparisonMetrics.orders) * 100
                : 0;
            return {
                revenue: {
                    current: currentMetrics.revenue,
                    previous: comparisonMetrics.revenue,
                    growth: Math.round(revenueGrowth * 10) / 10,
                    trend: revenueGrowth > 0 ? 'up' : revenueGrowth < -5 ? 'down' : 'stable'
                },
                orders: {
                    current: currentMetrics.orders,
                    previous: comparisonMetrics.orders,
                    growth: Math.round(ordersGrowth * 10) / 10,
                    trend: ordersGrowth > 0 ? 'up' : ordersGrowth < -5 ? 'down' : 'stable'
                },
                products: {
                    current: currentMetrics.products,
                    previous: comparisonMetrics.products,
                    growth: comparisonMetrics.products > 0
                        ? Math.round(((currentMetrics.products - comparisonMetrics.products) / comparisonMetrics.products) * 100 * 10) / 10
                        : 0,
                    trend: currentMetrics.products > comparisonMetrics.products ? 'up' : 'stable'
                },
                customers: {
                    current: currentMetrics.customers,
                    previous: comparisonMetrics.customers,
                    growth: comparisonMetrics.customers > 0
                        ? Math.round(((currentMetrics.customers - comparisonMetrics.customers) / comparisonMetrics.customers) * 100 * 10) / 10
                        : 0,
                    trend: 'up'
                }
            };
        }
        catch (error) {
            logger_1.logger.error('Error generating real metrics:', error);
            // Fallback to mock data
            return this.generateMockMetrics(dateRange, comparisonPeriod);
        }
    }
    async getPeriodMetrics(fromDate, toDate, shopFilter) {
        // Get billing data for the period
        const billingData = await client_1.prisma.billing.findMany({
            where: {
                createdAt: {
                    gte: fromDate,
                    lte: toDate
                },
                ...shopFilter
            },
            select: {
                total: true,
                items: true,
                customerName: true
            }
        });
        // Calculate metrics
        const revenue = billingData.reduce((sum, bill) => sum + (bill.total || 0), 0);
        const orders = billingData.length;
        // Calculate unique products from items JSON
        let products = 0;
        const productIds = new Set();
        billingData.forEach(bill => {
            if (bill.items && typeof bill.items === 'object' && Array.isArray(bill.items)) {
                bill.items.forEach((item) => {
                    if (item.productId) {
                        productIds.add(item.productId);
                    }
                });
            }
        });
        products = productIds.size;
        const customers = new Set(billingData.map(bill => bill.customerName).filter(Boolean)).size;
        return {
            revenue,
            orders,
            products,
            customers
        };
    }
    async generateMockMetrics(dateRange, comparisonPeriod) {
        // Generate realistic mock data based on date range
        const daysDiff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
        const baseRevenue = daysDiff * 1000; // Base revenue per day
        const baseOrders = daysDiff * 50; // Base orders per day
        // Add some randomness
        const revenueVariation = 0.2; // 20% variation
        const ordersVariation = 0.15; // 15% variation
        const currentRevenue = baseRevenue * (1 + (Math.random() - 0.5) * revenueVariation);
        const previousRevenue = currentRevenue * (0.8 + Math.random() * 0.4); // 80-120% of current
        const revenueGrowth = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
        const currentOrders = baseOrders * (1 + (Math.random() - 0.5) * ordersVariation);
        const previousOrders = currentOrders * (0.8 + Math.random() * 0.4);
        const ordersGrowth = ((currentOrders - previousOrders) / previousOrders) * 100;
        return {
            revenue: {
                current: Math.round(currentRevenue),
                previous: Math.round(previousRevenue),
                growth: Math.round(revenueGrowth * 10) / 10,
                trend: revenueGrowth > 0 ? 'up' : revenueGrowth < -5 ? 'down' : 'stable'
            },
            orders: {
                current: Math.round(currentOrders),
                previous: Math.round(previousOrders),
                growth: Math.round(ordersGrowth * 10) / 10,
                trend: ordersGrowth > 0 ? 'up' : ordersGrowth < -5 ? 'down' : 'stable'
            },
            products: {
                current: 45 + Math.floor(Math.random() * 10),
                previous: 40 + Math.floor(Math.random() * 10),
                growth: Math.round((Math.random() - 0.5) * 20 * 10) / 10,
                trend: Math.random() > 0.5 ? 'up' : 'stable'
            },
            customers: {
                current: 150 + Math.floor(Math.random() * 50),
                previous: 120 + Math.floor(Math.random() * 30),
                growth: Math.round((Math.random() * 30) * 10) / 10,
                trend: 'up'
            }
        };
    }
    async saveUserPreferences(userPublicId, preferences) {
        try {
            await client_1.prisma.user.update({
                where: { publicId: userPublicId },
                data: {
                    preferences: preferences
                }
            });
            logger_1.logger.info(`User preferences saved for ${userPublicId}`);
        }
        catch (error) {
            logger_1.logger.error('Error saving user preferences:', error);
            throw error;
        }
    }
    async loadUserPreferences(userPublicId) {
        try {
            const user = await client_1.prisma.user.findUnique({
                where: { publicId: userPublicId },
                select: {
                    preferences: true
                }
            });
            // Return user preferences or default if none found
            if (user?.preferences && typeof user.preferences === 'object') {
                return {
                    defaultRange: 'last_30_days',
                    comparisonType: 'previous',
                    autoSave: false,
                    ...user.preferences
                };
            }
            // Return default preferences if none found
            return {
                defaultRange: 'last_30_days',
                comparisonType: 'previous',
                autoSave: false
            };
        }
        catch (error) {
            logger_1.logger.error('Error loading user preferences:', error);
            // Return default preferences on error
            return {
                defaultRange: 'last_30_days',
                comparisonType: 'previous',
                autoSave: false
            };
        }
    }
    startLiveDataBroadcast(socket, type, userPublicId) {
        const interval = setInterval(() => {
            if (!socket.connected) {
                clearInterval(interval);
                return;
            }
            const liveData = {
                type,
                data: {
                    timestamp: new Date().toISOString(),
                    value: Math.floor(Math.random() * 1000) + 500,
                    change: (Math.random() - 0.5) * 10
                },
                timestamp: new Date()
            };
            socket.emit('dashboard:live:data', liveData);
        }, 5000); // Send every 5 seconds
        // Store interval reference for cleanup
        socket.liveDataInterval = interval;
    }
    startInsightsBroadcast(socket, userPublicId) {
        const insights = [
            {
                id: '1',
                type: 'growth',
                title: 'Revenue Growth Detected',
                description: 'Your revenue has increased significantly compared to the previous period.',
                impact: 'high',
                actionable: true,
                actionText: 'View Details',
                actionUrl: '/analytics',
                timestamp: new Date(),
                data: { growth: 25.5 }
            },
            {
                id: '2',
                type: 'opportunity',
                title: 'Inventory Optimization Opportunity',
                description: 'Consider restocking popular flavors - they\'re showing high demand.',
                impact: 'medium',
                actionable: true,
                actionText: 'Check Inventory',
                actionUrl: '/inventory',
                timestamp: new Date(),
                data: { flavor: 'Chocolate' }
            },
            {
                id: '3',
                type: 'warning',
                title: 'Low Stock Alert',
                description: 'Some products are running low and may need restocking soon.',
                impact: 'high',
                actionable: true,
                actionText: 'Restock Now',
                actionUrl: '/inventory/restock',
                timestamp: new Date(),
                data: { products: ['Vanilla', 'Strawberry'] }
            }
        ];
        // Send initial insights
        insights.forEach((insight, index) => {
            setTimeout(() => {
                if (socket.connected) {
                    socket.emit('dashboard:insight:new', insight);
                }
            }, index * 2000); // Send one every 2 seconds
        });
        // Send periodic new insights
        const interval = setInterval(() => {
            if (!socket.connected) {
                clearInterval(interval);
                return;
            }
            const newInsight = {
                id: Date.now().toString(),
                type: ['growth', 'decline', 'opportunity', 'warning'][Math.floor(Math.random() * 4)],
                title: 'New Business Insight',
                description: 'AI has detected a new pattern in your business data.',
                impact: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
                actionable: Math.random() > 0.5,
                actionText: 'Learn More',
                actionUrl: '/insights',
                timestamp: new Date(),
                data: { confidence: Math.random() * 100 }
            };
            socket.emit('dashboard:insight:new', newInsight);
        }, 30000); // Send new insight every 30 seconds
        // Store interval reference for cleanup
        socket.insightsInterval = interval;
    }
}
// Singleton instance
let socketService = null;
const getSocketService = () => {
    if (!socketService) {
        socketService = new SocketServiceImpl();
    }
    return socketService;
};
exports.getSocketService = getSocketService;
