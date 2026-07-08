import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pushRouter from "./push";
import shareRouter from "./share";
import trackRouter from "./track";
import gifsRouter from "./gifs";
import assistantRouter from "./assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pushRouter);
router.use(shareRouter);
router.use(trackRouter);
router.use(gifsRouter);
router.use(assistantRouter);

export default router;
