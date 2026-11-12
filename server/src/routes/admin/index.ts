import { Router } from 'express';
import { requireStaff } from '../../lib/auth.js';
import dashboardRoutes from './dashboard.js';
import catalogRoutes from './catalog.js';
import customerRoutes from './customers.js';
import inventoryRoutes from './inventory.js';
import orderRoutes from './orders.js';
import promotionRoutes from './promotions.js';
import reportRoutes from './reports.js';
import reviewRoutes from './reviews.js';
import settingRoutes from './settings.js';
import staffRoutes from './staff.js';
import uploadRoutes from './uploads.js';

const router = Router();

// Every admin endpoint requires staff access; individual routes then enforce
// the specific permission they need.
router.use(requireStaff);

router.use(dashboardRoutes);
router.use(reportRoutes);
router.use(catalogRoutes);
router.use(inventoryRoutes);
router.use(orderRoutes);
router.use(promotionRoutes);
router.use(reviewRoutes);
router.use(customerRoutes);
router.use(staffRoutes);
router.use(settingRoutes);
router.use(uploadRoutes);

export default router;
