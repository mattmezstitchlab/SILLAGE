import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sillageRouter from "./sillage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sillageRouter);

export default router;
