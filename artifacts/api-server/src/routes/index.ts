import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sillageRouter from "./sillage";
import djTransfersRouter from "./djTransfers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sillageRouter);
router.use(djTransfersRouter);

export default router;
