import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sillageRouter from "./sillage";
import djTransfersRouter from "./djTransfers";
import eventThemeRouter from "./eventTheme";
import professionalDocumentsRouter from "./professionalDocuments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sillageRouter);
router.use(djTransfersRouter);
router.use(eventThemeRouter);
router.use(professionalDocumentsRouter);

export default router;
